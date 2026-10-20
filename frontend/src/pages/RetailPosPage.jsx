import React, { useState, useEffect } from 'react';
import { posApi, inventoryApi } from '../services/api';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  QrCode,
  CheckCircle,
  AlertCircle,
  Clock,
  Printer,
  Search,
  Boxes
} from 'lucide-react';

export default function RetailPosPage() {
  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'CARD' | 'UPI'
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Shift Modals
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [openingFloat, setOpeningFloat] = useState(500);
  const [closingActual, setClosingActual] = useState('');

  useEffect(() => {
    loadShift();
    loadCatalog();
  }, []);

  const loadShift = async () => {
    setShiftLoading(true);
    try {
      const res = await posApi.getCurrentShift();
      setShift(res.data || null);
    } catch (err) {
      console.warn('Shift check:', err.message);
    } finally {
      setShiftLoading(false);
    }
  };

  const loadCatalog = async () => {
    try {
      const res = await inventoryApi.getItems();
      setItems(res.data || []);
    } catch (err) {
      console.warn('Catalog load error:', err.message);
    }
  };

  const handleOpenShift = async (e) => {
    e.preventDefault();
    try {
      const res = await posApi.openShift({ opening_float: Number(openingFloat) });
      setShift(res.data);
      setShowOpenShift(false);
      setSuccess('Cashier shift opened successfully.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCloseShift = async (e) => {
    e.preventDefault();
    try {
      const res = await posApi.closeShift({
        shift_id: shift._id,
        closing_cash_actual: Number(closingActual)
      });
      setShift(null);
      setShowCloseShift(false);
      setSuccess(`Shift closed. Variance: ₹${Number(res.data.cash_variance || 0).toFixed(2)}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const addToCart = (item) => {
    const existing = cart.find((c) => c.item_id === item._id);
    if (existing) {
      setCart(cart.map((c) => (c.item_id === item._id ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      setCart([
        ...cart,
        {
          item_id: item._id,
          item_code: item.item_code,
          item_name: item.item_name,
          quantity: 1,
          unit_price: Number(item.standard_selling_price || 100),
          tax_rate_code: 'GST_18',
          godown_id: null
        }
      ]);
    }
  };

  const updateQty = (id, delta) => {
    setCart(
      cart
        .map((c) => {
          if (c.item_id === id) {
            const newQ = c.quantity + delta;
            return newQ > 0 ? { ...c, quantity: newQ } : null;
          }
          return c;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (id) => {
    setCart(cart.filter((c) => c.item_id !== id));
  };

  const subtotal = cart.reduce((acc, c) => acc + c.quantity * c.unit_price, 0);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  const handleCheckout = async () => {
    if (!shift) {
      setError('Please open a cashier shift before checking out.');
      return;
    }
    if (cart.length === 0) {
      setError('Cart is empty.');
      return;
    }

    setCheckoutLoading(true);
    setError('');
    try {
      const tender = Number(tenderedAmount) || total;
      const res = await posApi.checkout({
        shift_id: shift._id,
        customer_name: 'POS Walk-in Customer',
        items: cart,
        payments: [{ method: paymentMethod, amount: total }],
        tendered_amount: tender
      });

      setReceipt(res.data);
      setCart([]);
      setTenderedAmount('');
      loadShift();
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const filteredItems = items.filter(
    (i) =>
      i.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.item_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Shift Status Banner */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${shift ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center space-x-2">
              <span>Cashier Shift Status:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                shift ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {shift ? shift.shift_number : 'NO ACTIVE SHIFT'}
              </span>
            </div>
            {shift && (
              <div className="text-[11px] text-slate-400 mt-0.5 flex space-x-4">
                <span>Float: ₹{Number(shift.opening_float || 0).toFixed(2)}</span>
                <span>Cash Sales: ₹{Number(shift.total_cash_sales || 0).toFixed(2)}</span>
                <span>Card/UPI: ₹{(Number(shift.total_card_sales || 0) + Number(shift.total_upi_sales || 0)).toFixed(2)}</span>
                <span>Tx Count: {shift.transaction_count || 0}</span>
              </div>
            )}
          </div>
        </div>

        <div>
          {!shift ? (
            <button
              onClick={() => setShowOpenShift(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
            >
              Open Register Shift
            </button>
          ) : (
            <button
              onClick={() => setShowCloseShift(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white font-semibold text-xs transition"
            >
              Close Shift & Reconcile
            </button>
          )}
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

      {/* POS Terminal Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Product Selection */}
        <div className="col-span-7 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search products by SKU or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 max-h-[550px] overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-slate-500 text-xs">
                No stock items found in this company.
              </div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item._id}
                  onClick={() => addToCart(item)}
                  className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-brand-500/50 rounded-xl text-left transition flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-mono text-brand-400">{item.item_code}</span>
                    <div className="text-xs font-semibold text-white mt-1 line-clamp-2">{item.item_name}</div>
                  </div>
                  <div className="text-xs font-bold text-emerald-400 mt-2 font-mono">
                    ₹{Number(item.standard_selling_price || 0).toFixed(2)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Cart & Tender */}
        <div className="col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-[600px]">
          <div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-brand-400" />
                <span>Current Order Cart ({cart.length})</span>
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-rose-400 hover:text-rose-300 text-[11px] font-semibold"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="space-y-2 mt-3 overflow-y-auto max-h-[280px]">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  Cart is empty. Tap items on the left to add.
                </div>
              ) : (
                cart.map((c) => (
                  <div key={c.item_id} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div className="max-w-[140px]">
                      <div className="text-xs font-semibold text-white truncate">{c.item_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">₹{c.unit_price} each</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateQty(c.item_id, -1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold text-white w-5 text-center">{c.quantity}</span>
                      <button
                        onClick={() => updateQty(c.item_id, 1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <div className="text-xs font-mono font-bold text-white ml-2">
                        ₹{(c.quantity * c.unit_price).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tender & Summary */}
          <div className="border-t border-slate-800 pt-3 space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>GST (18%)</span>
                <span className="font-mono text-emerald-400">₹{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                <span>Grand Total</span>
                <span className="font-mono text-emerald-400">₹{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPaymentMethod('CASH')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                  paymentMethod === 'CASH' ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Cash</span>
              </button>
              <button
                onClick={() => setPaymentMethod('CARD')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                  paymentMethod === 'CARD' ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Card</span>
              </button>
              <button
                onClick={() => setPaymentMethod('UPI')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition ${
                  paymentMethod === 'UPI' ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>UPI</span>
              </button>
            </div>

            {paymentMethod === 'CASH' && (
              <input
                type="number"
                placeholder={`Cash Tendered (₹${total.toFixed(0)})`}
                value={tenderedAmount}
                onChange={(e) => setTenderedAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white font-mono text-right"
              />
            )}

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || cart.length === 0}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition"
            >
              {checkoutLoading ? 'Processing Checkout...' : `Complete Sale (₹${total.toFixed(2)})`}
            </button>
          </div>
        </div>
      </div>

      {/* Shift Open Modal */}
      {showOpenShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Open Cashier Shift</h3>
            <form onSubmit={handleOpenShift} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Opening Cash Float (₹)</label>
                <input
                  type="number"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenShift(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Confirm & Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Close Modal */}
      {showCloseShift && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Close Shift & Reconcile Cash</h3>
            <div className="p-3 bg-slate-950 rounded-lg text-xs space-y-1 text-slate-300 font-mono">
              <div>Expected Drawer Cash: ₹{Number(shift?.closing_cash_expected || 0).toFixed(2)}</div>
            </div>
            <form onSubmit={handleCloseShift} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Actual Counted Cash (₹)</label>
                <input
                  type="number"
                  value={closingActual}
                  onChange={(e) => setClosingActual(e.target.value)}
                  placeholder="Enter physical cash in drawer"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseShift(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  Close & Reconcile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printed Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-6 space-y-4 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Transaction Completed!</h3>
            <div className="text-xs text-slate-400 font-mono">
              Invoice #{receipt.document_number}
            </div>

            <div className="p-3 bg-slate-950 rounded-lg text-xs space-y-1.5 text-left font-mono">
              <div className="flex justify-between text-slate-300">
                <span>Total Amount:</span>
                <span className="font-bold text-white">₹{Number(receipt.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tendered:</span>
                <span>₹{Number(receipt.tendered_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800 pt-1">
                <span>Change Due:</span>
                <span>₹{Number(receipt.change_amount).toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setReceipt(null)}
              className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition"
            >
              Done / Next Customer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
