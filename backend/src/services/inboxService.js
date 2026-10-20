const mongoose = require('mongoose');
const { InboxMessage, EventSubscription, Journal } = require('../models');
const { simulateJournalFromEvent } = require('./eventSimulatorService');
const { postJournalEntry } = require('./journalPostingService');

/**
 * Registry of active logical consumers
 */
const CONSUMER_REGISTRY = {
  JE_RULES_CONSUMER: {
    name: 'JE_RULES_CONSUMER',
    version: '1.0.0',
    description: 'Resolves published JE PostingRules and posts balanced double-entry journals'
  }
};

/**
 * Processes an event for a logical consumer with idempotent deduplication and state persistence.
 */
async function processEventForConsumer(outboxEvent, consumerName = 'JE_RULES_CONSUMER', { userId = null, workerId = null } = {}) {
  const tenantId = outboxEvent.tenant_id;
  const eventId = outboxEvent.event_id;
  const eventType = outboxEvent.event_type.trim().toLowerCase();
  const eventVersion = outboxEvent.event_version || '1.0.0';

  // 1. Consumer Deduplication Check
  let inboxMsg = await InboxMessage.findOne({
    tenant_id: tenantId,
    consumer_name: consumerName,
    event_id: eventId
  });

  if (inboxMsg && inboxMsg.status === 'PROCESSED') {
    return {
      duplicate: true,
      status: 'PROCESSED',
      inboxMessage: inboxMsg,
      journal_id: inboxMsg.result ? inboxMsg.result.journal_id : null
    };
  }

  // 2. Initialize Inbox Message if not present
  if (!inboxMsg) {
    try {
      inboxMsg = new InboxMessage({
        tenant_id: tenantId,
        event_id: eventId,
        consumer_name: consumerName,
        event_type: eventType,
        event_version: eventVersion,
        correlation_id: outboxEvent.correlation_id,
        causation_id: outboxEvent.causation_id,
        status: 'RECEIVED',
        attempt_count: 0,
        max_attempts: 5
      });
      await inboxMsg.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        // Race condition: another thread created it
        inboxMsg = await InboxMessage.findOne({
          tenant_id: tenantId,
          consumer_name: consumerName,
          event_id: eventId
        });
      } else {
        throw saveErr;
      }
    }
  }

  // 3. Subscription Check
  const subscription = await EventSubscription.findOne({
    tenant_id: tenantId,
    consumer_name: consumerName,
    event_type: eventType
  });

  if (subscription && !subscription.is_active) {
    inboxMsg.status = 'PROCESSED';
    inboxMsg.processed_at = new Date();
    inboxMsg.result = { skipped: true, reason: 'SUBSCRIPTION_PAUSED' };
    await inboxMsg.save();
    return {
      skipped: true,
      reason: 'SUBSCRIPTION_PAUSED',
      inboxMessage: inboxMsg
    };
  }

  // 4. Atomic claim for PROCESSING
  const claimedMsg = await InboxMessage.findOneAndUpdate(
    {
      _id: inboxMsg._id,
      status: { $in: ['RECEIVED', 'RETRY'] }
    },
    {
      $set: {
        status: 'PROCESSING',
        lease_owner: workerId || 'default-worker',
        lease_expires_at: new Date(Date.now() + 30000)
      },
      $inc: { attempt_count: 1 }
    },
    { new: true }
  );

  if (!claimedMsg) {
    // Another worker or thread claimed it or it is already PROCESSED
    let current = await InboxMessage.findById(inboxMsg._id);
    if (current && current.status === 'PROCESSED') {
      return {
        duplicate: true,
        status: 'PROCESSED',
        inboxMessage: current,
        journal_id: current.result ? current.result.journal_id : null
      };
    }
    // If it's currently PROCESSING by another thread, wait briefly for it to complete
    if (current && current.status === 'PROCESSING') {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 100));
        current = await InboxMessage.findById(inboxMsg._id);
        if (current && current.status === 'PROCESSED') {
          return {
            duplicate: true,
            status: 'PROCESSED',
            inboxMessage: current,
            journal_id: current.result ? current.result.journal_id : null
          };
        }
      }
      return {
        duplicate: true,
        status: 'PROCESSING',
        inboxMessage: current
      };
    }
  } else {
    inboxMsg = claimedMsg;
  }

  // 5. Check if GL journal was ALREADY posted for this event (lost acknowledgment recovery)
  const existingJournal = await Journal.findOne({
    tenant_id: tenantId,
    source_module: 'RULES_ENGINE',
    reference_id: eventId
  });

  if (existingJournal) {
    inboxMsg.status = 'PROCESSED';
    inboxMsg.processed_at = new Date();
    inboxMsg.result = {
      journal_id: existingJournal._id,
      journal_number: existingJournal.journal_number,
      recovered: true
    };
    await inboxMsg.save();
    return {
      success: true,
      recovered: true,
      journal: existingJournal,
      inboxMessage: inboxMsg
    };
  }

  // 6. Execute JE_RULES_CONSUMER Logic
  try {
    const sim = await simulateJournalFromEvent({
      tenantId,
      eventCode: eventType,
      schemaVersion: eventVersion,
      occurrenceDate: outboxEvent.occurred_at || new Date(),
      payload: outboxEvent.payload
    });

    if (!sim.success) {
      let errCategory = 'TRANSIENT_ERROR';
      let errCode = 'SIMULATION_FAILED';
      const errText = (sim.errors || []).join(' ');

      if (errText.includes('Ambiguous') || errText.includes('AMBIGUOUS_RULE_MATCH')) {
        errCategory = 'AMBIGUOUS_RULE_MATCH';
        errCode = 'AMBIGUOUS_RULE_MATCH';
      } else if (
        errText.includes('not found') ||
        errText.includes('NO_MATCH') ||
        sim.stage === 'RULE_RESOLUTION' ||
        (sim.code && sim.code.includes('NO_MATCH'))
      ) {
        errCategory = 'NO_RULE_MATCH';
        errCode = 'NO_RULE_MATCH';
      } else if (sim.stage === 'SCHEMA_VALIDATION' || sim.stage === 'PAYLOAD_VALIDATION') {
        errCategory = 'INVALID_PAYLOAD_SCHEMA';
        errCode = 'SCHEMA_VIOLATION';
      } else if (sim.stage === 'LINE_EVALUATION') {
        errCategory = 'INVALID_ACCOUNT';
        errCode = 'ACCOUNT_RESOLUTION_ERROR';
      } else if (!sim.balanced) {
        errCategory = 'JOURNAL_IMBALANCE';
        errCode = 'DOUBLE_ENTRY_IMBALANCE';
      }

      const failureMessage = (sim.errors || ['Rule engine evaluation failed']).join('; ');
      return await recordInboxFailure(inboxMsg, {
        errorCategory: errCategory,
        errorCode: errCode,
        errorMessage: failureMessage
      });
    }

    if (!sim.balanced) {
      return await recordInboxFailure(inboxMsg, {
        errorCategory: 'JOURNAL_IMBALANCE',
        errorCode: 'DOUBLE_ENTRY_IMBALANCE',
        errorMessage: `Debits ($${sim.total_debit}) != Credits ($${sim.total_credit})`
      });
    }

    // Prepare journal lines
    const journalLines = sim.lines.map(l => ({
      account_code: l.account_code,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo || `Event ${eventType}`,
      dimensions: l.dimensions
    }));

    // Post to General Ledger using existing GL engine
    const glResult = await postJournalEntry({
      tenantId,
      userId,
      postingDate: outboxEvent.occurred_at || new Date(),
      sourceModule: 'RULES_ENGINE',
      referenceId: eventId,
      memo: `Rule ${sim.rule.rule_code} (v${sim.rule.version}) for ${eventType} (${eventId})`,
      lines: journalLines,
      accountingBasis: sim.rule.accounting_basis || 'GAAP'
    });

    // Record success
    inboxMsg.status = 'PROCESSED';
    inboxMsg.processed_at = new Date();
    inboxMsg.last_error_code = null;
    inboxMsg.last_error_category = null;
    inboxMsg.last_error_message = null;
    inboxMsg.result = {
      journal_id: glResult.journal._id,
      journal_number: glResult.journal.journal_number,
      rule_code: sim.rule.rule_code,
      rule_version: sim.rule.version,
      total_debit: sim.total_debit,
      total_credit: sim.total_credit
    };
    await inboxMsg.save();

    return {
      success: true,
      journal: glResult.journal,
      rule: sim.rule,
      inboxMessage: inboxMsg
    };

  } catch (err) {
    let errCategory = 'TRANSIENT_ERROR';
    let errCode = 'POSTING_ERROR';

    if (err.message && err.message.includes('HARD_CLOSED')) {
      errCategory = 'CLOSED_PERIOD';
      errCode = 'CLOSED_FISCAL_PERIOD';
    } else if (err.message && err.message.includes('Duplicate posting prevented')) {
      // Handled as recovery
      const j = await Journal.findOne({
        tenant_id: tenantId,
        source_module: 'RULES_ENGINE',
        reference_id: eventId
      });
      if (j) {
        inboxMsg.status = 'PROCESSED';
        inboxMsg.processed_at = new Date();
        inboxMsg.result = {
          journal_id: j._id,
          journal_number: j.journal_number,
          recovered: true
        };
        await inboxMsg.save();
        return { success: true, recovered: true, journal: j, inboxMessage: inboxMsg };
      }
    }

    return await recordInboxFailure(inboxMsg, {
      errorCategory: errCategory,
      errorCode: errCode,
      errorMessage: err.message
    });
  }
}

