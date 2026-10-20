import React, { useState } from 'react';
import { configBundleApi } from '../services/api';
import {
  Download,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderSync
} from 'lucide-react';

export default function ConfigBundlePage() {
  const [exporting, setExporting] = useState(false);
  const [exportedJson, setExportedJson] = useState('');
  const [importJson, setImportJson] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const res = await configBundleApi.exportBundle();
      const formatted = JSON.stringify(res.data, null, 2);
      setExportedJson(formatted);

      // Trigger file download
      const blob = new Blob([formatted], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `veridex-accounting-bundle-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handlePreview = async () => {
    try {
      setPreviewing(true);
      setError(null);
      setPreviewResult(null);
      setImportSuccess(null);

      let parsed;
      try {
        parsed = JSON.parse(importJson);
      } catch (e) {
        throw new Error('Bundle must be valid JSON');
      }

      const res = await configBundleApi.previewBundle(parsed);
      setPreviewResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!previewResult || !previewResult.valid) return;
    if (!window.confirm('Import this configuration bundle into the active tenant workspace?')) return;

    try {
      setImporting(true);
      setError(null);
      const parsed = JSON.parse(importJson);
      const res = await configBundleApi.importBundle(parsed);
      setImportSuccess(res.data);
      alert('Configuration successfully imported into tenant workspace!');
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
          <FolderSync className="w-5 h-5 text-brand-400" />
          <span>Configuration Bundle Import & Export</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Export or migrate tenant-scoped Event Definitions, Posting Rules, and Test Cases as a portable versioned JSON bundle.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center space-x-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Export vs Import */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
              <Download className="w-4 h-4 text-brand-400" />
              <span>Export Workspace Bundle</span>
            </h3>
          </div>

          <p className="text-slate-400 text-[11px]">
            Generates an immutable JSON archive containing all active Event Definitions, Schema Contracts, Posting Rules, Line AST Expressions, and Rule Test Cases belonging to the active organization.
          </p>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition flex items-center justify-center space-x-2 shadow-md shadow-brand-500/20"
          >
            {exporting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Export Configuration Bundle</span>
          </button>

          {exportedJson && (
            <div>
              <label className="text-[11px] text-slate-400 font-medium">Bundle JSON Output</label>
              <textarea
                readOnly
                rows={10}
                value={exportedJson}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-300 font-mono text-[10px]"
              />
            </div>
          )}
        </div>

        {/* Import Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                <Upload className="w-4 h-4 text-brand-400" />
                <span>Import Configuration Bundle</span>
              </h3>
            </div>

            <div>
              <label className="text-slate-400 font-medium">Paste Bundle JSON *</label>
              <textarea
                rows={10}
                placeholder="Paste exported configuration bundle JSON..."
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={handlePreview}
              disabled={previewing || !importJson.trim()}
              className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
            >
              {previewing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileJson className="w-3.5 h-3.5 text-brand-400" />
              )}
              <span>Preview & Validate References</span>
            </button>

            {previewResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-2 ${
                  previewResult.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="font-semibold flex items-center space-x-1.5">
                  {previewResult.valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ready to Import ({previewResult.counts?.event_definitions} events, {previewResult.counts?.posting_rules} rules)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span>Validation Errors Detected</span>
                    </>
                  )}
                </div>

                {previewResult.errors?.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {previewResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {importSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg space-y-1">
                <div className="font-semibold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Import Completed</span>
                </div>
                <div className="text-[11px]">
                  Imported {importSuccess.imported_events} event definition(s) and {importSuccess.imported_rules} posting rule(s).
                </div>
              </div>
            )}
          </div>

          {previewResult && previewResult.valid && (
            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={handleImport}
                disabled={importing || importSuccess !== null}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition flex items-center justify-center space-x-2 shadow-md shadow-emerald-500/20"
              >
                {importing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>Confirm & Import Configuration</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
