const {
  PostingRule,
  PostingRuleLine,
  LedgerAccount,
  EventDefinition,
  PostingRuleTestCase
} = require('../models');
const { parseFormula } = require('../services/formulaEngine');
const { simulateJournalFromEvent, postJournalFromResolvedRule } = require('../services/eventSimulatorService');
const { seedDefaultEventDefinitions } = require('../utils/seedEventDefinitions');

/**
 * Validates a PostingRule and its lines
 */
async function validateRuleStructure(tenantId, ruleData, linesData) {
  const errors = [];
  const warnings = [];

  // 1. Verify EventDefinition reference exists
  if (ruleData.event_code) {
    let eventDef = await EventDefinition.findOne({
      tenant_id: tenantId,
      event_code: ruleData.event_code.toLowerCase().trim()
    });
    if (!eventDef) {
      await seedDefaultEventDefinitions(tenantId);
      eventDef = await EventDefinition.findOne({
        tenant_id: tenantId,
        event_code: ruleData.event_code.toLowerCase().trim()
      });
    }
    if (!eventDef) {
      errors.push(`Event code "${ruleData.event_code}" does not exist in tenant Event Catalog`);
    } else if (eventDef.status !== 'ACTIVE') {
      warnings.push(`Referenced event definition "${ruleData.event_code}" is currently ${eventDef.status}`);
    }
  }

  // 2. Validate condition operators
  const validOperators = ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GREATER_THAN', 'LESS_THAN', 'EXISTS'];
  if (ruleData.conditions && Array.isArray(ruleData.conditions)) {
    for (const c of ruleData.conditions) {
      if (!c.field_path || typeof c.field_path !== 'string') {
        errors.push('Each condition must have a valid field_path string');
      }
      if (!c.operator || !validOperators.includes(c.operator.toUpperCase())) {
        errors.push(`Invalid condition operator "${c.operator}". Allowed: ${validOperators.join(', ')}`);
      }
    }
  }

  // 3. Validate Lines
  if (!linesData || !Array.isArray(linesData) || linesData.length < 2) {
    errors.push('A valid posting rule must contain at least 2 lines (double-entry)');
  } else {
    let hasDebit = false;
    let hasCredit = false;

    for (let i = 0; i < linesData.length; i++) {
      const l = linesData[i];
      const lineNum = l.line_number || i + 1;

      // Check Direction
      const dir = (l.direction || '').toUpperCase();
      if (!['DEBIT', 'CREDIT'].includes(dir)) {
        errors.push(`Line ${lineNum}: Direction must be DEBIT or CREDIT`);
      } else {
        if (dir === 'DEBIT') hasDebit = true;
        if (dir === 'CREDIT') hasCredit = true;
      }

      // Check Account Code
      if (!l.account_code) {
        errors.push(`Line ${lineNum}: account_code is required`);
      } else {
        const account = await LedgerAccount.findOne({
          tenant_id: tenantId,
          account_code: l.account_code.trim()
        });
        if (!account) {
          errors.push(`Line ${lineNum}: Account "${l.account_code}" does not exist in tenant Chart of Accounts`);
        } else {
          if (account.status !== 'ACTIVE') {
            errors.push(`Line ${lineNum}: Account "${l.account_code}" is inactive`);
          }
          if (!account.is_posting_allowed) {
            errors.push(`Line ${lineNum}: Posting is not allowed on account "${l.account_code}"`);
          }
        }
      }

      // Check Formula Syntax
      const formula = l.amount_expression || (l.amount_field ? `payload.${l.amount_field}` : null);
      if (!formula) {
        errors.push(`Line ${lineNum}: amount_expression or amount_field is required`);
      } else {
        try {
          parseFormula(formula);
        } catch (fErr) {
          errors.push(`Line ${lineNum} formula parse error: ${fErr.message}`);
        }
      }
    }

    if (!hasDebit || !hasCredit) {
      errors.push('Rule must contain at least one DEBIT line and at least one CREDIT line');
    }
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings
  };
}

// List posting rules
async function getPostingRules(req, res) {
  try {
    const tenantId = req.tenantId;
    const { event_code, status, search } = req.query;

    const query = {
      $or: [{ tenant_id: tenantId }, { tenant_id: null }]
    };

    if (event_code) query.event_code = event_code.toLowerCase().trim();
    if (status) query.status = status.toUpperCase();
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { rule_code: { $regex: search, $options: 'i' } },
          { rule_name: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const rules = await PostingRule.find(query).sort({ priority: 1, rule_code: 1, version: -1 });
    const ruleIds = rules.map(r => r._id);
    const lines = await PostingRuleLine.find({ posting_rule_id: { $in: ruleIds } }).sort({ line_number: 1 });

    const result = rules.map(r => ({
      ...r.toObject(),
      lines: lines.filter(l => l.posting_rule_id.toString() === r._id.toString())
    }));

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list posting rules', 500, err.message);
  }
}

// Get single rule by ID
async function getPostingRuleById(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const rule = await PostingRule.findOne({
      _id: id,
      $or: [{ tenant_id: tenantId }, { tenant_id: null }]
    });

    if (!rule) {
      return res.error('Posting rule not found', 404);
    }

    const lines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
    return res.success({
      ...rule.toObject(),
      lines
    });
  } catch (err) {
    return res.error('Failed to get posting rule', 500, err.message);
  }
}