/**
 * Updates inbox message state on failure.
 */
async function recordInboxFailure(inboxMsg, { errorCategory, errorCode, errorMessage }) {
  inboxMsg.last_error_category = errorCategory;
  inboxMsg.last_error_code = errorCode;
  inboxMsg.last_error_message = (errorMessage || '').substring(0, 1000);

  const permanentCategories = [
    'INVALID_PAYLOAD_SCHEMA',
    'NO_RULE_MATCH',
    'AMBIGUOUS_RULE_MATCH',
    'JOURNAL_IMBALANCE',
    'INVALID_ACCOUNT',
    'CLOSED_PERIOD'
  ];

  const isPermanent = permanentCategories.includes(errorCategory);

  if (isPermanent || inboxMsg.attempt_count >= inboxMsg.max_attempts) {
    inboxMsg.status = 'DEAD_LETTER';
    inboxMsg.next_retry_at = null;
  } else {
    inboxMsg.status = 'RETRY';
    const delay = Math.min(2000 * Math.pow(2, inboxMsg.attempt_count - 1), 60000);
    inboxMsg.next_retry_at = new Date(Date.now() + delay);
  }

  await inboxMsg.save();

  return {
    success: false,
    errorCategory,
    errorCode,
    errorMessage,
    inboxMessage: inboxMsg
  };
}

