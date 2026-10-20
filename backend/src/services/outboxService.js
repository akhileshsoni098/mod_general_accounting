const mongoose = require('mongoose');
const { OutboxEvent, EventDefinition } = require('../models');
const { validateEventPayloadAgainstSchema } = require('./eventSchemaValidator');

/**
 * Creates an OutboxEvent record atomically or as part of a transaction.
 */
async function createOutboxEvent({
  tenantId,
  eventId,
  eventType,
  eventVersion = '1.0.0',
  sourceModule,
  sourceEntityType,
  sourceEntityId,
  sourceTransactionId = null,
  correlationId = null,
  causationId = null,
  occurredAt = new Date(),
  payload,
  traceMetadata = {},
  session = null
}) {
  if (!tenantId) throw new Error('tenantId is required for outbox event');
  if (!eventId) throw new Error('eventId is required for outbox event');
  if (!eventType) throw new Error('eventType is required for outbox event');
  if (!sourceModule) throw new Error('sourceModule is required for outbox event');
  if (!sourceEntityType || !sourceEntityId) throw new Error('sourceEntity details required');
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a valid object');

  // Verify tenant ownership of event definition if one is registered
  const normalizedEventType = eventType.trim().toLowerCase();
  const eventDef = await EventDefinition.findOne({
    tenant_id: tenantId,
    event_code: normalizedEventType
  }).session(session);

  if (eventDef) {
    if (eventDef.status === 'ARCHIVED' || eventDef.status === 'INACTIVE') {
      throw new Error(`Event definition "${normalizedEventType}" is ${eventDef.status} and cannot accept new events`);
    }

    // Find schema version
    const versionObj = eventDef.versions.find(v => v.version === eventVersion) ||
      eventDef.versions.find(v => v.version === eventDef.current_version);

    if (versionObj && versionObj.json_schema) {
      const valResult = validateEventPayloadAgainstSchema(versionObj.json_schema, payload);
      if (!valResult.valid) {
        const errMsg = valResult.errors && valResult.errors[0] ? valResult.errors[0] : 'Schema validation failed';
        const err = new Error(`Payload validation failed for event "${normalizedEventType}" version "${eventVersion}": ${errMsg}`);
        err.code = 'INVALID_PAYLOAD_SCHEMA';
        err.details = valResult.errors;
        throw err;
      }
    }
  }

  const outboxDoc = new OutboxEvent({
    tenant_id: tenantId,
    event_id: eventId.trim(),
    event_type: normalizedEventType,
    event_version: eventVersion,
    source_module: sourceModule.toUpperCase(),
    source_entity_type: sourceEntityType,
    source_entity_id: String(sourceEntityId),
    source_transaction_id: sourceTransactionId ? String(sourceTransactionId) : null,
    correlation_id: correlationId ? String(correlationId) : null,
    causation_id: causationId ? String(causationId) : null,
    occurred_at: occurredAt,
    recorded_at: new Date(),
    payload,
    trace_metadata: traceMetadata || {},
    status: 'PENDING',
    attempt_count: 0,
    max_attempts: 5
  });

  const saved = await outboxDoc.save({ session });
  return saved;
}

/**
 * Leases pending or retry-eligible outbox events for a worker.
 * Prevents concurrent dispatchers from publishing the same event.
 */
async function leasePendingOutboxEvents({ limit = 20, leaseDurationMs = 30000, workerId = 'default-worker', tenantId = null }) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  const eligibleConditions = [
    {
      status: { $in: ['PENDING', 'RETRY'] },
      $and: [
        {
          $or: [
            { next_retry_at: null },
            { next_retry_at: { $lte: now } }
          ]
        },
        {
          $or: [
            { lease_expires_at: null },
            { lease_expires_at: { $lte: now } }
          ]
        }
      ]
    },
    {
      status: 'PROCESSING',
      lease_expires_at: { $lte: now }
    }
  ];

  const query = {
    $or: eligibleConditions
  };

  if (tenantId) {
    query.tenant_id = tenantId;
  }

  // Find candidate event IDs
  const candidates = await OutboxEvent.find(query)
    .sort({ occurred_at: 1, created_at: 1 })
    .limit(limit)
    .select('_id event_id')
    .lean();

  if (candidates.length === 0) {
    return [];
  }

  const candidateIds = candidates.map(c => c._id);

  // Atomically claim the lease on these candidate events
  await OutboxEvent.updateMany(
    {
      _id: { $in: candidateIds },
      $or: [
        { lease_expires_at: null },
        { lease_expires_at: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        lease_owner: workerId,
        lease_expires_at: leaseExpiresAt
      }
    }
  );

  // Retrieve the leased records
  const leasedEvents = await OutboxEvent.find({
    _id: { $in: candidateIds },
    lease_owner: workerId,
    lease_expires_at: leaseExpiresAt
  });

  return leasedEvents;
}

