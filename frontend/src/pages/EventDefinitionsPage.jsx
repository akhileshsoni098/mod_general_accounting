import React, { useState, useEffect } from 'react';
import { eventsApi } from '../services/api';
import {
  Layers,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  Code2,
  RefreshCw,
  Eye
} from 'lucide-react';

export default function EventDefinitionsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('');

  // Modals / Detail
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const [testPayload, setTestPayload] = useState('');
  const [testValidationResult, setTestValidationResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  // Form State
  const [form, setForm] = useState({
    event_code: '',
    display_name: '',
    description: '',
    source_module: 'BILLING',
    category: 'TRANSACTION',
    initial_version: '1.0.0',
    json_schema: '{\n  "type": "object",\n  "required": ["policy_id", "gross_premium"],\n  "properties": {\n    "policy_id": { "type": "string" },\n    "gross_premium": { "type": "number" },\n    "policy_fee": { "type": "number" }\n  }\n}',
    sample_payload: '{\n  "policy_id": "POL-TX-8821",\n  "gross_premium": 37650,\n  "policy_fee": 150\n}'
  });

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      let query = '';
      const params = [];
      if (selectedModule) params.push(`source_module=${selectedModule}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (params.length > 0) query = `?${params.join('&')}`;

      const res = await eventsApi.getEvents(query);
      setEvents(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [selectedModule]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      let parsedSchema;
      try {
        parsedSchema = JSON.parse(form.json_schema);
      } catch (e) {
        throw new Error('Invalid JSON Schema format: must be valid JSON');
      }

      let parsedPayload = null;
      if (form.sample_payload.trim()) {
        try {
          parsedPayload = JSON.parse(form.sample_payload);
        } catch (e) {
          throw new Error('Invalid Sample Payload: must be valid JSON');
        }
      }

      await eventsApi.createEvent({
        ...form,
        json_schema: parsedSchema,
        sample_payload: parsedPayload
      });

      setShowCreateModal(false);
      loadEvents();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleValidatePayload = async () => {
    if (!activeEvent || !testPayload.trim()) return;
    try {
      setTestLoading(true);
      setTestValidationResult(null);
      const parsed = JSON.parse(testPayload);
      const res = await eventsApi.validatePayload(activeEvent._id, parsed, activeEvent.current_version);
      setTestValidationResult(res.data);
    } catch (err) {
      setTestValidationResult({
        valid: false,
        errors: [err.message]
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-brand-400" />
            <span>Event Definitions Catalog</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Author and version contract payload schemas that trigger financial journal entry rules.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-brand-500/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Event Definition</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center space-x-4 bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by event code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadEvents()}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono text-xs"
          />
        </div>
        <select
          value={selectedModule}
          onChange={(e) => setSelectedModule(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
        >
          <option value="">All Source Modules</option>
          <option value="BILLING">Billing & AR</option>
          <option value="TREASURY">Treasury & Bank Rec</option>
          <option value="COMMISSIONS">Commissions</option>
          <option value="POLICY">Policy Ops</option>
          <option value="CLAIMS">Claims</option>
          <option value="MANUAL">Manual</option>
        </select>
        <button
          onClick={loadEvents}
          className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center space-x-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table & Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Events List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Event Contracts ({events.length})</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">Loading event catalog...</div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <div className="text-xs font-semibold text-slate-400">No event definitions configured for this organization.</div>
              <div className="text-[11px]">Define an event contract to begin authoring rules.</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {events.map((evt) => {
                const isSelected = activeEvent?._id === evt._id;
                return (
                  <div
                    key={evt._id}
                    onClick={() => {
                      setActiveEvent(evt);
                      const latestVer = evt.versions?.find((v) => v.version === evt.current_version);
                      setTestPayload(latestVer?.sample_payload ? JSON.stringify(latestVer.sample_payload, null, 2) : '');
                      setTestValidationResult(null);
                    }}
                    className={`p-4 cursor-pointer transition flex items-center justify-between ${
                      isSelected ? 'bg-brand-600/10 border-l-2 border-brand-500' : 'hover:bg-slate-850'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-brand-300">{evt.event_code}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          v{evt.current_version}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {evt.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-200 font-medium">{evt.display_name}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-md">{evt.description || 'No description'}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <div className="font-mono">{evt.source_module}</div>
                      <div>{evt.versions?.length || 1} version(s)</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Event Detail & Payload Test */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
              <Code2 className="w-4 h-4 text-brand-400" />
              <span>Contract Inspector</span>
            </h3>
            {activeEvent && (
              <span className="font-mono text-[10px] text-brand-400">{activeEvent.event_code}</span>
            )}
          </div>

          {!activeEvent ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Select an event definition from the left panel to inspect its JSON schema and validate payloads.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 font-medium">Schema Contract (v{activeEvent.current_version})</label>
                <div className="mt-1 bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-48 overflow-y-auto">
                  <pre className="text-[10px] font-mono text-slate-300">
                    {JSON.stringify(
                      activeEvent.versions?.find((v) => v.version === activeEvent.current_version)?.json_schema || {},
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-medium">Interactive Payload Validator</label>
                <textarea
                  rows={6}
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  placeholder="Paste JSON payload to validate..."
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <button
                onClick={handleValidatePayload}
                disabled={testLoading}
                className="w-full py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-2"
              >
                {testLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
                )}
                <span>Validate Against Contract</span>
              </button>

              {testValidationResult && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    testValidationResult.valid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="font-semibold flex items-center space-x-1.5">
                    {testValidationResult.valid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Payload Validates Successfully</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Payload Schema Invalidation</span>
                      </>
                    )}
                  </div>
                  {testValidationResult.errors?.length > 0 && (
                    <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px]">
                      {testValidationResult.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Event Definition */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileCode className="w-4 h-4 text-brand-400" />
                <span>Create New Event Definition</span>
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Event Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. billing.invoice.issued"
                    value={form.event_code}
                    onChange={(e) => setForm({ ...form, event_code: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Premium Invoice Issued"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Source Module</label>
                  <select
                    value={form.source_module}
                    onChange={(e) => setForm({ ...form, source_module: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-brand-500 focus:outline-none"
                  >
                    <option value="BILLING">Billing & AR</option>
                    <option value="TREASURY">Treasury & Bank Rec</option>
                    <option value="COMMISSIONS">Commissions</option>
                    <option value="POLICY">Policy</option>
                    <option value="CLAIMS">Claims</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Initial Version</label>
                  <input
                    type="text"
                    value={form.initial_version}
                    onChange={(e) => setForm({ ...form, initial_version: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-medium">Description</label>
                <input
                  type="text"
                  placeholder="Describe the economic event"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">JSON Schema Contract *</label>
                <textarea
                  rows={6}
                  required
                  value={form.json_schema}
                  onChange={(e) => setForm({ ...form, json_schema: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">Sample Payload (Optional test fixture)</label>
                <textarea
                  rows={4}
                  value={form.sample_payload}
                  onChange={(e) => setForm({ ...form, sample_payload: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold shadow-md shadow-brand-500/20"
                >
                  Create Contract
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
