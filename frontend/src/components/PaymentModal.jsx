import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  DollarSign,
  CreditCard,
  CheckCircle,
  Copy,
  Printer,
  Receipt,
  X,
  Smartphone,
  Check
} from 'lucide-react';

/**
 * Enterprise SaaS Dynamic Payment & Dynamic UPI QR Settlement Modal
 */
export default function PaymentModal({
  isOpen = false,
  onClose,
  onConfirmPayment,
  amount = 0,
  invoiceNumber = 'DRAFT',
  customerName = 'Walk-in Customer',
  companyName = 'Pizza Palace Enterprises Ltd',
  upiId = 'pizzapalace@icici',
  loading = false
}) {
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' | 'CASH' | 'CARD'
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [tenderedCash, setTenderedCash] = useState(amount);
  const [cardRef, setCardRef] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate real Dynamic UPI QR string compliant with NPCI specification:
  // upi://pay?pa={VPA}&pn={NAME}&am={AMOUNT}&tr={REF}&tn={NOTE}&cu=INR
  useEffect(() => {
    if (!isOpen || amount <= 0) return;

    setTenderedCash(Math.ceil(amount));

    const cleanCompany = encodeURIComponent(companyName.replace(/[^a-zA-Z0-9 ]/g, ''));
    const note = encodeURIComponent(`Bill ${invoiceNumber}`);
    const upiPayload = `upi://pay?pa=${upiId}&pn=${cleanCompany}&am=${Number(amount).toFixed(2)}&tr=${invoiceNumber}&tn=${note}&cu=INR`;

    QRCode.toDataURL(upiPayload, {
      width: 240,
      margin: 1.5,
      color: {
        dark: '#0f172a', // slate-900
        light: '#ffffff'
      }
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('QR code generation failed:', err));
  }, [isOpen, amount, invoiceNumber, companyName, upiId]);

  if (!isOpen) return null;

  const totalAmount = Number(amount) || 0;
  const cashGiven = Number(tenderedCash) || 0;
  const changeToReturn = Math.max(0, cashGiven - totalAmount);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onConfirmPayment) {
      onConfirmPayment({
        method: paymentMethod,
        amount: totalAmount,
        tenderedAmount: paymentMethod === 'CASH' ? cashGiven : totalAmount,
        changeAmount: paymentMethod === 'CASH' ? changeToReturn : 0,
        upiRef: paymentMethod === 'UPI' ? (upiRef || `UPI-${Date.now().toString().slice(-6)}`) : null,
        cardRef: paymentMethod === 'CARD' ? cardRef : null
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[80]">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Point of Sale & Billing
            </span>
            <h3 className="text-base font-bold text-white mt-1">Collect Payment & Settle Invoice</h3>
            <p className="text-xs text-slate-400">
              {customerName} • Ref: <span className="font-mono text-slate-300 font-semibold">{invoiceNumber}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bill Total Display Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Total Bill Amount</span>
            <span className="text-xs text-slate-500">Includes all GST & Taxes</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black font-mono text-emerald-400">
              ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Payment Method Switcher */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod('UPI')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              paymentMethod === 'UPI'
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>UPI QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod('CASH')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              paymentMethod === 'CASH'
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Cash Tender</span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod('CARD')}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
              paymentMethod === 'CARD'
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Card / EDC</span>
          </button>
        </div>

        {/* Tab 1: Dynamic UPI QR Code */}
        {paymentMethod === 'UPI' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center space-y-3">
            <div className="text-center">
              <span className="text-xs font-bold text-white block">Scan & Pay via any UPI App</span>
              <span className="text-[10px] text-slate-400">GPay, PhonePe, Paytm, BHIM, Cred, Amazon Pay</span>
            </div>

            {/* Dynamic QR Code Canvas Image */}
            <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-700/80">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Scan Dynamic UPI QR Code"
                  className="w-44 h-44 object-contain rounded"
                />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs font-mono">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="flex items-center justify-between w-full text-[11px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono">
              <span className="text-slate-400 truncate">VPA: {upiId}</span>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="text-emerald-400 hover:text-emerald-300 ml-2 shrink-0 flex items-center space-x-1 font-sans text-[10px]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="w-full">
              <input
                type="text"
                placeholder="UPI UTR / Bank Reference (Optional)"
                value={upiRef}
                onChange={(e) => setUpiRef(e.target.value)}
                className="w-full bg-slate-900 border border-slate-750 rounded-lg p-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Cash Tender & Change Calculation */}
        {paymentMethod === 'CASH' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Cash Tendered by Customer (₹)
              </label>
              <input
                type="number"
                step="any"
                min={totalAmount}
                value={tenderedCash}
                onChange={(e) => setTenderedCash(e.target.value)}
                className="w-full bg-slate-900 border border-slate-750 rounded-lg p-2.5 text-base font-bold font-mono text-white text-right focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Quick denomination pills */}
            <div className="flex flex-wrap gap-1.5">
              {[totalAmount, Math.ceil(totalAmount / 100) * 100, 500, 1000, 2000].filter((v, i, arr) => v >= totalAmount && arr.indexOf(v) === i).map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setTenderedCash(amt)}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-750 text-slate-300 rounded text-[11px] font-mono transition"
                >
                  ₹{amt.toFixed(0)}
                </button>
              ))}
            </div>

            {/* Change to Return Banner */}
            <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
              <div>
                <span className="text-xs text-slate-400 block font-medium">Change to Return to Customer:</span>
                <span className="text-[10px] text-slate-500">Drawer Balance Adjusted</span>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold font-mono text-cyan-400">
                  ₹{changeToReturn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Card / POS Terminal */}
        {paymentMethod === 'CARD' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-center py-2">
              <CreditCard className="w-8 h-8 text-brand-400 mx-auto mb-1" />
              <span className="text-xs font-bold text-white block">Swipe / Tap on POS EDC Machine</span>
              <span className="text-[10px] text-slate-400">Visa, MasterCard, RuPay, Amex</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Bank Auth Code / Last 4 Digits
              </label>
              <input
                type="text"
                placeholder="e.g. AUTH-98234 or 4012"
                value={cardRef}
                onChange={(e) => setCardRef(e.target.value)}
                className="w-full bg-slate-900 border border-slate-750 rounded-lg p-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || (paymentMethod === 'CASH' && cashGiven < totalAmount)}
            className="w-2/3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? 'Posting & Settling...' : `Verify & Settle (₹${totalAmount.toFixed(2)})`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
