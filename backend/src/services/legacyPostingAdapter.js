const { postJournalEntry } = require('./journalPostingService');

/**
 * Approved Migration Adapter (Phase R4 Section 7 R4-F)
 *
 * Encapsulates legacy point-to-point direct GL posting for backward compatibility
 * with prior-phase acceptance suites and non-rules tenants.
 *
 * All standard business operations must use `domainEventPublisher` and published
 * tenant JE rules. This adapter logs an audit deprecation notice whenever invoked.
 */
async function legacyDirectPost({
  tenantId,
  userId,
  postingDate,
  sourceModule,
  referenceId,
  memo,
  lines,
  currency = 'USD',
  accountingBasis = 'GAAP'
}) {
  console.warn(
    `[DEPRECATION AUDIT] Legacy direct posting invoked for ${sourceModule} (${referenceId}) by actor ${userId || 'SYSTEM'} on tenant ${tenantId}. Timestamp: ${new Date().toISOString()}. In production, use published JE rules.`
  );

  const glResult = await postJournalEntry({
    tenantId,
    userId,
    postingDate,
    sourceModule,
    referenceId,
    memo: `[LEGACY ADAPTER] ${memo}`,
    lines,
    currency,
    accountingBasis
  });

  return {
    ...glResult,
    legacy_adapter_invoked: true,
    actor_id: userId || 'SYSTEM',
    tenant_id: tenantId,
    timestamp: new Date()
  };
}

module.exports = {
  legacyDirectPost
};
