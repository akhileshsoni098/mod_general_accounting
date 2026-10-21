import React, { useState, useEffect } from 'react';
import { eventsApi, rulesApi } from '../services/api';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  Code2,
  RefreshCw,
  Send,
  Sliders,
  DollarSign,
  ShieldCheck,
  Check,
  X
} from 'lucide-react';

const GUIDE_PRESETS = [
  {
    id: 's1_1',
    scenario: 'Scenario 1.1',
    label: 'Invoice Issued ($9,562.50)',
    event_code: 'commercial.invoice.issued',
    desc: 'Dr 1100 AR $9,562.50 / Cr 4000 Sales $9,412.50 + Cr 2110 Output Tax $150.00',
    payload: {
      invoice_id: 'INV-2026-00001',
      order_id: 'ORD-2026-00001',
      transaction_type: 'COMMERCIAL_INVOICE',
      subtotal: 9412.50,
      tax_amount: 150.00,
      total_amount: 9562.50
    }
  },
  {
    id: 's1_2',
    scenario: 'Scenario 1.2',
    label: 'Payment Collected ($9,562.50)',
    event_code: 'commercial.payment.received',
    desc: 'Dr 1000 Operating Bank $9,562.50 / Cr 1100 AR $9,562.50',
    payload: {
      payment_id: 'PAY-2026-00001',
      invoice_id: 'INV-2026-00001',
      amount: 9562.50,
      payment_method: 'BANK_TRANSFER'
    }
  },
  {
    id: 's1_3',
    scenario: 'Scenario 1.3',
    label: 'Vendor Bill Recorded ($7,530.00)',
    event_code: 'commercial.bill.recorded',
    desc: 'Dr 5000 Purchases $7,530.00 / Cr 2000 AP $7,530.00',
    payload: {
      bill_id: 'BILL-2026-00001',
      vendor_id: 'VEND-001-SUPPLIES',
      bill_amount: 7530.00
    }
  },
  {
    id: 's1_4',
    scenario: 'Scenario 1.4',
    label: 'Vendor Bill Paid ($7,530.00)',
    event_code: 'commercial.vendor_payment.issued',
    desc: 'Dr 2000 AP $7,530.00 / Cr 1000 Operating Bank $7,530.00',
    payload: {
      payment_id: 'VPAY-2026-00001',
      bill_id: 'BILL-2026-00001',
      amount: 7530.00
    }
  },
  {
    id: 's2',
    scenario: 'Scenario 2',
    label: 'Inventory Receipt ($7,222.19)',
    event_code: 'inventory.goods_received',
    desc: 'Dr 1300 Inventory $7,222.19 / Cr 2050 GRN Clearing $7,222.19',
    payload: {
      grn_number: 'GRN-2026-001',
      item_code: 'RAW-ALUM-BAR',
      valuation_amount: 7222.19
    }
  },
  {
    id: 's3_1',
    scenario: 'Scenario 3',
    label: 'Sales Return / Credit Note ($10,000)',
    event_code: 'commercial.credit_note.issued',
    desc: 'Dr 4010 Sales Returns $10,000.00 / Cr 1100 AR $10,000.00',
    payload: {
      credit_note_id: 'CN-2026-0001',
      invoice_id: 'INV-2026-00001',
      return_amount: 10000.00
    }
  },
  {
    id: 's3_2',
    scenario: 'Scenario 3',
    label: 'Inventory Restocking ($8,000.00)',
    event_code: 'inventory.return.recorded',
    desc: 'Dr 1300 Inventory $8,000.00 / Cr 5010 COGS $8,000.00',
    payload: {
      return_slip: 'RET-2026-001',
      cost_amount: 8000.00
    }
  },
  {
    id: 's4',
    scenario: 'Scenario 4',
    label: 'Advance Billing ($10,050.00)',
    event_code: 'billing.advance.billed',
    desc: 'Dr 1100 AR $10,050.00 / Cr 2200 Deferred Revenue $10,000.00 + Cr 2110 Output Tax $50.00',
    payload: {
      contract_id: 'CTR-2026-001',
      advance_amount: 10000.00,
      service_fee: 50.00
    }
  },
  {
    id: 's5',
    scenario: 'Scenario 5',
    label: 'Revenue Recognition ($3,197.67)',
    event_code: 'finance.revenue_recognition.posted',
    desc: 'Dr 2200 Deferred Revenue $3,197.67 / Cr 4000 Earned Revenue $3,197.67',
    payload: {
      contract_id: 'CTR-2026-001',
      period: '2026-07',
      recognized_amount: 3197.67
    }
  },
  {
    id: 's6_1',
    scenario: 'Scenario 6',
    label: 'WIP Material Issue ($39,000.00)',
    event_code: 'manufacturing.material_issued',
    desc: 'Dr 1350 WIP $39,000.00 / Cr 1300 Raw Materials $39,000.00',
    payload: {
      work_order_id: 'WO-2026-001',
      raw_material_cost: 39000.00
    }
  },
  {
    id: 's6_2',
    scenario: 'Scenario 6',
    label: 'Finished Goods Receipt ($39,000.00)',
    event_code: 'manufacturing.goods_completed',
    desc: 'Dr 1310 Finished Goods $39,000.00 / Cr 1350 WIP $39,000.00',
    payload: {
      work_order_id: 'WO-2026-001',
      finished_goods_cost: 39000.00
    }
  },
  {
    id: 's7',
    scenario: 'Treasury',
    label: 'NSF Dishonor Return ($9,562.50)',
    event_code: 'treasury.payment.returned',
    desc: 'Dr 1100 AR $9,562.50 / Cr 1000 Operating Bank $9,562.50 (Bank Dishonor R01)',
    payload: {
      return_reference: 'NSF-ACH-9912',
      return_code: 'R01',
      amount: 9562.50
    }
  }
];