// Create new DRAFT Posting Rule
async function createPostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const {
      rule_code,
      rule_name,
      description,
      event_code,
      event_type, // legacy fallback
      applicable_module,
      accounting_basis,
      tenant_type_applicability,
      priority = 100,
      conditions = [],
      lines = []
    } = req.body;

    if (!rule_code || !rule_name || (!event_code && !event_type)) {
      return res.error('rule_code, rule_name, and event_code are required', 400);
    }

    const cleanCode = rule_code.toUpperCase().trim();
    const cleanEventCode = (event_code || event_type).toLowerCase().trim();

    // Check duplicate rule_code for active draft
    const exists = await PostingRule.findOne({
      tenant_id: tenantId,
      rule_code: cleanCode,
      status: { $in: ['DRAFT', 'VALIDATED', 'PUBLISHED'] }
    });
    if (exists) {
      return res.error(`Posting rule code "${cleanCode}" already exists for this tenant`, 409);
    }

    // Validate structure
    const valReport = await validateRuleStructure(tenantId, { event_code: cleanEventCode, conditions }, lines);
    const fatalOperatorError = (valReport.errors || []).find(e => e.includes('Invalid condition operator'));
    if (fatalOperatorError) {
      return res.error(fatalOperatorError, 400);
    }

    const rule = await PostingRule.create({
      tenant_id: tenantId,
      rule_code: cleanCode,
      rule_name: rule_name.trim(),
      description: description || '',
      event_code: cleanEventCode,
      event_type: cleanEventCode.toUpperCase(),
      applicable_module: applicable_module || 'GL',
      accounting_basis: accounting_basis || 'GAAP',
      tenant_type_applicability: tenant_type_applicability || ['CARRIER', 'MGA', 'BROKER', 'OTHER'],
      priority: Number(priority) || 100,
      conditions,
      status: 'DRAFT',
      version: 1,
      validation_report: {
        is_valid: valReport.is_valid,
        validated_at: new Date(),
        errors: valReport.errors,
        warnings: valReport.warnings
      }
    });

    const createdLines = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const lineDoc = await PostingRuleLine.create({
        posting_rule_id: rule._id,
        tenant_id: tenantId,
        line_number: i + 1,
        line_key: l.line_key || null,
        account_code: l.account_code ? l.account_code.trim() : '',
        direction: (l.direction || 'DEBIT').toUpperCase(),
        amount_expression: l.amount_expression || (l.amount_field ? `payload.${l.amount_field}` : null),
        amount_field: l.amount_field || null,
        rounding_mode: l.rounding_mode || 'ROUND_HALF_UP',
        currency_expression: l.currency_expression || 'USD',
        dimension_mappings: l.dimension_mappings || {},
        description_template: l.description_template || ''
      });
      createdLines.push(lineDoc);
    }

    return res.success(
      { rule, lines: createdLines, validation: valReport },
      { message: 'Posting rule draft created' },
      201
    );
  } catch (err) {
    return res.error('Failed to create posting rule', 500, err.message);
  }
}

