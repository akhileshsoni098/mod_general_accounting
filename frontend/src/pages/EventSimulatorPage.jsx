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
    event_code: 'billing.invoice.issued',
    desc: 'Dr 1100 AR $9,562.50 / Cr 2200 UPR $9,412.50 + Cr 4100 Fee $150.00',
    payload: {
      invoice_id: 'INV-2026-00001',
      policy_id: 'POL-TX-8821',
      transaction_type: 'DIRECT_BILL',
      gross_premium: 9412.50,
      policy_fee: 150.00,
      total_amount: 9562.50
    }
  },
  {
    id: 's1_2',
    scenario: 'Scenario 1.2',
    label: 'Payment Collected ($9,562.50)',
    event_code: 'billing.payment.received',
    desc: 'Dr 1010 Trust $9,562.50 / Cr 1100 AR $9,562.50',
    payload: {
      payment_id: 'PAY-2026-00001',
      invoice_id: 'INV-2026-00001',
      amount: 9562.50,
      payment_method: 'ACH'
    }
  },
  {
    id: 's1_3',
    scenario: 'Scenario 1.3',
    label: 'Commission Allocation (Due to Carrier)',
    event_code: 'finance.commission.allocated',
    desc: 'Dr 2200 UPR $9,412.50 / Cr 2010 Carrier $7,530.00 + Cr 2020 Broker $941.25 + Cr 4200 MGA $941.25',
    payload: {
      policy_id: 'POL-TX-8821',
      invoice_id: 'INV-2026-00001',
      installment_premium: 9412.50,
      carrier_amount: 7530.00,
      broker_amount: 941.25,
      mga_amount: 941.25
    }
  },
  {
    id: 's1_4',
    scenario: 'Scenario 1.4',
    label: 'Texas Fiduciary Sweep ($3,765.00)',
    event_code: 'fiduciary.sweep.executed',
    desc: 'Dr 1000 Cash $3,765.00 / Cr 1010 Trust $3,765.00',
    payload: {
      sweep_reference: 'SWEEP-2026-00001',
      amount: 3765.00,
      fiduciary_account_code: '1010'
    }
  },
  {
    id: 's2',
    scenario: 'Scenario 2',
    label: 'Endorsement Truck T5 ($7,222.19)',
    event_code: 'policy.endorsement.issued',
    desc: 'Dr 1100 AR $7,222.19 / Cr 2200 UPR $7,222.19 (Pro-Rata 303 Active Days)',
    payload: {
      policy_id: 'POL-TX-8821',
      endorsement_number: 'END-001-T5',
      vehicle_id: 'TRUCK-T5-BOX',
      delta_premium: 7222.19,
      active_days: 303
    }
  },
  {
    id: 's3_1',
    scenario: 'Scenario 3',
    label: 'Pro-Rata Cancel Return ($10,000)',
    event_code: 'policy.cancelled.prorata',
    desc: 'Dr 2200 UPR $10,000.00 / Cr 2100 Return Premium Payable $10,000.00',
    payload: {
      policy_id: 'POL-TX-8821',
      cancellation_reason: 'Underwriting carrier portfolio withdrawal',
      return_premium: 10000.00
    }
  },
  {
    id: 's3_2',
    scenario: 'Scenario 3',
    label: 'Broker Clawback ($1,000.00)',
    event_code: 'finance.commission.clawback',
    desc: 'Dr 2020 Broker Payable $1,000.00 / Cr 5010 Commission Expense $1,000.00',
    payload: {
      policy_id: 'POL-TX-8821',
      broker_id: 'BROKER-BRIGHTLINE',
      clawback_amount: 1000.00
    }
  },
  {
    id: 's4',
    scenario: 'Scenario 4',
    label: 'Policy Reinstatement ($10,050)',
    event_code: 'policy.reinstated',
    desc: 'Dr 1100 AR $10,050.00 / Cr 2200 UPR $10,000.00 + Cr 4100 Fee $50.00',
    payload: {
      policy_id: 'POL-TX-8821',
      reinstated_premium: 10000.00,
      reinstatement_fee: 50.00
    }
  },
  {
    id: 's5',
    scenario: 'Scenario 5',
    label: 'Daily Earned Premium ($3,197.67)',
    event_code: 'finance.earned_premium.calculated',
    desc: 'Dr 2200 UPR $3,197.67 / Cr 4000 Earned Revenue $3,197.67 (July 31 Days)',
    payload: {
      policy_id: 'POL-TX-8821',
      period: '2026-07',
      earned_amount: 3197.67
    }
  },
  {
    id: 's6_1',
    scenario: 'Scenario 6',
    label: 'Claim Reserve ($39,000.00)',
    event_code: 'claim.reserve.established',
    desc: 'Dr 5000 Losses Incurred $39,000.00 / Cr 2500 Loss Reserves $39,000.00',
    payload: {
      claim_number: 'CLM-2026-0041',
      policy_id: 'POL-TX-8821',
      claimant_name: 'Susan Park',
      reserve_amount: 39000.00
    }
  },
  {
    id: 's6_2',
    scenario: 'Scenario 6',
    label: 'Claim Payout ($7,400.00)',
    event_code: 'claim.payment.issued',
    desc: 'Dr 2500 Loss Reserves $7,400.00 / Cr 1000 Operating Cash $7,400.00',
    payload: {
      claim_number: 'CLM-2026-0041',
      payee_name: 'Susan Park',
      payout_amount: 7400.00,
      check_number: 'CHK-90412'
    }
  },
  {
    id: 's7',
    scenario: 'Treasury',
    label: 'NSF Dishonor Return ($9,562.50)',
    event_code: 'treasury.payment.returned',
    desc: 'Dr 1100 AR $9,562.50 / Cr 1010 Trust $9,562.50 (Bank Dishonor R01)',
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
  const [schemaVersion, setSchemaVersion] = useState('1.0.0');
  const [payloadText, setPayloadText] = useState('{\n  "policy_id": "POL-TX-8821",\n  "transaction_type": "DIRECT_BILL",\n  "gross_premium": 37650,\n  "policy_fee": 150\n}');

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
        || (parsedPayload.payment_id ? `${selectedEventCode}:${parsedPayload.payment_id}` : null)
        || (parsedPayload.endorsement_number || parsedPayload.endorsement_id ? `${selectedEventCode}:${parsedPayload.endorsement_number || parsedPayload.endorsement_id}` : null)
        || (parsedPayload.claim_number || parsedPayload.claim_id ? `${selectedEventCode}:${parsedPayload.claim_number || parsedPayload.claim_id}` : null)
        || (parsedPayload.sweep_id ? `${selectedEventCode}:${parsedPayload.sweep_id}` : null)
        || (parsedPayload.statement_number || parsedPayload.settlement_id ? `${selectedEventCode}:${parsedPayload.statement_number || parsedPayload.settlement_id}` : null)
        || `${selectedEventCode}:${parsedPayload.policy_id || Date.now()}`;

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
