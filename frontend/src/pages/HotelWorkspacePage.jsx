import React, { useState, useEffect } from 'react';
import { hotelApi } from '../services/api';
import {
  Building,
  BedDouble,
  CalendarCheck,
  Plus,
  RefreshCw,
  Moon,
  DollarSign,
  TrendingUp,
  UserCheck,
  LogOut,
  Receipt,
  AlertCircle
} from 'lucide-react';

export default function HotelWorkspacePage() {
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'reservations' | 'night_audit'
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showResModal, setShowResModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showFolioModal, setShowFolioModal] = useState(false);
  const [activeFolio, setActiveFolio] = useState(null);

  // New Reservation Form
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState('');
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkOutDate, setCheckOutDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [ratePerNight, setRatePerNight] = useState(3500);

  // Night Audit State
  const [nightAuditLoading, setNightAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [roomRes, typeRes, resRes, metricRes] = await Promise.all([
        hotelApi.getRooms(),
        hotelApi.getRoomTypes(),
        hotelApi.getReservations(),
        hotelApi.getMetrics()
      ]);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : (roomRes.data?.rooms || []));
      setRoomTypes(Array.isArray(typeRes.data) ? typeRes.data : (typeRes.data?.room_types || []));
      setReservations(Array.isArray(resRes.data) ? resRes.data : (resRes.data?.reservations || []));
      setMetrics(metricRes.data || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    try {
      await hotelApi.createReservation({
        guest_name: guestName,
        guest_phone: guestPhone,
        room_type_id: selectedRoomType,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        rate_per_night: Number(ratePerNight)
      });
      setShowResModal(false);
      setSuccess(`Reservation created for ${guestName}`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCheckIn = async (res) => {
    const cleanRoom = rooms.find((r) => r.status === 'CLEAN');
    if (!cleanRoom) {
      setError('No clean rooms available to assign for check-in.');
      return;
    }

    try {
      await hotelApi.checkIn({
        reservation_id: res._id,
        room_id: cleanRoom._id
      });
      setSuccess(`Checked in ${res.guest_name} into Room ${cleanRoom.room_number}. Folio created.`);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleViewFolio = async (resId) => {
    try {
      const res = await hotelApi.getFolio(resId);
      setActiveFolio(res.data);
      setShowFolioModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCheckOut = async (resId) => {
    if (!window.confirm('Check out guest and settle guest folio?')) return;
    try {
      const res = await hotelApi.checkOut({
        reservation_id: resId,
        settlement_method: 'CASH'
      });
      setSuccess(`Guest checked out! Invoice ${res.data.commercial_document.document_number} posted.`);
      setShowFolioModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRunNightAudit = async () => {
    if (!window.confirm('Run Night Audit for today? This will post nightly room charges and record room revenue.')) return;
    setNightAuditLoading(true);
    try {
      const res = await hotelApi.runNightAudit({});
      setAuditResult(res.data);
      setSuccess(`Night audit completed! Processed: ${res.data.processed_reservations}, Skipped: ${res.data.skipped_reservations}, Revenue: ₹${res.data.total_room_revenue}`);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setNightAuditLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Building className="w-5 h-5 text-indigo-400" />
            <span>Hotel & Hospitality Property Management (PMS)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Room Inventory, Guest Folios, Idempotent Night Audit, and RevPAR Metrics.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowResModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Reservation</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Occupancy Rate</span>
            <div className="text-xl font-bold text-white mt-1">{metrics.occupancy_rate_pct}%</div>
            <span className="text-[10px] text-slate-500">{metrics.occupied_rooms} of {metrics.total_rooms} Rooms Occupied</span>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Average Daily Rate (ADR)</span>
            <div className="text-xl font-bold text-emerald-400 mt-1">₹{metrics.adr.toFixed(2)}</div>
            <span className="text-[10px] text-slate-500">Per occupied room</span>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">RevPAR</span>
            <div className="text-xl font-bold text-indigo-400 mt-1">₹{metrics.rev_par.toFixed(2)}</div>
            <span className="text-[10px] text-slate-500">Per available room</span>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Monthly Room Revenue</span>
            <div className="text-xl font-bold text-brand-400 mt-1">₹{metrics.total_month_revenue.toFixed(2)}</div>
            <span className="text-[10px] text-slate-500">From guest folios</span>
          </div>
        </div>
      )}

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
          onClick={() => setActiveTab('rooms')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'rooms' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BedDouble className="w-4 h-4" />
          <span>Room Grid & Housekeeping</span>
        </button>
        <button
          onClick={() => setActiveTab('reservations')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'reservations' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Reservations & Folios</span>
        </button>
        <button
          onClick={() => setActiveTab('night_audit')}
          className={`pb-2.5 flex items-center space-x-2 transition ${
            activeTab === 'night_audit' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Moon className="w-4 h-4" />
          <span>Night Audit</span>
        </button>
      </div>

      {/* TAB 1: Rooms */}
      {activeTab === 'rooms' && (
        <div className="grid grid-cols-4 gap-4">
          {rooms.length === 0 ? (
            <div className="col-span-4 text-center py-12 text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
              No rooms found. Seed or create rooms to see live occupancy.
            </div>
          ) : (
            rooms.map((room) => (
              <div
                key={room._id}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-base font-bold text-white font-mono">Room {room.room_number}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                        room.status === 'OCCUPIED'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : room.status === 'CLEAN'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {room.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {room.room_type_id?.type_name || 'Standard'} (Floor {room.floor})
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Reservations */}
      {activeTab === 'reservations' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <th className="p-3">Reservation #</th>
                <th className="p-3">Guest Name</th>
                <th className="p-3">Dates</th>
                <th className="p-3 text-right">Rate/Night</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-slate-500">
                    No reservations booked.
                  </td>
                </tr>
              ) : (
                reservations.map((res) => (
                  <tr key={res._id} className="hover:bg-slate-850/50 transition">
                    <td className="p-3 font-mono font-semibold text-indigo-400">{res.reservation_number}</td>
                    <td className="p-3 font-medium">{res.guest_name}</td>
                    <td className="p-3 text-slate-400">
                      {new Date(res.check_in_date).toLocaleDateString()} → {new Date(res.check_out_date).toLocaleDateString()} ({res.nights}n)
                    </td>
                    <td className="p-3 text-right font-mono">₹{res.rate_per_night}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          res.status === 'CHECKED_IN'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : res.status === 'CHECKED_OUT'
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}
                      >
                        {res.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {res.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleCheckIn(res)}
                          className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px]"
                        >
                          Check In
                        </button>
                      )}
                      {res.status === 'CHECKED_IN' && (
                        <>
                          <button
                            onClick={() => handleViewFolio(res._id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                          >
                            Folio
                          </button>
                          <button
                            onClick={() => handleCheckOut(res._id)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px]"
                          >
                            Check Out
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Night Audit */}
      {activeTab === 'night_audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 max-w-2xl">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>Idempotent Nightly Room Charge & Revenue Audit</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Posts the standard nightly room rate to all checked-in guest folios and generates the daily room revenue journal entry (DR Guest Ledger, CR Room Revenue). Safe to re-run: duplicate audit postings for the same date are rejected.
            </p>
          </div>

          <button
            onClick={handleRunNightAudit}
            disabled={nightAuditLoading}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition flex items-center space-x-2"
          >
            <Moon className="w-4 h-4" />
            <span>{nightAuditLoading ? 'Executing Night Audit...' : 'Run Night Audit for Today'}</span>
          </button>

          {auditResult && (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="text-emerald-400 font-semibold">Night Audit Execution Completed</div>
              <div className="font-mono text-slate-300">
                Audit Date: {auditResult.audit_date}
              </div>
              <div className="font-mono text-slate-300">
                Processed Checked-in Reservations: {auditResult.processed_reservations}
              </div>
              <div className="font-mono text-slate-300">
                Skipped Duplicates: {auditResult.skipped_reservations}
              </div>
              <div className="font-mono text-emerald-400 font-bold">
                Total Revenue Recognized: ₹{auditResult.total_room_revenue}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Reservation Modal */}
      {showResModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">New Room Reservation</h3>
            <form onSubmit={handleCreateReservation} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Guest Full Name</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Guest Phone</label>
                <input
                  type="text"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Room Type</label>
                <select
                  value={selectedRoomType}
                  onChange={(e) => setSelectedRoomType(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="">-- Choose Category --</option>
                  {roomTypes.map((rt) => (
                    <option key={rt._id} value={rt._id}>
                      {rt.type_name} (₹{rt.base_rate}/night)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Check-in Date</label>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Check-out Date</label>
                  <input
                    type="date"
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Rate Per Night (₹)</label>
                <input
                  type="number"
                  value={ratePerNight}
                  onChange={(e) => setRatePerNight(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Guest Folio Modal */}
      {showFolioModal && activeFolio && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white">Guest Folio ({activeFolio.folio_number})</h3>
                <span className="text-xs text-slate-400">{activeFolio.guest_name}</span>
              </div>
              <button onClick={() => setShowFolioModal(false)} className="text-slate-400 font-bold">×</button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {activeFolio.charges.map((c, idx) => (
                <div key={idx} className="p-2.5 bg-slate-950 rounded flex justify-between items-center text-xs">
                  <div>
                    <span className="text-white font-semibold">{c.description}</span>
                    <span className="text-[10px] text-slate-500 block">{c.charge_type}</span>
                  </div>
                  <span className="font-mono font-bold text-white">₹{Number(c.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-between items-center text-xs font-mono">
              <span className="text-slate-300">Total Charges:</span>
              <span className="text-emerald-400 font-bold text-sm">₹{Number(activeFolio.total_charges).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