// Update DRAFT Posting Rule
async function updatePostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const {
      rule_name,
      description,
      priority,
      conditions,
      lines,
      accounting_basis,
      tenant_type_applicability
    } = req.body;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) {
      return res.error('Posting rule not found', 404);
    }

    // Immutable check: If rule is already PUBLISHED, modifications must fork a new DRAFT version
    if (rule.status === 'PUBLISHED') {
      return res.error(
        'Published rules are immutable. Create a new draft version using the version endpoint to make modifications.',
        400
      );
    }

    if (rule_name) rule.rule_name = rule_name.trim();
    if (typeof description === 'string') rule.description = description.trim();
    if (priority !== undefined) rule.priority = Number(priority);
    if (conditions) rule.conditions = conditions;
    if (accounting_basis) rule.accounting_basis = accounting_basis;
    if (tenant_type_applicability) rule.tenant_type_applicability = tenant_type_applicability;

    if (lines && Array.isArray(lines)) {
      await PostingRuleLine.deleteMany({ posting_rule_id: rule._id });
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await PostingRuleLine.create({
          posting_rule_id: rule._id,
          tenant_id: tenantId,
          line_number: i + 1,
          line_key: l.line_key || null,
          account_code: l.account_code ? l.account_code.trim() : '',
          direction: (l.direction || 'DEBIT').toUpperCase(),
          amount_expression: l.amount_expression || (l.amount_field ? `payload.${l.amount_field}` : null),
          amount_field: l.amount_field || null,
          rounding_mode: l.rounding_mode || 'ROUND_HALF_UP',
          currency_expression: l.currency_expression || 'USD',
          dimension_mappings: l.dimension_mappings || {},
          description_template: l.description_template || ''
        });
      }
    }

    const currentLines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
    const valReport = await validateRuleStructure(tenantId, rule, currentLines);

    rule.validation_report = {
      is_valid: valReport.is_valid,
      validated_at: new Date(),
      errors: valReport.errors,
      warnings: valReport.warnings
    };
    rule.status = valReport.is_valid ? 'VALIDATED' : 'DRAFT';
    rule.row_version = (rule.row_version || 1) + 1;
    await rule.save();

    return res.success({
      rule,
      lines: currentLines,
      validation: valReport
    }, { message: 'Posting rule updated successfully' });
  } catch (err) {
    return res.error('Failed to update posting rule', 500, err.message);
  }
}

// Fork / Create New Draft Version from Published Rule
async function forkDraftVersion(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const sourceRule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!sourceRule) {
      return res.error('Source posting rule not found', 404);
    }

    const highestVersionRule = await PostingRule.findOne({
      tenant_id: tenantId,
      rule_code: sourceRule.rule_code
    }).sort({ version: -1 });

    const nextVersion = (highestVersionRule ? highestVersionRule.version : sourceRule.version) + 1;

    const newDraft = await PostingRule.create({
      tenant_id: tenantId,
      rule_code: sourceRule.rule_code,
      rule_name: `${sourceRule.rule_name} (v${nextVersion} Draft)`,
      description: sourceRule.description,
      event_code: sourceRule.event_code,
      event_type: sourceRule.event_type,
      applicable_module: sourceRule.applicable_module,
      accounting_basis: sourceRule.accounting_basis,
      tenant_type_applicability: sourceRule.tenant_type_applicability,
      priority: sourceRule.priority,
      conditions: sourceRule.conditions,
      status: 'DRAFT',
      version: nextVersion,
      parent_rule_id: sourceRule._id
    });

    const sourceLines = await PostingRuleLine.find({ posting_rule_id: sourceRule._id }).sort({ line_number: 1 });
    const newLines = [];
    for (const l of sourceLines) {
      const newLine = await PostingRuleLine.create({
        posting_rule_id: newDraft._id,
        tenant_id: tenantId,
        line_number: l.line_number,
        line_key: l.line_key,
        account_code: l.account_code,
        direction: l.direction,
        amount_expression: l.amount_expression,
        amount_field: l.amount_field,
        rounding_mode: l.rounding_mode,
        currency_expression: l.currency_expression,
        dimension_mappings: l.dimension_mappings,
        description_template: l.description_template
      });
      newLines.push(newLine);
    }

    return res.success(
      { rule: newDraft, lines: newLines },
      { message: `Created new draft version ${nextVersion} from published rule` },
      201
    );
  } catch (err) {
    return res.error('Failed to fork new draft version', 500, err.message);
  }
}

// Validate Rule endpoint
async function validateRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) return res.error('Posting rule not found', 404);

    const lines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
    const report = await validateRuleStructure(tenantId, rule, lines);

    rule.validation_report = {
      is_valid: report.is_valid,
      validated_at: new Date(),
      errors: report.errors,
      warnings: report.warnings
    };
    if (rule.status === 'DRAFT' && report.is_valid) {
      rule.status = 'VALIDATED';
    }
    await rule.save();

    return res.success(report);
  } catch (err) {
    return res.error('Failed to validate posting rule', 500, err.message);
  }
}

