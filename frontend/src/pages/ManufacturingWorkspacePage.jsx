import React, { useState, useEffect } from 'react';
import { manufacturingApi, inventoryApi } from '../services/api';
import {
  Factory,
  Boxes,
  Plus,
  RefreshCw,
  CheckCircle,
  Play,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function ManufacturingWorkspacePage() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'boms'
  const [workOrders, setWorkOrders] = useState([]);
  const [boms, setBoms] = useState([]);
  const [items, setItems] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Work Order Modal
  const [showWoModal, setShowWoModal] = useState(false);
  const [selectedBom, setSelectedBom] = useState('');
  const [plannedQty, setPlannedQty] = useState(10);
  const [rawGodown, setRawGodown] = useState('');
  const [fgGodown, setFgGodown] = useState('');

  // Complete WO Modal
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [activeWo, setActiveWo] = useState(null);
  const [completedQty, setCompletedQty] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [woRes, bomRes, itemRes, godownRes] = await Promise.all([
        manufacturingApi.getWorkOrders(),
        manufacturingApi.getBOMs(),
        inventoryApi.getItems(),
        inventoryApi.getGodowns()
      ]);
      setWorkOrders(woRes.data || []);
      setBoms(bomRes.data || []);
      setItems(itemRes.data || []);
      setGodowns(godownRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWo = async (e) => {
    e.preventDefault();
    try {
      await manufacturingApi.createWorkOrder({
        bom_id: selectedBom,
        planned_quantity: Number(plannedQty),
        raw_materials_godown_id: rawGodown,
        finished_goods_godown_id: fgGodown
      });
      setShowWoModal(false);
      setSuccess('Work order planned successfully.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleIssueMaterials = async (woId) => {
    if (!window.confirm('Issue raw materials from warehouse to factory floor?')) return;
    try {
      await manufacturingApi.issueMaterials(woId);
      setSuccess('Raw materials issued! Stock movements recorded.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCompleteWo = async (e) => {
    e.preventDefault();
    try {
      const res = await manufacturingApi.completeProduction(activeWo._id, {
        completed_quantity: Number(completedQty)
      });
      setShowCompleteModal(false);
      setSuccess(`Production completed! Finished goods added to warehouse and GL costing journal posted.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Factory className="w-5 h-5 text-emerald-400" />
            <span>Manufacturing & Assembly Workspace</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Bill of Materials (BOM), Work Orders, Raw Material Issue, and Finished Goods Production Costing.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowWoModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Work Order</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold">×</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="font-bold">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'orders' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Work Orders</span>
        </button>
        <button
          onClick={() => setActiveTab('boms')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'boms' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Bill of Materials (BOM)</span>
        </button>
      </div>

      {/* TAB 1: Work Orders */}
      {activeTab === 'orders' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <th className="p-3">Order Number</th>
                <th className="p-3">Finished Item</th>
                <th className="p-3 text-right">Planned Qty</th>
                <th className="p-3 text-right">Completed</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {workOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-slate-500">
                    No work orders found. Click "Create Work Order" to begin a production run.
                  </td>
                </tr>
              ) : (
                workOrders.map((wo) => (
                  <tr key={wo._id} className="hover:bg-slate-850/50 transition">
                    <td className="p-3 font-mono font-semibold text-emerald-400">{wo.order_number}</td>
                    <td className="p-3 font-medium">{wo.finished_item_id?.item_name || 'Manufactured Item'}</td>
                    <td className="p-3 text-right font-mono">{wo.planned_quantity}</td>
                    <td className="p-3 text-right font-mono">{wo.completed_quantity}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          wo.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : wo.status === 'IN_PROGRESS'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {wo.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {wo.status === 'PLANNED' && (
                        <button
                          onClick={() => handleIssueMaterials(wo._id)}
                          className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px]"
                        >
                          Issue Raw Materials
                        </button>
                      )}
                      {wo.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => {
                            setActiveWo(wo);
                            setCompletedQty(wo.planned_quantity);
                            setShowCompleteModal(true);
                          }}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px]"
                        >
                          Complete Production
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: BOMs */}
      {activeTab === 'boms' && (
        <div className="grid grid-cols-3 gap-4">
          {boms.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
              No Bill of Materials created yet.
            </div>
          ) : (
            boms.map((b) => (
              <div key={b._id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-white font-mono">{b.bom_number}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono">
                    Yield: {b.output_quantity}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-200">{b.bom_name}</div>
                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800">
                  Raw Materials: {b.raw_materials?.length || 0} items
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create WO Modal */}
      {showWoModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Plan Production Work Order</h3>
            <form onSubmit={handleCreateWo} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Select Bill of Materials (BOM)</label>
                <select
                  value={selectedBom}
                  onChange={(e) => setSelectedBom(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose BOM --</option>
                  {boms.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bom_name} ({b.bom_number})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Planned Quantity</label>
                <input
                  type="number"
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                  min="0.001"
                  step="any"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Raw Materials Warehouse</label>
                <select
                  value={rawGodown}
                  onChange={(e) => setRawGodown(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Raw Materials Godown --</option>
                  {godowns.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name} ({g.godown_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Finished Goods Warehouse</label>
                <select
                  value={fgGodown}
                  onChange={(e) => setFgGodown(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Finished Goods Godown --</option>
                  {godowns.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name} ({g.godown_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWoModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Create Work Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Production Modal */}
      {showCompleteModal && activeWo && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Complete Production ({activeWo.order_number})</h3>
            <form onSubmit={handleCompleteWo} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Actual Completed Quantity</label>
                <input
                  type="number"
                  value={completedQty}
                  onChange={(e) => setCompletedQty(e.target.value)}
                  min="0.001"
                  step="any"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Complete & Post GL Costing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
