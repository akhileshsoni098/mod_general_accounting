import React, { useState, useEffect, useMemo } from 'react';
import { manufacturingApi, inventoryApi } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';
import {
  Factory,
  Boxes,
  Plus,
  RefreshCw,
  CheckCircle,
  Play,
  Layers,
  ArrowRight,
  Search,
  Edit2,
  Trash2,
  Eye,
  Archive,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  X,
  FileSpreadsheet
} from 'lucide-react';

export default function ManufacturingWorkspacePage() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'boms'
  const [workOrders, setWorkOrders] = useState([]);
  const [boms, setBoms] = useState([]);
  const [items, setItems] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // BOM List Filtering & Pagination
  const [bomSearch, setBomSearch] = useState('');
  const [bomStatusFilter, setBomStatusFilter] = useState('ACTIVE'); // 'ALL' | 'ACTIVE' | 'ARCHIVED'
  const [bomPage, setBomPage] = useState(1);
  const bomPageSize = 10;
  const [selectedBomDetail, setSelectedBomDetail] = useState(null); // for detail view modal

  // Create / Edit BOM Modal
  const [showBomModal, setShowBomModal] = useState(false);
  const [editingBomId, setEditingBomId] = useState(null);
  const [bomForm, setBomForm] = useState({
    bom_number: '',
    bom_name: '',
    finished_item_id: '',
    output_quantity: 1,
    output_uom_id: '',
    raw_materials: [
      { item_id: '', quantity: 1, uom_id: '', scrap_percentage: 0 }
    ],
    overhead_costs: []
  });

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
      const [woRes, bomRes, itemRes, godownRes, unitRes] = await Promise.all([
        manufacturingApi.getWorkOrders(),
        manufacturingApi.getBOMs('?include_archived=true'),
        inventoryApi.getItems(),
        inventoryApi.getGodowns(),
        inventoryApi.getUnits ? inventoryApi.getUnits() : Promise.resolve({ data: [] })
      ]);
      setWorkOrders(Array.isArray(woRes.data) ? woRes.data : (woRes.data?.work_orders || []));
      setBoms(Array.isArray(bomRes.data) ? bomRes.data : (bomRes.data?.boms || []));
      setItems(Array.isArray(itemRes.data) ? itemRes.data : (itemRes.data?.items || []));
      setGodowns(Array.isArray(godownRes.data) ? godownRes.data : (godownRes.data?.godowns || []));
      setUnits(Array.isArray(unitRes.data) ? unitRes.data : (unitRes.data?.units || []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper map for quick item lookups
  const itemsMap = useMemo(() => {
    const map = {};
    items.forEach(it => { map[it._id] = it; });
    return map;
  }, [items]);

  // Options for item dropdowns
  const itemOptions = useMemo(() => {
    return items.map(it => ({
      value: it._id,
      label: it.item_name,
      secondary: `${it.item_code} • ₹${it.purchase_price || it.standard_cost || 0} • ${it.base_uom_id?.unit_code || 'UNIT'}`
    }));
  }, [items]);

  // Filtered BOMs
  const filteredBoms = useMemo(() => {
    return boms.filter(b => {
      // Status filter
      if (bomStatusFilter === 'ACTIVE' && b.is_active === false) return false;
      if (bomStatusFilter === 'ARCHIVED' && b.is_active !== false) return false;

      // Search term
      if (bomSearch.trim()) {
        const term = bomSearch.toLowerCase().trim();
        const num = (b.bom_number || '').toLowerCase();
        const name = (b.bom_name || '').toLowerCase();
        const finishedName = (b.finished_item_id?.item_name || '').toLowerCase();
        return num.includes(term) || name.includes(term) || finishedName.includes(term);
      }
      return true;
    });
  }, [boms, bomStatusFilter, bomSearch]);

  const paginatedBoms = useMemo(() => {
    const start = (bomPage - 1) * bomPageSize;
    return filteredBoms.slice(start, start + bomPageSize);
  }, [filteredBoms, bomPage, bomPageSize]);

  const totalBomPages = Math.ceil(filteredBoms.length / bomPageSize) || 1;

  // Calculate estimated material & total cost for a BOM
  const calculateBomCost = (bom) => {
    let materialCost = 0;
    if (Array.isArray(bom.raw_materials)) {
      bom.raw_materials.forEach(rm => {
        const itm = rm.item_id?._id ? rm.item_id : (itemsMap[rm.item_id] || {});
        const unitCost = Number(itm.purchase_price || itm.standard_cost || 0);
        const scrapMult = 1 + (Number(rm.scrap_percentage) || 0) / 100;
        materialCost += (Number(rm.quantity) || 0) * scrapMult * unitCost;
      });
    }
    let overheadCost = 0;
    if (Array.isArray(bom.overhead_costs)) {
      bom.overhead_costs.forEach(oh => {
        overheadCost += Number(oh.cost_amount) || 0;
      });
    }
    const totalCost = materialCost + overheadCost;
    const unitYield = Number(bom.output_quantity) || 1;
    return {
      materialCost,
      overheadCost,
      totalCost,
      costPerYield: totalCost / unitYield
    };
  };

  // Open Create BOM Modal
  const handleOpenCreateBom = () => {
    setEditingBomId(null);
    setBomForm({
      bom_number: `BOM-${Date.now().toString().slice(-6)}`,
      bom_name: '',
      finished_item_id: '',
      output_quantity: 1,
      output_uom_id: '',
      raw_materials: [
        { item_id: '', quantity: 1, uom_id: '', scrap_percentage: 0 }
      ],
      overhead_costs: []
    });
    setShowBomModal(true);
  };

  // Open Edit BOM Modal
  const handleOpenEditBom = (bom) => {
    setEditingBomId(bom._id);
    setBomForm({
      bom_number: bom.bom_number || '',
      bom_name: bom.bom_name || '',
      finished_item_id: bom.finished_item_id?._id || bom.finished_item_id || '',
      output_quantity: bom.output_quantity || 1,
      output_uom_id: bom.output_uom_id?._id || bom.output_uom_id || '',
      raw_materials: (bom.raw_materials || []).map(rm => ({
        item_id: rm.item_id?._id || rm.item_id || '',
        quantity: rm.quantity || 1,
        uom_id: rm.uom_id?._id || rm.uom_id || '',
        scrap_percentage: rm.scrap_percentage || 0
      })),
      overhead_costs: (bom.overhead_costs || []).map(oh => ({
        cost_name: oh.cost_name || '',
        cost_amount: oh.cost_amount || 0
      }))
    });
    setShowBomModal(true);
  };

  // Save or Update BOM
  const handleSaveBom = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!bomForm.bom_number.trim()) {
      setError('BOM Number / Code is required.');
      return;
    }
    if (!bomForm.bom_name.trim()) {
      setError('BOM Name is required.');
      return;
    }
    if (!bomForm.finished_item_id) {
      setError('Please select a finished output item.');
      return;
    }
    if (!bomForm.raw_materials || bomForm.raw_materials.length === 0) {
      setError('At least one raw material component is required.');
      return;
    }

    const seenItems = new Set();
    for (const rm of bomForm.raw_materials) {
      if (!rm.item_id) {
        setError('Please select a valid item for all raw material rows.');
        return;
      }
      if (seenItems.has(rm.item_id)) {
        setError('Duplicate raw material detected. Each component should only appear once.');
        return;
      }
      seenItems.add(rm.item_id);
      if (!rm.quantity || Number(rm.quantity) <= 0) {
        setError('Component quantity must be greater than zero.');
        return;
      }
    }

    try {
      if (editingBomId) {
        await manufacturingApi.updateBOM(editingBomId, {
          bom_name: bomForm.bom_name,
          output_quantity: Number(bomForm.output_quantity),
          output_uom_id: bomForm.output_uom_id || null,
          raw_materials: bomForm.raw_materials,
          overhead_costs: bomForm.overhead_costs
        });
        setSuccess(`BOM ${bomForm.bom_number} updated successfully.`);
      } else {
        await manufacturingApi.saveBOM({
          bom_number: bomForm.bom_number,
          bom_name: bomForm.bom_name,
          finished_item_id: bomForm.finished_item_id,
          output_quantity: Number(bomForm.output_quantity),
          output_uom_id: bomForm.output_uom_id || null,
          raw_materials: bomForm.raw_materials,
          overhead_costs: bomForm.overhead_costs
        });
        setSuccess(`BOM ${bomForm.bom_number} created successfully.`);
      }
      setShowBomModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Archive / Deactivate BOM
  const handleArchiveBom = async (bom) => {
    if (!window.confirm(`Archive BOM "${bom.bom_name}" (${bom.bom_number})?\n\nIt will be hidden from new Work Orders but retained for historical audits.`)) {
      return;
    }
    try {
      await manufacturingApi.archiveBOM(bom._id);
      setSuccess(`BOM ${bom.bom_number} archived successfully.`);
      loadData();
    } catch (err) {
      setError(err.message);
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
      await manufacturingApi.completeProduction(activeWo._id, {
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Factory className="w-5 h-5 text-emerald-400" />
            <span>Manufacturing & Assembly Workspace</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Bill of Materials (BOM), Multi-level Recipes, Production Work Orders, Raw Material Issue, and Finished Goods GL Costing.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreateBom}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create BOM</span>
          </button>
          <button
            onClick={() => setShowWoModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Play className="w-4 h-4" />
            <span>Create Work Order</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="font-bold hover:text-white">×</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="font-bold hover:text-white">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-2.5 flex items-center space-x-2 transition cursor-pointer ${
            activeTab === 'orders' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Work Orders ({workOrders.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('boms')}
          className={`pb-2.5 flex items-center space-x-2 transition cursor-pointer ${
            activeTab === 'boms' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Bill of Materials (BOM) ({boms.length})</span>
        </button>
      </div>

      {/* TAB 1: Work Orders */}
      {activeTab === 'orders' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
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
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    No production work orders planned yet. Click "Create Work Order" to begin a production run.
                  </td>
                </tr>
              ) : (
                workOrders.map((wo) => (
                  <tr key={wo._id} className="hover:bg-slate-850/50 transition">
                    <td className="p-3 font-mono font-semibold text-emerald-400">{wo.order_number}</td>
                    <td className="p-3 font-medium">
                      {wo.finished_item_id?.item_name || 'Manufactured Item'}
                      <div className="text-[10px] text-slate-500 font-mono">{wo.finished_item_id?.item_code}</div>
                    </td>
                    <td className="p-3 text-right font-mono">{wo.planned_quantity}</td>
                    <td className="p-3 text-right font-mono">{wo.completed_quantity || 0}</td>
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
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition shadow-sm"
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
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition shadow-sm"
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
        <div className="space-y-4">
          {/* BOM Filter Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search BOM #, name, or product..."
                value={bomSearch}
                onChange={(e) => { setBomSearch(e.target.value); setBomPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              <span className="text-xs text-slate-400">Status:</span>
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs font-semibold">
                {['ACTIVE', 'ALL', 'ARCHIVED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => { setBomStatusFilter(st); setBomPage(1); }}
                    className={`px-3 py-1 rounded-md transition ${
                      bomStatusFilter === st
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'ACTIVE' ? 'Active' : st === 'ALL' ? 'All' : 'Archived'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* BOM Data Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                  <th className="p-3">BOM Number</th>
                  <th className="p-3">BOM Name</th>
                  <th className="p-3">Finished Product</th>
                  <th className="p-3 text-right">Yield Qty</th>
                  <th className="p-3 text-center">Components</th>
                  <th className="p-3 text-right">Est. Unit Cost</th>
                  <th className="p-3 text-center">Version</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {paginatedBoms.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-slate-500">
                      No Bill of Materials found matching criteria. Click "+ Create BOM" to define a production formula.
                    </td>
                  </tr>
                ) : (
                  paginatedBoms.map((bom) => {
                    const costs = calculateBomCost(bom);
                    const isArchived = bom.is_active === false;
                    return (
                      <tr key={bom._id} className="hover:bg-slate-850/50 transition">
                        <td className="p-3 font-mono font-semibold text-emerald-400">
                          {bom.bom_number}
                        </td>
                        <td className="p-3 font-semibold text-white">
                          {bom.bom_name || 'Standard Formula'}
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-slate-100">
                            {bom.finished_item_id?.item_name || 'Unknown Item'}
                          </span>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {bom.finished_item_id?.item_code || ''}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">
                          {bom.output_quantity || 1} {bom.output_uom_id?.unit_code || bom.finished_item_id?.base_uom_id?.unit_code || 'NOS'}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                            {bom.raw_materials?.length || 0} items
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-semibold">
                          ₹{costs.costPerYield.toFixed(2)}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-400">
                          v{bom.version || 1}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              isArchived
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {isArchived ? 'ARCHIVED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => setSelectedBomDetail(bom)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Formula & Cost Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {!isArchived && (
                            <>
                              <button
                                onClick={() => handleOpenEditBom(bom)}
                                className="p-1 rounded bg-slate-800 hover:bg-blue-600/40 text-blue-300 transition"
                                title="Edit BOM"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleArchiveBom(bom)}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-600/40 text-rose-300 transition"
                                title="Archive / Deactivate BOM"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {totalBomPages > 1 && (
              <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex justify-between items-center text-xs text-slate-400">
                <span>
                  Showing {(bomPage - 1) * bomPageSize + 1} to {Math.min(bomPage * bomPageSize, filteredBoms.length)} of {filteredBoms.length} BOMs
                </span>
                <div className="flex space-x-1">
                  <button
                    disabled={bomPage === 1}
                    onClick={() => setBomPage(p => Math.max(1, p - 1))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 font-mono">{bomPage} / {totalBomPages}</span>
                  <button
                    disabled={bomPage === totalBomPages}
                    onClick={() => setBomPage(p => Math.min(totalBomPages, p + 1))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT BOM MODAL */}
      {showBomModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full p-6 space-y-5 my-8 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Boxes className="w-5 h-5 text-emerald-400" />
                  <span>{editingBomId ? `Edit BOM: ${bomForm.bom_number}` : 'Create Bill of Materials (BOM)'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Define manufacturing recipe formula, raw ingredients consumption, and production scrap factors.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBomModal(false)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveBom} className="space-y-4 text-xs">
              {/* Header Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">BOM Number / Formula Code *</label>
                  <input
                    type="text"
                    value={bomForm.bom_number}
                    onChange={(e) => setBomForm({ ...bomForm, bom_number: e.target.value.toUpperCase() })}
                    placeholder="e.g. BOM-PIZZA-01"
                    disabled={!!editingBomId}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono uppercase focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">BOM / Recipe Name *</label>
                  <input
                    type="text"
                    value={bomForm.bom_name}
                    onChange={(e) => setBomForm({ ...bomForm, bom_name: e.target.value })}
                    placeholder="e.g. Standard Margherita Pizza 10-Inch"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1 font-medium">Finished Output Item *</label>
                  <SearchableDropdown
                    options={itemOptions}
                    value={bomForm.finished_item_id}
                    onChange={(val) => {
                      const itm = itemsMap[val];
                      setBomForm({
                        ...bomForm,
                        finished_item_id: val,
                        output_uom_id: itm?.base_uom_id?._id || itm?.base_uom_id || bomForm.output_uom_id
                      });
                    }}
                    placeholder="Select finished product to manufacture..."
                    disabled={!!editingBomId}
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Output Yield Quantity *</label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={bomForm.output_quantity}
                      onChange={(e) => setBomForm({ ...bomForm, output_quantity: Number(e.target.value) })}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-right"
                    />
                    <select
                      value={bomForm.output_uom_id}
                      onChange={(e) => setBomForm({ ...bomForm, output_uom_id: e.target.value })}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-xs w-28"
                    >
                      <option value="">UOM</option>
                      {units.map(u => (
                        <option key={u._id} value={u._id}>{u.unit_code}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Raw Material Components Table */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">Raw Material Components ({bomForm.raw_materials.length})</span>
                  <button
                    type="button"
                    onClick={() => setBomForm({
                      ...bomForm,
                      raw_materials: [
                        ...bomForm.raw_materials,
                        { item_id: '', quantity: 1, uom_id: '', scrap_percentage: 0 }
                      ]
                    })}
                    className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Component</span>
                  </button>
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <th className="p-2">Component Item</th>
                        <th className="p-2 text-right w-24">Quantity</th>
                        <th className="p-2 w-24">UOM</th>
                        <th className="p-2 text-right w-20">Scrap %</th>
                        <th className="p-2 text-right w-24">Unit Cost</th>
                        <th className="p-2 text-right w-24">Est. Total</th>
                        <th className="p-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {bomForm.raw_materials.map((rm, idx) => {
                        const itm = itemsMap[rm.item_id] || {};
                        const unitCost = Number(itm.purchase_price || itm.standard_cost || 0);
                        const scrapMult = 1 + (Number(rm.scrap_percentage) || 0) / 100;
                        const lineTotal = (Number(rm.quantity) || 0) * scrapMult * unitCost;

                        return (
                          <tr key={idx} className="hover:bg-slate-850/30">
                            <td className="p-2">
                              <SearchableDropdown
                                options={itemOptions}
                                value={rm.item_id}
                                onChange={(val) => {
                                  const updated = [...bomForm.raw_materials];
                                  const found = itemsMap[val];
                                  updated[idx] = {
                                    ...updated[idx],
                                    item_id: val,
                                    uom_id: found?.base_uom_id?._id || found?.base_uom_id || updated[idx].uom_id
                                  };
                                  setBomForm({ ...bomForm, raw_materials: updated });
                                }}
                                placeholder="Select raw material..."
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                value={rm.quantity}
                                onChange={(e) => {
                                  const updated = [...bomForm.raw_materials];
                                  updated[idx].quantity = Number(e.target.value);
                                  setBomForm({ ...bomForm, raw_materials: updated });
                                }}
                                required
                                className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white font-mono text-right"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={rm.uom_id}
                                onChange={(e) => {
                                  const updated = [...bomForm.raw_materials];
                                  updated[idx].uom_id = e.target.value;
                                  setBomForm({ ...bomForm, raw_materials: updated });
                                }}
                                className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white font-mono text-xs"
                              >
                                <option value="">Auto</option>
                                {units.map(u => (
                                  <option key={u._id} value={u._id}>{u.unit_code}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={rm.scrap_percentage}
                                onChange={(e) => {
                                  const updated = [...bomForm.raw_materials];
                                  updated[idx].scrap_percentage = Number(e.target.value);
                                  setBomForm({ ...bomForm, raw_materials: updated });
                                }}
                                className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white font-mono text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-mono text-slate-300">
                              ₹{unitCost.toFixed(2)}
                            </td>
                            <td className="p-2 text-right font-mono text-emerald-400 font-semibold">
                              ₹{lineTotal.toFixed(2)}
                            </td>
                            <td className="p-2 text-center">
                              {bomForm.raw_materials.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setBomForm({
                                    ...bomForm,
                                    raw_materials: bomForm.raw_materials.filter((_, i) => i !== idx)
                                  })}
                                  className="text-rose-400 hover:text-rose-300 font-bold"
                                  title="Remove row"
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Overhead Costs Table */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">Overhead & Labor Costs</span>
                  <button
                    type="button"
                    onClick={() => setBomForm({
                      ...bomForm,
                      overhead_costs: [
                        ...bomForm.overhead_costs,
                        { cost_name: '', cost_amount: 0 }
                      ]
                    })}
                    className="flex items-center space-x-1 text-slate-400 hover:text-slate-200 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Overhead</span>
                  </button>
                </div>

                {bomForm.overhead_costs.length > 0 && (
                  <div className="border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <th className="p-2">Cost Name / Description</th>
                          <th className="p-2 text-right w-36">Amount (₹)</th>
                          <th className="p-2 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                        {bomForm.overhead_costs.map((oh, idx) => (
                          <tr key={idx}>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="e.g. Electricity, Labor, Packaging"
                                value={oh.cost_name}
                                onChange={(e) => {
                                  const updated = [...bomForm.overhead_costs];
                                  updated[idx].cost_name = e.target.value;
                                  setBomForm({ ...bomForm, overhead_costs: updated });
                                }}
                                required
                                className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={oh.cost_amount}
                                onChange={(e) => {
                                  const updated = [...bomForm.overhead_costs];
                                  updated[idx].cost_amount = Number(e.target.value);
                                  setBomForm({ ...bomForm, overhead_costs: updated });
                                }}
                                required
                                className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white font-mono text-right"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setBomForm({
                                  ...bomForm,
                                  overhead_costs: bomForm.overhead_costs.filter((_, i) => i !== idx)
                                })}
                                className="text-rose-400 hover:text-rose-300 font-bold"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Total Estimated Cost Banner */}
              {(() => {
                const costs = calculateBomCost(bomForm);
                return (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-center text-xs">
                    <div>
                      <span className="text-slate-400">Total Material: </span>
                      <strong className="text-white font-mono">₹{costs.materialCost.toFixed(2)}</strong>
                      <span className="text-slate-400 ml-3">Overheads: </span>
                      <strong className="text-white font-mono">₹{costs.overheadCost.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Est. Cost Per Yield Unit ({bomForm.output_quantity || 1}): </span>
                      <strong className="text-emerald-400 font-mono text-sm ml-1">
                        ₹{costs.costPerYield.toFixed(2)}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              {/* Modal Actions */}
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBomModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md transition cursor-pointer"
                >
                  {editingBomId ? 'Update BOM Formula' : 'Save BOM Formula'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW BOM DETAIL MODAL */}
      {selectedBomDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white">{selectedBomDetail.bom_name}</h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                    {selectedBomDetail.bom_number}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                    v{selectedBomDetail.version || 1}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Finished Item: <strong className="text-slate-200">{selectedBomDetail.finished_item_id?.item_name || 'N/A'}</strong> ({selectedBomDetail.finished_item_id?.item_code || ''})
                </p>
                <p className="text-xs text-slate-400">
                  Standard Output Yield: <strong className="text-emerald-400 font-mono">{selectedBomDetail.output_quantity} {selectedBomDetail.output_uom_id?.unit_code || 'NOS'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBomDetail(null)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ×
              </button>
            </div>

            {/* Ingredients table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300">Raw Material Components & Yield Consumption</h4>
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="p-2">Item Name</th>
                      <th className="p-2 text-right">Required Qty</th>
                      <th className="p-2 text-right">Scrap %</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-slate-200">
                    {(selectedBomDetail.raw_materials || []).map((rm, idx) => {
                      const itm = rm.item_id?._id ? rm.item_id : (itemsMap[rm.item_id] || {});
                      const unitCost = Number(itm.purchase_price || itm.standard_cost || 0);
                      const scrapMult = 1 + (Number(rm.scrap_percentage) || 0) / 100;
                      const lineCost = (Number(rm.quantity) || 0) * scrapMult * unitCost;

                      return (
                        <tr key={idx}>
                          <td className="p-2">
                            <span className="font-medium text-white">{itm.item_name || 'Item'}</span>
                            <span className="text-[10px] text-slate-500 font-mono ml-1">({itm.item_code})</span>
                          </td>
                          <td className="p-2 text-right font-mono">
                            {rm.quantity} {rm.uom_id?.unit_code || itm.base_uom_id?.unit_code || ''}
                          </td>
                          <td className="p-2 text-right font-mono text-slate-400">
                            {rm.scrap_percentage || 0}%
                          </td>
                          <td className="p-2 text-right font-mono text-slate-300">
                            ₹{unitCost.toFixed(2)}
                          </td>
                          <td className="p-2 text-right font-mono text-emerald-400 font-semibold">
                            ₹{lineCost.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Overheads if any */}
            {selectedBomDetail.overhead_costs && selectedBomDetail.overhead_costs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">Overhead Costs</h4>
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-slate-200">
                      {selectedBomDetail.overhead_costs.map((oh, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-slate-300">{oh.cost_name}</td>
                          <td className="p-2 text-right font-mono text-emerald-400 font-semibold">
                            ₹{Number(oh.cost_amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cost Summary */}
            {(() => {
              const costs = calculateBomCost(selectedBomDetail);
              return (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-center text-xs">
                  <div>
                    <span className="text-slate-400">Total Material Cost: </span>
                    <strong className="text-white font-mono">₹{costs.materialCost.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Cost per Unit: </span>
                    <strong className="text-emerald-400 font-mono text-sm ml-1">
                      ₹{costs.costPerYield.toFixed(2)}
                    </strong>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedBomDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE WORK ORDER MODAL */}
      {showWoModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Play className="w-4 h-4 text-emerald-400" />
              <span>Plan Production Work Order</span>
            </h3>
            <form onSubmit={handleCreateWo} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Select Bill of Materials (BOM) *</label>
                <select
                  value={selectedBom}
                  onChange={(e) => setSelectedBom(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose BOM --</option>
                  {boms.filter(b => b.is_active !== false).map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bom_name} ({b.bom_number}) - Yield: {b.output_quantity}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Planned Production Quantity *</label>
                <input
                  type="number"
                  value={plannedQty}
                  onChange={(e) => setPlannedQty(e.target.value)}
                  min="0.001"
                  step="any"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-right"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Raw Materials Warehouse *</label>
                <select
                  value={rawGodown}
                  onChange={(e) => setRawGodown(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Raw Materials Godown --</option>
                  {godowns.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.godown_name || g.name || g.godown_code} ({g.godown_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Finished Goods Warehouse *</label>
                <select
                  value={fgGodown}
                  onChange={(e) => setFgGodown(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Finished Goods Godown --</option>
                  {godowns.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.godown_name || g.name || g.godown_code} ({g.godown_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
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

      {/* COMPLETE PRODUCTION MODAL */}
      {showCompleteModal && activeWo && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono text-right"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
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
