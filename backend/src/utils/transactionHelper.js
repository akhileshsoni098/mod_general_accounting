const mongoose = require('mongoose');

/**
 * Diagnostic helper to inspect whether the current MongoDB deployment supports
 * multi-document transactions (requires Replica Set or Sharded cluster).
 */
function getDatabaseTopologyInfo() {
  const topology = mongoose.connection?.client?.topology?.description?.type || 'Unknown';
  // MongoDB requires ReplicaSetWithPrimary or Sharded for transactions
  const transactionsSupported = ['ReplicaSetWithPrimary', 'ReplicaSetNoPrimary', 'Sharded'].includes(topology);
  return {
    topology,
    transactionsSupported,
    status: transactionsSupported ? 'TRANSACTION_CAPABLE' : 'NON_TRANSACTIONAL'
  };
}

/**
 * Utility to run an async operation within a MongoDB transaction session.
 *
 * Invariants:
 * 1. For accounting-critical domain operations, multi-document transactions are REQUIRED.
 * 2. If failClosed === true (default) and standalone MongoDB ('Single' topology) is detected,
 *    fails closed by throwing a clear operational error BEFORE persisting any business record.
 * 3. Never silently downgrades an accounting-critical operation to non-transactional writes.
 * 4. Only if explicitly allowed (e.g. non-financial operations or explicit opt-in failClosed: false),
 *    falls back to fn(null).
 */
async function withOptionalTransaction(fn, { failClosed = true } = {}) {
  const { topology, transactionsSupported } = getDatabaseTopologyInfo();

  if (!transactionsSupported) {
    if (failClosed) {
      const err = new Error(
        `DATABASE_TOPOLOGY_UNSUPPORTED: Multi-document financial transactions require a MongoDB Replica Set or Sharded cluster. Standalone "${topology}" topology cannot guarantee atomic business and outbox writes.`
      );
      err.code = 'DATABASE_TOPOLOGY_UNSUPPORTED';
      err.topology = topology;
      throw err;
    }
    return await fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  withOptionalTransaction,
  getDatabaseTopologyInfo
};

