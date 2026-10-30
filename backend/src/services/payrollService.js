const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  Employee,
  SalaryStructure,
  PayrollRun,
  LedgerAccount
} = require('../models');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Previews monthly payroll calculations for all active employees without persisting.
 */
async function previewMonthlyPayroll({ tenantId, companyId, monthYear }) {
  const employees = await Employee.find({
    tenant_id: tenantId,
    company_id: companyId,
    status: 'ACTIVE'
  }).populate('salary_structure_id');

  let totGross = new BigNumber(0);
  let totEpf = new BigNumber(0);
  let totEsi = new BigNumber(0);
  let totPt = new BigNumber(0);
  let totTds = new BigNumber(0);
  let totNet = new BigNumber(0);
  const employeeLines = [];

  for (const emp of employees) {
    const struct = emp.salary_structure_id;
    if (!struct) continue;

    const basicBN = new BigNumber(struct.basic_pay ? struct.basic_pay.toString() : 0);
    const hraBN = new BigNumber(struct.hra ? struct.hra.toString() : 0);
    const convBN = new BigNumber(struct.conveyance ? struct.conveyance.toString() : 0);
    const specBN = new BigNumber(struct.special_allowance ? struct.special_allowance.toString() : 0);

    const grossBN = basicBN.plus(hraBN).plus(convBN).plus(specBN);

    // Statutory deductions
    const epfRate = struct.epf_employee_percent || 12.0;
    const epfBN = basicBN.multipliedBy(epfRate).dividedBy(100).decimalPlaces(2, BigNumber.ROUND_HALF_UP);

    // ESI applies if gross <= 21,000 INR
    let esiBN = new BigNumber(0);
    if (grossBN.isLessThanOrEqualTo(21000) && (struct.esi_employee_percent || 0) > 0) {
      esiBN = grossBN.multipliedBy(struct.esi_employee_percent).dividedBy(100).decimalPlaces(2, BigNumber.ROUND_HALF_UP);
    }

    const ptBN = new BigNumber(struct.professional_tax_monthly || 200);
    const tdsBN = new BigNumber(0); // Standard base projection

    const deductionsBN = epfBN.plus(esiBN).plus(ptBN).plus(tdsBN);
    const netBN = grossBN.minus(deductionsBN);

    totGross = totGross.plus(grossBN);
    totEpf = totEpf.plus(epfBN);
    totEsi = totEsi.plus(esiBN);
    totPt = totPt.plus(ptBN);
    totTds = totTds.plus(tdsBN);
    totNet = totNet.plus(netBN);

    employeeLines.push({
      employee_id: emp._id,
      employee_code: emp.employee_code,
      employee_name: emp.full_name,
      basic: basicBN.toFixed(2),
      hra: hraBN.toFixed(2),
      conveyance: convBN.toFixed(2),
      special_allowance: specBN.toFixed(2),
      gross_pay: grossBN.toFixed(2),
      epf: epfBN.toFixed(2),
      esi: esiBN.toFixed(2),
      pt: ptBN.toFixed(2),
      tds: tdsBN.toFixed(2),
      total_deductions: deductionsBN.toFixed(2),
      net_pay: netBN.toFixed(2)
    });
  }

  return {
    month_year: monthYear,
    employee_count: employeeLines.length,
    total_gross_pay: totGross.toFixed(2),
    total_epf: totEpf.toFixed(2),
    total_esi: totEsi.toFixed(2),
    total_pt: totPt.toFixed(2),
    total_tds: totTds.toFixed(2),
    total_net_pay: totNet.toFixed(2),
    employees: employeeLines
  };
}

/**
 * Computes and posts a monthly payroll run and generates a balanced double-entry salary journal.
 */