/**
 * Retries an inbox message in RETRY or DEAD_LETTER state.
 */
async function retryInboxMessage(inboxId, tenantId) {
  const msg = await InboxMessage.findOne({ _id: inboxId, tenant_id: tenantId });
  if (!msg) throw new Error('Inbox message not found');

  if (msg.status === 'PROCESSED') {
    throw new Error('Cannot retry an already PROCESSED inbox message');
  }

  msg.status = 'RETRY';
  msg.next_retry_at = new Date(); // Immediate
  await msg.save();
  return msg;
}

/**
 * Replays a DEAD_LETTER inbox message with required authorization audit.
 */
async function replayInboxDeadLetter(inboxId, tenantId, { userId = null, reason = 'Operator replay' } = {}) {
  const msg = await InboxMessage.findOne({ _id: inboxId, tenant_id: tenantId });
  if (!msg) throw new Error('Inbox message not found');

  if (msg.status !== 'DEAD_LETTER') {
    throw new Error(`Only DEAD_LETTER messages can be replayed (current status: ${msg.status})`);
  }

  msg.status = 'RECEIVED';
  msg.attempt_count = 0;
  msg.next_retry_at = new Date();
  msg.replayed_at = new Date();
  msg.replayed_by_user_id = userId;
  msg.replay_reason = reason;
  await msg.save();
  return msg;
}

module.exports = {
  CONSUMER_REGISTRY,
  processEventForConsumer,
  retryInboxMessage,
  replayInboxDeadLetter
};