export default function EventSimulatorPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Simulation Form
  const [selectedEventCode, setSelectedEventCode] = useState('');
  const [payloadText, setPayloadText] = useState('{\n  "invoice_id": "INV-2026-00001",\n  "transaction_type": "COMMERCIAL_INVOICE",\n  "subtotal": 37650,\n  "tax_amount": 150\n}');

  // Simulation Execution State
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await eventsApi.getEvents();
      const list = res.data || [];
      setEvents(list);
      if (list.length > 0 && !selectedEventCode) {
        setSelectedEventCode(list[0].event_code);
        setSchemaVersion(list[0].current_version || '1.0.0');
        const ver = list[0].versions?.find((v) => v.version === list[0].current_version);
        if (ver?.sample_payload) {
          setPayloadText(JSON.stringify(ver.sample_payload, null, 2));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleSelectEvent = (code) => {
    setSelectedEventCode(code);
    const evt = events.find((e) => e.event_code === code);
    if (evt) {
      setSchemaVersion(evt.current_version || '1.0.0');
      const ver = evt.versions?.find((v) => v.version === evt.current_version);
      if (ver?.sample_payload) {
        setPayloadText(JSON.stringify(ver.sample_payload, null, 2));
      }
    }
    setSimulationResult(null);
    setPostResult(null);
  };

  const handleSimulate = async () => {
    if (!selectedEventCode) return;
    try {
      setSimulating(true);
      setError(null);
      setSimulationResult(null);
      setPostResult(null);

      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch (e) {
        throw new Error('Payload format error: Invalid JSON syntax');
      }

      const res = await rulesApi.simulate({
        event_code: selectedEventCode,
        schema_version: schemaVersion,
        payload: parsedPayload
      });

      setSimulationResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  const handlePostJournal = async () => {
    if (!simulationResult || !simulationResult.balanced) return;
    if (!window.confirm('Post this balanced journal entry to the tenant General Ledger?')) return;

    try {
      setPosting(true);
      setError(null);
      let parsedPayload = JSON.parse(payloadText);

      const eventRef = parsedPayload.transaction_id
        || (parsedPayload.invoice_id ? `${selectedEventCode}:${parsedPayload.invoice_id}` : null)
        || (parsedPayload.order_id ? `${selectedEventCode}:${parsedPayload.order_id}` : null)
        || (parsedPayload.bill_id ? `${selectedEventCode}:${parsedPayload.bill_id}` : null)
        || (parsedPayload.payment_id ? `${selectedEventCode}:${parsedPayload.payment_id}` : null)
        || (parsedPayload.grn_number ? `${selectedEventCode}:${parsedPayload.grn_number}` : null)
        || (parsedPayload.work_order_id ? `${selectedEventCode}:${parsedPayload.work_order_id}` : null)
        || (parsedPayload.contract_id ? `${selectedEventCode}:${parsedPayload.contract_id}` : null)
        || (parsedPayload.return_reference ? `${selectedEventCode}:${parsedPayload.return_reference}` : null)
        || `${selectedEventCode}:${parsedPayload.reference_id || parsedPayload.policy_id || Date.now()}`;

      const res = await rulesApi.postSimulated({
        event_code: selectedEventCode,
        schema_version: schemaVersion,
        payload: parsedPayload,
        source_reference: eventRef,
        memo: `Manual Simulator Execution: ${selectedEventCode}`
      });

      setPostResult(res.data);
      alert(`Journal Entry ${res.data.journal.journal_number} successfully posted to General Ledger!`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setSelectedEventCode(preset.event_code);
    setSchemaVersion('1.0.0');
    setPayloadText(JSON.stringify(preset.payload, null, 2));
    setSimulationResult(null);
    setPostResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
            <Play className="w-5 h-5 text-brand-400" />
            <span>Event & Journal Simulator</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Test, preview, and execute all accounting scenarios from <code>accounting_architecture_guide.html</code> against published rules.
          </p>
        </div>
      </div>

      {/* Architecture Guide Scenarios Preset Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-400 font-mono text-[10px] font-bold border border-brand-500/30">
              GUIDE SCENARIOS (1 to 7)
            </span>
            <h3 className="text-xs font-bold text-slate-200">
              One-Click Accounting Architecture Scenarios
            </h3>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Click to load & simulate against published JE rules
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {GUIDE_PRESETS.map((p) => {
            const isSelected = selectedEventCode === p.event_code;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border ${
                  isSelected
                    ? 'bg-brand-600/30 border-brand-500 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                }`}
                title={p.desc}
              >
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] font-mono font-bold text-brand-400">
                  {p.scenario}
                </span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Input Form vs Output Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Parameters */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
              <Code2 className="w-4 h-4 text-brand-400" />
              <span>Event Invocation Parameters</span>
            </h3>
          </div>

          <div>
            <label className="text-slate-400 font-medium">Event Contract *</label>
            <select
              value={selectedEventCode}
              onChange={(e) => handleSelectEvent(e.target.value)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-brand-500"
            >
              {events.map((evt) => (
                <option key={evt._id} value={evt.event_code}>
                  {evt.event_code} (v{evt.current_version}) — {evt.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-400 font-medium">Schema Version</label>
            <input
              type="text"
              value={schemaVersion}
              onChange={(e) => setSchemaVersion(e.target.value)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="text-slate-400 font-medium">Event JSON Payload *</label>
            <textarea
              rows={12}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 font-mono text-xs focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="pt-2 flex items-center space-x-3">
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition flex items-center justify-center space-x-2 shadow-md shadow-brand-500/20"
            >
              {simulating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>Run Simulation (No Posting)</span>
            </button>
          </div>
        </div>

        {/* Output Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                <FileCode className="w-4 h-4 text-brand-400" />
                <span>Prospective Journal Entry Preview</span>
              </h3>
              {simulationResult?.rule && (
                <span className="font-mono text-[10px] text-brand-400">
                  Rule: {simulationResult.rule.rule_code} (v{simulationResult.rule.version})
                </span>
              )}
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!simulationResult ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Play className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <div className="text-xs font-semibold text-slate-400">Simulator Idle</div>
                <div className="text-[11px]">
                  Click "Run Simulation" to resolve matching published rules and preview the prospective journal lines.
                </div>
              </div>
            ) : !simulationResult.success ? (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-amber-300">
                <div className="font-bold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Simulation Did Not Resolve Balanced Journal</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Stage: <span className="font-mono text-amber-400">{simulationResult.stage}</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  {simulationResult.errors?.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Result KPI Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] text-slate-400">Total Debits</div>
                    <div className="text-sm font-mono font-bold text-amber-400">
                      ${simulationResult.total_debit}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] text-slate-400">Total Credits</div>
                    <div className="text-sm font-mono font-bold text-cyan-400">
                      ${simulationResult.total_credit}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] text-slate-400">Equilibrium Status</div>
                    <div className="text-xs font-semibold text-emerald-400 flex items-center space-x-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Balanced ($0.00)</span>
                    </div>
                  </div>
                </div>

                {/* Generated Lines Table */}
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Account</th>
                        <th className="py-2 px-3 text-right">Debit</th>
                        <th className="py-2 px-3 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {simulationResult.lines?.map((line) => (
                        <tr key={line.line_number} className="hover:bg-slate-900/50">
                          <td className="py-2 px-3 text-slate-500">{line.line_number}</td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-white">{line.account_code}</span>
                            <span className="text-[10px] text-slate-400 ml-1.5 font-sans">
                              {line.account_name}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-amber-300">
                            {Number(line.debit) > 0 ? `$${line.debit}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-cyan-300">
                            {Number(line.credit) > 0 ? `$${line.credit}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {postResult && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg space-y-1">
                    <div className="font-semibold flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Journal Posted to General Ledger</span>
                    </div>
                    <div className="text-[11px] font-mono">
                      Journal Number: {postResult.journal.journal_number}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Explicit Post Action */}
          {simulationResult && simulationResult.balanced && (
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <div className="text-[11px] text-slate-400">
                Simulation is balanced. To write this entry to the permanent General Ledger, execute the post action below:
              </div>
              <button
                onClick={handlePostJournal}
                disabled={posting || postResult !== null}
                className={`w-full py-2.5 rounded-lg font-semibold transition flex items-center justify-center space-x-2 ${
                  postResult
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                }`}
              >
                {posting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{postResult ? 'Posted to GL' : 'Post Journal to General Ledger'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
