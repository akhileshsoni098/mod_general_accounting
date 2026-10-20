import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Layers,
  FileText,
  Table,
  CheckCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  Database,
  Code
} from 'lucide-react';

export default function ModuleWorkspaceStub({
  moduleCode,
  moduleName,
  phaseTarget,
  modelsCount,
  modelsList,
  subtabs = [],
  description
}) {
  const { currentWorkspace, entitlements } = useAuth();
  const [activeSubtab, setActiveSubtab] = useState(subtabs[0]?.id || 'overview');

  const entitlement = entitlements.find(e => e.module_code === moduleCode);
  const isEnabled = entitlement ? entitlement.is_enabled : true;

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-bold border border-brand-500/20">
              {moduleCode}
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">{moduleName}</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
              Operational
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">{description}</p>
        </div>

        <div className="flex items-center space-x-3">
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center space-x-1.5 ${
              isEnabled
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            <span>{isEnabled ? 'Entitlement Active' : 'Module Disabled'}</span>
          </div>
        </div>
      </div>

      {!isEnabled && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center space-x-3">
          <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
          <div>
            <strong className="block font-semibold">Entitlement Disabled for this Workspace</strong>
            This module has been deactivated in Tenant Module Entitlements. To re-enable access, contact your tenant administrator or visit the Module Configuration tab.
          </div>
        </div>
      )}

      {/* Subtab Navigation */}
      {subtabs.length > 0 && (
        <div className="flex border-b border-slate-800 space-x-2">
          {subtabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubtab(tab.id)}
              className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center space-x-1.5 ${
                activeSubtab === tab.id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center space-x-2">
              <Code className="w-4 h-4 text-brand-400" />
              <span>Module Specifications & Architecture</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              The foundational SaaS identity, multi-tenant isolation, workspace routing, and entitlement gating for{' '}
              <strong className="text-white">{moduleName}</strong> are active.
              All business services, domain posting engines, and database controllers are tenant-scoped.
            </p>

            <div className="p-4 bg-slate-850 border border-slate-800 rounded-lg space-y-2 text-xs">
              <div className="text-slate-400 font-medium">Domain Scope & Data Guarantees:</div>
              <ul className="list-disc list-inside text-slate-300 space-y-1">
                <li>Strict multi-tenant partitioning by <code className="text-brand-300 font-mono">tenant_id</code></li>
                <li>Atomic transactional boundaries matching canonical ledger standards</li>
                <li>Audit logging and version concurrence (<code className="text-brand-300 font-mono">row_version</code>)</li>
                <li>Decimal128 serialization guarantees on all currency fields to prevent floating point inaccuracies</li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center space-x-2">
              <Table className="w-4 h-4 text-brand-400" />
              <span>Active Subtab: {subtabs.find(s => s.id === activeSubtab)?.label || 'Overview'}</span>
            </h3>
            <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-white">Submodule Controller Active</div>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Submodule tab navigation operational for {moduleName}.
              </p>
            </div>
          </div>
        </div>

        {/* Models Catalog Sidebar */}
        <div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-brand-400" />
                <span>Domain Models ({modelsCount})</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-500">Catalog Spec</span>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Standard insurance domain data models:
            </p>

            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {modelsList.map((m, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-850 border border-slate-800 text-xs font-mono flex items-center justify-between"
                >
                  <span className="text-slate-200">{m.name}</span>
                  <span className="text-[10px] text-slate-500">{m.table}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
