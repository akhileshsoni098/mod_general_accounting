const mongoose = require('mongoose');
const { createOutboxEvent, markOutboxPublished, markOutboxFailed } = require('./outboxService');
const { processEventForConsumer } = require('./inboxService');

/**
 * Publishes a domain event into the transactional outbox and optionally
 * dispatches it immediately to the registered JE_RULES_CONSUMER.
 *
 * Invariants:
 * 1. Persists an OutboxEvent record atomically.
 * 2. When dispatchImmediately === true, evaluates published rules via JE_RULES_CONSUMER.
 * 3. Fails visibly on missing or ambiguous rules (NO_RULE_MATCH, AMBIGUOUS_RULE_MATCH).
 * 4. Never silently falls back to hardcoded ledger accounts.
 */
async function publishAndProcessDomainEvent({
  tenantId,
  eventType,
  eventVersion = '1.0.0',
  sourceModule,
  sourceEntityType,
  sourceEntityId,
  sourceTransactionId = null,
  correlationId = null,
  causationId = null,
  occurredAt = new Date(),
  payload = {},
  traceMetadata = {},
  userId = null,
  session = null,
  dispatchImmediately = true
}) {
  if (!tenantId) throw new Error('tenantId is required for domain event');
  if (!eventType) throw new Error('eventType is required for domain event');
  if (!sourceModule) throw new Error('sourceModule is required for domain event');
  if (!sourceEntityType || !sourceEntityId) throw new Error('sourceEntity details are required');

  const cleanEntityId = String(sourceEntityId).replace(/[^a-zA-Z0-9_-]/g, '');
  const prefix = eventType.replace(/\./g, '-').toUpperCase();
  const eventId = `EVT-${prefix}-${cleanEntityId}-${Date.now().toString(36)}`;

  // 1. Persist Outbox Event
  const outboxEvent = await createOutboxEvent({
    tenantId,
    eventId,
    eventType,
    eventVersion,
    sourceModule,
    sourceEntityType,
    sourceEntityId: String(sourceEntityId),
    sourceTransactionId: sourceTransactionId ? String(sourceTransactionId) : null,
    correlationId: correlationId || `CORR-${prefix}-${cleanEntityId}`,
    causationId: causationId ? String(causationId) : null,
    occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    payload,
    traceMetadata,
    session
  });

  if (!dispatchImmediately) {
    return {
      success: true,
      pending: true,
      outboxEvent
    };
  }

  // 2. Immediate Consumer Dispatch outside session
  return await dispatchOutboxEventRecord(outboxEvent, { userId });
}

const { OutboxEvent } = require('../models');

async function dispatchOutboxEventRecord(outboxEventOrId, { userId = null } = {}) {
  let outboxEvent = outboxEventOrId;
  if (outboxEventOrId && (typeof outboxEventOrId === 'string' || outboxEventOrId instanceof mongoose.Types.ObjectId)) {
    outboxEvent = await OutboxEvent.findById(outboxEventOrId);
  }
  if (!outboxEvent) {
    throw new Error('Outbox event record not found for dispatch');
  }

  const consumerResult = await processEventForConsumer(outboxEvent, 'JE_RULES_CONSUMER', {
    userId,
    workerId: `publisher-${process.pid}`
  });

  if (consumerResult.success || consumerResult.duplicate || consumerResult.recovered) {
    const publishedOutbox = await markOutboxPublished(outboxEvent.event_id);
    return {
      success: true,
      outboxEvent: publishedOutbox || outboxEvent,
      inboxMessage: consumerResult.inboxMessage,
      journal: consumerResult.journal || null,
      journalId: consumerResult.journal ? consumerResult.journal._id : (consumerResult.journal_id || null),
      rule: consumerResult.rule || null,
      duplicate: consumerResult.duplicate || false,
      recovered: consumerResult.recovered || false
    };
  }

  if (consumerResult.skipped) {
    await markOutboxPublished(outboxEvent.event_id);
    return {
      success: true,
      skipped: true,
      reason: consumerResult.reason,
      outboxEvent,
      inboxMessage: consumerResult.inboxMessage
    };
  }

  // Handle Failure: Mark Outbox Failed and throw visible actionable error
  await markOutboxFailed(outboxEvent.event_id, {
    errorCategory: consumerResult.errorCategory || 'CONSUMER_FAILURE',
    errorMessage: consumerResult.errorMessage || 'Event processing failed',
    retryable: consumerResult.inboxMessage && consumerResult.inboxMessage.status === 'RETRY'
  });

  const error = new Error(consumerResult.errorMessage || `Domain event ${outboxEvent.event_type} failed during rule execution`);
  error.code = consumerResult.errorCode || 'EVENT_PROCESSING_FAILED';
  error.category = consumerResult.errorCategory || 'PROCESSING_ERROR';
  error.eventId = outboxEvent.event_id;
  error.inboxMessage = consumerResult.inboxMessage;
  throw error;
}

module.exports = {
  publishAndProcessDomainEvent,
  dispatchOutboxEventRecord
};
