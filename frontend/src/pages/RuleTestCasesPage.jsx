import React, { useState, useEffect } from 'react';
import { ruleTestsApi, rulesApi } from '../services/api';
import {
  FileCheck,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  FileCode,
  RefreshCw,
  Code2
} from 'lucide-react';

export default function RuleTestCasesPage() {
  const [testCases, setTestCases] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [runningId, setRunningId] = useState(null);

  const [form, setForm] = useState({
    posting_rule_id: '',
    test_name: '',
    description: '',
    input_payload: '{\n  "policy_id": "POL-TX-8821",\n  "transaction_type": "DIRECT_BILL",\n  "gross_premium": 37650,\n  "policy_fee": 150\n}',
    expected_total_debit: '37800.00',
    expected_total_credit: '37800.00'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tcRes, rulesRes] = await Promise.all([
        ruleTestsApi.getTestCases(),
        rulesApi.getRules()
      ]);
      setTestCases(tcRes.data || []);
      const rList = rulesRes.data || [];
      setRules(rList);
      if (rList.length > 0 && !form.posting_rule_id) {
        setForm((prev) => ({ ...prev, posting_rule_id: rList[0]._id }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRun = async (tcId) => {
    try {
      setRunningId(tcId);
      const res = await ruleTestsApi.runTestCase(tcId);
      alert(res.data.passed ? 'Test Case Passed!' : `Test Failed: ${res.data.errors.join('; ')}`);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setRunningId(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(form.input_payload);
      } catch (e) {
        throw new Error('Input payload must be valid JSON');
      }

      await ruleTestsApi.createTestCase({
        posting_rule_id: form.posting_rule_id,
        test_name: form.test_name,
        description: form.description,
        input_payload: parsedPayload,
        expected_outcome: {
          matches_rule: true,
          expected_total_debit: form.expected_total_debit,
          expected_total_credit: form.expected_total_credit
        }
      });

      setShowCreateModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
            <FileCheck className="w-5 h-5 text-brand-400" />
            <span>Rule Test Cases & Quality Gate</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Maintain isolated input fixtures to assert debit/credit balance without modifying ledger accounts.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-brand-500/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Test Case</span>
        </button>
      </div>

      {/* Test Cases Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Configured Test Fixtures ({testCases.length})</span>
          <button
            onClick={loadData}
            className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 font-mono">Loading test cases...</div>
        ) : testCases.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileCheck className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <div className="text-xs font-semibold text-slate-400">No test cases configured for this organization.</div>
            <div className="text-[11px]">Create a rule test case to safeguard rule changes against regressions.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {testCases.map((tc) => {
              const rule = rules.find((r) => r._id === tc.posting_rule_id);
              const lastResult = tc.last_run_result;
              const isPassed = lastResult?.status === 'PASSED';
              const isFailed = lastResult?.status === 'FAILED';

              return (
                <div key={tc._id} className="p-4 flex items-center justify-between hover:bg-slate-850 transition">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{tc.test_name}</span>
                      {rule && (
                        <span className="font-mono text-[10px] text-brand-300 bg-brand-500/10 px-1.5 py-0.2 rounded border border-brand-500/20">
                          {rule.rule_code}
                        </span>
                      )}
                      {lastResult && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                            isPassed
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isFailed
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {lastResult.status}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">{tc.description || 'No description'}</div>
                    <div className="font-mono text-[10px] text-slate-500">
                      Expected Debits: ${tc.expected_outcome?.expected_total_debit || '0.00'} • Expected Credits: $
                      {tc.expected_outcome?.expected_total_credit || '0.00'}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleRun(tc._id)}
                      disabled={runningId === tc._id}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5"
                    >
                      {runningId === tc._id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current text-brand-400" />
                      )}
                      <span>Execute Assertion</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: New Test Case */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileCheck className="w-4 h-4 text-brand-400" />
                <span>Create Rule Test Case</span>
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Target Posting Rule *</label>
                <select
                  required
                  value={form.posting_rule_id}
                  onChange={(e) => setForm({ ...form, posting_rule_id: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                >
                  {rules.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.rule_code} (v{r.version}) — {r.rule_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-medium">Test Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Standard Direct Bill Invoice Test"
                  value={form.test_name}
                  onChange={(e) => setForm({ ...form, test_name: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">Input Payload JSON *</label>
                <textarea
                  rows={6}
                  required
                  value={form.input_payload}
                  onChange={(e) => setForm({ ...form, input_payload: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Expected Total Debit ($)</label>
                  <input
                    type="text"
                    value={form.expected_total_debit}
                    onChange={(e) => setForm({ ...form, expected_total_debit: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Expected Total Credit ($)</label>
                  <input
                    type="text"
                    value={form.expected_total_credit}
                    onChange={(e) => setForm({ ...form, expected_total_credit: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
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
                  Save Test Fixture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
