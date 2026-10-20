const BigNumber = require('bignumber.js');
const { LedgerAccount } = require('../models');
const { validateEventPayload } = require('./eventSchemaValidator');
const { resolvePublishedPostingRule, getByPath } = require('./postingRuleResolver');
const { evaluateFormula } = require('./formulaEngine');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Validates and simulates journal entry generation from an event payload
 */
async function simulateJournalFromEvent({
  tenantId,
  eventCode,
  schemaVersion = '1.0.0',
  occurrenceDate = new Date(),
  tenantType = null,
  payload = {}
}) {
  // 1. Validate payload schema against EventDefinition
  const schemaValidation = await validateEventPayload(tenantId, eventCode, schemaVersion, payload);
  if (!schemaValidation.valid) {
    return {
      success: false,
      stage: 'PAYLOAD_VALIDATION',
      errors: schemaValidation.errors,
      balanced: false,
      rule: null,
      lines: []
    };
  }

  // 2. Resolve matching published rule
  const resolution = await resolvePublishedPostingRule({
    tenantId,
    eventCode,
    schemaVersion,
    occurrenceDate,
    tenantType,
    payload
  });

  if (!resolution.matched) {
    return {
      success: false,
      stage: 'RULE_RESOLUTION',
      code: resolution.code,
      errors: [resolution.reason],
      candidateEvaluations: resolution.candidateEvaluations,
      balanced: false,
      rule: null,
      lines: []
    };
  }

  const { rule, lines: ruleLines } = resolution;

  if (!ruleLines || ruleLines.length < 2) {
    return {
      success: false,
      stage: 'RULE_EVALUATION',
      errors: [`Rule "${rule.rule_code}" has fewer than 2 posting lines`],
      rule,
      lines: []
    };
  }

  // 3. Evaluate lines and resolve LedgerAccounts
  const context = { payload, params: {} };
  const evaluatedLines = [];
  let totalDebit = new BigNumber(0);
  let totalCredit = new BigNumber(0);
  const evaluationErrors = [];

  for (const line of ruleLines) {
    // Resolve Ledger Account
    const account = await LedgerAccount.findOne({
      tenant_id: tenantId,
      account_code: line.account_code
    });

    if (!account) {
      evaluationErrors.push(`Account code "${line.account_code}" does not exist in active tenant Chart of Accounts`);
      continue;
    }

    if (account.status !== 'ACTIVE') {
      evaluationErrors.push(`Account "${account.account_code}" (${account.account_name}) is inactive`);
      continue;
    }

    if (!account.is_posting_allowed) {
      evaluationErrors.push(`Posting is disallowed on account "${account.account_code}" (${account.account_name})`);
      continue;
    }

    // Evaluate Amount Expression
    let calculatedAmountStr = '0.00';
    try {
      const expr = line.amount_expression || (line.amount_field ? `payload.${line.amount_field}` : null);
      if (!expr) {
        throw new Error(`Line ${line.line_number} is missing an amount expression or amount field`);
      }

      calculatedAmountStr = evaluateFormula(expr, context, {
        roundingMode: line.rounding_mode || 'ROUND_HALF_UP'
      });
    } catch (err) {
      evaluationErrors.push(`Line ${line.line_number} amount evaluation failed: ${err.message}`);
      continue;
    }

    const amtBN = new BigNumber(calculatedAmountStr);
    if (amtBN.isNegative()) {
      evaluationErrors.push(`Line ${line.line_number} evaluated to a negative amount ($${calculatedAmountStr})`);
      continue;
    }

    if (amtBN.isZero()) {
      // Zero-amount lines (e.g., zero fees or unapplied cash) are safely omitted from double-entry lines
      continue;
    }

    const isDebit = line.direction === 'DEBIT';
    const debitStr = isDebit ? calculatedAmountStr : '0.00';
    const creditStr = !isDebit ? calculatedAmountStr : '0.00';

    if (isDebit) totalDebit = totalDebit.plus(amtBN);
    else totalCredit = totalCredit.plus(amtBN);

    // Dimension mapping
    const dimensions = {};
    if (line.dimension_mappings) {
      const mappings = line.dimension_mappings.toObject ? line.dimension_mappings.toObject() : line.dimension_mappings;
      for (const [dimKey, dimPath] of Object.entries(mappings)) {
        if (dimPath) {
          const val = getByPath(context, dimPath) || getByPath(payload, dimPath);
          if (val !== undefined && val !== null && val !== '') dimensions[dimKey] = String(val);
        }
      }
    }

    // Merge arbitrary dynamic dimensions from payload.dimensions
    if (payload.dimensions && typeof payload.dimensions === 'object') {
      for (const [dKey, dVal] of Object.entries(payload.dimensions)) {
        if (dVal !== undefined && dVal !== null && dVal !== '') {
          dimensions[dKey] = String(dVal);
        }
      }
    }

    // Line-specific standard dimension fallbacks
    if (!dimensions.policy_id && payload.policy_id) dimensions.policy_id = String(payload.policy_id);
    if (!dimensions.cost_center && payload.cost_center) dimensions.cost_center = String(payload.cost_center);
    if (!dimensions.company_code && payload.company_code) dimensions.company_code = String(payload.company_code);
    if (line.account_code === '2010') {
      if (!dimensions.carrier_id && payload.carrier_id) dimensions.carrier_id = String(payload.carrier_id);
      if (!dimensions.carrier_name && payload.carrier_name) dimensions.carrier_name = String(payload.carrier_name);
    }
    if (line.account_code === '2020') {
      if (!dimensions.broker_id && (payload.broker_id || payload.producer_id)) dimensions.broker_id = String(payload.broker_id || payload.producer_id);
      if (!dimensions.broker_name && payload.broker_name) dimensions.broker_name = String(payload.broker_name);
      if (!dimensions.producer_id && (payload.producer_id || payload.broker_id)) dimensions.producer_id = String(payload.producer_id || payload.broker_id);
    }
    if (line.account_code === '4200') {
      if (!dimensions.mga_id && payload.mga_id) dimensions.mga_id = String(payload.mga_id);
    }

    // Template description
    let memo = line.description_template || '';
    memo = memo.replace(/\{\{\s*payload\.([a-zA-Z0-9_.]+)\s*\}\}/g, (_, p) => getByPath(payload, p) || '');

    evaluatedLines.push({
      line_number: line.line_number,
      account_id: account._id,
      account_code: account.account_code,
      account_name: account.account_name,
      direction: line.direction,
      amount: calculatedAmountStr,
      debit: debitStr,
      credit: creditStr,
      dimensions,
      memo
    });
  }

  if (evaluationErrors.length > 0) {
    return {
      success: false,
      stage: 'LINE_EVALUATION',
      errors: evaluationErrors,
      balanced: false,
      rule,
      lines: evaluatedLines
    };
  }

  const isBalanced = totalDebit.isEqualTo(totalCredit);
  const diffBN = totalDebit.minus(totalCredit).abs();

  return {
    success: isBalanced,
    stage: 'SIMULATION_COMPLETE',
    rule: {
      id: rule._id,
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      version: rule.version,
      priority: rule.priority,
      accounting_basis: rule.accounting_basis
    },
    candidateEvaluations: resolution.candidateEvaluations,
    lines: evaluatedLines,
    total_debit: totalDebit.toFixed(2),
    total_credit: totalCredit.toFixed(2),
    difference: diffBN.toFixed(2),
    balanced: isBalanced,
    errors: isBalanced
      ? []
      : [`Double-entry imbalance: Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)})`]
  };
}

