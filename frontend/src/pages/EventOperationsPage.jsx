import React, { useState, useEffect } from 'react';
import { eventPipelineApi } from '../services/api';

export default function EventOperationsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Trace state
  const [traceInput, setTraceInput] = useState('');
  const [traceData, setTraceData] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);

  // Replay modal state
  const [replayModal, setReplayModal] = useState({ open: false, type: 'outbox', id: '', reason: '' });

  // Detail viewer modal
  const [detailModal, setDetailModal] = useState({ open: false, title: '', content: null });

  // Filter state
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchStats();
    if (activeTab === 'outbox' || activeTab === 'retry' || activeTab === 'deadletter') fetchOutbox();
    if (activeTab === 'inbox' || activeTab === 'retry' || activeTab === 'deadletter') fetchInbox();
    if (activeTab === 'subscriptions') fetchSubscriptions();
  }, [activeTab, statusFilter]);

  async function fetchStats() {
    try {
      const res = await eventPipelineApi.getStats();
      if (res.success) setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchOutbox() {
    setLoading(true);
    setError(null);
    try {
      let params = '';
      if (activeTab === 'retry') params = '?status=RETRY';
      else if (activeTab === 'deadletter') params = '?status=DEAD_LETTER';
      else if (statusFilter) params = `?status=${statusFilter}`;

      const res = await eventPipelineApi.getOutbox(params);
      if (res.success) setOutbox(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchInbox() {
    setLoading(true);
    setError(null);
    try {
      let params = '';
      if (activeTab === 'retry') params = '?status=RETRY';
      else if (activeTab === 'deadletter') params = '?status=DEAD_LETTER';
      else if (statusFilter) params = `?status=${statusFilter}`;

      const res = await eventPipelineApi.getInbox(params);
      if (res.success) setInbox(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSubscriptions() {
    setLoading(true);
    setError(null);
    try {
      const res = await eventPipelineApi.getSubscriptions();
      if (res.success) setSubscriptions(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTriggerDispatch() {
    setLoading(true);
    setSuccessMsg(null);
    setError(null);
    try {
      const res = await eventPipelineApi.triggerDispatch(20);
      if (res.success) {
        setSuccessMsg(`Dispatch batch executed: ${res.data.publishedCount} published, ${res.data.failedCount} failed.`);
        fetchStats();
        if (activeTab === 'outbox') fetchOutbox();
        if (activeTab === 'inbox') fetchInbox();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryOutbox(eventId) {
    try {
      await eventPipelineApi.retryOutbox(eventId);
      setSuccessMsg(`Outbox event ${eventId} queued for immediate retry.`);
      fetchOutbox();
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRetryInbox(id) {
    try {
      await eventPipelineApi.retryInbox(id);
      setSuccessMsg(`Inbox message queued for immediate retry.`);
      fetchInbox();
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReplaySubmit() {
    if (!replayModal.reason.trim()) {
      alert('Please provide an operator reason for audit records.');
      return;
    }
    try {
      if (replayModal.type === 'outbox') {
        await eventPipelineApi.replayOutbox(replayModal.id, replayModal.reason);
        setSuccessMsg(`Outbox event ${replayModal.id} replayed.`);
        fetchOutbox();
      } else {
        await eventPipelineApi.replayInbox(replayModal.id, replayModal.reason);
        setSuccessMsg(`Inbox message replayed.`);
        fetchInbox();
      }
      setReplayModal({ open: false, type: 'outbox', id: '', reason: '' });
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleSubscription(id) {
    try {
      await eventPipelineApi.toggleSubscription(id);
      fetchSubscriptions();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRunTrace(e) {
    e.preventDefault();
    if (!traceInput.trim()) return;
    setTraceLoading(true);
    setTraceData(null);
    setError(null);
    try {
      const res = await eventPipelineApi.getTrace(traceInput.trim());
      if (res.success) setTraceData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTraceLoading(false);
    }
  }

  function getStatusBadge(status) {
    const map = {
      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      PROCESSING: 'bg-blue-100 text-blue-800 border-blue-300',
      PUBLISHED: 'bg-green-100 text-green-800 border-green-300',
      PROCESSED: 'bg-green-100 text-green-800 border-green-300',
      RETRY: 'bg-orange-100 text-orange-800 border-orange-300',
      DEAD_LETTER: 'bg-red-100 text-red-800 border-red-300'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${map[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Operations & Delivery Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            Durable transactional outbox, consumer delivery, retry queues, and end-to-end accounting traceability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerDispatch}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-sm transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Run Dispatcher Now'}
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold">&times;</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 gap-1 overflow-x-auto text-sm font-medium text-gray-600">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'outbox', label: 'Outbox Events' },
          { key: 'inbox', label: 'Inbox Deliveries' },
          { key: 'retry', label: 'Retry Queue' },
          { key: 'deadletter', label: 'Dead Letters' },
          { key: 'trace', label: 'Event Trace' },
          { key: 'subscriptions', label: 'Subscriptions' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setStatusFilter(''); }}
            className={`py-2 px-4 border-b-2 transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Outbox Card */}
            <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-gray-900 border-b pb-2 flex items-center justify-between">
                <span>Transactional Outbox</span>
                <span className="text-xs text-gray-500 font-normal">Source business operations</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-yellow-50 rounded border border-yellow-100">
                  <div className="text-xl font-bold text-yellow-700">{stats.outbox.pending}</div>
                  <div className="text-xs text-yellow-600 mt-1">Pending</div>
                </div>
                <div className="p-3 bg-green-50 rounded border border-green-100">
                  <div className="text-xl font-bold text-green-700">{stats.outbox.published}</div>
                  <div className="text-xs text-green-600 mt-1">Published</div>
                </div>
                <div className="p-3 bg-orange-50 rounded border border-orange-100">
                  <div className="text-xl font-bold text-orange-700">{stats.outbox.retry}</div>
                  <div className="text-xs text-orange-600 mt-1">In Retry</div>
                </div>
                <div className="p-3 bg-red-50 rounded border border-red-100">
                  <div className="text-xl font-bold text-red-700">{stats.outbox.dead_letter}</div>
                  <div className="text-xs text-red-600 mt-1">Dead Letter</div>
                </div>
              </div>
            </div>

            {/* Inbox Card */}
            <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-gray-900 border-b pb-2 flex items-center justify-between">
                <span>Consumer Inbox</span>
                <span className="text-xs text-gray-500 font-normal">Logical consumers & GL posters</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-blue-50 rounded border border-blue-100">
                  <div className="text-xl font-bold text-blue-700">{stats.inbox.received}</div>
                  <div className="text-xs text-blue-600 mt-1">Received</div>
                </div>
                <div className="p-3 bg-green-50 rounded border border-green-100">
                  <div className="text-xl font-bold text-green-700">{stats.inbox.processed}</div>
                  <div className="text-xs text-green-600 mt-1">Processed</div>
                </div>
                <div className="p-3 bg-orange-50 rounded border border-orange-100">
                  <div className="text-xl font-bold text-orange-700">{stats.inbox.retry}</div>
                  <div className="text-xs text-orange-600 mt-1">In Retry</div>
                </div>
                <div className="p-3 bg-red-50 rounded border border-red-100">
                  <div className="text-xl font-bold text-red-700">{stats.inbox.dead_letter}</div>
                  <div className="text-xs text-red-600 mt-1">Dead Letter</div>
                </div>
              </div>
            </div>
          </div>

          {/* Active Consumers */}
          <div className="bg-white p-5 rounded-lg border shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Registered Logical Consumers</h3>
            <div className="divide-y text-sm">
              {stats.consumers?.map((c, i) => (
                <div key={i} className="py-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-gray-800">{c.name}</span>
                    <span className="text-xs text-gray-400 ml-2">v{c.version}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded border border-green-200">Active</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OUTBOX EVENTS */}
      {(activeTab === 'outbox' || activeTab === 'retry' || activeTab === 'deadletter') && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">
              {activeTab === 'retry' ? 'Outbox Events in Retry' : activeTab === 'deadletter' ? 'Dead Letter Outbox Events' : 'Transactional Outbox Events'}
            </h2>
            {activeTab === 'outbox' && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs border rounded p-1 bg-white"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="RETRY">RETRY</option>
                <option value="DEAD_LETTER">DEAD_LETTER</option>
              </select>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-700 uppercase font-medium">
                <tr>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Source Entity</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Attempts</th>
                  <th className="py-2.5 px-3">Last Error</th>
                  <th className="py-2.5 px-3">Occurred At</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-600">
                {outbox.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-6 text-gray-400">
                      No outbox events found.
                    </td>
                  </tr>
                ) : (
                  outbox.map(evt => (
                    <tr key={evt._id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-mono font-medium text-indigo-600">{evt.event_id}</td>
                      <td className="py-2.5 px-3">{evt.event_type}</td>
                      <td className="py-2.5 px-3">{evt.source_module} / {evt.source_entity_type} ({evt.source_entity_id})</td>
                      <td className="py-2.5 px-3">{getStatusBadge(evt.status)}</td>
                      <td className="py-2.5 px-3">{evt.attempt_count} / {evt.max_attempts}</td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-red-600" title={evt.last_error_message}>
                        {evt.last_error_category ? `${evt.last_error_category}: ${evt.last_error_message}` : '-'}
                      </td>
                      <td className="py-2.5 px-3">{new Date(evt.occurred_at).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => setDetailModal({ open: true, title: `Event ${evt.event_id}`, content: evt })}
                          className="px-2 py-1 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                          Payload
                        </button>
                        {evt.status === 'RETRY' && (
                          <button
                            onClick={() => handleRetryOutbox(evt.event_id)}
                            className="px-2 py-1 text-orange-700 bg-orange-100 hover:bg-orange-200 rounded font-medium"
                          >
                            Retry
                          </button>
                        )}
                        {evt.status === 'DEAD_LETTER' && (
                          <button
                            onClick={() => setReplayModal({ open: true, type: 'outbox', id: evt.event_id, reason: '' })}
                            className="px-2 py-1 text-red-700 bg-red-100 hover:bg-red-200 rounded font-medium"
                          >
                            Replay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INBOX DELIVERIES */}
      {activeTab === 'inbox' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Consumer Inbox Deliveries</h2>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs border rounded p-1 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="PROCESSING">PROCESSING</option>
              <option value="PROCESSED">PROCESSED</option>
              <option value="RETRY">RETRY</option>
              <option value="DEAD_LETTER">DEAD_LETTER</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-700 uppercase font-medium">
                <tr>
                  <th className="py-2.5 px-3">Consumer</th>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Attempts</th>
                  <th className="py-2.5 px-3">Result Reference</th>
                  <th className="py-2.5 px-3">Processed At</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-600">
                {inbox.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-6 text-gray-400">
                      No consumer inbox messages found.
                    </td>
                  </tr>
                ) : (
                  inbox.map(msg => (
                    <tr key={msg._id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-semibold text-gray-800">{msg.consumer_name}</td>
                      <td className="py-2.5 px-3 font-mono text-indigo-600">{msg.event_id}</td>
                      <td className="py-2.5 px-3">{msg.event_type}</td>
                      <td className="py-2.5 px-3">{getStatusBadge(msg.status)}</td>
                      <td className="py-2.5 px-3">{msg.attempt_count} / {msg.max_attempts}</td>
                      <td className="py-2.5 px-3">
                        {msg.result?.journal_number ? (
                          <span className="font-mono text-green-700">JE: {msg.result.journal_number} ({msg.result.rule_code})</span>
                        ) : msg.last_error_category ? (
                          <span className="text-red-600 truncate">{msg.last_error_category}</span>
                        ) : '-'}
                      </td>
                      <td className="py-2.5 px-3">{msg.processed_at ? new Date(msg.processed_at).toLocaleString() : '-'}</td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => setDetailModal({ open: true, title: `Inbox Message ${msg._id}`, content: msg })}
                          className="px-2 py-1 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                          Details
                        </button>
                        {msg.status === 'RETRY' && (
                          <button
                            onClick={() => handleRetryInbox(msg._id)}
                            className="px-2 py-1 text-orange-700 bg-orange-100 hover:bg-orange-200 rounded font-medium"
                          >
                            Retry
                          </button>
                        )}
                        {msg.status === 'DEAD_LETTER' && (
                          <button
                            onClick={() => setReplayModal({ open: true, type: 'inbox', id: msg._id, reason: '' })}
                            className="px-2 py-1 text-red-700 bg-red-100 hover:bg-red-200 rounded font-medium"
                          >
                            Replay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: EVENT TRACE */}
      {activeTab === 'trace' && (
        <div className="space-y-6">
          <form onSubmit={handleRunTrace} className="flex gap-2">
            <input
              type="text"
              placeholder="Search by Event ID, Correlation ID, or Invoice/Source ID..."
              value={traceInput}
              onChange={e => setTraceInput(e.target.value)}
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={traceLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {traceLoading ? 'Tracing...' : 'Trace'}
            </button>
          </form>

          {traceData && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border shadow-sm space-y-2">
                <h3 className="font-semibold text-gray-900 text-sm">Trace Target: <span className="font-mono text-indigo-600">{traceData.identifier}</span></h3>
                <div className="text-xs text-gray-500">
                  Found {traceData.outbox_events.length} outbox event(s), {traceData.inbox_messages.length} consumer message(s), and {traceData.journals.length} posted journal(s).
                </div>
              </div>

              {/* Step 1: Outbox Event */}
              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Outbox Event Snapshot</h4>
                {traceData.outbox_events.map(evt => (
                  <div key={evt._id} className="p-3 bg-gray-50 rounded border mb-2 text-xs space-y-1 font-mono">
                    <div>Event ID: <span className="font-bold text-gray-800">{evt.event_id}</span> ({evt.event_type} v{evt.event_version})</div>
                    <div>Source: {evt.source_module} / {evt.source_entity_type} ({evt.source_entity_id})</div>
                    <div>Status: {evt.status} | Correlation: {evt.correlation_id || '-'}</div>
                  </div>
                ))}
              </div>

              {/* Step 2: Consumer Inbox */}
              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">2. Consumer Delivery & Resolution</h4>
                {traceData.inbox_messages.map(msg => (
                  <div key={msg._id} className="p-3 bg-gray-50 rounded border mb-2 text-xs space-y-1 font-mono">
                    <div>Consumer: <span className="font-bold text-gray-800">{msg.consumer_name}</span></div>
                    <div>Status: {msg.status} | Processed: {msg.processed_at ? new Date(msg.processed_at).toLocaleString() : '-'}</div>
                    {msg.result?.rule_code && <div>Matched Rule: {msg.result.rule_code} (v{msg.result.rule_version})</div>}
                    {msg.last_error_message && <div className="text-red-600">Error: {msg.last_error_category} - {msg.last_error_message}</div>}
                  </div>
                ))}
              </div>

              {/* Step 3: Posted Journals */}
              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">3. General Ledger Journal Entries</h4>
                {traceData.journals.map(j => (
                  <div key={j._id} className="p-3 bg-gray-50 rounded border mb-2 text-xs space-y-2">
                    <div className="font-mono font-bold text-gray-800">
                      Journal #{j.journal_number} ({j.source_module}) - {new Date(j.posting_date).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">{j.memo}</div>
                    <table className="w-full text-left text-xs border bg-white rounded mt-1">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-1.5">Account</th>
                          <th className="p-1.5 text-right">Debit</th>
                          <th className="p-1.5 text-right">Credit</th>
                          <th className="p-1.5">Memo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {j.lines?.map(l => (
                          <tr key={l._id} className="border-t">
                            <td className="p-1.5 font-mono">{l.account_code}</td>
                            <td className="p-1.5 text-right">{l.debit !== '0.00' ? `$${l.debit}` : '-'}</td>
                            <td className="p-1.5 text-right">{l.credit !== '0.00' ? `$${l.credit}` : '-'}</td>
                            <td className="p-1.5 text-gray-500">{l.memo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SUBSCRIPTIONS */}
      {activeTab === 'subscriptions' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Tenant Event Subscriptions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-700 uppercase font-medium">
                <tr>
                  <th className="py-2.5 px-3">Subscription Code</th>
                  <th className="py-2.5 px-3">Consumer</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-600">
                {subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-6 text-gray-400">
                      No custom event subscriptions configured. Default automatic subscriptions apply.
                    </td>
                  </tr>
                ) : (
                  subscriptions.map(sub => (
                    <tr key={sub._id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-semibold text-gray-800">{sub.subscription_code}</td>
                      <td className="py-2.5 px-3">{sub.consumer_name}</td>
                      <td className="py-2.5 px-3 font-mono">{sub.event_type}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${sub.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {sub.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{sub.description || '-'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleToggleSubscription(sub._id)}
                          className={`px-2 py-1 rounded font-medium ${sub.is_active ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                        >
                          {sub.is_active ? 'Pause' : 'Resume'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-sm text-gray-900">{detailModal.title}</h3>
              <button onClick={() => setDetailModal({ open: false, title: '', content: null })} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-gray-50">
              <pre>{JSON.stringify(detailModal.content, null, 2)}</pre>
            </div>
            <div className="p-3 border-t text-right">
              <button
                onClick={() => setDetailModal({ open: false, title: '', content: null })}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPLAY AUDIT MODAL */}
      {replayModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-semibold text-base text-gray-900">Operator Replay Authorization</h3>
            <p className="text-xs text-gray-500">
              Replaying a dead-letter item resets its failure count and re-submits it to the pipeline using its original identity. A required operator reason is audited.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Audit Reason</label>
              <textarea
                rows="3"
                value={replayModal.reason}
                onChange={e => setReplayModal({ ...replayModal, reason: e.target.value })}
                placeholder="Explain why this item is being replayed (e.g. underlying COA account corrected, policy updated)..."
                className="w-full border rounded p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReplayModal({ open: false, type: 'outbox', id: '', reason: '' })}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleReplaySubmit}
                className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium"
              >
                Confirm Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