async function postMonthlyPayroll({
  tenantId,
  companyId,
  userId,
  monthYear,
  postingDate = new Date(),
  salaryExpenseAccountCode = '5201', // Staff Salaries & Wages
  epfPayableAccountCode = '2110', // EPF Payable
  esiPayableAccountCode = '2111', // ESI Payable
  ptPayableAccountCode = '2112', // Professional Tax Payable
  netSalaryPayableAccountCode = '2120', // Net Salaries Payable
  session = null
}) {
  const existing = await PayrollRun.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    month_year: monthYear
  });

  if (existing) {
    throw new Error(`Payroll run for "${monthYear}" has already been posted (${existing.status})`);
  }

  const preview = await previewMonthlyPayroll({ tenantId, companyId, monthYear });
  if (preview.employee_count === 0) {
    throw new Error('No active employees with assigned salary structures found');
  }

  // Ensure accounts exist or fallback to generic
  const findAcc = async (code, fallbackCodes) => {
    let acc = await LedgerAccount.findOne({
      tenant_id: tenantId,
      account_code: code,
      ...(companyId ? { company_id: companyId } : {})
    });
    if (!acc && fallbackCodes) {
      acc = await LedgerAccount.findOne({
        tenant_id: tenantId,
        account_code: { $in: fallbackCodes },
        ...(companyId ? { company_id: companyId } : {})
      });
    }
    return acc;
  };

  const salAcc = await findAcc(salaryExpenseAccountCode, ['5201', '5000']);
  if (!salAcc) throw new Error(`Salary expense account "${salaryExpenseAccountCode}" not found`);

  // Ensure payables accounts
  let epfAcc = await findAcc(epfPayableAccountCode, ['2110', '2100', '2000']);
  let esiAcc = await findAcc(esiPayableAccountCode, ['2111', '2100', '2000']);
  let ptAcc = await findAcc(ptPayableAccountCode, ['2112', '2100', '2000']);
  let netSalAcc = await findAcc(netSalaryPayableAccountCode, ['2120', '2000']);

  if (!netSalAcc) throw new Error(`Net salary payable account "${netSalaryPayableAccountCode}" not found`);

  // Build balanced salary journal lines:
  // Debit: Salaries & Wages Expense = Total Gross Pay
  // Credit: EPF Payable
  // Credit: ESI Payable
  // Credit: PT Payable
  // Credit: Net Salaries Payable = Total Net Pay
  const lines = [
    {
      account_code: salAcc.account_code,
      debit: preview.total_gross_pay,
      credit: '0.00',
      memo: `Gross salary expense for ${monthYear}`
    }
  ];

  if (new BigNumber(preview.total_epf).isGreaterThan(0) && epfAcc) {
    lines.push({
      account_code: epfAcc.account_code,
      debit: '0.00',
      credit: preview.total_epf,
      memo: `Employee EPF contribution payable for ${monthYear}`
    });
  }

  if (new BigNumber(preview.total_esi).isGreaterThan(0) && esiAcc) {
    lines.push({
      account_code: esiAcc.account_code,
      debit: '0.00',
      credit: preview.total_esi,
      memo: `Employee ESI contribution payable for ${monthYear}`
    });
  }

  if (new BigNumber(preview.total_pt).isGreaterThan(0) && ptAcc) {
    lines.push({
      account_code: ptAcc.account_code,
      debit: '0.00',
      credit: preview.total_pt,
      memo: `Professional Tax payable for ${monthYear}`
    });
  }

  // Calculate remaining credit required to guarantee exact double-entry equilibrium
  let creditAssigned = new BigNumber(0);
  for (let i = 1; i < lines.length; i++) {
    creditAssigned = creditAssigned.plus(lines[i].credit);
  }
  const netPayCredit = new BigNumber(preview.total_gross_pay).minus(creditAssigned);

  lines.push({
    account_code: netSalAcc.account_code,
    debit: '0.00',
    credit: netPayCredit.toFixed(2),
    memo: `Net salaries payable for ${monthYear}`
  });

  // Post balanced salary journal
  const journalResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate,
    sourceModule: 'PAYROLL',
    referenceId: `PAYROLL-${monthYear}`,
    memo: `Monthly payroll journal for ${monthYear} (${preview.employee_count} employees)`,
    currency: 'INR',
    lines,
    session
  });

  const formattedEmployeeLines = preview.employees.map(e => ({
    employee_id: e.employee_id,
    employee_code: e.employee_code,
    employee_name: e.employee_name,
    basic: mongoose.Types.Decimal128.fromString(e.basic),
    hra: mongoose.Types.Decimal128.fromString(e.hra),
    conveyance: mongoose.Types.Decimal128.fromString(e.conveyance),
    special_allowance: mongoose.Types.Decimal128.fromString(e.special_allowance),
    gross_pay: mongoose.Types.Decimal128.fromString(e.gross_pay),
    epf: mongoose.Types.Decimal128.fromString(e.epf),
    esi: mongoose.Types.Decimal128.fromString(e.esi),
    pt: mongoose.Types.Decimal128.fromString(e.pt),
    tds: mongoose.Types.Decimal128.fromString(e.tds),
    total_deductions: mongoose.Types.Decimal128.fromString(e.total_deductions),
    net_pay: mongoose.Types.Decimal128.fromString(e.net_pay)
  }));

  const payrollRun = new PayrollRun({
    tenant_id: tenantId,
    company_id: companyId,
    month_year: monthYear,
    run_date: new Date(postingDate),
    total_gross_pay: mongoose.Types.Decimal128.fromString(preview.total_gross_pay),
    total_epf: mongoose.Types.Decimal128.fromString(preview.total_epf),
    total_esi: mongoose.Types.Decimal128.fromString(preview.total_esi),
    total_pt: mongoose.Types.Decimal128.fromString(preview.total_pt),
    total_tds: mongoose.Types.Decimal128.fromString(preview.total_tds),
    total_net_pay: mongoose.Types.Decimal128.fromString(netPayCredit.toFixed(2)),
    employee_lines: formattedEmployeeLines,
    journal_id: journalResult.journal._id,
    status: 'POSTED'
  });

  await payrollRun.save(session ? { session } : undefined);

  return {
    payrollRun,
    journal: journalResult.journal
  };
}

