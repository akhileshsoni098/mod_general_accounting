import React, { useState, useEffect } from 'react';
import { rulesApi, eventsApi, authApi } from '../services/api';
import {
  Sliders,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  Code2,
  RefreshCw,
  GitBranch,
  Trash2,
  Play,
  Layers,
  ChevronRight,
  Check,
  X,
  Edit3,
  Copy,
  RotateCcw
} from 'lucide-react';

export default function PostingRulesPage() {
  const [rules, setRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected Rule for Inspection / Edit
  const [selectedRule, setSelectedRule] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form State for Editing Rule
  const [editRuleForm, setEditRuleForm] = useState({
    _id: '',
    rule_code: '',
    rule_name: '',
    description: '',
    event_code: '',
    priority: 100,
    accounting_basis: 'GAAP',
    conditions: [],
    lines: []
  });

  // Form State for New Rule
  const [newRuleForm, setNewRuleForm] = useState({
    rule_code: '',
    rule_name: '',
    description: '',
    event_code: '',
    priority: 100,
    accounting_basis: 'GAAP',
    conditions: [{ field_path: 'payload.transaction_type', operator: 'EQUALS', value: 'DIRECT_BILL' }],
    lines: [
      {
        line_number: 1,
        line_key: 'DR_AR',
        account_code: '1100',
        direction: 'DEBIT',
        amount_expression: 'payload.gross_premium + payload.policy_fee',
        description_template: 'Receivable for Policy {{payload.policy_id}}'
      },
      {
        line_number: 2,
        line_key: 'CR_UPR',
        account_code: '2200',
        direction: 'CREDIT',
        amount_expression: 'payload.gross_premium',
        description_template: 'Unearned premium reserve'
      },
      {
        line_number: 3,
        line_key: 'CR_FEE',
        account_code: '4100',
        direction: 'CREDIT',
        amount_expression: 'payload.policy_fee',
        description_template: 'Policy fee revenue'
      }
    ]
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      let query = '';
      const params = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (params.length > 0) query = `?${params.join('&')}`;

      const [rulesRes, eventsRes, accsRes] = await Promise.all([
        rulesApi.getRules(query),
        eventsApi.getEvents(),
        authApi.getAccounts()
      ]);

      setRules(rulesRes.data || []);
      setEvents(eventsRes.data || []);
      setAccounts(accsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleValidate = async (ruleId) => {
    try {
      setActionLoading(true);
      const res = await rulesApi.validateRule(ruleId);
      alert(res.data.is_valid ? 'Rule validation passed!' : `Validation failed: ${res.data.errors.join('; ')}`);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async (ruleId) => {
    if (!window.confirm('Publishing this rule version will make it active and immutable. Proceed?')) return;
    try {
      setActionLoading(true);
      await rulesApi.publishRule(ruleId);
      alert('Posting rule version published successfully!');
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFork = async (ruleId) => {
    try {
      setActionLoading(true);
      const res = await rulesApi.forkRule(ruleId);
      alert(`Created new draft version ${res.data.rule.version}`);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetire = async (ruleId) => {
    const reason = window.prompt('Enter reason for retiring this rule version:');
    if (!reason) return;
    try {
      setActionLoading(true);
      await rulesApi.retireRule(ruleId, reason);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLine = () => {
    const nextNum = newRuleForm.lines.length + 1;
    setNewRuleForm({
      ...newRuleForm,
      lines: [
        ...newRuleForm.lines,
        {
          line_number: nextNum,
          line_key: `LINE_${nextNum}`,
          account_code: '',
          direction: 'CREDIT',
          amount_expression: 'payload.amount',
          description_template: `Line ${nextNum}`
        }
      ]
    });
  };

  const handleRemoveLine = (idxToRemove) => {
    if (newRuleForm.lines.length <= 2) {
      alert('A valid double-entry posting rule requires at least 2 lines (Debit and Credit).');
      return;
    }
    const updated = newRuleForm.lines
      .filter((_, idx) => idx !== idxToRemove)
      .map((line, idx) => ({
        ...line,
        line_number: idx + 1,
        line_key: `LINE_${idx + 1}`
      }));
    setNewRuleForm({
      ...newRuleForm,
      lines: updated
    });
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await rulesApi.createRule(newRuleForm);
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId, ruleCode, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete rule "${ruleCode}"? This will also remove all its double-entry line configurations.`)) {
      return;
    }
    try {
      setActionLoading(true);
      await rulesApi.deleteRule(ruleId);
      if (selectedRule?._id === ruleId) {
        setSelectedRule(null);
      }
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete rule');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivateRule = async (ruleId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Reactivate this retired rule and mark it as active and PUBLISHED?')) return;
    try {
      setActionLoading(true);
      await rulesApi.reactivateRule(ruleId);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to reactivate rule');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDuplicateRule = (rule, e) => {
    if (e) e.stopPropagation();
    const cleanLines = (rule.lines || []).map((l, idx) => ({
      line_number: idx + 1,
      line_key: l.line_key || `LINE_${idx + 1}`,
      account_code: l.account_code || '',
      direction: l.direction || 'DEBIT',
      amount_expression: l.amount_expression || l.amount_field || '',
      description_template: l.description_template || ''
    }));

    setNewRuleForm({
      rule_code: `${rule.rule_code}_COPY`,
      rule_name: `${rule.rule_name} (Copy)`,
      description: rule.description || '',
      event_code: rule.event_code || '',
      priority: rule.priority || 100,
      accounting_basis: rule.accounting_basis || 'GAAP',
      conditions: (rule.conditions || []).map(c => ({
        field_path: c.field_path || '',
        operator: c.operator || 'EQUALS',
        value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? '')
      })),
      lines: cleanLines.length >= 2 ? cleanLines : [
        { line_number: 1, line_key: 'LINE_1', account_code: '1100', direction: 'DEBIT', amount_expression: 'payload.amount', description_template: '' },
        { line_number: 2, line_key: 'LINE_2', account_code: '2200', direction: 'CREDIT', amount_expression: 'payload.amount', description_template: '' }
      ]
    });
    setShowCreateModal(true);
  };

  const handleOpenEdit = async (rule) => {
    if (!rule) return;
    if (rule.status === 'PUBLISHED') {
      const confirmFork = window.confirm(
        `Rule "${rule.rule_code}" is currently PUBLISHED and locked for accounting audit integrity.\n\nWould you like to fork a new Draft Version (v${(rule.version || 1) + 1}) to edit it?`
      );
      if (!confirmFork) return;
      try {
        setActionLoading(true);
        const forkRes = await rulesApi.forkRule(rule._id);
        const newDraft = forkRes.data.rule;
        const newLines = forkRes.data.lines || [];
        setEditRuleForm({
          _id: newDraft._id,
          rule_code: newDraft.rule_code,
          rule_name: newDraft.rule_name,
          description: newDraft.description || '',
          event_code: newDraft.event_code,
          priority: newDraft.priority || 100,
          conditions: (newDraft.conditions || []).map(c => ({
            field_path: c.field_path || '',
            operator: c.operator || 'EQUALS',
            value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? '')
          })),
          lines: newLines.map((l, idx) => ({
            line_number: idx + 1,
            line_key: l.line_key || `LINE_${idx + 1}`,
            account_code: l.account_code || '',
            direction: l.direction || 'DEBIT',
            amount_expression: l.amount_expression || l.amount_field || '',
            description_template: l.description_template || ''
          }))
        });
        setSelectedRule({ ...newDraft, lines: newLines });
        setShowEditModal(true);
        loadData();
      } catch (err) {
        alert(err.message);
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // For DRAFT or VALIDATED
    setEditRuleForm({
      _id: rule._id,
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      description: rule.description || '',
      event_code: rule.event_code,
      priority: rule.priority || 100,
      conditions: (rule.conditions || []).map(c => ({
        field_path: c.field_path || '',
        operator: c.operator || 'EQUALS',
        value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? '')
      })),
      lines: (rule.lines || []).map((l, idx) => ({
        line_number: idx + 1,
        line_key: l.line_key || `LINE_${idx + 1}`,
        account_code: l.account_code || '',
        direction: l.direction || 'DEBIT',
        amount_expression: l.amount_expression || l.amount_field || '',
        description_template: l.description_template || ''
      }))
    });
    setShowEditModal(true);
  };

  const handleSaveEditRule = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const cleanedConditions = editRuleForm.conditions
        .filter(c => c.field_path && c.field_path.trim() !== '')
        .map(c => {
          let val = c.value;
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          else if (!isNaN(Number(val)) && typeof val === 'string' && val.trim() !== '') val = Number(val);
          return {
            field_path: c.field_path.trim(),
            operator: c.operator,
            value: val
          };
        });

      const payload = {
        rule_name: editRuleForm.rule_name,
        description: editRuleForm.description,
        priority: Number(editRuleForm.priority) || 100,
        conditions: cleanedConditions,
        lines: editRuleForm.lines
      };

      const res = await rulesApi.updateRule(editRuleForm._id, payload);
      alert('Posting rule updated successfully!');
      setShowEditModal(false);
      const updatedRule = res.data.rule ? { ...res.data.rule, lines: res.data.lines } : null;
      if (updatedRule) setSelectedRule(updatedRule);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddEditLine = () => {
    const nextNum = editRuleForm.lines.length + 1;
    setEditRuleForm({
      ...editRuleForm,
      lines: [
        ...editRuleForm.lines,
        {
          line_number: nextNum,
          line_key: `LINE_${nextNum}`,
          account_code: '',
          direction: 'CREDIT',
          amount_expression: 'payload.amount',
          description_template: `Line ${nextNum}`
        }
      ]
    });
  };

  const handleRemoveEditLine = (idxToRemove) => {
    if (editRuleForm.lines.length <= 2) {
      alert('A valid double-entry posting rule requires at least 2 lines (Debit and Credit).');
      return;
    }
    const updated = editRuleForm.lines
      .filter((_, idx) => idx !== idxToRemove)
      .map((line, idx) => ({
        ...line,
        line_number: idx + 1,
        line_key: `LINE_${idx + 1}`
      }));
    setEditRuleForm({
      ...editRuleForm,
      lines: updated
    });
  };

  const handleAddEditCondition = () => {
    setEditRuleForm({
      ...editRuleForm,
      conditions: [
        ...editRuleForm.conditions,
        { field_path: 'payload.', operator: 'EQUALS', value: '' }
      ]
    });
  };

  const handleRemoveEditCondition = (idxToRemove) => {
    setEditRuleForm({
      ...editRuleForm,
      conditions: editRuleForm.conditions.filter((_, idx) => idx !== idxToRemove)
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
            <Sliders className="w-5 h-5 text-brand-400" />
            <span>Journal Entry Posting Rules</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure, validate, and publish double-entry journal generation rules triggered by business events.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-brand-500/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Posting Rule</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center space-x-4 bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by rule code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="VALIDATED">Validated</option>
          <option value="PUBLISHED">Published</option>
          <option value="RETIRED">Retired</option>
        </select>
        <button
          onClick={loadData}
          className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Configured Rules ({rules.length})</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">Loading rules catalog...</div>
          ) : rules.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Sliders className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <div className="text-xs font-semibold text-slate-400">No posting rules configured for this organization.</div>
              <div className="text-[11px]">Create a rule to define double-entry journal mappings.</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {rules.map((r) => {
                const isSelected = selectedRule?._id === r._id;
                const statusBadge =
                  r.status === 'PUBLISHED'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : r.status === 'VALIDATED'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    : r.status === 'RETIRED'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30';

                return (
                  <div
                    key={r._id}
                    onClick={() => setSelectedRule(r)}
                    className={`p-4 cursor-pointer transition flex items-center justify-between ${
                      isSelected ? 'bg-brand-600/10 border-l-2 border-brand-500' : 'hover:bg-slate-850'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-white">{r.rule_code}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          v{r.version}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${statusBadge}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-200 font-medium">{r.rule_name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                        <span className="font-mono text-brand-300">Event: {r.event_code}</span>
                        <span>•</span>
                        <span>Priority: {r.priority}</span>
                        <span>•</span>
                        <span>{r.lines?.length || 0} line(s)</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(r)}
                        className="p-1.5 bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white rounded transition"
                        title={r.status === 'PUBLISHED' ? 'Edit (Fork new version)' : 'Edit Rule'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDuplicateRule(r, e)}
                        className="p-1.5 bg-slate-800 hover:bg-brand-600 text-slate-300 hover:text-white rounded transition"
                        title="Duplicate / Clone Rule"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {r.status === 'RETIRED' && (
                        <button
                          type="button"
                          onClick={(e) => handleReactivateRule(r._id, e)}
                          className="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-800/60 rounded text-[10px] font-bold transition flex items-center space-x-1"
                          title="Restore & Publish this Rule"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDeleteRule(r._id, r.rule_code, e)}
                        className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded transition"
                        title="Delete Rule Permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <ChevronRight className={`w-4 h-4 ml-1 ${isSelected ? 'text-brand-400' : 'text-slate-600'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Rule Inspector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
              <Code2 className="w-4 h-4 text-brand-400" />
              <span>Rule Detail & Lifecycle</span>
            </h3>
            {selectedRule && (
              <span className="font-mono text-[10px] text-brand-400">{selectedRule.rule_code}</span>
            )}
          </div>

          {!selectedRule ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Select a posting rule from the left panel to inspect conditions, ledger lines, and lifecycle controls.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[11px] text-slate-400">Status & Priority:</span>
                <div className="mt-1 flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="font-semibold text-slate-200">{selectedRule.status}</span>
                  <span className="font-mono text-slate-400">Priority: {selectedRule.priority}</span>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Match Conditions ({selectedRule.conditions?.length || 0})</span>
                <div className="mt-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                  {selectedRule.conditions?.length === 0 ? (
                    <div className="text-[11px] text-slate-500">Unconditional (matches all events with this code)</div>
                  ) : (
                    selectedRule.conditions?.map((c, idx) => (
                      <div key={idx} className="font-mono text-[10px] text-slate-300">
                        <span className="text-brand-400">{c.field_path}</span> {c.operator}{' '}
                        <span className="text-emerald-400">{JSON.stringify(c.value)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Posting Lines */}
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Journal Lines ({selectedRule.lines?.length || 0})</span>
                <div className="mt-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                  {selectedRule.lines?.map((l) => (
                    <div key={l.line_number} className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[11px] text-white">
                          #{l.line_number} {l.account_code}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            l.direction === 'DEBIT' ? 'text-amber-400 bg-amber-500/10' : 'text-cyan-400 bg-cyan-500/10'
                          }`}
                        >
                          {l.direction}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate">
                        Formula: {l.amount_expression || l.amount_field}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lifecycle Controls */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                  <span>Rule Actions & Lifecycle</span>
                  <span className="font-mono text-[10px] text-slate-500">v{selectedRule.version}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenEdit(selectedRule)}
                    disabled={actionLoading}
                    className="py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 shadow-md shadow-amber-500/10"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{selectedRule.status === 'PUBLISHED' ? 'Edit (Fork)' : 'Edit Rule'}</span>
                  </button>

                  <button
                    onClick={(e) => handleDuplicateRule(selectedRule, e)}
                    disabled={actionLoading}
                    className="py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Clone Rule</span>
                  </button>

                  <button
                    onClick={() => handleValidate(selectedRule._id)}
                    disabled={actionLoading}
                    className="py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    Validate
                  </button>

                  {selectedRule.status !== 'PUBLISHED' && selectedRule.status !== 'RETIRED' && (
                    <button
                      onClick={() => handlePublish(selectedRule._id)}
                      disabled={actionLoading}
                      className="py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-brand-500/20"
                    >
                      Publish
                    </button>
                  )}

                  {selectedRule.status === 'PUBLISHED' && (
                    <button
                      onClick={() => handleFork(selectedRule._id)}
                      disabled={actionLoading}
                      className="py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition"
                    >
                      Fork New Draft
                    </button>
                  )}

                  {selectedRule.status === 'RETIRED' && (
                    <button
                      onClick={(e) => handleReactivateRule(selectedRule._id, e)}
                      disabled={actionLoading}
                      className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-500/20"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reactivate / Publish</span>
                    </button>
                  )}

                  {selectedRule.status !== 'RETIRED' && (
                    <button
                      onClick={() => handleRetire(selectedRule._id)}
                      disabled={actionLoading}
                      className="py-1.5 bg-slate-800 hover:bg-rose-950/60 border border-slate-750 hover:border-rose-800 text-slate-300 hover:text-rose-300 rounded-lg text-xs font-semibold transition"
                    >
                      Retire
                    </button>
                  )}

                  <button
                    onClick={(e) => handleDeleteRule(selectedRule._id, selectedRule.rule_code, e)}
                    disabled={actionLoading}
                    className="py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 shadow-md shadow-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Rule</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Posting Rule */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-brand-400" />
                <span>Create Journal Entry Posting Rule</span>
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Rule Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RULE_INV_PREMIUM"
                    value={newRuleForm.rule_code}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, rule_code: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Rule Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Premium Invoice Direct Recognition"
                    value={newRuleForm.rule_name}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, rule_name: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Trigger Event Code *</label>
                  <select
                    required
                    value={newRuleForm.event_code}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, event_code: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">-- Select Trigger Event --</option>
                    {events.map((evt) => (
                      <option key={evt._id || evt.event_code} value={evt.event_code}>
                        {evt.event_code} {evt.name ? `(${evt.name})` : ''}
                      </option>
                    ))}
                    {!events.some(e => e.event_code === 'billing.invoice.issued') && (
                      <option value="billing.invoice.issued">billing.invoice.issued (Billing Invoice Issued)</option>
                    )}
                    {!events.some(e => e.event_code === 'billing.payment.received') && (
                      <option value="billing.payment.received">billing.payment.received (Billing Payment Received)</option>
                    )}
                    {!events.some(e => e.event_code === 'commissions.fiduciary.sweep') && (
                      <option value="commissions.fiduciary.sweep">commissions.fiduciary.sweep (Fiduciary Sweep)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Priority (Lower = Higher Precedence)</label>
                  <input
                    type="number"
                    value={newRuleForm.priority}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, priority: Number(e.target.value) })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Configured Double-Entry Lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-slate-400 font-medium">
                    Configured Double-Entry Lines ({newRuleForm.lines.length})
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 border border-brand-500/30 rounded text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newRuleForm.lines.map((l, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center space-x-2">
                      <span className="text-slate-500 font-mono text-[11px] w-6 text-center shrink-0">
                        #{idx + 1}
                      </span>
                      <select
                        required
                        value={l.account_code}
                        onChange={(e) => {
                          const updated = [...newRuleForm.lines];
                          updated[idx].account_code = e.target.value;
                          setNewRuleForm({ ...newRuleForm, lines: updated });
                        }}
                        className="w-56 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-white shrink-0 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">-- Select GL Account --</option>
                        {accounts.length > 0 ? (
                          accounts.map((acc) => (
                            <option key={acc._id || acc.account_code} value={acc.account_code}>
                              {acc.account_code} - {acc.account_name} ({acc.account_type})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="1000">1000 - Operating Cash (ASSET)</option>
                            <option value="1010">1010 - Fiduciary Premium Trust (ASSET)</option>
                            <option value="1100">1100 - Premium Receivables (ASSET)</option>
                            <option value="2010">2010 - Carrier Payable (LIABILITY)</option>
                            <option value="2020">2020 - Broker Commission Payable (LIABILITY)</option>
                            <option value="2200">2200 - Unearned Premium Reserve (LIABILITY)</option>
                            <option value="4000">4000 - Commission Revenue (REVENUE)</option>
                            <option value="4100">4100 - Policy Fee Income (REVENUE)</option>
                          </>
                        )}
                      </select>
                      <select
                        value={l.direction}
                        onChange={(e) => {
                          const updated = [...newRuleForm.lines];
                          updated[idx].direction = e.target.value;
                          setNewRuleForm({ ...newRuleForm, lines: updated });
                        }}
                        className={`w-24 rounded p-1.5 text-[11px] font-semibold border shrink-0 ${
                          l.direction === 'DEBIT'
                            ? 'bg-blue-950/40 text-blue-400 border-blue-800/60'
                            : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                        }`}
                      >
                        <option value="DEBIT">DEBIT</option>
                        <option value="CREDIT">CREDIT</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Expression (e.g. payload.gross_premium)"
                        required
                        value={l.amount_expression}
                        onChange={(e) => {
                          const updated = [...newRuleForm.lines];
                          updated[idx].amount_expression = e.target.value;
                          setNewRuleForm({ ...newRuleForm, lines: updated });
                        }}
                        className="flex-1 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-brand-300 min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        disabled={newRuleForm.lines.length <= 2}
                        className={`p-1.5 rounded transition shrink-0 ${
                          newRuleForm.lines.length <= 2
                            ? 'text-slate-600 cursor-not-allowed opacity-40'
                            : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 cursor-pointer'
                        }`}
                        title={newRuleForm.lines.length <= 2 ? 'Minimum 2 lines required for double-entry' : 'Delete line'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
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
                  disabled={actionLoading}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold shadow-md shadow-brand-500/20"
                >
                  Create Rule Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Posting Rule */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Edit Journal Entry Posting Rule ({editRuleForm.rule_code})</span>
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditRule} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Rule Code</label>
                  <input
                    type="text"
                    disabled
                    value={editRuleForm.rule_code}
                    className="w-full mt-1 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 font-mono cursor-not-allowed text-xs"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Rule Name *</label>
                  <input
                    type="text"
                    required
                    value={editRuleForm.rule_name}
                    onChange={(e) => setEditRuleForm({ ...editRuleForm, rule_name: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 font-medium">Trigger Event</label>
                  <input
                    type="text"
                    disabled
                    value={editRuleForm.event_code}
                    className="w-full mt-1 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 font-mono cursor-not-allowed text-xs"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Priority (Lower = Higher Precedence)</label>
                  <input
                    type="number"
                    value={editRuleForm.priority}
                    onChange={(e) => setEditRuleForm({ ...editRuleForm, priority: Number(e.target.value) })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-medium">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Recognizes premium and fees for Texas Direct Bill policies"
                  value={editRuleForm.description}
                  onChange={(e) => setEditRuleForm({ ...editRuleForm, description: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Match Conditions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-slate-400 font-medium flex items-center space-x-1.5">
                    <span>Match Conditions ({editRuleForm.conditions.length})</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      (Leave empty for unconditional rule)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditCondition}
                    className="flex items-center space-x-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Condition</span>
                  </button>
                </div>

                {editRuleForm.conditions.length === 0 ? (
                  <div className="p-2.5 bg-slate-950/50 border border-dashed border-slate-800 rounded text-slate-500 text-[11px]">
                    No conditions configured. This rule will match all events for {editRuleForm.event_code}.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editRuleForm.conditions.map((cond, cIdx) => (
                      <div key={cIdx} className="p-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="field_path (e.g. payload.transaction_type)"
                          value={cond.field_path}
                          onChange={(e) => {
                            const updated = [...editRuleForm.conditions];
                            updated[cIdx].field_path = e.target.value;
                            setEditRuleForm({ ...editRuleForm, conditions: updated });
                          }}
                          className="w-48 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-brand-300 focus:outline-none"
                        />
                        <select
                          value={cond.operator}
                          onChange={(e) => {
                            const updated = [...editRuleForm.conditions];
                            updated[cIdx].operator = e.target.value;
                            setEditRuleForm({ ...editRuleForm, conditions: updated });
                          }}
                          className="w-32 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-white focus:outline-none"
                        >
                          <option value="EQUALS">EQUALS</option>
                          <option value="NOT_EQUALS">NOT_EQUALS</option>
                          <option value="GREATER_THAN">GREATER_THAN</option>
                          <option value="LESS_THAN">LESS_THAN</option>
                          <option value="IN">IN</option>
                          <option value="NOT_IN">NOT_IN</option>
                          <option value="EXISTS">EXISTS</option>
                        </select>
                        <input
                          type="text"
                          placeholder="value (e.g. DIRECT_BILL or 0)"
                          value={cond.value}
                          onChange={(e) => {
                            const updated = [...editRuleForm.conditions];
                            updated[cIdx].value = e.target.value;
                            setEditRuleForm({ ...editRuleForm, conditions: updated });
                          }}
                          className="flex-1 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-emerald-300 min-w-0 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveEditCondition(cIdx)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Configured Double-Entry Lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-slate-400 font-medium">
                    Configured Double-Entry Lines ({editRuleForm.lines.length})
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditLine}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {editRuleForm.lines.map((l, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center space-x-2">
                      <span className="text-slate-500 font-mono text-[11px] w-6 text-center shrink-0">
                        #{idx + 1}
                      </span>
                      <select
                        required
                        value={l.account_code}
                        onChange={(e) => {
                          const updated = [...editRuleForm.lines];
                          updated[idx].account_code = e.target.value;
                          setEditRuleForm({ ...editRuleForm, lines: updated });
                        }}
                        className="w-56 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-white shrink-0 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">-- Select GL Account --</option>
                        {accounts.length > 0 ? (
                          accounts.map((acc) => (
                            <option key={acc._id || acc.account_code} value={acc.account_code}>
                              {acc.account_code} - {acc.account_name} ({acc.account_type})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="1000">1000 - Operating Cash (ASSET)</option>
                            <option value="1010">1010 - Fiduciary Premium Trust (ASSET)</option>
                            <option value="1100">1100 - Premium Receivables (ASSET)</option>
                            <option value="2010">2010 - Carrier Payable (LIABILITY)</option>
                            <option value="2020">2020 - Broker Commission Payable (LIABILITY)</option>
                            <option value="2190">2190 - Unapplied Cash (LIABILITY)</option>
                            <option value="2200">2200 - Unearned Premium Reserve (LIABILITY)</option>
                            <option value="4000">4000 - Commission Revenue (REVENUE)</option>
                            <option value="4100">4100 - Policy Fee Income (REVENUE)</option>
                          </>
                        )}
                      </select>
                      <select
                        value={l.direction}
                        onChange={(e) => {
                          const updated = [...editRuleForm.lines];
                          updated[idx].direction = e.target.value;
                          setEditRuleForm({ ...editRuleForm, lines: updated });
                        }}
                        className={`w-24 rounded p-1.5 text-[11px] font-semibold border shrink-0 ${
                          l.direction === 'DEBIT'
                            ? 'bg-blue-950/40 text-blue-400 border-blue-800/60'
                            : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                        }`}
                      >
                        <option value="DEBIT">DEBIT</option>
                        <option value="CREDIT">CREDIT</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Expression (e.g. payload.gross_premium)"
                        required
                        value={l.amount_expression}
                        onChange={(e) => {
                          const updated = [...editRuleForm.lines];
                          updated[idx].amount_expression = e.target.value;
                          setEditRuleForm({ ...editRuleForm, lines: updated });
                        }}
                        className="flex-1 bg-slate-900 border border-slate-750 rounded p-1.5 font-mono text-[11px] text-amber-300 min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEditLine(idx)}
                        disabled={editRuleForm.lines.length <= 2}
                        className={`p-1.5 rounded transition shrink-0 ${
                          editRuleForm.lines.length <= 2
                            ? 'text-slate-600 cursor-not-allowed opacity-40'
                            : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 cursor-pointer'
                        }`}
                        title={editRuleForm.lines.length <= 2 ? 'Minimum 2 lines required for double-entry' : 'Delete line'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shadow-md shadow-amber-500/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
