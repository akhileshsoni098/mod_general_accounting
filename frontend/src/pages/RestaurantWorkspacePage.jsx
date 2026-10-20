import React, { useState, useEffect } from 'react';
import { restaurantApi, inventoryApi } from '../services/api';
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
  AlertTriangle
} from 'lucide-react';

export default function RestaurantWorkspacePage() {
  const [activeTab, setActiveTab] = useState('tables'); // 'tables' | 'kitchen' | 'recipes'
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      const [tableRes, orderRes, itemRes] = await Promise.all([
        restaurantApi.getTables(),
        restaurantApi.getOrders(),
        inventoryApi.getItems()
      ]);
      setTables(tableRes.data || []);
      setOrders(orderRes.data || []);
      setMenuItems(itemRes.data || []);
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
    setOrderItems([]);
    setShowOrderModal(true);
  };

  const addDishToOrder = (dish) => {
    const existing = orderItems.find((o) => o.item_id === dish._id);
    if (existing) {
      setOrderItems(orderItems.map((o) => (o.item_id === dish._id ? { ...o, quantity: o.quantity + 1 } : o)));
    } else {
      setOrderItems([
        ...orderItems,
        {
          item_id: dish._id,
          item_name: dish.item_name,
          quantity: 1,
          unit_price: Number(dish.standard_selling_price || 150)
        }
      ]);
    }
  };

  const handleSendOrder = async () => {
    if (orderItems.length === 0) return;
    try {
      const res = await restaurantApi.createOrder({
        table_id: selectedTable._id,
        order_type: 'DINE_IN',
        customer_name: `Table ${selectedTable.table_number}`,
        items: orderItems
      });

      // Send to kitchen immediately
      await restaurantApi.sendToKitchen(res.data._id);
      setShowOrderModal(false);
      setSuccess(`KOT issued for Table ${selectedTable.table_number}. Order sent to kitchen!`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSettleOrder = async (orderId) => {
    if (!window.confirm('Settle this order? This will generate the sales invoice and auto-consume recipe ingredients from inventory.')) return;
    try {
      const res = await restaurantApi.settleOrder(orderId);
      setSuccess(`Order settled! Invoice ${res.data.commercial_document.document_number} posted and ingredients deducted from stock.`);
      loadData();
    } catch (err) {
      setError(err.message);
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
          <button
            onClick={() => setShowTableModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition"
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
          <span>Kitchen Display & Orders</span>
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'recipes' ? 'border-b-2 border-amber-500 text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Recipe BOM & Ingredients</span>
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
                    <button
                      onClick={() => openOrderForTable(t)}
                      className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition"
                    >
                      Take Order
                    </button>
                  ) : (
                    <div className="text-[11px] text-amber-300 font-mono text-center">
                      Order in Progress
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
          <div className="grid grid-cols-3 gap-4">
            {orders.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
                No active orders in the kitchen.
              </div>
            ) : (
              orders.map((ord) => (
                <div key={ord._id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-xs font-bold text-white font-mono">{ord.order_number}</div>
                      <div className="text-[11px] text-slate-400">{ord.customer_name}</div>
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

                  <div className="space-y-1 text-xs">
                    {ord.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-slate-300 font-mono">
                        <span>{it.quantity}x {it.item_name}</span>
                        <span>₹{it.line_total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                    <span className="text-xs font-bold text-white">Total: ₹{ord.grand_total.toFixed(2)}</span>
                    {ord.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleSettleOrder(ord._id)}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition"
                      >
                        Settle Bill
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Recipe BOM */}
      {activeTab === 'recipes' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 max-w-2xl">
          <div>
            <h3 className="text-sm font-bold text-white">Configure Dish Recipe BOM</h3>
            <p className="text-xs text-slate-400 mt-1">
              Link sellable dishes with raw inventory ingredients for automated stock consumption on order completion.
            </p>
          </div>

          {recipeSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs">
              {recipeSuccess}
            </div>
          )}

          <form onSubmit={handleSaveRecipe} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Select Menu Item / Dish</label>
              <select
                value={selectedMenuDish}
                onChange={(e) => setSelectedMenuDish(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
              >
                <option value="">-- Choose Dish (e.g. Pizza, Burger, Pasta) --</option>
                {menuItems.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.item_name} ({m.item_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <span className="font-semibold text-slate-300">Raw Ingredients</span>
              {recipeIngredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="col-span-7">
                    <select
                      value={ing.ingredient_item_id}
                      onChange={(e) => {
                        const updated = [...recipeIngredients];
                        updated[idx].ingredient_item_id = e.target.value;
                        const found = menuItems.find((it) => it._id === e.target.value);
                        if (found) updated[idx].uom_id = found.base_uom_id;
                        setRecipeIngredients(updated);
                      }}
                      required
                      className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white"
                    >
                      <option value="">-- Choose Raw Ingredient --</option>
                      {menuItems.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.item_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
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
                      className="w-full bg-slate-900 border border-slate-750 rounded p-1.5 text-white text-right font-mono"
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      type="button"
                      onClick={() => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx))}
                      className="text-rose-400 font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setRecipeIngredients([
                    ...recipeIngredients,
                    { ingredient_item_id: '', quantity: 0.1, uom_id: '', waste_percentage: 5 }
                  ])
                }
                className="text-amber-400 hover:text-amber-300 font-semibold text-xs"
              >
                + Add Ingredient
              </button>
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition"
            >
              Save Recipe BOM
            </button>
          </form>
        </div>
      )}

      {/* Take Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white">Order for Table {selectedTable?.table_number}</h3>
              <button onClick={() => setShowOrderModal(false)} className="text-slate-400 font-bold">×</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">Available Menu</span>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {menuItems.map((m) => (
                    <button
                      key={m._id}
                      onClick={() => addDishToOrder(m)}
                      className="w-full p-2 bg-slate-950 hover:bg-slate-800 border border-slate-850 rounded text-left flex justify-between items-center text-xs text-white"
                    >
                      <span>{m.item_name}</span>
                      <span className="font-mono text-amber-400 font-bold">+</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">Selected Items</span>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {orderItems.length === 0 ? (
                    <div className="text-slate-500 text-xs py-10 text-center">No items selected</div>
                  ) : (
                    orderItems.map((it, idx) => (
                      <div key={idx} className="p-2 bg-slate-950 rounded flex justify-between text-xs text-slate-200">
                        <span>{it.quantity}x {it.item_name}</span>
                        <span className="font-mono">₹{(it.quantity * it.unit_price).toFixed(2)}</span>
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
    </div>
  );
}