/**
 * Marks an outbox event as PUBLISHED upon successful delivery to consumers.
 */
async function markOutboxPublished(eventId, { session = null } = {}) {
  const event = await OutboxEvent.findOneAndUpdate(
    { event_id: eventId },
    {
      $set: {
        status: 'PUBLISHED',
        published_at: new Date(),
        lease_owner: null,
        lease_expires_at: null,
        last_error_category: null,
        last_error_message: null
      }
    },
    { new: true, session }
  );
  return event;
}

/**
 * Records a failure on an outbox event, updating attempt count, retry backoff, or moving to DEAD_LETTER.
 */
async function markOutboxFailed(eventId, {
  errorCategory = 'TRANSIENT_ERROR',
  errorMessage = 'Failed to deliver event',
  retryable = true,
  baseBackoffMs = 2000,
  maxAttempts = 5
}) {
  const event = await OutboxEvent.findOne({ event_id: eventId });
  if (!event) return null;

  event.attempt_count += 1;
  event.last_error_category = errorCategory;
  event.last_error_message = (errorMessage || '').substring(0, 1000);
  event.lease_owner = null;
  event.lease_expires_at = null;

  const isPermanent = !retryable || [
    'INVALID_PAYLOAD_SCHEMA',
    'NO_EVENT_DEFINITION',
    'AMBIGUOUS_RULE_MATCH',
    'NO_RULE_MATCH',
    'CLOSED_PERIOD'
  ].includes(errorCategory);

  if (event.attempt_count >= maxAttempts || isPermanent) {
    event.status = 'DEAD_LETTER';
    event.next_retry_at = null;
  } else {
    event.status = 'RETRY';
    // Exponential backoff with jitter: base * 2^(attempts-1)
    const delay = Math.min(baseBackoffMs * Math.pow(2, event.attempt_count - 1), 60000);
    event.next_retry_at = new Date(Date.now() + delay);
  }

  await event.save();
  return event;
}

/**
 * Manually schedules an eligible outbox event for retry.
 */
async function retryOutboxEvent(eventId, tenantId) {
  const event = await OutboxEvent.findOne({ event_id: eventId, tenant_id: tenantId });
  if (!event) throw new Error('Outbox event not found');

  if (event.status === 'PUBLISHED') {
    throw new Error('Cannot retry an already PUBLISHED event');
  }

  event.status = 'RETRY';
  event.next_retry_at = new Date(); // Immediate
  event.lease_owner = null;
  event.lease_expires_at = null;
  await event.save();
  return event;
}

/**
 * Replays a DEAD_LETTER outbox event with authorization and audit reason.
 */
async function replayOutboxDeadLetter(eventId, tenantId, { userId = null, reason = 'Operator manual replay' } = {}) {
  const event = await OutboxEvent.findOne({ event_id: eventId, tenant_id: tenantId });
  if (!event) throw new Error('Outbox event not found');

  if (event.status !== 'DEAD_LETTER') {
    throw new Error(`Only DEAD_LETTER events can be replayed (current status: ${event.status})`);
  }

  event.status = 'PENDING';
  event.next_retry_at = new Date();
  event.attempt_count = 0; // Reset attempts for fresh cycle
  event.lease_owner = null;
  event.lease_expires_at = null;
  event.trace_metadata = {
    ...(event.trace_metadata || {}),
    replayed_at: new Date(),
    replayed_by_user_id: userId,
    replay_reason: reason
  };

  await event.save();
  return event;
}

module.exports = {
  createOutboxEvent,
  leasePendingOutboxEvents,
  markOutboxPublished,
  markOutboxFailed,
  retryOutboxEvent,
  replayOutboxDeadLetter
};
