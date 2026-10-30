import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { inventoryApi } from '../services/api';
import {
  Boxes,
  PlusCircle,
  Package,
  Layers,
  Warehouse,
  Scale,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  ArrowRight,
  TrendingUp,
  Tag,
  ShieldCheck,
  X,
  Eye,
  FileText,
  Calculator,
  AlertTriangle,
  Edit2,
  Trash2
} from 'lucide-react';

export default function InventoryWorkspacePage() {
  const { currentWorkspace } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // overview | items | opening_stock | balances | movements | godowns | groups | categories | uom

  // Data states
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Search & Filter
  const [searchItem, setSearchItem] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');

  // Modals
  const [showItemModal, setShowItemModal] = useState(false);
  const [showOpeningStockModal, setShowOpeningStockModal] = useState(false);
  const [showGodownModal, setShowGodownModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showUomModal, setShowUomModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showReversalModal, setShowReversalModal] = useState(null); // movement object
  const [selectedItemDetail, setSelectedItemDetail] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);

  // Form states
  const [itemForm, setItemForm] = useState({
    item_code: '',
    sku: '',
    item_name: '',
    stock_group_id: '',
    stock_category_id: '',
    base_uom_id: '',
    purchase_uom_id: '',
    sales_uom_id: '',
    purchase_price: '0',
    sales_price: '0',
    mrp: '0',
    costing_method: 'AVERAGE_COST',
    reorder_level: '0',
    reorder_quantity: '0',
    is_batch_tracked: false,
    is_expiry_tracked: false,
    hsn_sac_code: '',
    tax_rate: 0,
    uom_conversions: []
  });

  const [openingStockForm, setOpeningStockForm] = useState({
    stock_item_id: '',
    godown_id: '',
    quantity: '',
    uom_id: '',
    unit_rate: '',
    total_cost: '',
    batch_number: '',
    expiry_date: '',
    notes: ''
  });

  const [godownForm, setGodownForm] = useState({
    godown_code: '',
    godown_name: '',
    is_default: false,
    contact_person: '',
    phone: '',
    address: { street: '', city: '', state: '', postal_code: '', country: 'IN' }
  });

  const [groupForm, setGroupForm] = useState({
    group_code: '',
    group_name: '',
    parent_group_id: '',
    description: ''
  });

  const [categoryForm, setCategoryForm] = useState({
    category_code: '',
    category_name: '',
    description: ''
  });

  const [uomForm, setUomForm] = useState({
    unit_code: '',
    unit_name: '',
    symbol: '',
    unit_type: 'COUNT',
    decimal_places: 0,
    description: ''
  });

  const [reversalReason, setReversalReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // UOM Simulator state
  const [simForm, setSimForm] = useState({
    stock_item_id: '',
    from_uom_id: '',
    to_uom_id: '',
    quantity: '1'
  });
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // Initial Load
  const fetchAllData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [
        summaryRes,
        itemsRes,
        groupsRes,
        categoriesRes,
        unitsRes,
        godownsRes,
        balancesRes,
        movementsRes
      ] = await Promise.all([
        inventoryApi.getSummary().catch(() => ({ data: null })),
        inventoryApi.getItems('?limit=100').catch(() => ({ data: { items: [] } })),
        inventoryApi.getGroups().catch(() => ({ data: [] })),
        inventoryApi.getCategories().catch(() => ({ data: [] })),
        inventoryApi.getUnits().catch(() => ({ data: [] })),
        inventoryApi.getGodowns().catch(() => ({ data: [] })),
        inventoryApi.getBalances().catch(() => ({ data: [] })),
        inventoryApi.getMovements('?limit=50').catch(() => ({ data: { movements: [] } }))
      ]);

      if (summaryRes?.data) setSummary(summaryRes.data);
      if (itemsRes?.data?.items) setItems(itemsRes.data.items);
      if (groupsRes?.data) setGroups(groupsRes.data);
      if (categoriesRes?.data) setCategories(categoriesRes.data);
      if (unitsRes?.data) setUnits(unitsRes.data);
      if (godownsRes?.data) setGodowns(godownsRes.data);
      if (balancesRes?.data) setBalances(balancesRes.data);
      if (movementsRes?.data?.movements) setMovements(movementsRes.data.movements);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load inventory workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [currentWorkspace]);

  // Flash message helper
  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // ----------------------------------------------------
  // Handlers: Item Create
  // ----------------------------------------------------
  const handleAddItemConversionRow = () => {
    setItemForm(prev => ({
      ...prev,
      uom_conversions: [...prev.uom_conversions, { alternate_uom_id: '', conversion_factor: '1' }]
    }));
  };

  const handleRemoveItemConversionRow = (index) => {
    setItemForm(prev => ({
      ...prev,
      uom_conversions: prev.uom_conversions.filter((_, idx) => idx !== index)
    }));
  };

  const handleItemConversionChange = (index, field, value) => {
    setItemForm(prev => {
      const updated = [...prev.uom_conversions];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, uom_conversions: updated };
    });
  };

  const resetItemForm = () => {
    setItemForm({
      item_code: '',
      sku: '',
      item_name: '',
      stock_group_id: '',
      stock_category_id: '',
      base_uom_id: '',
      purchase_uom_id: '',
      sales_uom_id: '',
      purchase_price: '0',
      sales_price: '0',
      mrp: '0',
      costing_method: 'AVERAGE_COST',
      reorder_level: '0',
      reorder_quantity: '0',
      is_batch_tracked: false,
      is_expiry_tracked: false,
      hsn_sac_code: '',
      tax_rate: 0,
      status: 'ACTIVE',
      uom_conversions: []
    });
  };

  const openCreateItem = () => {
    setEditingItemId(null);
    resetItemForm();
    setShowItemModal(true);
  };

  const openEditItem = (item) => {
    setEditingItemId(item._id);
    setItemForm({
      item_code: item.item_code || '',
      sku: item.sku || '',
      item_name: item.item_name || '',
      stock_group_id: item.stock_group_id?._id || item.stock_group_id || '',
      stock_category_id: item.stock_category_id?._id || item.stock_category_id || '',
      base_uom_id: item.base_uom_id?._id || item.base_uom_id || '',
      purchase_uom_id: item.purchase_uom_id?._id || item.purchase_uom_id || '',
      sales_uom_id: item.sales_uom_id?._id || item.sales_uom_id || '',
      purchase_price: String(item.purchase_price || '0'),
      sales_price: String(item.sales_price || '0'),
      mrp: String(item.mrp || '0'),
      costing_method: item.costing_method || 'AVERAGE_COST',
      reorder_level: String(item.reorder_level || '0'),
      reorder_quantity: String(item.reorder_quantity || '0'),
      is_batch_tracked: Boolean(item.is_batch_tracked),
      is_expiry_tracked: Boolean(item.is_expiry_tracked),
      hsn_sac_code: item.hsn_sac_code || '',
      tax_rate: Number(item.tax_rate || 0),
      status: item.status || 'ACTIVE',
      uom_conversions: Array.isArray(item.uom_conversions) ? item.uom_conversions.map(c => ({
        alternate_uom_id: c.alternate_uom_id?._id || c.alternate_uom_id || '',
        conversion_factor: String(c.conversion_factor || '1')
      })) : []
    });
    setShowItemModal(true);
  };

  const handleCreateOrUpdateItem = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingItemId) {
        await inventoryApi.updateItem(editingItemId, itemForm);
        showSuccess(`Stock item "${itemForm.item_name}" updated successfully.`);
      } else {
        await inventoryApi.createItem(itemForm);
        showSuccess(`Stock item "${itemForm.item_name}" created successfully.`);
      }
      setShowItemModal(false);
      setEditingItemId(null);
      resetItemForm();
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveItem = async (item) => {
    if (!window.confirm(`Are you sure you want to archive stock item "${item.item_name}" (${item.item_code})?`)) return;
    try {
      await inventoryApi.archiveItem(item._id);
      showSuccess(`Stock item "${item.item_name}" archived successfully.`);
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to archive item');
    }
  };

  const handleToggleItemStatus = async (item) => {
    try {
      const nextStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await inventoryApi.updateItem(item._id, { status: nextStatus });
      showSuccess(`Status of "${item.item_name}" changed to ${nextStatus}.`);
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update item status');
    }
  };

  // ----------------------------------------------------
  // Handlers: Opening Stock
  // ----------------------------------------------------
  const handleOpeningStockItemChange = (stockItemId) => {
    const item = items.find(i => i._id === stockItemId);
    setOpeningStockForm(prev => ({
      ...prev,
      stock_item_id: stockItemId,
      uom_id: item ? (item.base_uom_id?._id || item.base_uom_id) : '',
      unit_rate: item?.purchase_price || ''
    }));
  };

  const handleOpeningStockQtyOrRateChange = (qtyVal, rateVal) => {
    const q = parseFloat(qtyVal);
    const r = parseFloat(rateVal);
    let total = '';
    if (!isNaN(q) && !isNaN(r)) {
      total = (q * r).toFixed(2);
    }
    setOpeningStockForm(prev => ({
      ...prev,
      quantity: qtyVal,
      unit_rate: rateVal,
      total_cost: total
    }));
  };

  const handlePostOpeningStock = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        stock_item_id: openingStockForm.stock_item_id,
        godown_id: openingStockForm.godown_id,
        quantity: parseFloat(openingStockForm.quantity),
        uom_id: openingStockForm.uom_id || undefined,
        unit_rate: parseFloat(openingStockForm.unit_rate),
        total_cost: openingStockForm.total_cost ? parseFloat(openingStockForm.total_cost) : undefined,
        batch_number: openingStockForm.batch_number || undefined,
        expiry_date: openingStockForm.expiry_date || undefined,
        notes: openingStockForm.notes || undefined
      };

      const res = await inventoryApi.postOpeningStock(payload);
      showSuccess(`Opening stock posted successfully for item. Movement recorded.`);
      setShowOpeningStockModal(false);
      setOpeningStockForm({
        stock_item_id: '',
        godown_id: '',
        quantity: '',
        uom_id: '',
        unit_rate: '',
        total_cost: '',
        batch_number: '',
        expiry_date: '',
        notes: ''
      });
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // Handlers: Masters (Godown, Group, Category, UOM)
  // ----------------------------------------------------
  const handleCreateGodown = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await inventoryApi.createGodown(godownForm);
      showSuccess(`Godown "${godownForm.godown_name}" created.`);
      setShowGodownModal(false);
      setGodownForm({
        godown_code: '',
        godown_name: '',
        is_default: false,
        contact_person: '',
        phone: '',
        address: { street: '', city: '', state: '', postal_code: '', country: 'IN' }
      });
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await inventoryApi.createGroup({
        ...groupForm,
        parent_group_id: groupForm.parent_group_id || null
      });
      showSuccess(`Stock group "${groupForm.group_name}" created.`);
      setShowGroupModal(false);
      setGroupForm({ group_code: '', group_name: '', parent_group_id: '', description: '' });
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await inventoryApi.createCategory(categoryForm);
      showSuccess(`Stock category "${categoryForm.category_name}" created.`);
      setShowCategoryModal(false);
      setCategoryForm({ category_code: '', category_name: '', description: '' });
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateUom = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await inventoryApi.createUnit(uomForm);
      showSuccess(`Unit of measurement "${uomForm.unit_code}" created.`);
      setShowUomModal(false);
      setUomForm({
        unit_code: '',
        unit_name: '',
        symbol: '',
        unit_type: 'COUNT',
        decimal_places: 0,
        description: ''
      });
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // Handlers: Reversal & Reconcile
  // ----------------------------------------------------
  const handleReverseMovement = async () => {
    if (!showReversalModal) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await inventoryApi.reverseMovement(showReversalModal._id, { reason: reversalReason || 'User requested reversal' });
      showSuccess(`Movement reversed successfully. Offsetting entry logged.`);
      setShowReversalModal(null);
      setReversalReason('');
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcileBalances = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await inventoryApi.reconcileBalances({});
      showSuccess(`Balances successfully reconciled from immutable movement ledger (${res.data?.result?.rebuilt_balances_count || 0} balances recalculated).`);
      setShowReconcileModal(false);
      fetchAllData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // Handlers: Simulate UOM Conversion
  // ----------------------------------------------------
  const handleRunConversionSim = async (e) => {
    e.preventDefault();
    if (!simForm.from_uom_id || !simForm.to_uom_id || !simForm.quantity) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await inventoryApi.simulateConversion({
        stock_item_id: simForm.stock_item_id || undefined,
        from_uom_id: simForm.from_uom_id,
        to_uom_id: simForm.to_uom_id,
        quantity: parseFloat(simForm.quantity)
      });
      setSimResult(res.data);
    } catch (err) {
      setSimResult({ error: err.message });
    } finally {
      setSimLoading(false);
    }
  };

  // Filtered items
  const filteredItems = items.filter(item => {
    const matchSearch = !searchItem ||
      item.item_name.toLowerCase().includes(searchItem.toLowerCase()) ||
      item.item_code.toLowerCase().includes(searchItem.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchItem.toLowerCase());
    const matchGroup = !selectedGroupFilter || (item.stock_group_id?._id || item.stock_group_id) === selectedGroupFilter;
    return matchSearch && matchGroup;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 bg-brand-500/10 border border-brand-500/30 rounded-lg flex items-center justify-center text-brand-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
                <span>Inventory & Stock Masters</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                  Phase 3 Foundation
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Item-level master data, multi-UOM conversions, godowns, opening stock, and immutable stock movement ledger.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowOpeningStockModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Post Opening Stock</span>
          </button>
          <button
            onClick={openCreateItem}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Stock Item</span>
          </button>
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 transition cursor-pointer"
            title="Refresh inventory data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-800 overflow-x-auto pb-1 text-xs font-medium">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'items', label: `Stock Items (${items.length})`, icon: Package },
          { id: 'opening_stock', label: 'Opening Stock Entry', icon: Tag },
          { id: 'balances', label: `Stock Balances (${balances.length})`, icon: Scale },
          { id: 'movements', label: `Movements Ledger (${movements.length})`, icon: FileText },
          { id: 'godowns', label: `Godowns (${godowns.length})`, icon: Warehouse },
          { id: 'groups', label: `Groups (${groups.length})`, icon: Layers },
          { id: 'categories', label: `Categories (${categories.length})`, icon: Boxes },
          { id: 'uom', label: `UOMs & Conversion (${units.length})`, icon: Calculator }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-t-lg transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-b-2 border-brand-500 text-brand-400 bg-slate-900/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW & DASHBOARD METRICS */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Tracked Items</span>
                <Package className="w-4 h-4 text-brand-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white font-mono">
                {summary?.total_items_tracked || items.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Across {summary?.total_groups || groups.length} stock groups
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Godowns</span>
                <Warehouse className="w-4 h-4 text-purple-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white font-mono">
                {summary?.total_godowns || godowns.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Multi-location storage active
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Units On Hand</span>
                <Scale className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
                {summary?.total_quantity_on_hand || '0.0000'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Base UOM equivalent
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Inventory Valuation</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-400 font-mono">
                {summary?.currency || 'INR'} {summary?.total_inventory_valuation || '0.00'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Weighted average cost basis
              </div>
            </div>
          </div>

          {/* Quick Actions & Audit Integrity Notice */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Inventory Accounting Integrity Safeguards</span>
                </h3>
                <button
                  onClick={() => setShowReconcileModal(true)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs text-brand-400 hover:text-brand-300 font-medium transition cursor-pointer"
                >
                  Audit & Reconcile
                </button>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                TallyVeridexERP uses an <strong className="text-slate-200">append-only stock movement ledger</strong>. Stock balances are projected materialized views guaranteed to match the sum of signed base quantities. Opening stock entries are locked against duplicate entry per item/godown.
              </p>
              <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                  Company Isolated: Yes
                </span>
                <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                  Moving Avg Costing: Enabled
                </span>
                <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                  Decimal-Safe BigNumber: Active
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Quick Operations</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowOpeningStockModal(true)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-between"
                >
                  <span>Post Opening Stock</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  onClick={openCreateItem}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-between"
                >
                  <span>Create New Stock Item</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  onClick={() => setShowGodownModal(true)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-between"
                >
                  <span>Add Warehouse / Godown</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          </div>

          {/* Recent Movements Feed */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Recent Stock Movements (Latest 10)</h3>
              <button
                onClick={() => setActiveTab('movements')}
                className="text-xs text-brand-400 hover:text-brand-300 transition flex items-center space-x-1"
              >
                <span>View Full Register</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {movements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No stock movements logged yet. Initialize opening stock or create stock items to begin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Item</th>
                      <th className="py-2.5 px-4">Godown</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4 text-right">Qty</th>
                      <th className="py-2.5 px-4">UOM</th>
                      <th className="py-2.5 px-4 text-right">Base Qty</th>
                      <th className="py-2.5 px-4 text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                    {movements.slice(0, 10).map(m => (
                      <tr key={m._id} className="hover:bg-slate-850/50 transition">
                        <td className="py-2.5 px-4 text-slate-400">
                          {new Date(m.movement_date || m.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                          {m.stock_item_id?.item_name || 'N/A'}
                          <span className="block text-[10px] text-slate-500 font-mono">{m.stock_item_id?.sku}</span>
                        </td>
                        <td className="py-2.5 px-4">{m.godown_id?.godown_name || 'Main'}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            m.movement_type === 'OPENING_STOCK'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : m.movement_type === 'REVERSAL'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-white">{m.quantity}</td>
                        <td className="py-2.5 px-4">{m.uom_id?.unit_code || 'PCS'}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-400">{m.base_quantity} {m.base_uom_id?.unit_code}</td>
                        <td className="py-2.5 px-4 text-right text-amber-300">{m.total_cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 2: STOCK ITEMS */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search item code, SKU, or name..."
                  value={searchItem}
                  onChange={e => setSearchItem(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>
              <select
                value={selectedGroupFilter}
                onChange={e => setSelectedGroupFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="">All Groups</option>
                {groups.map(g => (
                  <option key={g._id} value={g._id}>{g.group_name} ({g.group_code})</option>
                ))}
              </select>
            </div>
            <button
              onClick={openCreateItem}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Item</span>
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No stock items match your search. Click "Create Item" to add your first inventory product.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Item Code / SKU</th>
                      <th className="py-2.5 px-4">Item Name</th>
                      <th className="py-2.5 px-4">Stock Group</th>
                      <th className="py-2.5 px-4">Base UOM</th>
                      <th className="py-2.5 px-4">Alt Conversions</th>
                      <th className="py-2.5 px-4 text-right">Purchase Rate</th>
                      <th className="py-2.5 px-4 text-right">Sales Rate</th>
                      <th className="py-2.5 px-4">Costing</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {filteredItems.map(item => (
                      <tr key={item._id} className="hover:bg-slate-850/50 transition">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-200">
                          {item.item_code}
                          <span className="block text-[10px] text-brand-400 font-mono font-normal">SKU: {item.sku}</span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-white">
                          {item.item_name}
                          {item.is_batch_tracked && (
                            <span className="ml-2 px-1.5 py-0.2 rounded text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/30">
                              Batch
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {item.stock_group_id?.group_name || 'Primary'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">
                          {item.base_uom_id?.unit_code || 'PCS'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                          {item.uom_conversions?.length > 0 ? (
                            <span>
                              {item.uom_conversions.map(c => `1 ${c.alternate_uom_id?.unit_code || 'ALT'} = ${c.conversion_factor} ${item.base_uom_id?.unit_code}`).join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-600">None</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-300">
                          {item.purchase_price}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                          {item.sales_price}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[10px] text-slate-400">
                          {item.costing_method}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleItemStatus(item)}
                            title="Click to toggle Active / Inactive"
                            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                              item.status === 'ACTIVE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750'
                            }`}
                          >
                            {item.status}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => openEditItem(item)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-brand-400 transition cursor-pointer"
                              title="Edit stock item"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedItemDetail(item)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
                              title="Inspect item balances"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleArchiveItem(item)}
                              className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                              title="Archive stock item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 3: OPENING STOCK ENTRY */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'opening_stock' && (
        <div className="space-y-6 max-w-3xl">
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              <span>Opening Stock Balance Initialization</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Record verified starting stock quantities and unit valuation into a target godown. Each item-godown pair allows exactly one opening stock posting to guarantee ledger consistency.
            </p>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Integration Boundary Note:</strong> Inventory balances and movements are updated immediately. Direct GL suspense balancing journal entries will be integrated in Phase 4.
              </span>
            </div>
          </div>

          <form onSubmit={handlePostOpeningStock} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Stock Item *</label>
                <select
                  required
                  value={openingStockForm.stock_item_id}
                  onChange={e => handleOpeningStockItemChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                >
                  <option value="">Select Stock Item...</option>
                  {items.map(i => (
                    <option key={i._id} value={i._id}>
                      {i.item_code} - {i.item_name} (Base: {i.base_uom_id?.unit_code || 'PCS'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Godown / Warehouse *</label>
                <select
                  required
                  value={openingStockForm.godown_id}
                  onChange={e => setOpeningStockForm({ ...openingStockForm, godown_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                >
                  <option value="">Select Godown...</option>
                  {godowns.map(g => (
                    <option key={g._id} value={g._id}>
                      {g.godown_name} ({g.godown_code}) {g.is_default ? '★ Default' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Quantity *</label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={openingStockForm.quantity}
                  onChange={e => handleOpeningStockQtyOrRateChange(e.target.value, openingStockForm.unit_rate)}
                  placeholder="e.g. 100"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Unit of Measurement (UOM)</label>
                <select
                  value={openingStockForm.uom_id}
                  onChange={e => setOpeningStockForm({ ...openingStockForm, uom_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                >
                  <option value="">Auto (Item Base UOM)</option>
                  {units.map(u => (
                    <option key={u._id} value={u._id}>{u.unit_code} - {u.unit_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Unit Purchase Rate *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={openingStockForm.unit_rate}
                  onChange={e => handleOpeningStockQtyOrRateChange(openingStockForm.quantity, e.target.value)}
                  placeholder="e.g. 50.00"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Calculated Total Valuation</label>
                <input
                  type="text"
                  readOnly
                  value={openingStockForm.total_cost}
                  placeholder="Calculated automatically"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-amber-400 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Batch Number (Optional)</label>
                <input
                  type="text"
                  value={openingStockForm.batch_number}
                  onChange={e => setOpeningStockForm({ ...openingStockForm, batch_number: e.target.value })}
                  placeholder="e.g. BATCH-2026-01"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={openingStockForm.expiry_date}
                  onChange={e => setOpeningStockForm({ ...openingStockForm, expiry_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Notes / Opening Memo</label>
              <input
                type="text"
                value={openingStockForm.notes}
                onChange={e => setOpeningStockForm({ ...openingStockForm, notes: e.target.value })}
                placeholder="e.g. Fiscal year 2026 physical inventory verification count"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Posting Movement...' : 'Post Opening Stock'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 4: STOCK BALANCES */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Projected Materialized Balances by Godown
            </h3>
            <button
              onClick={() => setShowReconcileModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-brand-400 text-xs font-medium transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reconcile / Rebuild Balances</span>
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            {balances.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active stock balances recorded. Post opening stock to generate inventory balances.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Item Code</th>
                      <th className="py-2.5 px-4">Item Name</th>
                      <th className="py-2.5 px-4">Godown</th>
                      <th className="py-2.5 px-4 text-right">Quantity On Hand</th>
                      <th className="py-2.5 px-4">Base UOM</th>
                      <th className="py-2.5 px-4 text-right">Moving Avg Rate</th>
                      <th className="py-2.5 px-4 text-right">Total Inventory Value</th>
                      <th className="py-2.5 px-4 text-right">Last Movement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                    {balances.map(b => (
                      <tr key={b._id} className="hover:bg-slate-850/50 transition">
                        <td className="py-2.5 px-4 font-bold text-slate-200">
                          {b.stock_item_id?.item_code || 'N/A'}
                        </td>
                        <td className="py-2.5 px-4 font-sans text-white">
                          {b.stock_item_id?.item_name || 'N/A'}
                        </td>
                        <td className="py-2.5 px-4 font-sans">
                          {b.godown_id?.godown_name || 'Main'}
                          {b.godown_id?.is_default && (
                            <span className="ml-1.5 text-[10px] text-brand-400">★</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                          {b.quantity_on_hand}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {b.stock_item_id?.base_uom_id?.unit_code || 'PCS'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-300">
                          {b.average_unit_cost}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-amber-300">
                          {b.total_inventory_value}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 text-[11px]">
                          {b.last_movement_at ? new Date(b.last_movement_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 5: MOVEMENTS REGISTER & REVERSALS */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Immutable Stock Movement Ledger ({movements.length} total)
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Append-Only • No destructive row mutations
            </span>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            {movements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No stock movements logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Item Code</th>
                      <th className="py-2.5 px-4">Godown</th>
                      <th className="py-2.5 px-4">Movement Type</th>
                      <th className="py-2.5 px-4 text-right">Qty</th>
                      <th className="py-2.5 px-4">UOM</th>
                      <th className="py-2.5 px-4 text-right">Base Qty</th>
                      <th className="py-2.5 px-4 text-right">Unit Rate</th>
                      <th className="py-2.5 px-4 text-right">Total Cost</th>
                      <th className="py-2.5 px-4 text-center">Reversal</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
                    {movements.map(m => (
                      <tr key={m._id} className="hover:bg-slate-850/50 transition">
                        <td className="py-2.5 px-4 text-slate-400">
                          {new Date(m.movement_date || m.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-200">
                          {m.stock_item_id?.item_code || 'N/A'}
                        </td>
                        <td className="py-2.5 px-4 font-sans">{m.godown_id?.godown_name || 'Main'}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            m.movement_type === 'OPENING_STOCK'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : m.movement_type === 'REVERSAL'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-white">{m.quantity}</td>
                        <td className="py-2.5 px-4">{m.uom_id?.unit_code || 'PCS'}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-400">{m.base_quantity}</td>
                        <td className="py-2.5 px-4 text-right">{m.unit_rate}</td>
                        <td className="py-2.5 px-4 text-right text-amber-300">{m.total_cost}</td>
                        <td className="py-2.5 px-4 text-center">
                          {m.is_reversed ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              Reversed
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {!m.is_reversed && m.movement_type !== 'REVERSAL' && (
                            <button
                              onClick={() => setShowReversalModal(m)}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[11px] font-medium transition cursor-pointer"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 6: GODOWNS / WAREHOUSES */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'godowns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Godowns and Storage Locations
            </h3>
            <button
              onClick={() => setShowGodownModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Godown</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {godowns.map(g => (
              <div key={g._id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-white">{g.godown_code}</span>
                  {g.is_default && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-500/10 border border-brand-500/30 text-brand-400 font-medium">
                      Default Godown
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-200">{g.godown_name}</h4>
                <div className="text-xs text-slate-400">
                  {g.address?.city ? `${g.address.city}, ${g.address.state || ''}` : 'No address specified'}
                </div>
                <div className="pt-2 text-[11px] text-slate-500 flex justify-between">
                  <span>Contact: {g.contact_person || 'N/A'}</span>
                  <span className="text-emerald-400">{g.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 7: STOCK GROUPS */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Stock Groups Hierarchy
            </h3>
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Stock Group</span>
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Group Code</th>
                  <th className="py-2.5 px-4">Group Name</th>
                  <th className="py-2.5 px-4">Parent Group</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {groups.map(g => (
                  <tr key={g._id} className="hover:bg-slate-850/50 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-200">{g.group_code}</td>
                    <td className="py-2.5 px-4 font-medium text-white">{g.group_name}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">
                      {g.parent_group_id?.group_name ? `${g.parent_group_id.group_name} (${g.parent_group_id.group_code})` : 'Primary (Root)'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{g.description || '—'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {g.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 8: STOCK CATEGORIES */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Stock Categories
            </h3>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Category Code</th>
                  <th className="py-2.5 px-4">Category Name</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {categories.map(c => (
                  <tr key={c._id} className="hover:bg-slate-850/50 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-200">{c.category_code}</td>
                    <td className="py-2.5 px-4 font-medium text-white">{c.category_name}</td>
                    <td className="py-2.5 px-4 text-slate-400">{c.description || '—'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 9: UNITS OF MEASUREMENT & CONVERSION SIMULATOR */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'uom' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Units of Measurement ({units.length} defined)
            </h3>
            <button
              onClick={() => setShowUomModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Custom UOM</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Units Table */}
            <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Unit Name</th>
                    <th className="py-2.5 px-4">Symbol</th>
                    <th className="py-2.5 px-4">Dimension Type</th>
                    <th className="py-2.5 px-4 text-center">Decimals</th>
                    <th className="py-2.5 px-4 text-center">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {units.map(u => (
                    <tr key={u._id} className="hover:bg-slate-850/50 transition">
                      <td className="py-2.5 px-4 font-mono font-bold text-white">{u.unit_code}</td>
                      <td className="py-2.5 px-4">{u.unit_name}</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-400">{u.symbol}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">{u.unit_type}</td>
                      <td className="py-2.5 px-4 text-center font-mono">{u.decimal_places}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          u.is_system_standard
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {u.is_system_standard ? 'System Standard' : 'Custom'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Live UOM Conversion Simulator */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-brand-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                  Live UOM Conversion Simulator
                </h4>
              </div>
              <p className="text-[11px] text-slate-400">
                Simulate multi-UOM conversions (standard dimension math or item-specific packaging ratios, e.g., 5 BOX = 50 PCS).
              </p>

              <form onSubmit={handleRunConversionSim} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Stock Item (Required for packaging like BOX)
                  </label>
                  <select
                    value={simForm.stock_item_id}
                    onChange={e => setSimForm({ ...simForm, stock_item_id: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">None (Standard Dimension Conversion)</option>
                    {items.map(i => (
                      <option key={i._id} value={i._id}>{i.item_code} - {i.item_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">From UOM</label>
                    <select
                      required
                      value={simForm.from_uom_id}
                      onChange={e => setSimForm({ ...simForm, from_uom_id: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select...</option>
                      {units.map(u => (
                        <option key={u._id} value={u._id}>{u.unit_code} ({u.unit_name})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">To UOM</label>
                    <select
                      required
                      value={simForm.to_uom_id}
                      onChange={e => setSimForm({ ...simForm, to_uom_id: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value="">Select...</option>
                      {units.map(u => (
                        <option key={u._id} value={u._id}>{u.unit_code} ({u.unit_name})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={simForm.quantity}
                    onChange={e => setSimForm({ ...simForm, quantity: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={simLoading}
                  className="w-full py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {simLoading ? 'Converting...' : 'Calculate Conversion'}
                </button>
              </form>

              {simResult && (
                <div className={`p-3 rounded-lg border text-xs font-mono space-y-1 ${
                  simResult.error
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}>
                  {simResult.error ? (
                    <div>Error: {simResult.error}</div>
                  ) : (
                    <>
                      <div className="font-bold text-white">
                        {simResult.source_quantity} {simResult.from_unit} = {simResult.target_quantity} {simResult.to_unit}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Factor: {simResult.conversion_factor} • Mode: {simResult.conversion_type}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: CREATE STOCK ITEM */}
      {/* ---------------------------------------------------------------- */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Package className="w-5 h-5 text-brand-400" />
                <span>{editingItemId ? `Edit Stock Item (${itemForm.item_code})` : 'Create New Stock Item'}</span>
              </h2>
              <button onClick={() => setShowItemModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdateItem} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Item Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ITM-001"
                    value={itemForm.item_code}
                    onChange={e => setItemForm({ ...itemForm, item_code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">SKU *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SKU-BOLT-M8"
                    value={itemForm.sku}
                    onChange={e => setItemForm({ ...itemForm, sku: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono uppercase"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Item Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. M8 Stainless Steel Hex Bolt 50mm"
                    value={itemForm.item_name}
                    onChange={e => setItemForm({ ...itemForm, item_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Stock Group</label>
                  <select
                    value={itemForm.stock_group_id}
                    onChange={e => setItemForm({ ...itemForm, stock_group_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Default (Primary)</option>
                    {groups.map(g => (
                      <option key={g._id} value={g._id}>{g.group_name} ({g.group_code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Stock Category</label>
                  <select
                    value={itemForm.stock_category_id}
                    onChange={e => setItemForm({ ...itemForm, stock_category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">None</option>
                    {categories.map(c => (
                      <option key={c._id} value={c._id}>{c.category_name} ({c.category_code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Base UOM *</label>
                  <select
                    required
                    value={itemForm.base_uom_id}
                    onChange={e => setItemForm({ ...itemForm, base_uom_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Select Base UOM...</option>
                    {units.map(u => (
                      <option key={u._id} value={u._id}>{u.unit_code} - {u.unit_name} ({u.symbol})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Costing Method</label>
                  <select
                    value={itemForm.costing_method}
                    onChange={e => setItemForm({ ...itemForm, costing_method: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="AVERAGE_COST">Moving Average Cost</option>
                    <option value="STANDARD_COST">Standard Cost</option>
                    <option value="FIFO">FIFO (First-In, First-Out)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Default Purchase Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={itemForm.purchase_price}
                    onChange={e => setItemForm({ ...itemForm, purchase_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Default Sales Rate (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={itemForm.sales_price}
                    onChange={e => setItemForm({ ...itemForm, sales_price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 0406 (Cheese), 1101 (Flour)"
                    value={itemForm.hsn_sac_code}
                    onChange={e => setItemForm({ ...itemForm, hsn_sac_code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Default GST Rate (%)</label>
                  <select
                    value={itemForm.tax_rate}
                    onChange={e => setItemForm({ ...itemForm, tax_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                  >
                    <option value="0">0% (Exempt / Nil Rated)</option>
                    <option value="5">5% (GST 5%)</option>
                    <option value="12">12% (GST 12%)</option>
                    <option value="18">18% (GST 18%)</option>
                    <option value="28">28% (GST 28%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Item Status</label>
                  <select
                    value={itemForm.status}
                    onChange={e => setItemForm({ ...itemForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              {/* Item-Specific Alternate UOM Conversions Table */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-200">Alternate UOM Conversions</span>
                    <span className="block text-[10px] text-slate-500">e.g. 1 BOX = 100 PCS</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItemConversionRow}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700 text-brand-400 text-xs font-medium transition cursor-pointer"
                  >
                    + Add Alternate UOM
                  </button>
                </div>

                {itemForm.uom_conversions.map((conv, idx) => (
                  <div key={idx} className="flex items-center space-x-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                    <span className="text-xs text-slate-400">1</span>
                    <select
                      value={conv.alternate_uom_id}
                      onChange={e => handleItemConversionChange(idx, 'alternate_uom_id', e.target.value)}
                      className="px-2 py-1 bg-slate-900 border border-slate-750 rounded text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="">Select Alt UOM...</option>
                      {units.map(u => (
                        <option key={u._id} value={u._id}>{u.unit_code}</option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-400">=</span>
                    <input
                      type="number"
                      step="any"
                      min="0.000001"
                      placeholder="Factor"
                      value={conv.conversion_factor}
                      onChange={e => handleItemConversionChange(idx, 'conversion_factor', e.target.value)}
                      className="w-24 px-2 py-1 bg-slate-900 border border-slate-750 rounded text-xs text-slate-200 font-mono"
                    />
                    <span className="text-xs text-slate-400 font-mono">Base Units</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItemConversionRow(idx)}
                      className="p-1 text-rose-400 hover:text-rose-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  {editingItemId ? (submitting ? 'Saving Changes...' : 'Update Stock Item') : (submitting ? 'Creating...' : 'Save Stock Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ITEM DETAIL DRILLDOWN */}
      {/* ---------------------------------------------------------------- */}
      {selectedItemDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{selectedItemDetail.item_name}</h3>
                <span className="text-xs text-brand-400 font-mono">
                  Code: {selectedItemDetail.item_code} • SKU: {selectedItemDetail.sku}
                </span>
              </div>
              <button onClick={() => setSelectedItemDetail(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-500 block">Base UOM</span>
                <span className="font-mono font-bold text-white">{selectedItemDetail.base_uom_id?.unit_code}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-500 block">Costing Method</span>
                <span className="font-mono font-bold text-white">{selectedItemDetail.costing_method}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-500 block">Default Purchase Rate</span>
                <span className="font-mono font-bold text-slate-300">{selectedItemDetail.purchase_price}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-500 block">Default Sales Rate</span>
                <span className="font-mono font-bold text-emerald-400">{selectedItemDetail.sales_price}</span>
              </div>
            </div>

            {/* Balances for this item */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold text-slate-200">Current Godown Distribution</h4>
              {balances.filter(b => (b.stock_item_id?._id || b.stock_item_id) === selectedItemDetail._id).length === 0 ? (
                <div className="text-xs text-slate-500 p-3 bg-slate-950 rounded-lg border border-slate-800">
                  No stock balances recorded in any godown.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                  {balances
                    .filter(b => (b.stock_item_id?._id || b.stock_item_id) === selectedItemDetail._id)
                    .map(b => (
                      <div key={b._id} className="p-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-200">{b.godown_id?.godown_name}</span>
                        <div className="text-right font-mono">
                          <span className="font-bold text-emerald-400">{b.quantity_on_hand} {selectedItemDetail.base_uom_id?.unit_code}</span>
                          <span className="block text-[10px] text-amber-300">Valuation: {b.total_inventory_value}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ADD GODOWN */}
      {/* ---------------------------------------------------------------- */}
      {showGodownModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Warehouse className="w-5 h-5 text-brand-400" />
                <span>Add New Godown / Warehouse</span>
              </h3>
              <button onClick={() => setShowGodownModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGodown} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Godown Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WH-NORTH"
                  value={godownForm.godown_code}
                  onChange={e => setGodownForm({ ...godownForm, godown_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Godown Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Northern Regional Distribution Center"
                  value={godownForm.godown_name}
                  onChange={e => setGodownForm({ ...godownForm, godown_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">City / Location</label>
                <input
                  type="text"
                  placeholder="e.g. New Delhi"
                  value={godownForm.address.city}
                  onChange={e => setGodownForm({ ...godownForm, address: { ...godownForm.address, city: e.target.value } })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="default_godown"
                  checked={godownForm.is_default}
                  onChange={e => setGodownForm({ ...godownForm, is_default: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-750 text-brand-500"
                />
                <label htmlFor="default_godown" className="text-xs text-slate-300 cursor-pointer">
                  Set as Company Default Godown
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowGodownModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
                >
                  Save Godown
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ADD STOCK GROUP */}
      {/* ---------------------------------------------------------------- */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-brand-400" />
                <span>Add Stock Group</span>
              </h3>
              <button onClick={() => setShowGroupModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Group Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RAW-MAT"
                  value={groupForm.group_code}
                  onChange={e => setGroupForm({ ...groupForm, group_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Group Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Raw Materials"
                  value={groupForm.group_name}
                  onChange={e => setGroupForm({ ...groupForm, group_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Parent Group (Optional)</label>
                <select
                  value={groupForm.parent_group_id}
                  onChange={e => setGroupForm({ ...groupForm, parent_group_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                >
                  <option value="">None (Root Group)</option>
                  {groups.map(g => (
                    <option key={g._id} value={g._id}>{g.group_name} ({g.group_code})</option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
                >
                  Save Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ADD STOCK CATEGORY */}
      {/* ---------------------------------------------------------------- */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Boxes className="w-5 h-5 text-brand-400" />
                <span>Add Stock Category</span>
              </h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Category Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FASTENERS"
                  value={categoryForm.category_code}
                  onChange={e => setCategoryForm({ ...categoryForm, category_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Industrial Fasteners"
                  value={categoryForm.category_name}
                  onChange={e => setCategoryForm({ ...categoryForm, category_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ADD CUSTOM UOM */}
      {/* ---------------------------------------------------------------- */}
      {showUomModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Scale className="w-5 h-5 text-brand-400" />
                <span>Add Unit of Measurement</span>
              </h3>
              <button onClick={() => setShowUomModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUom} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Unit Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ROLL"
                  value={uomForm.unit_code}
                  onChange={e => setUomForm({ ...uomForm, unit_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Unit Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Roll"
                  value={uomForm.unit_name}
                  onChange={e => setUomForm({ ...uomForm, unit_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Dimension Type</label>
                  <select
                    value={uomForm.unit_type}
                    onChange={e => setUomForm({ ...uomForm, unit_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
                  >
                    <option value="COUNT">COUNT</option>
                    <option value="MASS">MASS</option>
                    <option value="VOLUME">VOLUME</option>
                    <option value="LENGTH">LENGTH</option>
                    <option value="PACKAGING">PACKAGING</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Decimal Places</label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    value={uomForm.decimal_places}
                    onChange={e => setUomForm({ ...uomForm, decimal_places: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowUomModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
                >
                  Save UOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: REVERSE MOVEMENT */}
      {/* ---------------------------------------------------------------- */}
      {showReversalModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-rose-400 flex items-center space-x-2">
                <RotateCcw className="w-5 h-5" />
                <span>Reverse Stock Movement</span>
              </h3>
              <button onClick={() => setShowReversalModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              This will create an <strong className="text-white">immutable offsetting reversal movement</strong> for {showReversalModal.stock_item_id?.item_name || 'this item'} and recalculate the godown stock balance.
            </p>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
              <div>Quantity: {showReversalModal.quantity} {showReversalModal.uom_id?.unit_code}</div>
              <div>Base Quantity: {showReversalModal.base_quantity}</div>
              <div>Total Cost: {showReversalModal.total_cost}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Reason for Reversal *</label>
              <input
                type="text"
                required
                placeholder="e.g. Physical count discrepancy correction"
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-lg text-xs text-slate-200"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowReversalModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReverseMovement}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
              >
                {submitting ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: RECONCILE BALANCES */}
      {/* ---------------------------------------------------------------- */}
      {showReconcileModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-brand-400" />
                <span>Reconcile Inventory Balances</span>
              </h3>
              <button onClick={() => setShowReconcileModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              This procedure verifies and recalculates all godown-level stock balances from scratch by replaying the immutable <strong className="text-slate-200">StockMovement</strong> ledger. It resolves any potential caching drift.
            </p>

            <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg text-brand-300 text-xs flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Safe operation • Zero destructive data deletion</span>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowReconcileModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReconcileBalances}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition"
              >
                {submitting ? 'Reconciling...' : 'Run Full Reconciliation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
