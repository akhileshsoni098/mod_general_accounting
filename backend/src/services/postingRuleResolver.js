const { PostingRule, PostingRuleLine, LedgerAccount } = require('../models');

/**
 * Helper to extract value from object by dot path (e.g. "transaction.type")
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') return undefined;
    curr = curr[p];
  }
  return curr;
}

/**
 * Evaluates whether a condition matches a payload/context
 */
function evaluateCondition(condition, context) {
  const { field_path, operator, value } = condition;
  let actual = getByPath(context, field_path);
  if (actual === undefined && !field_path.startsWith('payload.') && context.payload) {
    actual = getByPath(context.payload, field_path);
  }

  switch (operator) {
    case 'EQUALS':
      return String(actual) === String(value);

    case 'NOT_EQUALS':
      return String(actual) !== String(value);

    case 'IN': {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map(String).includes(String(actual));
    }

    case 'NOT_IN': {
      const arr = Array.isArray(value) ? value : [value];
      return !arr.map(String).includes(String(actual));
    }

    case 'GREATER_THAN':
      return Number(actual) > Number(value);

    case 'LESS_THAN':
      return Number(actual) < Number(value);

    case 'EXISTS':
      return actual !== undefined && actual !== null;

    default:
      return false;
  }
}

/**
 * Resolves eligible published posting rule for an event
 *
 * Precedence hierarchy:
 * 1. Exact condition specificity (higher condition count matched = more specific rule)
 * 2. Explicit numeric priority (lower number = higher priority, e.g. 10 ahead of 100)
 * 3. Exact schema version match over fallback
 *
 * Ambiguity rule:
 * If multiple rules tie on condition specificity and priority, resolver returns AMBIGUOUS_RULE_MATCH.
 */
async function resolvePublishedPostingRule({
  tenantId,
  companyId = null,
  eventCode,
  schemaVersion = '1.0.0',
  occurrenceDate = new Date(),
  tenantType = null,
  payload = {}
}) {
  const occDate = new Date(occurrenceDate);
  const resolvedCompanyId = companyId || payload.company_id || null;

  // 1. Query candidate rules: PUBLISHED or ACTIVE status within tenant
  const query = {
    tenant_id: tenantId,
    event_code: eventCode.toLowerCase().trim(),
    status: { $in: ['PUBLISHED', 'ACTIVE'] },
    effective_from: { $lte: occDate },
    $or: [{ effective_to: null }, { effective_to: { $gte: occDate } }]
  };

  if (resolvedCompanyId) {
    query.$and = [
      {
        $or: [
          { company_id: resolvedCompanyId },
          { company_id: null }
        ]
      }
    ];
  }

  const candidates = await PostingRule.find(query).sort({ priority: 1, created_at: -1 });

  if (!candidates || candidates.length === 0) {
    return {
      matched: false,
      code: 'NO_MATCHING_RULE',
      reason: `No published posting rule found for event "${eventCode}" at effective date ${occDate.toISOString().slice(0, 10)}`,
      candidateEvaluations: []
    };
  }

  const context = { payload, tenant_type: tenantType };
  const evaluatedCandidates = [];

  for (const rule of candidates) {
    // Check tenant type applicability
    if (tenantType && rule.tenant_type_applicability && rule.tenant_type_applicability.length > 0) {
      if (!rule.tenant_type_applicability.includes(tenantType)) {
        evaluatedCandidates.push({
          rule_id: rule._id,
          rule_code: rule.rule_code,
          priority: rule.priority,
          matched: false,
          reason: `Rule inapplicable to tenant type "${tenantType}"`
        });
        continue;
      }
    }

    // Check conditions
    let allConditionsPassed = true;
    let failedCondition = null;

    if (rule.conditions && rule.conditions.length > 0) {
      for (const cond of rule.conditions) {
        if (!evaluateCondition(cond, context)) {
          allConditionsPassed = false;
          failedCondition = `${cond.field_path} ${cond.operator} ${JSON.stringify(cond.value)}`;
          break;
        }
      }
    }

    if (!allConditionsPassed) {
      evaluatedCandidates.push({
        rule_id: rule._id,
        rule_code: rule.rule_code,
        priority: rule.priority,
        condition_count: rule.conditions ? rule.conditions.length : 0,
        matched: false,
        reason: `Condition failed: ${failedCondition}`
      });
      continue;
    }

    // Condition matched
    evaluatedCandidates.push({
      rule_id: rule._id,
      rule_code: rule.rule_code,
      priority: rule.priority || 100,
      condition_count: rule.conditions ? rule.conditions.length : 0,
      version: rule.version,
      matched: true,
      rule
    });
  }

  const matching = evaluatedCandidates.filter(c => c.matched);

  if (matching.length === 0) {
    return {
      matched: false,
      code: 'NO_MATCHING_RULE',
      reason: `Found ${candidates.length} active candidate rule(s) for "${eventCode}", but none satisfied the payload conditions`,
      candidateEvaluations: evaluatedCandidates
    };
  }

  // Sort matching rules by:
  // 1. Company specificity (company-specific rule ahead of tenant-wide)
  // 2. Condition specificity DESC (most specific criteria wins)
  // 3. Explicit priority ASC (lower priority number wins)
  matching.sort((a, b) => {
    const aCompanySpecific = a.rule.company_id ? 1 : 0;
    const bCompanySpecific = b.rule.company_id ? 1 : 0;
    if (bCompanySpecific !== aCompanySpecific) {
      return bCompanySpecific - aCompanySpecific;
    }
    if (b.condition_count !== a.condition_count) {
      return b.condition_count - a.condition_count;
    }
    return (a.priority || 100) - (b.priority || 100);
  });

  const topMatch = matching[0];

  // Check for ambiguity: Is there another matching rule with equal condition specificity and equal priority?
  if (matching.length > 1) {
    const secondMatch = matching[1];
    if (
      secondMatch.condition_count === topMatch.condition_count &&
      (secondMatch.priority || 100) === (topMatch.priority || 100) &&
      secondMatch.rule_code !== topMatch.rule_code
    ) {
      return {
        matched: false,
        code: 'AMBIGUOUS_RULE_MATCH',
        reason: `Ambiguous match between rule "${topMatch.rule_code}" and "${secondMatch.rule_code}" with identical specificity (${topMatch.condition_count} conditions) and priority (${topMatch.priority})`,
        candidateEvaluations: evaluatedCandidates
      };
    }
  }

  // Load rule lines for top matched rule
  const lines = await PostingRuleLine.find({ posting_rule_id: topMatch.rule._id }).sort({ line_number: 1 });

  return {
    matched: true,
    code: 'RULE_RESOLVED',
    rule: topMatch.rule,
    lines,
    candidateEvaluations: evaluatedCandidates
  };
}

module.exports = {
  getByPath,
  evaluateCondition,
  resolvePublishedPostingRule
};