/**
 * Disburses monthly salaries from bank account, clearing Net Salaries Payable.
 */
async function disburseMonthlySalaries({
  tenantId,
  companyId,
  userId,
  payrollRunId,
  bankAccountCode = '1110', // Bank Account
  netSalaryPayableAccountCode = '2120',
  disbursementDate = new Date(),
  session = null
}) {
  const payrollRun = await PayrollRun.findOne({
    _id: payrollRunId,
    tenant_id: tenantId,
    company_id: companyId
  });

  if (!payrollRun) throw new Error('Payroll run not found');
  if (payrollRun.status === 'DISBURSED') {
    throw new Error('Salaries for this payroll run have already been disbursed');
  }

  const bankAcc = await LedgerAccount.findOne({
    tenant_id: tenantId,
    account_code: bankAccountCode,
    ...(companyId ? { company_id: companyId } : {})
  });
  if (!bankAcc) throw new Error(`Bank account "${bankAccountCode}" not found`);

  let netSalAcc = await LedgerAccount.findOne({
    tenant_id: tenantId,
    account_code: netSalaryPayableAccountCode,
    ...(companyId ? { company_id: companyId } : {})
  });
  if (!netSalAcc) {
    netSalAcc = await LedgerAccount.findOne({
      tenant_id: tenantId,
      account_code: { $in: ['2120', '2000', '2001'] },
      ...(companyId ? { company_id: companyId } : {})
    });
  }
  if (!netSalAcc) throw new Error(`Net salary payable account "${netSalaryPayableAccountCode}" not found`);

  const netAmount = payrollRun.total_net_pay.toString();

  // Post balanced disbursement journal:
  // Debit: Net Salaries Payable (clears liability)
  // Credit: Bank Account (releases cash)
  const journalResult = await postJournalEntry({
    tenantId,
    companyId,
    userId,
    postingDate: disbursementDate,
    sourceModule: 'BANKING_CASH',
    referenceId: `SAL-DISB-${payrollRun.month_year}`,
    memo: `Bank salary disbursement for ${payrollRun.month_year}`,
    currency: 'INR',
    lines: [
      {
        account_code: netSalAcc.account_code,
        debit: netAmount,
        credit: '0.00',
        memo: `Clear net salary payable liability for ${payrollRun.month_year}`
      },
      {
        account_code: bankAcc.account_code,
        debit: '0.00',
        credit: netAmount,
        memo: `Bank salary payout for ${payrollRun.month_year}`
      }
    ],
    session
  });

  payrollRun.status = 'DISBURSED';
  payrollRun.disbursement_journal_id = journalResult.journal._id;
  await payrollRun.save(session ? { session } : undefined);

  return {
    payrollRun,
    disbursement_journal: journalResult.journal
  };
}

module.exports = {
  previewMonthlyPayroll,
  postMonthlyPayroll,
  disburseMonthlySalaries
};
