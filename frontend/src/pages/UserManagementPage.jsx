import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Users, UserPlus, Shield, Check, AlertCircle, RefreshCw } from 'lucide-react';

export default function UserManagementPage() {
  const { currentWorkspace, permissions } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role_code: 'STAFF_ACCOUNTANT',
    temporary_password: 'Password123!'
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadData();
  }, [currentWorkspace]);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        authApi.getTenantUsers(),
        authApi.getRoles()
      ]);
      if (usersRes.success) setUsers(usersRes.data);
      if (rolesRes.success) setRoles(rolesRes.data);
    } catch (err) {
      console.error('Failed to load users/roles:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await authApi.inviteUser(inviteForm);
      if (res.success) {
        setMessage({ type: 'success', text: `User ${inviteForm.email} successfully added to ${currentWorkspace.name}` });
        setShowInviteModal(false);
        setInviteForm({
          email: '',
          first_name: '',
          last_name: '',
          role_code: 'STAFF_ACCOUNTANT',
          temporary_password: 'Password123!'
        });
        await loadData();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-brand-400" />
            <span>Tenant User Management & Role Assignments</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Scoped to workspace: <strong className="text-slate-200">{currentWorkspace?.name}</strong> ({currentWorkspace?.tenant_code})
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="py-2 px-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-brand-600/20 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite New User</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-400'
              : 'bg-rose-950/40 border border-rose-500/40 text-rose-400'
          }`}
        >
          {message.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-white">Active Members ({users.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-850 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-5">Name & Email</th>
                <th className="py-3 px-5">Assigned Roles</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-500">
                    No users found for this workspace.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-slate-850/50 transition">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-white">
                        {u.first_name} {u.last_name}
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex flex-wrap gap-1.5">
                        {u.roles && u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <span
                              key={r.id || r.code}
                              className="px-2 py-0.5 rounded bg-brand-950/60 border border-brand-500/30 text-brand-300 font-mono text-[11px]"
                            >
                              {r.code}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic">No role assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-slate-400 font-mono">
                      {new Date(u.joined_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Invite User to Workspace</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a new member to {currentWorkspace?.name} with specific financial role permissions.
            </p>

            <form onSubmit={handleInvite} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.first_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.last_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="name@company.com"
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Assign Role</label>
                <select
                  value={inviteForm.role_code}
                  onChange={(e) => setInviteForm({ ...inviteForm, role_code: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                >
                  <option value="ACCOUNTANT">ACCOUNTANT (Journal Entries & Reconciliations)</option>
                  <option value="FINANCE_ADMIN">FINANCE_ADMIN (Comprehensive Finance Administration)</option>
                  <option value="FINANCE_CONTROLLER">FINANCE_CONTROLLER (Accounting Oversight & Hard Close)</option>
                  <option value="BILLING_OPERATOR">BILLING_OPERATOR (Invoicing & Cash Receipts)</option>
                  <option value="TREASURY_OPERATOR">TREASURY_OPERATOR (Bank Reconciliations & Feeds)</option>
                  <option value="AUDITOR_READ_ONLY">AUDITOR_READ_ONLY (Read-Only Subledger Audit)</option>
                  <option value="TENANT_ADMIN">TENANT_ADMIN (Full Workspace Administrator)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Temporary Password</label>
                <input
                  type="password"
                  required
                  value={inviteForm.temporary_password}
                  onChange={(e) => setInviteForm({ ...inviteForm, temporary_password: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
