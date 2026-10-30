import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  UtensilsCrossed,
  Pizza,
  ShoppingBag,
  CreditCard,
  QrCode,
  CheckCircle2,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  RefreshCw,
  Clock,
  Sparkles,
  Info,
  ChevronRight,
  Phone,
  User,
  Mail,
  MapPin,
  X,
  Printer
} from 'lucide-react';
import { kioskApi } from '../services/api';

export default function KioskOrderingPage() {
  // Determine slugs from pathname
  // e.g. /kiosk/DOMINOS/OUTLET-01 or /order/table/abcd123
  const pathname = window.location.pathname;
  const isTableQr = pathname.startsWith('/order/table/');

  let defaultTenantSlug = 'TEST-TENANT';
  let defaultOutletSlug = 'default';
  let tableQrToken = '';

  if (isTableQr) {
    tableQrToken = pathname.replace('/order/table/', '').split('/')[0];
  } else if (pathname.startsWith('/kiosk/')) {
    const parts = pathname.replace('/kiosk/', '').split('/').filter(Boolean);
    if (parts.length >= 1) defaultTenantSlug = parts[0];
    if (parts.length >= 2) defaultOutletSlug = parts[1];
  }

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catalogData, setCatalogData] = useState(null);

  // Workflow State: 'INTAKE' | 'MENU' | 'CART' | 'PAYMENT' | 'CONFIRMED'
  const [step, setStep] = useState('INTAKE');
  const [orderType, setOrderType] = useState('DINE_IN'); // 'DINE_IN' | 'TAKEAWAY'

  // Customer Intake Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Cart
  const [cart, setCart] = useState([]);

  // Active Category Filter
  const [activeCategory, setActiveCategory] = useState('ALL');

  // Customization Modal State
  const [customizingItem, setCustomizingItem] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState('STANDARD');
  const [excludedIngredients, setExcludedIngredients] = useState([]);
  const [selectedModifiers, setSelectedModifiers] = useState([]);
  const [customItemQuantity, setCustomItemQuantity] = useState(1);

  // Completed Order State
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch Catalog Data on Mount
  useEffect(() => {
    fetchCatalog();
  }, [pathname]);

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (isTableQr && tableQrToken) {
        data = await kioskApi.getTableCatalog(tableQrToken);
      } else {
        data = await kioskApi.getCatalog(defaultTenantSlug, defaultOutletSlug);
      }
      setCatalogData(data);
    } catch (err) {
      console.error('Failed to load kiosk catalog:', err);
      setError(err.message || 'Failed to connect to restaurant kiosk server.');
    } finally {
      setLoading(false);
    }
  };

  // Open Customization Modal
  const openCustomizer = (item) => {
    setCustomizingItem(item);
    setSelectedVariant('STANDARD');
    setExcludedIngredients([]);
    setSelectedModifiers([]);
    setCustomItemQuantity(1);
  };

  // Toggle Ingredient Removal
  const toggleExcludeIngredient = (ingredientItemId) => {
    setExcludedIngredients(prev =>
      prev.includes(ingredientItemId)
        ? prev.filter(id => id !== ingredientItemId)
        : [...prev, ingredientItemId]
    );
  };

  // Toggle Modifier Add-on
  const toggleModifier = (modGroup, option) => {
    const existingIndex = selectedModifiers.findIndex(
      m => String(m.option_id) === String(option._id || option.name)
    );

    if (existingIndex >= 0) {
      setSelectedModifiers(prev => prev.filter((_, idx) => idx !== existingIndex));
    } else {
      setSelectedModifiers(prev => [
        ...prev,
        {
          modifier_group_id: modGroup._id,
          option_id: option._id || option.name,
          name: option.name,
          price_adjustment: Number(option.price_adjustment || 0),
          quantity: 1,
          ingredient_item_id: option.ingredient_item_id,
          quantity_to_consume: option.quantity_to_consume
        }
      ]);
    }
  };

  // Calculate customized item price
  const calculateCustomPrice = () => {
    if (!customizingItem) return 0;
    let price = Number(customizingItem.standard_selling_price || 0);

    // Variant adjustment
    if (selectedVariant !== 'STANDARD' && catalogData?.variants) {
      const v = catalogData.variants.find(
        varItem => String(varItem.base_item_id) === String(customizingItem._id) && varItem.variant_name === selectedVariant
      );
      if (v && v.price_adjustment) price += Number(v.price_adjustment);
    }

    // Modifiers adjustment
    for (const mod of selectedModifiers) {
      price += Number(mod.price_adjustment || 0);
    }

    return price;
  };

  // Add customized dish to Cart
  const handleAddToCart = () => {
    if (!customizingItem) return;
    const unitPrice = calculateCustomPrice();

    const cartItem = {
      cartId: `${customizingItem._id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item_id: customizingItem._id,
      item_name: customizingItem.item_name,
      variant_name: selectedVariant,
      excluded_ingredients: excludedIngredients,
      selected_modifiers: selectedModifiers,
      unit_price: unitPrice,
      quantity: customItemQuantity,
      line_total: Number((unitPrice * customItemQuantity).toFixed(2))
    };

    setCart(prev => [...prev, cartItem]);
    setCustomizingItem(null);
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId));
  };

  // Cart Totals
  const subtotal = Number(cart.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));
  const taxRate = 0.05; // 5% GST restaurant rate
  const taxAmount = Number((subtotal * taxRate).toFixed(2));
  const grandTotal = Number((subtotal + taxAmount).toFixed(2));

  // Submit Order & Generate Dynamic UPI QR
  const handleProceedToPayment = async () => {
    if (cart.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        customer_name: customerName || 'Kiosk Guest',
        customer_phone: customerPhone || '',
        customer_email: customerEmail || '',
        customer_address: customerAddress || '',
        order_type: orderType,
        items: cart.map(item => ({
          item_id: item.item_id,
          item_name: item.item_name,
          variant_name: item.variant_name,
          excluded_ingredients: item.excluded_ingredients,
          selected_modifiers: item.selected_modifiers,
          quantity: item.quantity,
          unit_price: item.unit_price
        })),
        payment_details: {
          method: 'UPI_DYNAMIC_QR',
          status: 'PENDING'
        }
      };

      let result;
      if (isTableQr && tableQrToken) {
        result = await kioskApi.submitTableOrder(tableQrToken, payload);
      } else {
        result = await kioskApi.submitOrder(
          catalogData?.tenant?.tenant_code || defaultTenantSlug,
          catalogData?.outlet?.slug || defaultOutletSlug,
          payload
        );
      }

      setConfirmedOrder(result);

      // Generate Dynamic UPI QR Image
      const qrPayload = result.upi_payment_string || `upi://pay?pa=restaurant@okaxis&pn=TallyVeridex&am=${grandTotal}&cu=INR&tn=Order${result.order?.order_number}`;
      const url = await QRCode.toDataURL(qrPayload, {
        width: 260,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      setQrCodeDataUrl(url);

      setStep('PAYMENT');
    } catch (err) {
      console.error('Order submission error:', err);
      setError(err.message || 'Failed to place order.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishPayment = () => {
    setStep('CONFIRMED');
  };

  const handleStartNewOrder = () => {
    setCart([]);
    setConfirmedOrder(null);
    setQrCodeDataUrl('');
    setStep('INTAKE');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold tracking-tight">Connecting to Domino's-Style Kiosk...</h2>
        <p className="text-slate-400 text-sm mt-1">Loading restaurant configuration, menu & live pricing engine...</p>
      </div>
    );
  }

  if (error && !catalogData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center shadow-2xl">
          <UtensilsCrossed className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-red-200">Kiosk Offline or Outlet Not Found</h2>
          <p className="text-slate-400 text-sm mt-2">{error}</p>
          <button
            onClick={fetchCatalog}
            className="mt-5 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center mx-auto space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Reconnecting</span>
          </button>
        </div>
      </div>
    );
  }

  const { outlet, config, menu_items = [], modifier_groups = [], recipes = [] } = catalogData || {};
  const customerPolicy = config?.customer_info_policy || { name: 'REQUIRED', phone: 'REQUIRED', email: 'OPTIONAL', address: 'OPTIONAL' };

  // Filter menu items by category
  const filteredItems = activeCategory === 'ALL'
    ? menu_items
    : menu_items.filter(item => {
        const catName = item.stock_group_id?.group_name || '';
        return catName.toUpperCase().includes(activeCategory.toUpperCase());
      });

  // Get recipe for currently customizing item
  const activeRecipe = customizingItem
    ? recipes.find(r => String(r.menu_item_id) === String(customizingItem._id))
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Kiosk Touch Header */}
      <header className="h-18 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
            <Pizza className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-extrabold text-base md:text-lg tracking-tight text-white">
                {outlet?.name || 'Gourmet Pizza & Diner'}
              </h1>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono uppercase">
                {config?.operating_mode || 'QSR KIOSK'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {outlet?.address?.city || 'Main Outlet'} • Self-Service Ordering Screen
            </p>
          </div>
        </div>

        {/* Dine-In / Takeaway Toggle */}
        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setOrderType('DINE_IN')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              orderType === 'DINE_IN'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Eat Here</span>
          </button>
          <button
            type="button"
            onClick={() => setOrderType('TAKEAWAY')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              orderType === 'TAKEAWAY'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>
        </div>

        {/* Step Indicator / Cart Summary Pill */}
        <div className="flex items-center space-x-3">
          {step === 'MENU' && (
            <button
              onClick={() => setStep('CART')}
              className="relative px-4 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 flex items-center space-x-2 transition"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>My Order ({cart.length})</span>
              <span className="bg-black/40 px-2 py-0.5 rounded-lg font-mono">
                ₹{grandTotal.toFixed(2)}
              </span>
            </button>
          )}

          <button
            onClick={handleStartNewOrder}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Reset Kiosk Session"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Kiosk Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* ========================================================= */}
        {/* STEP 1: CUSTOMER INTAKE SCREEN                            */}
        {/* ========================================================= */}
        {step === 'INTAKE' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mx-auto">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white">Welcome! Let's Order</h2>
                <p className="text-slate-400 text-xs">
                  Please provide your contact details to receive live kitchen updates and receipt.
                </p>
              </div>

              <div className="space-y-4">
                {customerPolicy.name !== 'HIDDEN' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Your Full Name</span>
                      </span>
                      <span className={`text-[10px] ${customerPolicy.name === 'REQUIRED' ? 'text-amber-400' : 'text-slate-500'}`}>
                        {customerPolicy.name === 'REQUIRED' ? 'Required' : 'Optional'}
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                )}

                {customerPolicy.phone !== 'HIDDEN' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>Mobile Phone (for SMS updates)</span>
                      </span>
                      <span className={`text-[10px] ${customerPolicy.phone === 'REQUIRED' ? 'text-amber-400' : 'text-slate-500'}`}>
                        {customerPolicy.phone === 'REQUIRED' ? 'Required' : 'Optional'}
                      </span>
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                )}

                {customerPolicy.email !== 'HIDDEN' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>Email Address (for e-receipt)</span>
                      </span>
                      <span className={`text-[10px] ${customerPolicy.email === 'REQUIRED' ? 'text-amber-400' : 'text-slate-500'}`}>
                        {customerPolicy.email === 'REQUIRED' ? 'Required' : 'Optional'}
                      </span>
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. customer@example.com"
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                )}

                {customerPolicy.address !== 'HIDDEN' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>Address / Table Landmark</span>
                      </span>
                      <span className={`text-[10px] ${customerPolicy.address === 'REQUIRED' ? 'text-amber-400' : 'text-slate-500'}`}>
                        {customerPolicy.address === 'REQUIRED' ? 'Required' : 'Optional'}
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Table 4 / Sector 18"
                      value={customerAddress}
                      onChange={e => setCustomerAddress(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (customerPolicy.name === 'REQUIRED' && !customerName.trim()) {
                      alert('Please enter your name to continue.');
                      return;
                    }
                    if (customerPolicy.phone === 'REQUIRED' && !customerPhone.trim()) {
                      alert('Please enter your phone number to continue.');
                      return;
                    }
                    setStep('MENU');
                  }}
                  className="w-full py-4 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black rounded-2xl shadow-xl shadow-amber-500/20 text-sm flex items-center justify-center space-x-2 transition cursor-pointer"
                >
                  <span>Start Customizing Your Order</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 2: INTERACTIVE VISUAL MENU                           */}
        {/* ========================================================= */}
        {step === 'MENU' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Category Sidebar */}
            <div className="w-full md:w-56 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 p-3 flex md:flex-col space-x-2 md:space-x-0 md:space-y-2 overflow-x-auto md:overflow-y-auto">
              {[
                { id: 'ALL', label: 'All Items', icon: Sparkles },
                { id: 'PIZZA', label: 'Pizzas', icon: Pizza },
                { id: 'BURGER', label: 'Sides & Fast Food', icon: ShoppingBag },
                { id: 'BEVERAGE', label: 'Drinks & Shakes', icon: UtensilsCrossed }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left shrink-0 ${
                    activeCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <cat.icon className="w-4 h-4" />
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredItems.map(item => {
                  const hasRecipe = recipes.some(r => String(r.menu_item_id) === String(item._id));
                  return (
                    <div
                      key={item._id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition shadow-lg group"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <h3 className="font-bold text-white text-base group-hover:text-amber-400 transition">
                            {item.item_name}
                          </h3>
                          <span className="text-sm font-extrabold text-amber-400 font-mono">
                            ₹{Number(item.standard_selling_price || 0).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-1.5 line-clamp-2">
                          {item.description || 'Freshly prepared with authentic ingredients.'}
                        </p>
                        {hasRecipe && (
                          <div className="mt-2.5 flex items-center space-x-1.5 text-[11px] text-emerald-400">
                            <Sparkles className="w-3 h-3" />
                            <span>Customizable (Ingredients & Add-ons)</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          {item.stock_group_id?.group_name || 'Kitchen Item'}
                        </span>
                        <button
                          type="button"
                          onClick={() => openCustomizer(item)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-amber-500/20"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Customize & Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Mini Cart Drawer (on large screens) */}
            <div className="w-80 bg-slate-900 border-l border-slate-800 p-5 hidden xl:flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-sm text-white mb-4 flex items-center justify-between">
                  <span>Current Tray</span>
                  <span className="text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded-full font-mono">
                    {cart.length} items
                  </span>
                </h3>

                <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Your tray is empty. Tap any dish to customize!
                    </div>
                  ) : (
                    cart.map(c => (
                      <div key={c.cartId} className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-3 text-xs">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-bold text-white">{c.item_name}</span>
                            {c.variant_name !== 'STANDARD' && (
                              <span className="ml-1 text-[10px] text-amber-400 font-mono">({c.variant_name})</span>
                            )}
                          </div>
                          <span className="font-mono text-white font-bold">₹{c.line_total.toFixed(2)}</span>
                        </div>

                        {/* Excluded Ingredients */}
                        {c.excluded_ingredients?.length > 0 && (
                          <div className="text-[10px] text-red-400 mt-1 flex flex-wrap gap-1">
                            {c.excluded_ingredients.map(ingId => (
                              <span key={ingId} className="bg-red-500/10 px-1 rounded line-through">
                                No {ingId?.item_name || 'Ingredient'}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Modifiers */}
                        {c.selected_modifiers?.length > 0 && (
                          <div className="text-[10px] text-emerald-400 mt-1 flex flex-wrap gap-1">
                            {c.selected_modifiers.map((m, idx) => (
                              <span key={idx} className="bg-emerald-500/10 px-1 rounded">
                                + {m.name} (₹{m.price_adjustment})
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between text-slate-400">
                          <span>Qty: {c.quantity}</span>
                          <button
                            onClick={() => removeFromCart(c.cartId)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {cart.length > 0 && (
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono text-white">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>GST (5%):</span>
                    <span className="font-mono text-white">₹{taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-amber-400">
                    <span>Grand Total:</span>
                    <span className="font-mono text-base">₹{grandTotal.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => setStep('CART')}
                    className="w-full py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-red-500/20 transition flex items-center justify-center space-x-1.5"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 3: FULL CART / REVIEW SCREEN                         */}
        {/* ========================================================= */}
        {step === 'CART' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex flex-col items-center">
            <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-xl font-black text-white">Review Your Order</h2>
                  <p className="text-xs text-slate-400">
                    Ordering for: <strong className="text-amber-400">{customerName || 'Guest'}</strong> • {orderType}
                  </p>
                </div>
                <button
                  onClick={() => setStep('MENU')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  + Add More Items
                </button>
              </div>

              <div className="space-y-4">
                {cart.map(c => (
                  <div key={c.cartId} className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">{c.item_name}</h4>
                      {c.variant_name !== 'STANDARD' && (
                        <p className="text-xs text-amber-400 font-semibold mt-0.5">Size/Crust: {c.variant_name}</p>
                      )}

                      {/* Exclusions Note */}
                      {c.excluded_ingredients?.length > 0 && (
                        <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg">
                          <strong>Customized:</strong> Excluded from recipe (no stock deduction).
                        </div>
                      )}

                      {/* Modifiers List */}
                      {c.selected_modifiers?.length > 0 && (
                        <div className="mt-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                          <strong>Add-ons:</strong> {c.selected_modifiers.map(m => `${m.name} (+₹${m.price_adjustment})`).join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="text-right space-y-2">
                      <div className="font-mono text-white font-black text-base">₹{c.line_total.toFixed(2)}</div>
                      <div className="text-xs text-slate-400">Qty: {c.quantity}</div>
                      <button
                        onClick={() => removeFromCart(c.cartId)}
                        className="text-red-400 hover:text-red-300 text-xs flex items-center space-x-1 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Summary */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-mono text-white">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>GST Supply of Food & Beverages (5%)</span>
                  <span className="font-mono text-white">₹{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-black text-amber-400 pt-2 border-t border-slate-800">
                  <span>Total Amount Payable</span>
                  <span className="font-mono text-lg">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Proceed Button */}
              <button
                type="button"
                onClick={handleProceedToPayment}
                disabled={submitting}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 font-black rounded-2xl shadow-xl shadow-green-500/20 text-sm flex items-center justify-center space-x-2 transition disabled:opacity-50"
              >
                {submitting ? (
                  <span>Generating Secure Dynamic QR...</span>
                ) : (
                  <>
                    <QrCode className="w-5 h-5" />
                    <span>Pay ₹{grandTotal.toFixed(2)} via Dynamic UPI QR</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 4: DYNAMIC NPCI UPI QR SCREEN                        */}
        {/* ========================================================= */}
        {step === 'PAYMENT' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex flex-col items-center justify-center">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
              <div>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-bold">
                  Order Registered #{confirmedOrder?.order?.order_number}
                </span>
                <h2 className="text-2xl font-black text-white mt-3">Scan & Pay via UPI</h2>
                <p className="text-slate-400 text-xs mt-1">
                  Scan using Google Pay, PhonePe, Paytm, or any UPI banking app
                </p>
              </div>

              {/* QR Image Box */}
              <div className="bg-white p-5 rounded-3xl shadow-xl inline-block mx-auto border-4 border-amber-500">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="NPCI Dynamic UPI QR" className="w-64 h-64 mx-auto" />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center text-slate-900 font-bold">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-400">Total Payable Amount</p>
                <div className="font-mono text-3xl font-black text-amber-400">
                  ₹{grandTotal.toFixed(2)}
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={handleFinishPayment}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-amber-500/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>I Have Completed Payment</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('CART')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel & Edit Order
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 5: TOKEN & ORDER CONFIRMATION SCREEN                */}
        {/* ========================================================= */}
        {step === 'CONFIRMED' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex flex-col items-center justify-center">
            <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-white">Order Received & Sent to Kitchen!</h2>
                <p className="text-slate-400 text-xs mt-1">
                  Your pizza is being freshly baked right now.
                </p>
              </div>

              {/* Large Pickup Token Box */}
              <div className="bg-slate-950 border-2 border-amber-500/50 rounded-2xl p-6 space-y-1">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  Your Pickup Token Number
                </span>
                <div className="text-5xl font-black text-white font-mono tracking-tight">
                  {confirmedOrder?.pickup_token || 'P-042'}
                </div>
                <p className="text-[11px] text-slate-400">
                  Please watch the customer display screen for your token.
                </p>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-4 text-left text-xs space-y-1.5 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Order Reference:</span>
                  <span className="font-mono text-white font-semibold">{confirmedOrder?.order?.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer:</span>
                  <span className="text-white">{customerName || 'Guest'} ({customerPhone || 'N/A'})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mode:</span>
                  <span className="text-amber-400 font-bold">{orderType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Paid:</span>
                  <span className="font-mono text-emerald-400 font-bold">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartNewOrder}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 rounded-xl text-xs font-black transition shadow-lg shadow-amber-500/20"
                >
                  Place Another Order
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* CUSTOMIZATION MODAL (DOMINO'S EXPERIENCE)                */}
      {/* ========================================================= */}
      {customizingItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black text-white">{customizingItem.item_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Customize your pizza ingredients and add-ons</p>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* 1. Crust / Size Variants */}
              {catalogData?.variants?.filter(v => String(v.base_item_id) === String(customizingItem._id)).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                    1. Choose Size or Crust
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVariant('STANDARD')}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition ${
                        selectedVariant === 'STANDARD'
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="font-bold">Standard Size</div>
                      <div className="text-[10px] text-slate-400">Included</div>
                    </button>
                    {catalogData.variants
                      .filter(v => String(v.base_item_id) === String(customizingItem._id))
                      .map(variant => (
                        <button
                          key={variant._id}
                          type="button"
                          onClick={() => setSelectedVariant(variant.variant_name)}
                          className={`p-3 rounded-xl border text-xs font-semibold text-left transition ${
                            selectedVariant === variant.variant_name
                              ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                              : 'bg-slate-800/60 border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="font-bold">{variant.variant_name}</div>
                          <div className="text-[10px] text-slate-400">
                            {variant.price_adjustment > 0 ? `+₹${variant.price_adjustment}` : 'No extra cost'}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* 2. Remove Ingredients (Customer exclusion) */}
              {activeRecipe && activeRecipe.ingredients && activeRecipe.ingredients.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      2. Remove Ingredients (Don't want Capsicum or Mushrooms?)
                    </h4>
                    <span className="text-[10px] text-slate-500">Tap to toggle</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {activeRecipe.ingredients.map(ing => {
                      const ingId = ing.ingredient_item_id?._id || ing.ingredient_item_id;
                      const ingName = ing.ingredient_item_id?.item_name || 'Ingredient';
                      const isExcluded = excludedIngredients.includes(ingId);

                      return (
                        <button
                          key={ingId}
                          type="button"
                          onClick={() => toggleExcludeIngredient(ingId)}
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition ${
                            isExcluded
                              ? 'bg-red-500/10 border-red-500/50 text-red-400 line-through'
                              : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <span>{ingName}</span>
                          <span className="text-[10px] font-mono">
                            {isExcluded ? '❌ Removed' : 'Included'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 bg-slate-800/40 p-2 rounded-lg border border-slate-800">
                    💡 <em>Notice:</em> Removed ingredients will not be added to your pizza, and will not be deducted from restaurant stock balances.
                  </p>
                </div>
              )}

              {/* 3. Add-ons & Extras (Modifier Groups) */}
              {modifier_groups && modifier_groups.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                    3. Add Extra Toppings & Cheese
                  </h4>
                  <div className="space-y-3">
                    {modifier_groups.map(group => (
                      <div key={group._id} className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl">
                        <span className="text-xs font-bold text-amber-400">{group.display_name}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {group.options?.map(opt => {
                            const isSelected = selectedModifiers.some(
                              m => String(m.option_id) === String(opt._id || opt.name)
                            );
                            return (
                              <button
                                key={opt._id || opt.name}
                                type="button"
                                onClick={() => toggleModifier(group, opt)}
                                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition ${
                                  isSelected
                                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                                    : 'bg-slate-800/70 border-slate-700/60 text-slate-300 hover:border-slate-600'
                                }`}
                              >
                                <span>{opt.name}</span>
                                <span className="font-mono text-xs">
                                  {opt.price_adjustment > 0 ? `+₹${opt.price_adjustment}` : 'Free'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer with Live Price & Add Button */}
            <div className="p-6 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Total Price:</span>
                <div className="font-mono text-2xl font-black text-amber-400">
                  ₹{(calculateCustomPrice() * customItemQuantity).toFixed(2)}
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center space-x-3 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
                <button
                  type="button"
                  onClick={() => setCustomItemQuantity(q => Math.max(1, q - 1))}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-sm text-white px-1">{customItemQuantity}</span>
                <button
                  type="button"
                  onClick={() => setCustomItemQuantity(q => q + 1)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition flex items-center space-x-1.5"
              >
                <span>Add to My Tray</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
