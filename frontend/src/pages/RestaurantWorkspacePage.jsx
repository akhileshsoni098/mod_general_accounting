import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { restaurantApi, inventoryApi } from '../services/api';
import PaymentModal from '../components/PaymentModal';
import {
  UtensilsCrossed,
  ChefHat,
  Plus,
  RefreshCw,
  CheckCircle,
  Clock,
  Send,
  Receipt,
  Layers,
  Flame,
  AlertTriangle,
  ShoppingBag,
  QrCode,
  Trash2,
  XCircle,
  RotateCcw,
  Store,
  Sliders,
  ExternalLink,
  Copy,
  Eye,
  Check
} from 'lucide-react';

export default function RestaurantWorkspacePage() {
  const [activeTab, setActiveTab] = useState('tables'); // 'tables' | 'kitchen' | 'recipes' | 'outlets' | 'policies' | 'modifiers'
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [restaurantConfig, setRestaurantConfig] = useState(null);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [kdsStation, setKdsStation] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Table QR Modal State
  const [tableQrModal, setTableQrModal] = useState({
    isOpen: false,
    table: null,
    qrDataUrl: '',
    url: ''
  });

  // Outlets Modal
  const [showOutletModal, setShowOutletModal] = useState(false);
  const [outletName, setOutletName] = useState('');
  const [outletCode, setOutletCode] = useState('');
  const [outletSlug, setOutletSlug] = useState('');

  // Modifier Group Modal
  const [showModGroupModal, setShowModGroupModal] = useState(false);
  const [modGroupName, setModGroupName] = useState('');
  const [modGroupDisplayName, setModGroupDisplayName] = useState('');
  const [modGroupOptions, setModGroupOptions] = useState([
    { name: 'Extra Cheese', price_adjustment: 50, quantity_to_consume: 0.05 },
    { name: 'Extra Sauce', price_adjustment: 20, quantity_to_consume: 0.02 }
  ]);

  // Takeaway & Payment Modal State
  const [takeawayCustomerName, setTakeawayCustomerName] = useState('');
  const [takeawayCustomerPhone, setTakeawayCustomerPhone] = useState('');
  const [paymentModalState, setPaymentModalState] = useState({
    isOpen: false,
    orderId: null,
    orderNumber: '',
    amount: 0,
    customerName: 'Customer',
    companyName: 'Pizza Palace Enterprises Ltd',
    upiId: 'pizzapalace@icici'
  });
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Selected Table & Order Modal
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // New Table Modal
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [tableSection, setTableSection] = useState('MAIN_HALL');
  const [tableCapacity, setTableCapacity] = useState(4);

  // Recipe BOM State
  const [recipes, setRecipes] = useState([]);
  const [selectedMenuDish, setSelectedMenuDish] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState([
    { ingredient_item_id: '', quantity: 0.1, uom_id: '', waste_percentage: 5 }
  ]);
  const [recipeSuccess, setRecipeSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [tableRes, orderRes, itemRes, recipeRes, locRes, configRes, modRes] = await Promise.all([
        restaurantApi.getTables(),
        restaurantApi.getOrders(),
        inventoryApi.getItems(),
        restaurantApi.getRecipes ? restaurantApi.getRecipes() : Promise.resolve({ data: [] }),
        restaurantApi.getLocations ? restaurantApi.getLocations() : Promise.resolve({ data: [] }),
        restaurantApi.getConfig ? restaurantApi.getConfig() : Promise.resolve({ data: {} }),
        restaurantApi.getModifierGroups ? restaurantApi.getModifierGroups() : Promise.resolve({ data: [] })
      ]);
      setTables(Array.isArray(tableRes.data) ? tableRes.data : (tableRes.data?.tables || []));
      setOrders(Array.isArray(orderRes.data) ? orderRes.data : (orderRes.data?.orders || []));
      setMenuItems(Array.isArray(itemRes.data) ? itemRes.data : (itemRes.data?.items || []));
      setRecipes(Array.isArray(recipeRes.data) ? recipeRes.data : (recipeRes.data?.recipes || []));
      setLocations(Array.isArray(locRes.data) ? locRes.data : []);
      setRestaurantConfig(configRes.data || null);
      setModifierGroups(Array.isArray(modRes.data) ? modRes.data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    try {
      await restaurantApi.createTable({
        table_number: tableNumber,
        section: tableSection,
        capacity: Number(tableCapacity)
      });
      setShowTableModal(false);
      setSuccess(`Table ${tableNumber} created.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openOrderForTable = (table) => {
    setSelectedTable(table);
    setTakeawayCustomerName('');
    setTakeawayCustomerPhone('');
    setOrderItems([]);
    setShowOrderModal(true);
  };

  const openTakeawayOrder = () => {
    setSelectedTable({
      _id: null,
      table_number: 'TAKEAWAY',
      section: 'PARCEL_COUNTER',
      isTakeaway: true
    });
    setTakeawayCustomerName('');
    setTakeawayCustomerPhone('');
    setOrderItems([]);
    setShowOrderModal(true);
  };

  const addDishToOrder = async (dish) => {
    let recipeIngredients = [];
    try {
      const recRes = await restaurantApi.getRecipe(dish._id);
      if (recRes && recRes.data && recRes.data.ingredients) {
        recipeIngredients = recRes.data.ingredients.map(ing => ({
          ingredient_id: ing.ingredient_item_id?._id || ing.ingredient_item_id,
          ingredient_name: ing.ingredient_item_id?.item_name || 'Ingredient',
          quantity: ing.quantity,
          uom: ing.uom_id?.unit_code || ''
        }));
      }
    } catch {
      // No recipe BOM configured yet
    }

    const price = Number(dish.sales_price || dish.standard_selling_price || 300);
    const existing = orderItems.find((o) => o.item_id === dish._id && o.excluded_ingredients?.length === 0);
    if (existing) {
      setOrderItems(orderItems.map((o) => (o === existing ? { ...o, quantity: o.quantity + 1 } : o)));
    } else {
      setOrderItems([
        ...orderItems,
        {
          item_id: dish._id,
          item_name: dish.item_name,
          quantity: 1,
          unit_price: price,
          recipeIngredients,
          excluded_ingredients: [],
          modifiers: []
        }
      ]);
    }
  };

  const toggleExcludeIngredient = (orderIndex, ing) => {
    const updated = [...orderItems];
    const item = { ...updated[orderIndex] };
    const curExcluded = item.excluded_ingredients || [];
    const ingId = String(ing.ingredient_id);
    const isExcluded = curExcluded.includes(ingId);
    const modTag = `NO ${ing.ingredient_name.toUpperCase()}`;

    if (isExcluded) {
      item.excluded_ingredients = curExcluded.filter(id => id !== ingId);
      item.modifiers = (item.modifiers || []).filter(m => m !== modTag);
    } else {
      item.excluded_ingredients = [...curExcluded, ingId];
      item.modifiers = [...(item.modifiers || []), modTag];
    }
    updated[orderIndex] = item;
    setOrderItems(updated);
  };

  const handleSendOrder = async () => {
    if (orderItems.length === 0) return;
    try {
      const isTakeaway = selectedTable?.isTakeaway || !selectedTable?._id;
      const res = await restaurantApi.createOrder({
        table_id: isTakeaway ? null : selectedTable._id,
        order_type: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        customer_name: isTakeaway ? (takeawayCustomerName || 'Takeaway Customer') : `Table ${selectedTable.table_number}`,
        customer_phone: takeawayCustomerPhone || '',
        items: orderItems
      });

      // Send to kitchen immediately
      await restaurantApi.sendToKitchen(res.data._id);
      setShowOrderModal(false);
      setSuccess(`KOT issued for ${isTakeaway ? `Takeaway Order (${takeawayCustomerName || 'Parcel'})` : `Table ${selectedTable.table_number}`}. Order sent to kitchen!`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openOrderPaymentModal = (order) => {
    setPaymentModalState({
      isOpen: true,
      orderId: order._id,
      orderNumber: order.order_number,
      amount: Number(order.grand_total || order.total_amount || 0),
      customerName: order.customer_name || 'Walk-in Guest',
      companyName: 'Pizza Palace Enterprises Ltd',
      upiId: 'pizzapalace@icici'
    });
  };

  const handleConfirmRestaurantPayment = async (paymentData) => {
    try {
      setPaymentLoading(true);
      setError('');
      const res = await restaurantApi.settleOrder(paymentModalState.orderId, {
        payment_method: paymentData.method,
        tendered_amount: paymentData.tenderedAmount,
        change_amount: paymentData.changeAmount,
        upi_ref: paymentData.upiRef
      });
      setSuccess(`Payment of ₹${paymentData.amount.toFixed(2)} received via ${paymentData.method}! Invoice ${res.data.commercial_document?.document_number || 'POSTED'} generated & raw ingredients consumed.`);
      setPaymentModalState(prev => ({ ...prev, isOpen: false }));
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleSettleOrder = async (orderId) => {
    const ord = orders.find(o => String(o._id) === String(orderId));
    if (ord) {
      openOrderPaymentModal(ord);
    } else {
      try {
        const res = await restaurantApi.settleOrder(orderId);
        setSuccess(`Order settled! Invoice ${res.data.commercial_document?.document_number || 'POSTED'} posted and ingredients deducted from stock.`);
        loadData();
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const handleCancelOrder = async (orderId) => {
    const reason = window.prompt('Enter cancellation reason (e.g. Order placed by mistake, customer cancelled):', 'Order placed by mistake');
    if (!reason) return;
    try {
      setLoading(true);
      const res = await restaurantApi.cancelOrder(orderId, { reason, auto_reverse: true });
      setSuccess(res.data?.message || 'Order cancelled and table freed! If invoiced, GL journals & stock were auto-reversed.');
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Delete this order completely from database? If settled, associated invoices & stock will be reversed.')) return;
    try {
      setLoading(true);
      await restaurantApi.deleteOrder(orderId);
      setSuccess('Order deleted from database.');
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    if (!selectedMenuDish) {
      setError('Please select a menu dish.');
      return;
    }
    try {
      await restaurantApi.saveRecipe({
        menu_item_id: selectedMenuDish,
        variant_name: 'STANDARD',
        yield_quantity: 1,
        ingredients: recipeIngredients
      });
      setRecipeSuccess('Recipe BOM saved successfully. Orders for this dish will auto-consume ingredients.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleArchiveRecipe = async (recipeId) => {
    if (!window.confirm('Delete/Archive this dish recipe BOM?')) return;
    try {
      await restaurantApi.archiveRecipe(recipeId);
      setRecipeSuccess('Recipe archived successfully.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleShowTableQr = async (table) => {
    try {
      let token = table.table_qr_token;
      if (!token) {
        const res = await restaurantApi.generateTableQr(table._id);
        token = res.data?.qr_token;
        table.table_qr_token = token;
      }
      const fullUrl = `${window.location.origin}/order/table/${token}`;
      const qrData = await QRCode.toDataURL(fullUrl, { width: 220, margin: 1 });
      setTableQrModal({
        isOpen: true,
        table,
        qrDataUrl: qrData,
        url: fullUrl
      });
    } catch (err) {
      setError('Failed to generate table QR: ' + err.message);
    }
  };

  const handleCreateOutlet = async (e) => {
    e.preventDefault();
    try {
      await restaurantApi.saveLocation({
        name: outletName,
        location_code: outletCode,
        slug: outletSlug
      });
      setShowOutletModal(false);
      setSuccess(`Outlet ${outletName} created successfully.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveConfig = async (newConfig) => {
    try {
      await restaurantApi.saveConfig(newConfig);
      setSuccess('Restaurant operating policy saved.');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateModifierGroup = async (e) => {
    e.preventDefault();
    try {
      await restaurantApi.saveModifierGroup({
        name: modGroupName,
        display_name: modGroupDisplayName,
        options: modGroupOptions
      });
      setShowModGroupModal(false);
      setSuccess(`Modifier group ${modGroupDisplayName} created.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateKdsItemStatus = async (orderId, itemId, newStatus) => {
    try {
      await restaurantApi.updateKdsItemStatus(orderId, itemId, newStatus);
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
            <UtensilsCrossed className="w-5 h-5 text-amber-400" />
            <span>Restaurant, Cafe & QSR Workspace</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Floor tables, Kitchen Order Tickets (KOT), Dine-in/Takeaway, and Recipe BOM Ingredient Auto-Deduction.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <a
            href="/kiosk/default/default"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-bold shadow-md shadow-red-950/30 transition cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>🚀 Open Customer Kiosk</span>
          </a>
          <button
            onClick={openTakeawayOrder}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold shadow-md shadow-amber-950/30 transition cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>🛍️ Takeaway / Parcel Order</span>
          </button>
          <button
            onClick={() => setShowTableModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 shadow-md transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Table</span>
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
          onClick={() => setActiveTab('tables')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'tables' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Floor & Tables</span>
        </button>
        <button
          onClick={() => setActiveTab('kitchen')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'kitchen' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ChefHat className="w-4 h-4" />
          <span>Kitchen Display (KDS)</span>
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'recipes' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Recipe BOM</span>
        </button>
        <button
          onClick={() => setActiveTab('outlets')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'outlets' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Outlets & Locations</span>
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'policies' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Operating Policies</span>
        </button>
        <button
          onClick={() => setActiveTab('modifiers')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'modifiers' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Modifier Add-ons</span>
        </button>
      </div>

      {/* TAB 1: Tables */}
      {activeTab === 'tables' && (
        <div className="grid grid-cols-4 gap-4">
          {tables.length === 0 ? (
            <div className="col-span-4 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
              No tables created yet. Click "Add Table" to set up your restaurant dining floor.
            </div>
          ) : (
            tables.map((t) => (
              <div
                key={t._id}
                className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                  t.status === 'OCCUPIED'
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-bold text-white font-mono">{t.table_number}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                        t.status === 'OCCUPIED'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Section: <span className="text-slate-200 font-semibold">{t.section}</span> ({t.capacity} Covers)
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  {t.status === 'VACANT' ? (
                    <div className="flex space-x-1.5">
                      <button
                        onClick={() => openOrderForTable(t)}
                        className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition"
                      >
                        Take Order
                      </button>
                      <button
                        onClick={() => handleShowTableQr(t)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                        title="View & Print Table QR Code for self-service mobile ordering"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] text-amber-300 font-mono text-center">
                        Order in Progress
                      </div>
                      <div className="flex space-x-1.5">
                        <button
                          onClick={() => {
                            const tableOrdId = t.current_order_id?._id || t.current_order_id;
                            handleSettleOrder(tableOrdId);
                          }}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow-sm"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>⚡ Settle Bill</span>
                        </button>
                        <button
                          onClick={() => {
                            const tableOrdId = t.current_order_id?._id || t.current_order_id;
                            handleCancelOrder(tableOrdId);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-rose-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                          title="Cancel order and release table"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Kitchen Display */}
      {activeTab === 'kitchen' && (
        <div className="space-y-4">
          {/* Station Filter Pills */}
          <div className="flex items-center space-x-2 pb-2 border-b border-slate-800">
            <span className="text-xs text-slate-400 font-semibold mr-2">Routing Station:</span>
            {[
              { id: 'ALL', label: 'All Stations' },
              { id: 'OVEN', label: '🍕 Pizza Oven Station' },
              { id: 'HOT_KITCHEN', label: '🍟 Hot Kitchen & Fryers' },
              { id: 'BEVERAGE', label: '🥤 Beverage & Bar' }
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setKdsStation(st.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  kdsStation === st.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {orders.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
                No active orders in the kitchen.
              </div>
            ) : (
              orders
                .filter(ord => {
                  if (kdsStation === 'ALL') return true;
                  return ord.items?.some(it => (it.kitchen_station || 'OVEN') === kdsStation);
                })
                .map((ord) => (
                <div key={ord._id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white font-mono">{ord.order_number}</span>
                        {ord.pickup_token && (
                          <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold">
                            Token: {ord.pickup_token}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{ord.customer_name} • {ord.order_type}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        ord.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {ord.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {ord.items
                      ?.filter(it => kdsStation === 'ALL' || (it.kitchen_station || 'OVEN') === kdsStation)
                      .map((it, idx) => (
                      <div key={idx} className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white">{it.quantity}x {it.item_name}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                            {it.kitchen_station || 'OVEN'}
                          </span>
                        </div>
                        {it.variant_name && it.variant_name !== 'STANDARD' && (
                          <div className="text-[11px] text-amber-400 font-mono">Size/Crust: {it.variant_name}</div>
                        )}
                        {it.selected_modifiers && it.selected_modifiers.length > 0 && (
                          <div className="text-[11px] text-emerald-400">
                            + {it.selected_modifiers.map(m => m.name).join(', ')}
                          </div>
                        )}
                        {it.excluded_ingredients && it.excluded_ingredients.length > 0 && (
                          <div className="text-[11px] text-rose-400 line-through">
                            No {it.excluded_ingredients.map(e => e?.item_name || 'Ingredient').join(', ')}
                          </div>
                        )}
                        <div className="pt-1 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Status: <strong className="text-slate-200">{it.kot_status || 'PENDING'}</strong></span>
                          {it.kot_status !== 'READY' && (
                            <button
                              onClick={() => handleUpdateKdsItemStatus(ord._id, it._id, 'READY')}
                              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition"
                            >
                              ✓ Mark Ready
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Total: ₹{ord.grand_total.toFixed(2)}</span>
                    <div className="flex items-center space-x-1.5">
                      {ord.status !== 'COMPLETED' && ord.status !== 'CANCELLED' && (
                        <>
                          <button
                            onClick={() => openOrderPaymentModal(ord)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>⚡ Settle (UPI QR)</span>
                          </button>
                          <button
                            onClick={() => handleCancelOrder(ord._id)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-rose-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/50 text-xs font-semibold transition cursor-pointer"
                            title="Cancel order and release table"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {ord.status === 'COMPLETED' && (
                        <button
                          onClick={() => handleCancelOrder(ord._id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-[11px] font-semibold transition flex items-center space-x-1 cursor-pointer"
                          title="Cancel order & auto-reverse commercial invoice and stock"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reverse & Cancel</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteOrder(ord._id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border border-slate-750 transition cursor-pointer"
                        title="Delete order from database"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Recipe BOM */}
      {activeTab === 'recipes' && (
        <div className="space-y-6">
          {/* Section 1: Configured Dish Recipes List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Configured Dish Recipe BOMs ({recipes.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Recipes actively linked to dishes. Raw ingredients are automatically deducted from stock when bills are settled.
                </p>
              </div>
            </div>

            {recipes.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                No dish recipes created yet. Use the configuration form below to map raw ingredients to a menu dish.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map((rec) => {
                  const recipeTotalCost = (rec.ingredients || []).reduce((sum, ing) => {
                    const rate = Number(ing.ingredient_item_id?.purchase_price ?? ing.ingredient_item_id?.standard_cost ?? 0);
                    return sum + ((Number(ing.quantity) || 0) * rate);
                  }, 0);
                  const dishSellingPrice = Number(rec.menu_item_id?.sales_price || rec.menu_item_id?.standard_selling_price || 0);
                  const dishMargin = dishSellingPrice > 0 ? (((dishSellingPrice - recipeTotalCost) / dishSellingPrice) * 100).toFixed(1) : 0;

                  return (
                    <div key={rec._id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm font-bold text-white">
                            {rec.menu_item_id?.item_name || 'Dish Recipe'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Code: {rec.menu_item_id?.item_code || 'N/A'} • Yield: {rec.yield_quantity || 1}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-semibold">
                          {rec.variant_name || 'STANDARD'}
                        </span>
                      </div>

                      {/* Recipe Cost Summary Card */}
                      <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-[11px]">
                        <div>
                          <div className="text-slate-400 text-[10px]">Total Raw Cost:</div>
                          <div className="font-mono font-bold text-amber-400 text-xs">₹{recipeTotalCost.toFixed(2)}</div>
                        </div>
                        {dishSellingPrice > 0 && (
                          <div className="text-right">
                            <div className="text-slate-400 text-[10px]">Selling Price:</div>
                            <div className="font-mono font-bold text-white text-xs">
                              ₹{dishSellingPrice.toFixed(2)}{' '}
                              <span className="text-emerald-400 text-[10px] font-semibold">({dishMargin}% margin)</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-1 border-t border-slate-850">
                        <span className="text-[11px] font-semibold text-slate-400">Ingredients ({rec.ingredients?.length || 0}):</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(rec.ingredients || []).map((ing, i) => {
                            const unitRate = Number(ing.ingredient_item_id?.purchase_price ?? ing.ingredient_item_id?.standard_cost ?? 0);
                            const lineTotal = (Number(ing.quantity) || 0) * unitRate;
                            return (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-slate-850 border border-slate-750 text-slate-200 text-[11px] font-mono flex items-center space-x-1"
                              >
                                <span className="text-emerald-400 font-semibold">{ing.quantity} {ing.uom_id?.unit_code || ''}</span>
                                <span className="text-slate-300">{ing.ingredient_item_id?.item_name || 'Ingredient'}</span>
                                {unitRate > 0 && (
                                  <span className="text-amber-300/80 text-[10px]"> (₹{lineTotal.toFixed(2)})</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-850 flex justify-end space-x-2 text-xs">
                        <button
                          onClick={() => {
                            setSelectedMenuDish(rec.menu_item_id?._id || rec.menu_item_id);
                            setRecipeIngredients((rec.ingredients || []).map(ing => ({
                              ingredient_item_id: ing.ingredient_item_id?._id || ing.ingredient_item_id,
                              quantity: ing.quantity,
                              uom_id: ing.uom_id?._id || ing.uom_id,
                              waste_percentage: ing.waste_percentage || 5
                            })));
                            setRecipeSuccess(`Loaded formula for ${rec.menu_item_id?.item_name} into editor.`);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-[11px] transition"
                        >
                          Edit Formula
                        </button>
                        <button
                          onClick={() => handleArchiveRecipe(rec._id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-900/40 text-rose-300 font-semibold text-[11px] transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Recipe Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 max-w-3xl">
            <div>
              <h3 className="text-sm font-bold text-white">Configure / Update Dish Recipe BOM</h3>
              <p className="text-xs text-slate-400 mt-1">
                Link sellable dishes with raw inventory ingredients for automated stock consumption and live cost pricing breakdown.
              </p>
            </div>

            {recipeSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex justify-between items-center">
                <span>{recipeSuccess}</span>
                <button onClick={() => setRecipeSuccess('')} className="font-bold">×</button>
              </div>
            )}

            <form onSubmit={handleSaveRecipe} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Select Menu Item / Dish *</label>
                <select
                  value={selectedMenuDish}
                  onChange={(e) => setSelectedMenuDish(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Dish (e.g. Pizza, Burger, Pasta) --</option>
                  {menuItems.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.item_name} ({m.item_code}) {m.sales_price ? `— Selling: ₹${Number(m.sales_price).toFixed(2)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-300">Raw Ingredients Breakdown</span>
                  <span className="text-[11px] text-slate-400">Unit Rate • Qty • Line Total</span>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 text-[11px] text-slate-400 px-2 font-medium">
                  <div className="col-span-5">Raw Material Item</div>
                  <div className="col-span-2 text-right">Unit Rate</div>
                  <div className="col-span-2 text-right">Qty & UOM</div>
                  <div className="col-span-2 text-right">Line Cost</div>
                  <div className="col-span-1 text-center">Action</div>
                </div>

                {recipeIngredients.map((ing, idx) => {
                  const foundItem = menuItems.find((it) => it._id === ing.ingredient_item_id);
                  const unitRate = Number(foundItem?.purchase_price ?? foundItem?.standard_cost ?? 0);
                  const uomCode = foundItem?.base_uom_id?.unit_code || (typeof foundItem?.base_uom_id === 'string' ? foundItem.base_uom_id : '');
                  const lineCost = (Number(ing.quantity) || 0) * unitRate;

                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <div className="col-span-5">
                        <select
                          value={ing.ingredient_item_id}
                          onChange={(e) => {
                            const updated = [...recipeIngredients];
                            updated[idx].ingredient_item_id = e.target.value;
                            const found = menuItems.find((it) => it._id === e.target.value);
                            if (found) updated[idx].uom_id = found.base_uom_id?._id || found.base_uom_id;
                            setRecipeIngredients(updated);
                          }}
                          required
                          className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white text-xs"
                        >
                          <option value="">-- Choose Raw Ingredient --</option>
                          {menuItems.map((m) => (
                            <option key={m._id} value={m._id}>
                              {m.item_name} ({m.item_code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Unit Rate Column */}
                      <div className="col-span-2 text-right font-mono text-[11px] text-slate-400 py-1.5 px-2 bg-slate-900/60 border border-slate-800 rounded">
                        {unitRate > 0 ? `₹${unitRate.toFixed(2)}${uomCode ? `/${uomCode}` : ''}` : '₹0.00'}
                      </div>

                      {/* Qty Column with UOM Indicator */}
                      <div className="col-span-2 relative">
                        <input
                          type="number"
                          placeholder="Qty"
                          step="any"
                          value={ing.quantity}
                          onChange={(e) => {
                            const updated = [...recipeIngredients];
                            updated[idx].quantity = Number(e.target.value);
                            setRecipeIngredients(updated);
                          }}
                          required
                          className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white text-right font-mono pr-7"
                        />
                        {uomCode && (
                          <span className="absolute right-2 top-2 text-[10px] text-slate-500 font-mono pointer-events-none">
                            {uomCode}
                          </span>
                        )}
                      </div>

                      {/* Line Cost Total */}
                      <div className="col-span-2 text-right font-mono font-bold text-amber-300 py-1.5 px-2 bg-slate-900/60 border border-slate-800 rounded text-xs">
                        ₹{lineCost.toFixed(2)}
                      </div>

                      {/* Remove Button */}
                      <div className="col-span-1 text-center">
                        {recipeIngredients.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx))}
                            className="text-rose-400 hover:text-rose-300 font-bold text-base transition"
                            title="Remove Ingredient"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() =>
                    setRecipeIngredients([
                      ...recipeIngredients,
                      { ingredient_item_id: '', quantity: 0.1, uom_id: '', waste_percentage: 5 }
                    ])
                  }
                  className="text-amber-400 hover:text-amber-300 font-semibold text-xs cursor-pointer inline-flex items-center space-x-1"
                >
                  <span>+ Add Ingredient</span>
                </button>

                {/* Live Recipe Cost & Margin Breakdown Summary */}
                {(() => {
                  const currentTotalCost = recipeIngredients.reduce((sum, ing) => {
                    const item = menuItems.find((it) => it._id === ing.ingredient_item_id);
                    const rate = Number(item?.purchase_price ?? item?.standard_cost ?? 0);
                    return sum + ((Number(ing.quantity) || 0) * rate);
                  }, 0);

                  const selectedDishObj = menuItems.find((m) => m._id === selectedMenuDish);
                  const dishSellingPrice = Number(selectedDishObj?.sales_price || selectedDishObj?.standard_selling_price || 0);
                  const grossProfit = dishSellingPrice - currentTotalCost;
                  const marginPct = dishSellingPrice > 0 ? ((grossProfit / dishSellingPrice) * 100).toFixed(1) : 0;

                  return (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2.5 mt-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Total Raw Material Cost (BOM Cost):</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          ₹{currentTotalCost.toFixed(2)}
                        </span>
                      </div>

                      {selectedDishObj && (
                        <>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium">
                              Menu Dish Selling Price ({selectedDishObj.item_name}):
                            </span>
                            <span className="font-mono font-bold text-white text-sm">
                              ₹{dishSellingPrice.toFixed(2)}
                            </span>
                          </div>

                          <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium">Estimated Gross Profit per Dish:</span>
                            <div className="text-right">
                              <span className={`font-mono font-bold text-sm ${grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ₹{grossProfit.toFixed(2)}
                              </span>
                              <span className={`ml-2 text-[11px] font-mono px-1.5 py-0.5 rounded ${grossProfit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {marginPct}% Margin
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition cursor-pointer shadow-md"
                >
                  Save Recipe BOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: Outlets & Locations */}
      {activeTab === 'outlets' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Store className="w-4 h-4 text-amber-400" />
                <span>Physical Outlets & Delivery Hubs ({locations.length})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage stores, cloud kitchens, kiosk endpoints, and station mappings.
              </p>
            </div>
            <button
              onClick={() => setShowOutletModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Outlet</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
                No outlets configured yet. Default outlet is active.
              </div>
            ) : (
              locations.map((loc) => (
                <div key={loc._id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-white text-sm">{loc.name}</h4>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Code: {loc.location_code} • Slug: {loc.slug}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                      ACTIVE
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1">
                    <div>Channels: <span className="text-white font-mono">{loc.enabled_channels?.join(', ') || 'POS, KIOSK'}</span></div>
                    <div>Stations: <span className="text-white font-mono">{loc.kitchen_stations?.length || 3} Routing Stations</span></div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                    <a
                      href={`/kiosk/${loc.tenant_id?.tenant_code || 'default'}/${loc.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:text-amber-300 font-bold flex items-center space-x-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Launch Kiosk</span>
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Operating Policies */}
      {activeTab === 'policies' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 max-w-3xl">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Restaurant Operating Model & Workflow Policies</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure how this tenant operates: Domino's-style self-service kiosk, Fine Dining Table QR, or Fast Counter.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveConfig(restaurantConfig);
            }}
            className="space-y-5 text-xs"
          >
            {/* Operating Mode */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">Primary Operating Workflow</label>
              <select
                value={restaurantConfig?.operating_mode || 'QSR_KIOSK'}
                onChange={(e) =>
                  setRestaurantConfig(prev => ({ ...prev, operating_mode: e.target.value }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-xs"
              >
                <option value="QSR_KIOSK">QSR Kiosk (Customer-facing screen, pay before food, token pickup)</option>
                <option value="DINE_IN">Fine Dining (Table service, captain ordering, pay after eating)</option>
                <option value="QUICK_COUNTER">Quick Counter (Cashier POS, instant parcel)</option>
                <option value="CLOUD_KITCHEN">Cloud Kitchen (Online delivery only, no walk-ins)</option>
              </select>
            </div>

            {/* Customer Intake Policy */}
            <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/50 space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                Customer Information Requirements (At Kiosk / Table QR)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {['name', 'phone', 'email', 'address'].map(field => (
                  <div key={field}>
                    <label className="block text-slate-400 mb-1 capitalize">{field} Field</label>
                    <select
                      value={restaurantConfig?.customer_info_policy?.[field] || 'REQUIRED'}
                      onChange={(e) =>
                        setRestaurantConfig(prev => ({
                          ...prev,
                          customer_info_policy: {
                            ...(prev?.customer_info_policy || {}),
                            [field]: e.target.value
                          }
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs"
                    >
                      <option value="REQUIRED">Required</option>
                      <option value="OPTIONAL">Optional</option>
                      <option value="HIDDEN">Hidden</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Modifier & Recipe Rules */}
            <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/50 space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                Menu Customization & Ingredient Stock Rules
              </h4>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restaurantConfig?.modifier_rules?.allow_ingredient_removal !== false}
                    onChange={(e) =>
                      setRestaurantConfig(prev => ({
                        ...prev,
                        modifier_rules: {
                          ...(prev?.modifier_rules || {}),
                          allow_ingredient_removal: e.target.checked
                        }
                      }))
                    }
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>Allow customers to remove ingredients (e.g. No mushrooms, no capsicum)</span>
                </label>
                <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restaurantConfig?.modifier_rules?.allow_chargeable_add_ons !== false}
                    onChange={(e) =>
                      setRestaurantConfig(prev => ({
                        ...prev,
                        modifier_rules: {
                          ...(prev?.modifier_rules || {}),
                          allow_chargeable_add_ons: e.target.checked
                        }
                      }))
                    }
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span>Allow chargeable add-on modifiers (e.g. Extra Cheese +₹50)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-md cursor-pointer"
              >
                Save Operating Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 6: Modifier Add-ons */}
      {activeTab === 'modifiers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Modifier Groups & Chargeable Add-ons ({modifierGroups.length})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Relational add-ons (Extra cheese, crusts, toppings) linked directly to inventory consumption.
              </p>
            </div>
            <button
              onClick={() => setShowModGroupModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Modifier Group</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modifierGroups.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
                No modifier groups configured yet. Click "Create Modifier Group" to add extra toppings or crust options.
              </div>
            ) : (
              modifierGroups.map((grp) => (
                <div key={grp._id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-white text-sm">{grp.display_name}</h4>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Group: {grp.name} • {grp.selection_type}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {grp.options?.map((opt, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-200">{opt.name}</span>
                        <span className="font-mono text-amber-400 font-bold">
                          {opt.price_adjustment > 0 ? `+₹${opt.price_adjustment}` : 'Free'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Take Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  {selectedTable?.isTakeaway ? (
                    <>
                      <ShoppingBag className="w-4 h-4 text-amber-400" />
                      <span>Takeaway / Parcel Counter Order</span>
                    </>
                  ) : (
                    <span>Order for Table {selectedTable?.table_number} ({selectedTable?.section})</span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {selectedTable?.isTakeaway
                    ? 'Direct parcel counter order (No table required) with live ingredient customization'
                    : 'Dine-in guest table order with KOT and stock deduction'}
                </p>
              </div>
              <button onClick={() => setShowOrderModal(false)} className="text-slate-400 hover:text-white font-bold p-1">×</button>
            </div>

            {/* If Takeaway, show customer name and phone inputs */}
            {selectedTable?.isTakeaway && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/80 rounded-lg border border-slate-850">
                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">Customer / Walk-in Name</label>
                  <input
                    type="text"
                    value={takeawayCustomerName}
                    onChange={(e) => setTakeawayCustomerName(e.target.value)}
                    placeholder="e.g. Rohan Verma"
                    className="w-full h-8 bg-slate-900 border border-slate-750 rounded-lg px-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">Customer Mobile Number</label>
                  <input
                    type="tel"
                    value={takeawayCustomerPhone}
                    onChange={(e) => setTakeawayCustomerPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full h-8 bg-slate-900 border border-slate-750 rounded-lg px-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">Available Menu</span>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {menuItems.map((m) => (
                    <button
                      key={m._id}
                      onClick={() => addDishToOrder(m)}
                      className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded-lg text-left flex justify-between items-center text-xs text-white transition"
                    >
                      <div>
                        <div className="font-medium text-white">{m.item_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">₹{m.sales_price || m.standard_selling_price || 300}</div>
                      </div>
                      <span className="font-mono text-amber-400 font-bold text-base">+</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">Selected Items</span>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {orderItems.length === 0 ? (
                    <div className="text-slate-500 text-xs py-10 text-center">No items selected</div>
                  ) : (
                    orderItems.map((it, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-white">{it.quantity}x {it.item_name}</span>
                          <span className="font-mono text-amber-400 font-bold">₹{(it.quantity * it.unit_price).toFixed(2)}</span>
                        </div>

                        {/* Ingredients Customization / Exclusion Pills */}
                        {it.recipeIngredients && it.recipeIngredients.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-850">
                            <span className="text-[10px] text-slate-400 font-medium block mb-1">
                              Recipe Ingredients (Click to Exclude):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {it.recipeIngredients.map(ing => {
                                const isExcluded = (it.excluded_ingredients || []).includes(String(ing.ingredient_id));
                                return (
                                  <button
                                    key={ing.ingredient_id}
                                    type="button"
                                    onClick={() => toggleExcludeIngredient(idx, ing)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer border ${
                                      isExcluded
                                        ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 line-through'
                                        : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40'
                                    }`}
                                    title={isExcluded ? 'Excluded (Stock deduction skipped)' : 'Included in recipe'}
                                  >
                                    {isExcluded ? `✕ No ${ing.ingredient_name}` : `✓ ${ing.ingredient_name}`}
                                  </button>
                                );
                              })}
                            </div>
                            {it.excluded_ingredients?.length > 0 && (
                              <div className="text-[10px] text-amber-400 font-mono mt-1">
                                ℹ️ Price remains ₹{(it.quantity * it.unit_price).toFixed(2)} • Stock deduction will be skipped for excluded ingredients!
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-1 text-[11px] text-slate-400">
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (it.quantity > 1) {
                                  const updated = [...orderItems];
                                  updated[idx].quantity -= 1;
                                  setOrderItems(updated);
                                } else {
                                  setOrderItems(orderItems.filter((_, i) => i !== idx));
                                }
                              }}
                              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-mono">{it.quantity}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...orderItems];
                                updated[idx].quantity += 1;
                                setOrderItems(updated);
                              }}
                              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                            className="text-rose-400 hover:text-rose-300 text-[11px]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSendOrder}
                disabled={orderItems.length === 0}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs disabled:opacity-50"
              >
                Send KOT to Kitchen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Table Modal */}
      {showTableModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Add Dining Table</h3>
            <form onSubmit={handleCreateTable} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Table Number</label>
                <input
                  type="text"
                  placeholder="e.g. T-01, BAR-02"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Section</label>
                <select
                  value={tableSection}
                  onChange={(e) => setTableSection(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="MAIN_HALL">Main Dining Hall</option>
                  <option value="TERRACE">Terrace / Balcony</option>
                  <option value="BAR">Bar Counter</option>
                  <option value="VIP_LOUNGE">VIP Lounge</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Capacity (Covers)</label>
                <input
                  type="number"
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  min="1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTableModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  Save Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table QR Modal */}
      {tableQrModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 text-center">
            <h3 className="text-base font-bold text-white">
              Table QR Code: Table {tableQrModal.table?.table_number}
            </h3>
            <p className="text-xs text-slate-400">
              Customers scan this code on their mobile to order directly to Table {tableQrModal.table?.table_number}.
            </p>

            <div className="bg-white p-4 rounded-2xl inline-block mx-auto border-2 border-amber-500">
              {tableQrModal.qrDataUrl && (
                <img src={tableQrModal.qrDataUrl} alt="Table QR" className="w-52 h-52 mx-auto" />
              )}
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300 overflow-x-auto">
              <span className="truncate mr-2">{tableQrModal.url}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(tableQrModal.url);
                  alert('Table URL copied to clipboard!');
                }}
                className="text-amber-400 hover:text-amber-300 cursor-pointer"
                title="Copy URL"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setTableQrModal(prev => ({ ...prev, isOpen: false }))}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Outlet Modal */}
      {showOutletModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Add Store Location / Outlet</h3>
            <form onSubmit={handleCreateOutlet} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Outlet Name</label>
                <input
                  type="text"
                  placeholder="e.g. Connaught Place Flagship"
                  value={outletName}
                  onChange={(e) => setOutletName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Location Code</label>
                <input
                  type="text"
                  placeholder="e.g. CP-01"
                  value={outletCode}
                  onChange={(e) => setOutletCode(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white uppercase"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">URL Slug</label>
                <input
                  type="text"
                  placeholder="e.g. cp-delhi"
                  value={outletSlug}
                  onChange={(e) => setOutletSlug(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white lowercase"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOutletModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                >
                  Save Outlet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Modifier Group Modal */}
      {showModGroupModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Create Modifier Group</h3>
            <form onSubmit={handleCreateModifierGroup} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Internal Code</label>
                <input
                  type="text"
                  placeholder="e.g. EXTRA_CHEESE"
                  value={modGroupName}
                  onChange={(e) => setModGroupName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white uppercase"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Display Label</label>
                <input
                  type="text"
                  placeholder="e.g. Extra Cheese & Crust Toppings"
                  value={modGroupDisplayName}
                  onChange={(e) => setModGroupDisplayName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400 font-semibold">Options & Price Adjustments</label>
                {modGroupOptions.map((opt, idx) => (
                  <div key={idx} className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Option Name"
                      value={opt.name}
                      onChange={(e) => {
                        const copy = [...modGroupOptions];
                        copy[idx].name = e.target.value;
                        setModGroupOptions(copy);
                      }}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded p-1.5 text-white"
                    />
                    <input
                      type="number"
                      placeholder="Price (+₹)"
                      value={opt.price_adjustment}
                      onChange={(e) => {
                        const copy = [...modGroupOptions];
                        copy[idx].price_adjustment = Number(e.target.value);
                        setModGroupOptions(copy);
                      }}
                      className="w-24 bg-slate-950 border border-slate-800 rounded p-1.5 text-white font-mono"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModGroupModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                >
                  Save Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic Payment & NPCI UPI QR Settlement Modal */}
      <PaymentModal
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirmPayment={handleConfirmRestaurantPayment}
        amount={paymentModalState.amount}
        invoiceNumber={paymentModalState.orderNumber}
        customerName={paymentModalState.customerName}
        companyName={paymentModalState.companyName}
        upiId={paymentModalState.upiId}
        loading={paymentLoading}
      />
    </div>
  );
}
