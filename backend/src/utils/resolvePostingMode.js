const { PostingRule } = require('../models');

/**
 * Determines whether a business operation should post via the legacy adapter
 * or through the durable event pipeline with published JE rules.
 *
 * Rules:
 * 1. If useMigrationAdapter === true -> true (explicitly requested)
 * 2. If the tenant has a PUBLISHED PostingRule for this event -> false (rules-driven tenant)
 * 3. If no published rule exists AND process.env.ENABLE_LEGACY_POSTING_ADAPTER === 'true' -> true (legacy unmigrated tenant fallback)
 * 4. Otherwise -> false (pure event pipeline mode, fails visibly on missing rules)
 */
async function shouldUseLegacyAdapter({ tenantId, eventCode, useMigrationAdapter = false }) {
  if (useMigrationAdapter) {
    return true;
  }

  if (tenantId && eventCode) {
    const hasPublishedRule = await PostingRule.exists({
      tenant_id: tenantId,
      event_code: eventCode,
      status: 'PUBLISHED'
    });
    if (hasPublishedRule) {
      return false;
    }
  }

  if (process.env.ENABLE_LEGACY_POSTING_ADAPTER === 'true') {
    return true;
  }

  return false;
}

module.exports = {
  shouldUseLegacyAdapter
};
