import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Building2, Check, ArrowRight, Shield, Globe, Sun, Moon } from 'lucide-react';

export default function WorkspaceSelectPage({ onProceed }) {
  const { currentWorkspace, availableWorkspaces, switchWorkspace } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [selectedId, setSelectedId] = useState(currentWorkspace ? currentWorkspace.id : (availableWorkspaces[0]?.id || ''));
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async () => {
    if (!selectedId) return;
    setSwitching(true);
    try {
      await switchWorkspace(selectedId);
      if (onProceed) onProceed();
    } catch (err) {
      alert('Failed to switch workspace: ' + err.message);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative">
      <div className="absolute top-5 right-5">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition shadow"
          title={theme === 'dark' ? 'Switch to Day Mode' : 'Switch to Night Mode'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Day Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-500" />
              <span>Night Mode</span>
            </>
          )}
        </button>
      </div>
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="h-10 w-10 bg-brand-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Select Active Workspace</h1>
            <p className="text-xs text-slate-400 font-medium">Multi-Tenant Tenant Isolation & Scoping</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 mb-4">
          You are a member of the following tenant workspaces. Select the organization you want to manage:
        </p>

        <div className="space-y-2.5 mb-6">
          {availableWorkspaces.map((ws) => {
            const isSelected = selectedId === ws.id;
            return (
              <div
                key={ws.id}
                onClick={() => setSelectedId(ws.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-brand-950/40 border-brand-500 text-white shadow-md shadow-brand-500/10'
                    : 'bg-slate-850 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`h-8 w-8 rounded flex items-center justify-center font-bold text-xs ${
                      isSelected ? 'bg-brand-500 text-white' : 'bg-slate-750 text-slate-400'
                    }`}
                  >
                    {ws.tenant_code?.slice(0, 3)}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{ws.name}</h4>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1">
                      <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-brand-400 font-semibold">
                        {ws.tenant_code}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                        ws.tenant_type === 'CARRIER'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : ws.tenant_type === 'BROKER'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {ws.tenant_type || 'MGA'}
                      </span>
                      <span>•</span>
                      <span>{ws.base_currency}</span>
                    </div>
                  </div>
                </div>
                {isSelected && <Check className="w-5 h-5 text-brand-400" />}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSwitch}
          disabled={switching || !selectedId}
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-medium rounded-lg text-sm flex items-center justify-center space-x-2 transition-all shadow-md shadow-brand-600/20 disabled:opacity-50"
        >
          <span>{switching ? 'Switching Workspace...' : 'Enter Selected Workspace'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
