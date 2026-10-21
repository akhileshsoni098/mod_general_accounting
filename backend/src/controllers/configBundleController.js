const {
  EventDefinition,
  PostingRule,
  PostingRuleLine,
  PostingRuleTestCase,
  LedgerAccount
} = require('../models');
const { validateSchemaStructure } = require('../services/eventSchemaValidator');

// Export active tenant's accounting configuration bundle
async function exportConfiguration(req, res) {
  try {
    const tenantId = req.tenantId;

    const eventDefinitions = await EventDefinition.find({ tenant_id: tenantId });
    const rules = await PostingRule.find({ tenant_id: tenantId });
    const ruleIds = rules.map(r => r._id);
    const ruleLines = await PostingRuleLine.find({ posting_rule_id: { $in: ruleIds } });
    const testCases = await PostingRuleTestCase.find({ tenant_id: tenantId });

    const bundle = {
      version: '1.0.0',
      bundle_version: '1.0.0',
      exported_at: new Date().toISOString(),
      tenant_id: tenantId.toString(),
      data: {
        event_definitions: eventDefinitions.map(e => ({
          event_code: e.event_code,
          display_name: e.display_name,
          description: e.description,
          source_module: e.source_module,
          category: e.category,
          current_version: e.current_version,
          versions: (e.versions || []).map(v => ({
            version: v.version,
            json_schema: v.json_schema,
            sample_payload: v.sample_payload,
            description: v.description
          }))
        })),
        posting_rules: rules.map(r => {
          const lines = ruleLines.filter(l => l.posting_rule_id.toString() === r._id.toString());
          return {
            rule_code: r.rule_code,
            rule_name: r.rule_name,
            description: r.description,
            event_code: r.event_code,
            applicable_module: r.applicable_module,
            accounting_basis: r.accounting_basis,
            tenant_type_applicability: r.tenant_type_applicability,
            priority: r.priority,
            conditions: r.conditions,
            lines: lines.map(l => ({
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
            }))
          };
        }),
        test_cases: testCases.map(tc => ({
          test_name: tc.test_name,
          description: tc.description,
          schema_version: tc.schema_version,
          input_payload: tc.input_payload,
          expected_outcome: tc.expected_outcome
        }))
      }
    };

    return res.success(bundle);
  } catch (err) {
    return res.error('Failed to export configuration bundle', 500, err.message);
  }
}

// Preview import bundle and detect missing accounts or validation issues
async function previewImport(req, res) {
  try {
    const tenantId = req.tenantId;
    const { bundle } = req.body;

    if (!bundle || !bundle.data) {
      return res.error('Invalid bundle format: missing data container', 400);
    }

    const { event_definitions = [], posting_rules = [] } = bundle.data;
    const errors = [];
    const warnings = [];

    // Check account existence for rule lines in the active tenant's COA
    for (const rule of posting_rules) {
      for (const line of (rule.lines || [])) {
        if (!line.account_code) {
          errors.push(`Rule "${rule.rule_code}" line ${line.line_number} is missing account_code`);
        } else {
          const acc = await LedgerAccount.findOne({ tenant_id: tenantId, account_code: line.account_code });
          if (!acc) {
            errors.push(`Account code "${line.account_code}" required by rule "${rule.rule_code}" is missing in target tenant COA`);
          } else if (!acc.is_posting_allowed) {
            warnings.push(`Account "${line.account_code}" has posting disallowed`);
          }
        }
      }
    }

    // Validate event definition schemas
    for (const ed of event_definitions) {
      for (const ver of (ed.versions || [])) {
        const val = validateSchemaStructure(ver.json_schema);
        if (!val.valid) {
          errors.push(`Event "${ed.event_code}" schema v${ver.version} is invalid: ${val.errors.join(', ')}`);
        }
      }
    }

    return res.success({
      valid: errors.length === 0,
      errors,
      warnings,
      counts: {
        event_definitions: event_definitions.length,
        posting_rules: posting_rules.length
      }
    });
  } catch (err) {
    return res.error('Failed to preview import bundle', 500, err.message);
  }
}

// Confirmed import into active tenant
async function confirmedImport(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { bundle } = req.body;

    if (!bundle || !bundle.data) {
      return res.error('Invalid bundle format', 400);
    }

    const { event_definitions = [], posting_rules = [] } = bundle.data;

    // 1. Import event definitions (tenant-scoped)
    for (const ed of event_definitions) {
      await EventDefinition.findOneAndUpdate(
        { tenant_id: tenantId, event_code: ed.event_code.toLowerCase().trim() },
        {
          display_name: ed.display_name,
          description: ed.description || '',
          source_module: ed.source_module || 'BILLING',
          category: ed.category || 'TRANSACTION',
          current_version: ed.current_version || '1.0.0',
          versions: (ed.versions || []).map(v => ({
            version: v.version,
            json_schema: v.json_schema,
            sample_payload: v.sample_payload || null,
            description: v.description || '',
            created_by_user_id: userId
          })),
          status: 'ACTIVE'
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // 2. Import posting rules and lines (tenant-scoped)
    for (const pr of posting_rules) {
      const ruleDoc = await PostingRule.findOneAndUpdate(
        { tenant_id: tenantId, rule_code: pr.rule_code.toUpperCase().trim() },
        {
          rule_name: pr.rule_name,
          description: pr.description || '',
          event_code: pr.event_code.toLowerCase().trim(),
          event_type: pr.event_code.toUpperCase().trim(),
          applicable_module: pr.applicable_module || 'GL',
          accounting_basis: pr.accounting_basis || 'GAAP',
          tenant_type_applicability: pr.tenant_type_applicability || ['CARRIER', 'MGA', 'BROKER', 'OTHER'],
          priority: Number(pr.priority) || 100,
          conditions: pr.conditions || [],
          status: 'DRAFT', // Imported rules start in DRAFT
          version: 1
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Re-create lines
      await PostingRuleLine.deleteMany({ posting_rule_id: ruleDoc._id });
      for (const l of (pr.lines || [])) {
        await PostingRuleLine.create({
          posting_rule_id: ruleDoc._id,
          tenant_id: tenantId,
          line_number: l.line_number,
          line_key: l.line_key || null,
          account_code: l.account_code,
          direction: l.direction,
          amount_expression: l.amount_expression || (l.amount_field ? `payload.${l.amount_field}` : null),
          amount_field: l.amount_field || null,
          rounding_mode: l.rounding_mode || 'ROUND_HALF_UP',
          currency_expression: l.currency_expression || 'USD',
          dimension_mappings: l.dimension_mappings || {},
          description_template: l.description_template || ''
        });
      }
    }

    return res.success(
      {
        imported_events: event_definitions.length,
        imported_rules: posting_rules.length
      },
      { message: 'Configuration successfully imported into tenant workspace' },
      201
    );
  } catch (err) {
    return res.error('Failed to import configuration bundle', 500, err.message);
  }
}

module.exports = {
  exportConfiguration,
  previewImport,
  confirmedImport
};
