const payrollService = require('../services/payrollService');
const { Employee, SalaryStructure, PayrollRun } = require('../models');

async function listEmployees(req, res) {
  try {
    const { tenantId, companyId } = req;
    const employees = await Employee.find({
      tenant_id: tenantId,
      company_id: companyId
    }).populate('salary_structure_id');
    return res.success(employees);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function createEmployee(req, res) {
  try {
    const { tenantId, companyId } = req;
    const employee = await Employee.create({
      tenant_id: tenantId,
      company_id: companyId,
      ...req.body
    });
    return res.success(employee, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function listSalaryStructures(req, res) {
  try {
    const { tenantId, companyId } = req;
    const structures = await SalaryStructure.find({
      tenant_id: tenantId,
      company_id: companyId
    });
    return res.success(structures);
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function createSalaryStructure(req, res) {
  try {
    const { tenantId, companyId } = req;
    const structure = await SalaryStructure.create({
      tenant_id: tenantId,
      company_id: companyId,
      ...req.body
    });
    return res.success(structure, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function previewPayroll(req, res) {
  try {
    const { tenantId, companyId } = req;
    const { month_year } = req.query;
    if (!month_year) return res.error('month_year query parameter is required (e.g. 2026-10)', 400);

    const result = await payrollService.previewMonthlyPayroll({
      tenantId,
      companyId,
      monthYear: month_year
    });
    return res.success(result);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function postPayroll(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { month_year, posting_date } = req.body;
    if (!month_year) return res.error('month_year is required', 400);

    const result = await payrollService.postMonthlyPayroll({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      monthYear: month_year,
      postingDate: posting_date || new Date()
    });
    return res.success(result, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function disbursePayroll(req, res) {
  try {
    const { tenantId, companyId, user } = req;
    const { id } = req.params;
    const { bank_account_code, disbursement_date } = req.body;

    const result = await payrollService.disburseMonthlySalaries({
      tenantId,
      companyId,
      userId: user?._id || req.body.userId,
      payrollRunId: id,
      bankAccountCode: bank_account_code || '1110',
      disbursementDate: disbursement_date || new Date()
    });
    return res.success(result);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

module.exports = {
  listEmployees,
  createEmployee,
  listSalaryStructures,
  createSalaryStructure,
  previewPayroll,
  postPayroll,
  disbursePayroll
};
