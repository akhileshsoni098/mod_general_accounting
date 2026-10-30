import React, { useState, useEffect } from 'react';
import { counterpartiesApi } from '../services/api';
import {
  Users2,
  Plus,
  Search,
  Filter,
  Building,
  User,
  Shield,
  Briefcase,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Edit2,
  Trash2,
  Power
} from 'lucide-react';

const ROLE_COLORS = {
  CUSTOMER: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SUPPLIER: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  VENDOR: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  DEBTOR: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  CREDITOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FRANCHISE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  MAIN_HUB: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  PARTNER: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  AGENT: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  PRODUCER: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  CARRIER: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  MGA: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  BROKER: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  POLICYHOLDER: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
};

export default function CounterpartiesPage() {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);

  // Form State for Create
  const [formData, setFormData] = useState({
    party_code: '',
    legal_name: '',
    trade_name: '',
    party_type: 'ORGANIZATION',
    tax_id: '',
    email: '',
    phone: '',
    initial_role_type: 'CUSTOMER',
    street1: '',
    city: '',
    state: '',
    postal_code: ''
  });

  // Form State for Edit
  const [editFormData, setEditFormData] = useState({
    _id: '',
    party_code: '',
    legal_name: '',
    trade_name: '',
    party_type: 'ORGANIZATION',
    status: 'ACTIVE',
    tax_id: '',
    email: '',
    phone: '',
    initial_role_type: '',
    street1: '',
    city: '',
    state: '',
    postal_code: ''
  });

  // Form State for Add Role
  const [newRoleType, setNewRoleType] = useState('SUPPLIER');
  const [newRoleDetails, setNewRoleDetails] = useState('');

  useEffect(() => {
    loadParties();
  }, [roleFilter, statusFilter]);

  async function loadParties() {
    try {
      setLoading(true);
      setError(null);
      const q = [];
      if (roleFilter) q.push(`role_type=${roleFilter}`);
      if (statusFilter) q.push(`status=${statusFilter}`);
      const params = q.length ? `?${q.join('&')}` : '';
      const res = await counterpartiesApi.getParties(params);
      if (res.success && res.data) {
        setParties(res.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedDefaults() {
    try {
      setSeeding(true);
      setError(null);
      const res = await counterpartiesApi.seedParties();
      if (res.success) {
        setSuccessMsg(`Commercial counterparties (Apex Wholesale Mart, Metro Hypermarket, Horizon Tech, Bharat Logistics, Global Goods, Premier Packaging, Mumbai Central Franchise, Veridex Central Hub) loaded successfully.`);
        await loadParties();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      setError(null);
      const payload = {
        party_code: formData.party_code,
        legal_name: formData.legal_name,
        trade_name: formData.trade_name,
        party_type: formData.party_type,
        tax_id: formData.tax_id,
        email: formData.email,
        phone: formData.phone,
        address: {
          street1: formData.street1,
          city: formData.city,
          state: formData.state,
          postal_code: formData.postal_code
        },
        initial_role_type: formData.initial_role_type
      };

      const res = await counterpartiesApi.createParty(payload);
      if (res.success) {
        setSuccessMsg(`Counterparty "${formData.legal_name}" added successfully.`);
        setShowCreateModal(false);
        setFormData({
          party_code: '',
          legal_name: '',
          trade_name: '',
          party_type: 'ORGANIZATION',
          tax_id: '',
          email: '',
          phone: '',
          initial_role_type: 'CUSTOMER',
          street1: '',
          city: '',
          state: '',
          postal_code: ''
        });
        loadParties();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function openEditModal(party) {
    setSelectedParty(party);
    setEditFormData({
      _id: party._id,
      party_code: party.party_code || '',
      legal_name: party.legal_name || '',
      trade_name: party.trade_name || '',
      party_type: party.party_type || 'ORGANIZATION',
      status: party.status || 'ACTIVE',
      tax_id: party.tax_id || '',
      email: party.email || '',
      phone: party.phone || '',
      initial_role_type: (party.roles && party.roles[0]?.role_type) || party.initial_role_type || 'CUSTOMER',
      street1: party.address?.street1 || '',
      city: party.address?.city || '',
      state: party.address?.state || '',
      postal_code: party.address?.postal_code || ''
    });
    setShowEditModal(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editFormData._id) return;
    try {
      setError(null);
      const payload = {
        party_code: editFormData.party_code,
        legal_name: editFormData.legal_name,
        trade_name: editFormData.trade_name,
        party_type: editFormData.party_type,
        status: editFormData.status,
        tax_id: editFormData.tax_id,
        email: editFormData.email,
        phone: editFormData.phone,
        initial_role_type: editFormData.initial_role_type,
        address: {
          street1: editFormData.street1,
          city: editFormData.city,
          state: editFormData.state,
          postal_code: editFormData.postal_code
        }
      };

      const res = await counterpartiesApi.updateParty(editFormData._id, payload);
      if (res.success) {
        setSuccessMsg(`Counterparty "${editFormData.legal_name}" updated successfully.`);
        setShowEditModal(false);
        loadParties();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleStatus(party) {
    try {
      setError(null);
      const nextStatus = party.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await counterpartiesApi.updateParty(party._id, { status: nextStatus });
      if (res.success) {
        setSuccessMsg(`Status of "${party.legal_name}" changed to ${nextStatus}.`);
        loadParties();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleArchiveParty(party) {
    if (!window.confirm(`Are you sure you want to archive "${party.legal_name}"?`)) return;
    try {
      setError(null);
      const res = await counterpartiesApi.archiveParty(party._id);
      if (res.success) {
        setSuccessMsg(`Counterparty "${party.legal_name}" archived successfully.`);
        loadParties();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddRole(e) {
    e.preventDefault();
    if (!selectedParty) return;
    try {
      setError(null);
      let detailsObj = {};
      if (newRoleDetails.trim()) {
        try {
          detailsObj = JSON.parse(newRoleDetails);
        } catch {
          detailsObj = { note: newRoleDetails.trim() };
        }
      }
      const res = await counterpartiesApi.addPartyRole(selectedParty._id, {
        role_type: newRoleType,
        role_details: detailsObj
      });
      if (res.success) {
        setSuccessMsg(`Assigned role ${newRoleType} to ${selectedParty.legal_name}`);
        setShowRoleModal(false);
        setSelectedParty(null);
        setNewRoleDetails('');
        loadParties();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  // Filtered by search term, status, and entity type
  const displayedParties = parties.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (typeFilter && p.party_type !== typeFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.legal_name?.toLowerCase().includes(term) ||
      p.party_code?.toLowerCase().includes(term) ||
      p.trade_name?.toLowerCase().includes(term) ||
      p.tax_id?.toLowerCase().includes(term)
    );
  });

  // Calculate KPI Counts
  const totalCount = parties.length;
  const customerCount = parties.filter(p => p.roles?.some(r => ['CUSTOMER', 'DEBTOR', 'POLICYHOLDER'].includes(r.role_type))).length;
  const supplierCount = parties.filter(p => p.roles?.some(r => ['SUPPLIER', 'VENDOR', 'CREDITOR'].includes(r.role_type))).length;
  const franchiseCount = parties.filter(p => p.roles?.some(r => r.role_type === 'FRANCHISE')).length;
  const hubPartnerCount = parties.filter(p => p.roles?.some(r => ['MAIN_HUB', 'PARTNER', 'AGENT', 'CARRIER', 'BROKER', 'MGA'].includes(r.role_type))).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold border border-brand-500/20">
              COUNTERPARTIES
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">Counterparties & Business Roles</h2>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">
            Directory of commercial business counterparties: Sundry Debtors (Customers), Sundry Creditors (Suppliers & Vendors), Franchise Stores, and Corporate Hub. Scoped to the active company workspace.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-2 transition disabled:opacity-50"
            title="Seed standard commercial counterparties (Apex Mart, Metro Hypermarket, Bharat Logistics, Global Goods, Franchise Store, Hub)"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${seeding ? 'animate-spin' : ''}`} />
            <span>{seeding ? 'Seeding...' : 'Seed Default Parties'}</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition shadow-sm shadow-brand-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Counterparty</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-400 font-mono uppercase">Total Counterparties</div>
          <div className="text-xl font-bold text-white mt-1">{totalCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-amber-400 font-mono uppercase">Customers (Debtors)</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{customerCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-emerald-400 font-mono uppercase">Suppliers & Vendors (Creditors)</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{supplierCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-purple-400 font-mono uppercase">Franchise Stores</div>
          <div className="text-xl font-bold text-purple-400 mt-1">{franchiseCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-indigo-400 font-mono uppercase">Corporate Hub & Partners</div>
          <div className="text-xl font-bold text-indigo-400 mt-1">{hubPartnerCount}</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="relative flex-1 w-full md:w-auto">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by legal name, party code, DBA, or GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Role Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700">
            <Filter className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-400">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
            >
              <option value="" className="bg-slate-800">All Roles</option>
              <option value="CUSTOMER" className="bg-slate-800">Customers (Debtors)</option>
              <option value="SUPPLIER" className="bg-slate-800">Suppliers (Creditors)</option>
              <option value="VENDOR" className="bg-slate-800">Vendors & Contractors</option>
              <option value="FRANCHISE" className="bg-slate-800">Franchise Stores</option>
              <option value="MAIN_HUB" className="bg-slate-800">Corporate Hub</option>
              <option value="PARTNER" className="bg-slate-800">Partners</option>
              <option value="AGENT" className="bg-slate-800">Agents</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700">
            <span className="text-[11px] text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
            >
              <option value="" className="bg-slate-800">All Statuses</option>
              <option value="ACTIVE" className="bg-slate-800 text-emerald-400">Active Only</option>
              <option value="INACTIVE" className="bg-slate-800 text-rose-400">Inactive Only</option>
              <option value="ARCHIVED" className="bg-slate-800 text-slate-400">Archived</option>
            </select>
          </div>

          {/* Entity Type Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700">
            <span className="text-[11px] text-slate-400">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
            >
              <option value="" className="bg-slate-800">All Types</option>
              <option value="ORGANIZATION" className="bg-slate-800">Organization / Firm</option>
              <option value="INDIVIDUAL" className="bg-slate-800">Individual / Person</option>
            </select>
          </div>
        </div>
      </div>

      {/* Counterparties Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850/80 border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3">Party Code</th>
                <th className="px-4 py-3">Legal Name / Trade Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Assigned Business Roles</th>
                <th className="px-4 py-3">Tax ID</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-500 font-mono">
                    Loading counterparties directory...
                  </td>
                </tr>
              ) : displayedParties.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                    No counterparties found matching the criteria.
                  </td>
                </tr>
              ) : (
                displayedParties.map((party) => (
                  <tr key={party._id} className="hover:bg-slate-850/50 transition">
                    <td className="px-4 py-3 font-mono font-semibold text-brand-300">
                      {party.party_code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{party.legal_name}</div>
                      {party.trade_name && (
                        <div className="text-[11px] text-slate-400">DBA: {party.trade_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {party.party_type === 'INDIVIDUAL' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono border bg-amber-500/10 text-amber-300 border-amber-500/20">
                          <User className="w-3 h-3 text-amber-400" />
                          <span>INDIVIDUAL</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono border bg-sky-500/10 text-sky-300 border-sky-500/20">
                          <Building className="w-3 h-3 text-sky-400" />
                          <span>ORGANIZATION</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {party.roles && party.roles.length > 0 ? (
                          party.roles.map((r) => (
                            <span
                              key={r._id || r.role_type}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold ${
                                ROLE_COLORS[r.role_type] || 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {r.role_type}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">No roles assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {party.tax_id || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-300">{party.email || '—'}</div>
                      {party.phone && <div className="text-[11px] text-slate-500">{party.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleStatus(party)}
                        title={`Click to switch status to ${party.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}`}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer border ${
                          party.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : party.status === 'ARCHIVED'
                            ? 'bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                        }`}
                      >
                        {party.status}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => openEditModal(party)}
                          title="Edit Counterparty"
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition border border-slate-700 hover:border-brand-500 flex items-center space-x-1"
                        >
                          <Edit2 className="w-3 h-3 text-brand-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedParty(party);
                            setShowRoleModal(true);
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition border border-slate-700"
                        >
                          + Role
                        </button>
                        <button
                          onClick={() => handleArchiveParty(party)}
                          title="Archive Counterparty"
                          className="p-1 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-700 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Counterparty */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Users2 className="w-4 h-4 text-brand-400" />
                <span>Register New Counterparty</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Party Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CUST-APEX-001 or SUPP-001"
                    value={formData.party_code}
                    onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Entity Type *</label>
                  <select
                    value={formData.party_type}
                    onChange={(e) => setFormData({ ...formData, party_type: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="ORGANIZATION">Organization (Company/Firm)</option>
                    <option value="INDIVIDUAL">Individual (Person/Proprietor)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Initial Business Role</label>
                  <select
                    value={formData.initial_role_type}
                    onChange={(e) => setFormData({ ...formData, initial_role_type: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="CUSTOMER">Customer / Sundry Debtor</option>
                    <option value="SUPPLIER">Supplier / Sundry Creditor</option>
                    <option value="VENDOR">Vendor / Contractor</option>
                    <option value="FRANCHISE">Franchise Store</option>
                    <option value="MAIN_HUB">Corporate / Main Hub</option>
                    <option value="PARTNER">Commercial Partner</option>
                    <option value="AGENT">Sales Agent / Distributor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Wholesale Mart Private Limited"
                  value={formData.legal_name}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Trade Name (DBA)</label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Mart"
                    value={formData.trade_name}
                    onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AABCA1234F1Z8"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="commercial@apexmart.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 022-25550122"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[11px] text-slate-400 block mb-1">Street Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Shop 12-14, Commercial Market"
                    value={formData.street1}
                    onChange={(e) => setFormData({ ...formData, street1: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">State</label>
                  <input
                    type="text"
                    placeholder="MH"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold"
                >
                  Create Counterparty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Counterparty */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-brand-400" />
                <span>Edit Counterparty ({editFormData.party_code})</span>
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Party Code *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.party_code}
                    onChange={(e) => setEditFormData({ ...editFormData, party_code: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Entity Type *</label>
                  <select
                    value={editFormData.party_type}
                    onChange={(e) => setEditFormData({ ...editFormData, party_type: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="ORGANIZATION">Organization (Company/Firm)</option>
                    <option value="INDIVIDUAL">Individual (Person/Proprietor)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Status *</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 font-semibold"
                  >
                    <option value="ACTIVE" className="text-emerald-400">ACTIVE</option>
                    <option value="INACTIVE" className="text-rose-400">INACTIVE</option>
                    <option value="ARCHIVED" className="text-slate-400">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Legal Name *</label>
                <input
                  type="text"
                  required
                  value={editFormData.legal_name}
                  onChange={(e) => setEditFormData({ ...editFormData, legal_name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Trade Name (DBA)</label>
                  <input
                    type="text"
                    value={editFormData.trade_name}
                    onChange={(e) => setEditFormData({ ...editFormData, trade_name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    value={editFormData.tax_id}
                    onChange={(e) => setEditFormData({ ...editFormData, tax_id: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Email</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[11px] text-slate-400 block mb-1">Street Address</label>
                  <input
                    type="text"
                    value={editFormData.street1}
                    onChange={(e) => setEditFormData({ ...editFormData, street1: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">State</label>
                  <input
                    type="text"
                    value={editFormData.state}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Party Role */}
      {showRoleModal && selectedParty && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-purple-400" />
                <span>Assign Role to {selectedParty.legal_name}</span>
              </h3>
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedParty(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRole} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Business Role Type *</label>
                <select
                  value={newRoleType}
                  onChange={(e) => setNewRoleType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="CUSTOMER">Customer / Sundry Debtor</option>
                  <option value="SUPPLIER">Supplier / Sundry Creditor</option>
                  <option value="VENDOR">Vendor / Contractor</option>
                  <option value="FRANCHISE">Franchise Store</option>
                  <option value="MAIN_HUB">Corporate / Main Hub</option>
                  <option value="PARTNER">Commercial Partner</option>
                  <option value="AGENT">Sales Agent / Distributor</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Role Details / Metadata (JSON or text)</label>
                <textarea
                  rows="3"
                  placeholder='e.g. {"subledger_code": "1101", "credit_limit": 500000, "credit_days": 30}'
                  value={newRoleDetails}
                  onChange={(e) => setNewRoleDetails(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoleModal(false);
                    setSelectedParty(null);
                  }}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                >
                  Assign Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