/**
 * Explicitly post a validated simulation through the existing GL posting service
 */
async function postJournalFromResolvedRule({
  tenantId,
  userId,
  eventCode,
  schemaVersion = '1.0.0',
  occurrenceDate = new Date(),
  tenantType = null,
  payload = {},
  sourceReference = null,
  memo = null
}) {
  const sim = await simulateJournalFromEvent({
    tenantId,
    eventCode,
    schemaVersion,
    occurrenceDate,
    tenantType,
    payload
  });

  if (!sim.success || !sim.balanced) {
    throw new Error(`Simulation failed validation: ${sim.errors.join('; ')}`);
  }

  const journalLines = sim.lines.map(l => ({
    account_code: l.account_code,
    debit: l.debit,
    credit: l.credit,
    memo: l.memo || `Event ${eventCode} Line ${l.line_number}`,
    dimensions: l.dimensions
  }));

  const primaryEntityId = payload.transaction_id
    || (eventCode.includes('payment') ? payload.payment_id : null)
    || (eventCode.includes('invoice') ? payload.invoice_id || payload.invoice_number : null)
    || (eventCode.includes('endorsement') ? payload.endorsement_id : null)
    || (eventCode.includes('claim') ? (payload.payout_id || payload.claim_id) : null)
    || (eventCode.includes('sweep') ? payload.sweep_id : null)
    || (eventCode.includes('settlement') || eventCode.includes('disburse') ? payload.settlement_id : null)
    || payload.payment_id
    || payload.invoice_id
    || payload.endorsement_id
    || payload.claim_id
    || payload.policy_id
    || `TXN-${Date.now()}`;

  const refId = sourceReference || `${eventCode}:${primaryEntityId}`;
  const journalMemo = memo || `Rule ${sim.rule.rule_code} (v${sim.rule.version}) for ${eventCode}`;

  const glResult = await postJournalEntry({
    tenantId,
    userId,
    postingDate: occurrenceDate,
    sourceModule: 'RULES_ENGINE',
    referenceId: refId,
    memo: journalMemo,
    lines: journalLines,
    accountingBasis: sim.rule.accounting_basis || 'GAAP'
  });

  return {
    journal: glResult.journal,
    lines: glResult.lines,
    rule: sim.rule,
    simulation: sim
  };
}

module.exports = {
  simulateJournalFromEvent,
  postJournalFromResolvedRule
};
