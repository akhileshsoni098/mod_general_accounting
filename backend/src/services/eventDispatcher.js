const {
  leasePendingOutboxEvents,
  markOutboxPublished,
  markOutboxFailed
} = require('./outboxService');
const { processEventForConsumer } = require('./inboxService');

let dispatcherTimer = null;
let isDispatching = false;

/**
 * Executes a single bounded dispatch run across leased outbox events.
 */
async function dispatchPendingEvents({
  limit = 20,
  workerId = `worker-${process.pid}`,
  tenantId = null,
  userId = null
} = {}) {
  const leased = await leasePendingOutboxEvents({
    limit,
    leaseDurationMs: 30000,
    workerId,
    tenantId
  });

  const results = [];
  let publishedCount = 0;
  let failedCount = 0;

  for (const event of leased) {
    try {
      // Deliver to standard JE_RULES_CONSUMER
      const consumerResult = await processEventForConsumer(event, 'JE_RULES_CONSUMER', { userId });

      if (consumerResult.success || consumerResult.duplicate || consumerResult.skipped) {
        await markOutboxPublished(event.event_id);
        publishedCount += 1;
        results.push({
          event_id: event.event_id,
          status: 'PUBLISHED',
          consumerResult
        });
      } else {
        await markOutboxFailed(event.event_id, {
          errorCategory: consumerResult.errorCategory || 'CONSUMER_FAILURE',
          errorMessage: consumerResult.errorMessage || 'Consumer rejected event',
          retryable: consumerResult.inboxMessage && consumerResult.inboxMessage.status === 'RETRY'
        });
        failedCount += 1;
        results.push({
          event_id: event.event_id,
          status: 'FAILED',
          consumerResult
        });
      }
    } catch (dispatchErr) {
      await markOutboxFailed(event.event_id, {
        errorCategory: 'DISPATCH_ERROR',
        errorMessage: dispatchErr.message,
        retryable: true
      });
      failedCount += 1;
      results.push({
        event_id: event.event_id,
        status: 'FAILED',
        error: dispatchErr.message
      });
    }
  }

  return {
    leasedCount: leased.length,
    publishedCount,
    failedCount,
    results
  };
}

/**
 * Starts the polling background dispatcher worker.
 */
function startDispatcher({ intervalMs = 5000 } = {}) {
  if (dispatcherTimer) return;

  dispatcherTimer = setInterval(async () => {
    if (isDispatching) return; // Prevent overlapping runs
    isDispatching = true;
    try {
      await dispatchPendingEvents({ limit: 10 });
    } catch (err) {
      console.error('[EventDispatcher Error]', err.message);
    } finally {
      isDispatching = false;
    }
  }, intervalMs);

  console.log(`[EventDispatcher] Started polling every ${intervalMs}ms`);
}

/**
 * Stops the polling background dispatcher worker.
 */
function stopDispatcher() {
  if (dispatcherTimer) {
    clearInterval(dispatcherTimer);
    dispatcherTimer = null;
    console.log('[EventDispatcher] Stopped');
  }
}

module.exports = {
  dispatchPendingEvents,
  startDispatcher,
  stopDispatcher
};