// Publish Rule endpoint
async function publishRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { id } = req.params;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) return res.error('Posting rule not found', 404);

    if (rule.status === 'PUBLISHED') {
      return res.error('This rule version is already published', 400);
    }

    const lines = await PostingRuleLine.find({ posting_rule_id: rule._id }).sort({ line_number: 1 });
    const report = await validateRuleStructure(tenantId, rule, lines);

    if (!report.is_valid) {
      return res.error(`Cannot publish invalid rule: ${report.errors.join('; ')}`, 400);
    }

    // Retire previous published versions of this rule_code
    await PostingRule.updateMany(
      {
        tenant_id: tenantId,
        rule_code: rule.rule_code,
        status: 'PUBLISHED',
        _id: { $ne: rule._id }
      },
      {
        $set: {
          status: 'RETIRED',
          retired_at: new Date(),
          retired_by_user_id: userId,
          retirement_reason: `Superseded by version ${rule.version}`
        }
      }
    );

    rule.validation_report = {
      is_valid: true,
      validated_at: new Date(),
      errors: [],
      warnings: report.warnings || []
    };
    rule.status = 'PUBLISHED';
    rule.published_at = new Date();
    rule.published_by_user_id = userId;
    rule.row_version = (rule.row_version || 1) + 1;
    await rule.save();

    return res.success(rule, { message: `Rule ${rule.rule_code} v${rule.version} published successfully` });
  } catch (err) {
    return res.error('Failed to publish rule', 500, err.message);
  }
}

// Retire Rule endpoint
async function retireRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { id } = req.params;
    const { reason = 'Manually retired by administrator' } = req.body;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) return res.error('Posting rule not found', 404);

    rule.status = 'RETIRED';
    rule.retired_at = new Date();
    rule.retired_by_user_id = userId;
    rule.retirement_reason = reason;
    rule.row_version = (rule.row_version || 1) + 1;
    await rule.save();

    return res.success(rule, { message: `Rule ${rule.rule_code} retired` });
  } catch (err) {
    return res.error('Failed to retire rule', 500, err.message);
  }
}

// Simulate Event API
async function simulateEvent(req, res) {
  try {
    const tenantId = req.tenantId;
    const { event_code, schema_version = '1.0.0', occurrence_date, payload = {} } = req.body;

    if (!event_code) {
      return res.error('event_code is required', 400);
    }

    const companyId = req.companyId || req.body.company_id || payload.company_id || null;

    const simResult = await simulateJournalFromEvent({
      tenantId,
      companyId,
      eventCode: event_code,
      schemaVersion: schema_version,
      occurrenceDate: occurrence_date || new Date(),
      tenantType: req.tenant ? req.tenant.tenant_type : null,
      payload
    });

    return res.success(simResult);
  } catch (err) {
    return res.error('Simulation error', 500, err.message);
  }
}

// Post Journal from Validated Simulation
async function postSimulatedJournal(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const {
      event_code,
      schema_version = '1.0.0',
      occurrence_date,
      payload = {},
      source_reference,
      memo,
      company_id
    } = req.body;

    if (!event_code) {
      return res.error('event_code is required', 400);
    }

    const companyId = req.companyId || company_id || payload.company_id || null;

    const postResult = await postJournalFromResolvedRule({
      tenantId,
      companyId,
      userId,
      eventCode: event_code,
      schemaVersion: schema_version,
      occurrenceDate: occurrence_date || new Date(),
      tenantType: req.tenant ? req.tenant.tenant_type : null,
      payload,
      sourceReference: source_reference,
      memo
    });

    return res.success(postResult, { message: 'Journal entry successfully posted from resolved rule' }, 201);
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// Reactivate Retired Rule endpoint
async function reactivateRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { id } = req.params;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) return res.error('Posting rule not found', 404);

    rule.status = 'PUBLISHED';
    rule.retired_at = null;
    rule.retirement_reason = '';
    rule.published_at = new Date();
    rule.published_by_user_id = userId;
    rule.row_version = (rule.row_version || 1) + 1;
    await rule.save();

    return res.success(rule, { message: `Rule ${rule.rule_code} reactivated and published successfully` });
  } catch (err) {
    return res.error('Failed to reactivate rule', 500, err.message);
  }
}

// Delete Posting Rule endpoint (Full CRUD support)
async function deletePostingRule(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const rule = await PostingRule.findOne({ _id: id, tenant_id: tenantId });
    if (!rule) {
      return res.error('Posting rule not found', 404);
    }

    // Delete associated lines
    await PostingRuleLine.deleteMany({ posting_rule_id: rule._id });

    // Delete rule test cases if any
    await PostingRuleTestCase.deleteMany({ posting_rule_id: rule._id });

    // Delete rule itself
    await PostingRule.deleteOne({ _id: rule._id });

    return res.success(
      { id: rule._id, rule_code: rule.rule_code },
      { message: `Posting rule ${rule.rule_code} deleted successfully` }
    );
  } catch (err) {
    return res.error('Failed to delete posting rule', 500, err.message);
  }
}

module.exports = {
  getPostingRules,
  getPostingRuleById,
  createPostingRule,
  updatePostingRule,
  forkDraftVersion,
  validateRule,
  publishRule,
  retireRule,
  reactivateRule,
  deletePostingRule,
  simulateEvent,
  postSimulatedJournal
};
