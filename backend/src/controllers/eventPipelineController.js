const { OutboxEvent, InboxMessage, EventSubscription, Journal, JournalEntry } = require('../models');
const { dispatchPendingEvents } = require('../services/eventDispatcher');
const { retryOutboxEvent, replayOutboxDeadLetter } = require('../services/outboxService');
const { retryInboxMessage, replayInboxDeadLetter, CONSUMER_REGISTRY } = require('../services/inboxService');

// GET /api/v1/event-pipeline/stats
async function getPipelineStats(req, res) {
  try {
    const tenantId = req.tenantId;

    const [outboxPending, outboxPublished, outboxRetry, outboxDeadLetter] = await Promise.all([
      OutboxEvent.countDocuments({ tenant_id: tenantId, status: { $in: ['PENDING', 'PROCESSING'] } }),
      OutboxEvent.countDocuments({ tenant_id: tenantId, status: 'PUBLISHED' }),
      OutboxEvent.countDocuments({ tenant_id: tenantId, status: 'RETRY' }),
      OutboxEvent.countDocuments({ tenant_id: tenantId, status: 'DEAD_LETTER' })
    ]);

    const [inboxReceived, inboxProcessed, inboxRetry, inboxDeadLetter] = await Promise.all([
      InboxMessage.countDocuments({ tenant_id: tenantId, status: { $in: ['RECEIVED', 'PROCESSING'] } }),
      InboxMessage.countDocuments({ tenant_id: tenantId, status: 'PROCESSED' }),
      InboxMessage.countDocuments({ tenant_id: tenantId, status: 'RETRY' }),
      InboxMessage.countDocuments({ tenant_id: tenantId, status: 'DEAD_LETTER' })
    ]);

    return res.json({
      success: true,
      data: {
        outbox: {
          pending: outboxPending,
          published: outboxPublished,
          retry: outboxRetry,
          dead_letter: outboxDeadLetter
        },
        inbox: {
          received: inboxReceived,
          processed: inboxProcessed,
          retry: inboxRetry,
          dead_letter: inboxDeadLetter
        },
        consumers: Object.values(CONSUMER_REGISTRY)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/v1/event-pipeline/outbox
async function listOutbox(req, res) {
  try {
    const tenantId = req.tenantId;
    const { status, event_type, correlation_id, limit = 50, page = 1 } = req.query;

    const filter = { tenant_id: tenantId };
    if (status) filter.status = status;
    if (event_type) filter.event_type = event_type.toLowerCase();
    if (correlation_id) filter.correlation_id = correlation_id;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [events, total] = await Promise.all([
      OutboxEvent.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      OutboxEvent.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/v1/event-pipeline/inbox
async function listInbox(req, res) {
  try {
    const tenantId = req.tenantId;
    const { status, consumer_name, event_type, limit = 50, page = 1 } = req.query;

    const filter = { tenant_id: tenantId };
    if (status) filter.status = status;
    if (consumer_name) filter.consumer_name = consumer_name;
    if (event_type) filter.event_type = event_type.toLowerCase();

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [messages, total] = await Promise.all([
      InboxMessage.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      InboxMessage.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/v1/event-pipeline/dispatch (Manual trigger)
async function triggerDispatch(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { limit = 20 } = req.body;

    const result = await dispatchPendingEvents({
      limit: parseInt(limit),
      workerId: `manual-trigger-${req.userId || 'admin'}`,
      tenantId,
      userId
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/v1/event-pipeline/outbox/:eventId/retry
async function retryOutbox(req, res) {
  try {
    const tenantId = req.tenantId;
    const { eventId } = req.params;

    const updated = await retryOutboxEvent(eventId, tenantId);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// POST /api/v1/event-pipeline/outbox/:eventId/replay
async function replayOutbox(req, res) {
  try {
    const tenantId = req.tenantId;
    const { eventId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Replay reason is required for audit traceability' });
    }

    const updated = await replayOutboxDeadLetter(eventId, tenantId, {
      userId: req.userId,
      reason
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// POST /api/v1/event-pipeline/inbox/:id/retry
async function retryInbox(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const updated = await retryInboxMessage(id, tenantId);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// POST /api/v1/event-pipeline/inbox/:id/replay
async function replayInbox(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Replay reason is required for audit traceability' });
    }

    const updated = await replayInboxDeadLetter(id, tenantId, {
      userId: req.userId,
      reason
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// GET /api/v1/event-pipeline/trace/:identifier
async function getEventTrace(req, res) {
  try {
    const tenantId = req.tenantId;
    const { identifier } = req.params;

    // Search across event_id, correlation_id, and source_entity_id
    const outboxEvents = await OutboxEvent.find({
      tenant_id: tenantId,
      $or: [
        { event_id: identifier },
        { correlation_id: identifier },
        { source_entity_id: identifier }
      ]
    }).sort({ created_at: -1 }).lean();

    const eventIds = outboxEvents.map(e => e.event_id);
    if (!eventIds.includes(identifier)) {
      eventIds.push(identifier);
    }

    const inboxMessages = await InboxMessage.find({
      tenant_id: tenantId,
      event_id: { $in: eventIds }
    }).lean();

    // Find journals posted from these events
    const journalIds = inboxMessages
      .filter(m => m.result && m.result.journal_id)
      .map(m => m.result.journal_id);

    const journals = await Journal.find({
      tenant_id: tenantId,
      $or: [
        { _id: { $in: journalIds } },
        { reference_id: { $in: eventIds } }
      ]
    }).lean();

    const jIds = journals.map(j => j._id);
    const journalLines = await JournalEntry.find({
      journal_id: { $in: jIds }
    }).lean();

    return res.json({
      success: true,
      data: {
        identifier,
        outbox_events: outboxEvents,
        inbox_messages: inboxMessages,
        journals: journals.map(j => ({
          ...j,
          lines: journalLines.filter(l => String(l.journal_id) === String(j._id))
        }))
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Subscriptions APIs
async function listSubscriptions(req, res) {
  try {
    const tenantId = req.tenantId;
    const subscriptions = await EventSubscription.find({ tenant_id: tenantId }).sort({ event_type: 1 }).lean();
    return res.json({ success: true, data: subscriptions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function upsertSubscription(req, res) {
  try {
    const tenantId = req.tenantId;
    const { subscription_code, consumer_name, event_type, is_active, description } = req.body;

    if (!subscription_code || !consumer_name || !event_type) {
      return res.status(400).json({ success: false, error: 'subscription_code, consumer_name, and event_type are required' });
    }

    const sub = await EventSubscription.findOneAndUpdate(
      { tenant_id: tenantId, consumer_name, event_type: event_type.toLowerCase() },
      {
        $set: {
          subscription_code: subscription_code.toUpperCase(),
          is_active: is_active !== undefined ? Boolean(is_active) : true,
          description: description || ''
        }
      },
      { new: true, upsert: true }
    );

    return res.json({ success: true, data: sub });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function toggleSubscription(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const sub = await EventSubscription.findOne({ _id: id, tenant_id: tenantId });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    sub.is_active = !sub.is_active;
    await sub.save();

    return res.json({ success: true, data: sub });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getPipelineStats,
  listOutbox,
  listInbox,
  triggerDispatch,
  retryOutbox,
  replayOutbox,
  retryInbox,
  replayInbox,
  getEventTrace,
  listSubscriptions,
  upsertSubscription,
  toggleSubscription
};
