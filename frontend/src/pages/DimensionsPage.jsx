import React, { useState, useEffect } from 'react';
import { dimensionsApi } from '../services/api';
import {
  Tags,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  Users2,
  Layers,
  ShieldCheck,
  Edit3,
  Trash2,
  RefreshCw,
  X,
  Check,
  Info
} from 'lucide-react';

const TYPE_BADGES = {
  COUNTERPARTY: { label: 'Counterparty', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  ORGANIZATION_UNIT: { label: 'Org Unit / CC', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  LOOKUP_LIST: { label: 'Lookup List', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  POLICY: { label: 'Policy Root', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  TEXT: { label: 'Text / Code', color: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
  CUSTOM: { label: 'Custom', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' }
};

export default function DimensionsPage() {
  const [dimensions, setDimensions] = useState([]);
  const [contextData, setContextData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    dimension_code: '',
    display_name: '',
    dimension_type: 'CUSTOM',
    target_role: '',
    allowed_values_str: '',
    default_value: '',
    description: '',
    is_required: false
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    _id: '',
    dimension_code: '',
    display_name: '',
    status: 'ACTIVE',
    allowed_values_str: '',
    default_value: '',
    description: '',
    is_required: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [dimRes, ctxRes] = await Promise.all([
        dimensionsApi.getDimensions(),
        dimensionsApi.getDimensionContext().catch(() => ({ data: null }))
      ]);
      setDimensions(dimRes.data || []);
      setContextData(ctxRes?.data || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.dimension_code.trim() || !createForm.display_name.trim()) {
      setError('Dimension Code and Display Name are required');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);

      const allowedValues = createForm.allowed_values_str
        ? createForm.allowed_values_str.split(',').map((v) => v.trim()).filter(Boolean)
        : [];

      await dimensionsApi.createDimension({
        dimension_code: createForm.dimension_code.trim().toUpperCase(),
        display_name: createForm.display_name.trim(),
        dimension_type: createForm.dimension_type,
        target_role: createForm.dimension_type === 'COUNTERPARTY' ? createForm.target_role : null,
        allowed_values: allowedValues,
        default_value: createForm.default_value.trim() || null,
        description: createForm.description.trim(),
        is_required: createForm.is_required
      });

      setSuccessMsg(`Dimension ${createForm.dimension_code.toUpperCase()} created successfully!`);
      setShowCreateModal(false);
      setCreateForm({
        dimension_code: '',
        display_name: '',
        dimension_type: 'CUSTOM',
        target_role: '',
        allowed_values_str: '',
        default_value: '',
        description: '',
        is_required: false
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditOpen = (dim) => {
    setEditForm({
      _id: dim._id,
      dimension_code: dim.dimension_code,
      display_name: dim.display_name,
      status: dim.status,
      allowed_values_str: (dim.allowed_values || []).join(', '),
      default_value: dim.default_value || '',
      description: dim.description || '',
      is_required: dim.is_required || false
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);

      const allowedValues = editForm.allowed_values_str
        ? editForm.allowed_values_str.split(',').map((v) => v.trim()).filter(Boolean)
        : [];

      await dimensionsApi.updateDimension(editForm._id, {
        display_name: editForm.display_name.trim(),
        status: editForm.status,
        allowed_values: allowedValues,
        default_value: editForm.default_value.trim() || null,
        description: editForm.description.trim(),
        is_required: editForm.is_required
      });

      setSuccessMsg(`Dimension ${editForm.dimension_code} updated successfully!`);
      setShowEditModal(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (dim) => {
    const promptMsg = dim.is_system
      ? `Deactivate system dimension "${dim.dimension_code}"? It will not be suggested in postings.`
      : `Delete custom dimension "${dim.dimension_code}"?`;

    if (!window.confirm(promptMsg)) return;

    try {
      setActionLoading(true);
      setError(null);
      await dimensionsApi.deleteDimension(dim._id);
      setSuccessMsg(`Dimension ${dim.dimension_code} ${dim.is_system ? 'deactivated' : 'deleted'} successfully`);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredDimensions = dimensions.filter((d) => {
    if (typeFilter && d.dimension_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.dimension_code.toLowerCase().includes(q) ||
        d.display_name.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Tags className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">Accounting Dimensions</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure dynamic multi-carrier, multi-broker, MGA, cost center, and company code subledger dimensions tagged on every GL journal line.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Reload dimensions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition shadow-lg shadow-brand-500/20 flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Dimension</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Overview Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Total Configured</div>
          <div className="text-2xl font-bold font-mono text-white">{dimensions.length}</div>
          <div className="text-[11px] text-slate-500">Active GL dimension segments</div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Counterparty Roles</div>
          <div className="text-2xl font-bold font-mono text-blue-400">
            {dimensions.filter((d) => d.dimension_type === 'COUNTERPARTY').length}
          </div>
          <div className="text-[11px] text-slate-500">Carriers, Brokers, MGAs, Reinsurers</div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Custom Org & CC</div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {dimensions.filter((d) => ['ORGANIZATION_UNIT', 'TEXT', 'CUSTOM'].includes(d.dimension_type)).length}
          </div>
          <div className="text-[11px] text-slate-500">Cost centers, company codes, departments</div>
        </div>
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">System Standards</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {dimensions.filter((d) => d.is_system).length}
          </div>
          <div className="text-[11px] text-slate-500">Texas § 4053 and ASC 944 compliance</div>
        </div>
      </div>

      {/* Subledger Linkage Concept Card */}
      <div className="p-4 bg-slate-900/60 border border-brand-500/30 rounded-xl text-xs space-y-2">
        <div className="flex items-center space-x-2 text-brand-400 font-semibold">
          <Info className="w-4 h-4 shrink-0" />
          <span>How Dynamic Dimensions Control Subledger Postings</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-slate-300">
          <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
            <span className="font-mono font-bold text-amber-400">Account 2010 (Due to Carrier)</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Automatically stamped with <code className="text-slate-200">carrier_id</code> and <code className="text-slate-200">carrier_name</code>. Bordereaux and wires isolate each carrier.
            </p>
          </div>
          <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
            <span className="font-mono font-bold text-purple-400">Account 2020 (Broker Payable)</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Stamped with <code className="text-slate-200">broker_id</code> and <code className="text-slate-200">broker_name</code>. Producer commissions are grouped and settled per retail agency.
            </p>
          </div>
          <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
            <span className="font-mono font-bold text-emerald-400">Custom Tags (CC & Comp)</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Pass arbitrary segments like <code className="text-slate-200">cost_center</code> or <code className="text-slate-200">company_code</code> to segment P&L reporting.
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or description..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="">All Dimension Types</option>
            <option value="COUNTERPARTY">Counterparty</option>
            <option value="ORGANIZATION_UNIT">Organization Unit / Cost Center</option>
            <option value="LOOKUP_LIST">Lookup List</option>
            <option value="POLICY">Policy</option>
            <option value="TEXT">Text</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
      </div>

      {/* Dimensions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Dimension Code</th>
                <th className="py-3 px-4">Display Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Role / Values</th>
                <th className="py-3 px-4">Default Value</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    Loading dimensions...
                  </td>
                </tr>
              ) : filteredDimensions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    No dimensions found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredDimensions.map((dim) => {
                  const typeBadge = TYPE_BADGES[dim.dimension_type] || TYPE_BADGES.CUSTOM;
                  return (
                    <tr key={dim._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-white flex items-center space-x-2">
                        <span>{dim.dimension_code}</span>
                        {dim.is_system && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] text-slate-400 border border-slate-700 font-sans">
                            SYSTEM
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{dim.display_name}</div>
                        {dim.description && (
                          <div className="text-[10px] text-slate-500 truncate max-w-xs">{dim.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {dim.target_role ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-mono">
                            ROLE: {dim.target_role}
                          </span>
                        ) : dim.allowed_values && dim.allowed_values.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {dim.allowed_values.slice(0, 3).map((val) => (
                              <span key={val} className="px-1 py-0.2 rounded bg-slate-800 text-[9px] font-mono text-slate-300">
                                {val}
                              </span>
                            ))}
                            {dim.allowed_values.length > 3 && (
                              <span className="text-[10px] text-slate-500">+{dim.allowed_values.length - 3} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {dim.default_value || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            dim.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {dim.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleEditOpen(dim)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Edit Dimension"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(dim)}
                            className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                            title={dim.is_system ? 'Deactivate' : 'Delete Dimension'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Tags className="w-4 h-4 text-brand-400" />
                <span>Create New Dimension Definition</span>
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Dimension Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. COMP_CODE, DEPT, REGION, PROGRAM_ID"
                  value={createForm.dimension_code}
                  onChange={(e) => setCreateForm({ ...createForm, dimension_code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 uppercase font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operating Company Code, Department"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Dimension Type</label>
                  <select
                    value={createForm.dimension_type}
                    onChange={(e) => setCreateForm({ ...createForm, dimension_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="CUSTOM">Custom Dimension</option>
                    <option value="COUNTERPARTY">Counterparty Role</option>
                    <option value="ORGANIZATION_UNIT">Organization Unit / Cost Center</option>
                    <option value="LOOKUP_LIST">Lookup List (Allowed Values)</option>
                    <option value="TEXT">Freeform Text</option>
                  </select>
                </div>

                {createForm.dimension_type === 'COUNTERPARTY' ? (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Target Role</label>
                    <select
                      value={createForm.target_role}
                      onChange={(e) => setCreateForm({ ...createForm, target_role: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select Role...</option>
                      <option value="CARRIER">CARRIER (Paper Carrier)</option>
                      <option value="BROKER">BROKER (Retail Producer)</option>
                      <option value="MGA">MGA (Managing General Agent)</option>
                      <option value="REINSURER">REINSURER (Treaty/Facultative)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Default Value</label>
                    <input
                      type="text"
                      placeholder="e.g. CC-OPS, COMP-001"
                      value={createForm.default_value}
                      onChange={(e) => setCreateForm({ ...createForm, default_value: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Allowed Values (Comma-separated, optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CC-OPS, CC-FINANCE, CC-CLAIMS"
                  value={createForm.allowed_values_str}
                  onChange={(e) => setCreateForm({ ...createForm, allowed_values_str: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Description</label>
                <textarea
                  rows="2"
                  placeholder="Purpose of this accounting dimension..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold transition disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Create Dimension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-brand-400" />
                <span>Edit Dimension: {editForm.dimension_code}</span>
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Display Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Default Value</label>
                  <input
                    type="text"
                    value={editForm.default_value}
                    onChange={(e) => setEditForm({ ...editForm, default_value: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Allowed Values (Comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.allowed_values_str}
                  onChange={(e) => setEditForm({ ...editForm, allowed_values_str: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Description</label>
                <textarea
                  rows="2"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-brand-500"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold transition disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
