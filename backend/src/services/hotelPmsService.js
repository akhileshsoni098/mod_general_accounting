const mongoose = require('mongoose');
const {
  HotelRoomType,
  HotelRoom,
  HotelReservation,
  GuestFolio,
  FiscalPeriod,
  LedgerAccount
} = require('../models');
const { postJournalEntry } = require('./journalPostingService');
const commercialDocumentService = require('./commercialDocumentService');
const { postCommercialDocument } = require('./commercialPostingService');

class HotelPmsService {
  /**
   * Create or update room type
   */
  async createRoomType({ tenantId, companyId, typeCode, typeName, baseRate, maxOccupancy = 2, amenities = [] }) {
    return HotelRoomType.findOneAndUpdate(
      { company_id: companyId, type_code: typeCode.toUpperCase() },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          type_code: typeCode.toUpperCase(),
          type_name: typeName,
          base_rate: Number(baseRate),
          maxOccupancy: Number(maxOccupancy),
          amenities,
          is_active: true
        }
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Get all room types
   */
  async getRoomTypes(companyId) {
    return HotelRoomType.find({ company_id: companyId, is_active: true });
  }

  /**
   * Create or update hotel room
   */
  async createRoom({ tenantId, companyId, roomNumber, roomTypeId, floor = '1' }) {
    return HotelRoom.findOneAndUpdate(
      { company_id: companyId, room_number: roomNumber.toUpperCase() },
      {
        $set: {
          tenant_id: tenantId,
          company_id: companyId,
          room_number: roomNumber.toUpperCase(),
          room_type_id: roomTypeId,
          floor,
          status: 'CLEAN'
        }
      },
      { upsert: true, new: true }
    ).populate('room_type_id');
  }

  /**
   * Get all rooms with room type details
   */
  async getRooms(companyId) {
    return HotelRoom.find({ company_id: companyId }).populate('room_type_id');
  }

  /**
   * Create a hotel reservation
   */
  async createReservation({
    tenantId,
    companyId,
    userId,
    guestName,
    guestEmail = '',
    guestPhone = '',
    roomTypeId,
    checkInDate,
    checkOutDate,
    ratePerNight,
    depositAmount = 0
  }) {
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    const diffTime = Math.abs(end - start);
    const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const count = await HotelReservation.countDocuments({ company_id: companyId });
    const resNumber = `RES-${Date.now().toString().slice(-6)}-${String(count + 1).padStart(3, '0')}`;

    return HotelReservation.create({
      tenant_id: tenantId,
      company_id: companyId,
      reservation_number: resNumber,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      room_type_id: roomTypeId,
      check_in_date: start,
      check_out_date: end,
      nights,
      rate_per_night: Number(ratePerNight),
      status: 'CONFIRMED',
      deposit_amount: Number(depositAmount),
      created_by: userId
    });
  }

  /**
   * Check in guest: Assign room, mark room occupied, and initialize guest folio
   */
  async checkInGuest({ reservationId, roomId, userId }) {
    const res = await HotelReservation.findById(reservationId);
    if (!res) throw new Error('Reservation not found');
    if (res.status === 'CHECKED_IN') throw new Error('Guest is already checked in.');

    const room = await HotelRoom.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'OCCUPIED') throw new Error(`Room ${room.room_number} is already occupied.`);

    res.status = 'CHECKED_IN';
    res.room_id = roomId;
    await res.save();

    room.status = 'OCCUPIED';
    room.current_reservation_id = res._id;
    await room.save();

    // Initialize Guest Folio
    const folioCount = await GuestFolio.countDocuments({ company_id: res.company_id });
    const folioNumber = `FOLIO-${res.reservation_number.slice(-4)}-${String(folioCount + 1).padStart(3, '0')}`;

    const charges = [];
    let payments = 0;
    if (res.deposit_amount > 0) {
      charges.push({
        charge_type: 'PAYMENT',
        description: 'Advance Deposit Received',
        amount: -res.deposit_amount,
        date: new Date()
      });
      payments = res.deposit_amount;
    }

    const folio = await GuestFolio.create({
      tenant_id: res.tenant_id,
      company_id: res.company_id,
      reservation_id: res._id,
      folio_number: folioNumber,
      guest_name: res.guest_name,
      status: 'OPEN',
      charges,
      total_charges: 0,
      total_payments: payments,
      balance_due: -payments
    });

    return { reservation: res, room, folio };
  }

  /**
   * Add incidental or service charge to guest folio
   */
  async addFolioCharge({ folioId, chargeType, description, amount }) {
    const folio = await GuestFolio.findById(folioId);
    if (!folio || folio.status !== 'OPEN') throw new Error('Open folio not found');

    const amt = Number(amount);
    folio.charges.push({
      charge_type: chargeType,
      description,
      amount: amt,
      date: new Date()
    });

    if (chargeType === 'PAYMENT') {
      folio.total_payments += amt;
    } else {
      folio.total_charges += amt;
    }
    folio.balance_due = folio.total_charges - folio.total_payments;
    await folio.save();

    return folio;
  }

  /**
   * Idempotent Night Audit:
   * Posts daily room rate charges to folios and records room revenue journal entries.
   * If re-run for the same audit date, duplicate postings are prevented.
   */
  async runNightAudit({ tenantId, companyId, auditDate, userId }) {
    const dateStr = auditDate || new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Find all checked-in reservations
    const checkedInReservations = await HotelReservation.find({
      company_id: companyId,
      status: 'CHECKED_IN'
    }).populate('room_id');

    let processedCount = 0;
    let skippedCount = 0;
    let totalNightlyRevenue = 0;

    for (const res of checkedInReservations) {
      const folio = await GuestFolio.findOne({
        reservation_id: res._id,
        status: 'OPEN'
      });

      if (!folio) continue;

      // Check if night audit was already run for this reservation on this date
      const alreadyAudited = folio.charges.some(
        c => c.posted_by_night_audit && c.night_audit_date === dateStr
      );

      if (alreadyAudited) {
        skippedCount++;
        continue;
      }

      // Add room charge to folio
      const roomRate = res.rate_per_night;
      folio.charges.push({
        charge_type: 'ROOM_CHARGE',
        description: `Room Charge (${dateStr}) - Room ${res.room_id ? res.room_id.room_number : 'Assigned'}`,
        amount: roomRate,
        date: new Date(),
        posted_by_night_audit: true,
        night_audit_date: dateStr
      });

      folio.total_charges += roomRate;
      folio.balance_due = folio.total_charges - folio.total_payments;
      await folio.save();

      processedCount++;
      totalNightlyRevenue += roomRate;
    }

    // Post GL Journal Entry for Nightly Room Revenue if revenue > 0
    let glJournalId = null;
    if (totalNightlyRevenue > 0) {
      // Find current open fiscal period
      const now = new Date();
      const period = await FiscalPeriod.findOne({
        tenant_id: tenantId,
        status: 'OPEN',
        start_date: { $lte: now },
        end_date: { $gte: now }
      }) || await FiscalPeriod.findOne({ tenant_id: tenantId }).sort({ start_date: -1 });

      // Find accounts for AR (1101/1200) and Room Revenue (4001/4000)
      const arAccount = await LedgerAccount.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        account_code: { $in: ['1101', '1200', '1201', 'AR_TRADE'] }
      }) || await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_type: 'ASSET' })
         || await LedgerAccount.findOne({ tenant_id: tenantId, account_type: 'ASSET' });

      const revAccount = await LedgerAccount.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        account_code: { $in: ['4001', '4003', '4000', 'ROOM_REVENUE', 'SALES_REV'] }
      }) || await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_type: 'REVENUE' })
         || await LedgerAccount.findOne({ tenant_id: tenantId, account_type: 'REVENUE' });

      if (period && arAccount && revAccount) {
        const idempotencyKey = `NIGHT-AUDIT-${companyId}-${dateStr}`;
        try {
          const journal = await postJournalEntry({
            tenantId,
            companyId,
            postingDate: new Date(dateStr),
            sourceModule: 'NIGHT_AUDIT',
            referenceId: `AUDIT-${dateStr}`,
            memo: `Night Audit Room Revenue Recognition for ${dateStr}`,
            idempotencyKey,
            lines: [
              {
                account_code: arAccount.account_code,
                debit: totalNightlyRevenue,
                credit: 0,
                memo: `Guest Folio Charges Recognized - ${dateStr}`
              },
              {
                account_code: revAccount.account_code,
                debit: 0,
                credit: totalNightlyRevenue,
                memo: `Room Revenue - ${dateStr}`
              }
            ],
            userId
          });
          glJournalId = journal && journal.journal ? journal.journal._id : (journal ? journal._id : null);
        } catch (err) {
          // If already posted or journal error, log and continue
          console.warn('[NightAudit] Journal posting note:', err.message);
        }
      }
    }

    return {
      audit_date: dateStr,
      processed_reservations: processedCount,
      skipped_reservations: skippedCount,
      total_room_revenue: totalNightlyRevenue,
      gl_journal_id: glJournalId
    };
  }

  /**
   * Settle folio and check out guest
   */
  async checkOutGuest({ reservationId, settlementMethod = 'CASH', userId }) {
    const res = await HotelReservation.findById(reservationId);
    if (!res) throw new Error('Reservation not found');
    if (res.status !== 'CHECKED_IN') throw new Error('Guest is not currently checked in.');

    const folio = await GuestFolio.findOne({ reservation_id: res._id, status: 'OPEN' });
    if (!folio) throw new Error('Open folio not found');

    // Create Commercial Document for settlement
    const draft = await commercialDocumentService.createDraftDocument({
      tenant_id: res.tenant_id,
      company_id: res.company_id,
      document_type: 'SALES_INVOICE',
      sub_type: 'TAX_INVOICE',
      billing_name: res.guest_name,
      customer_phone: res.guest_phone,
      lines: [
        {
          line_number: 1,
          line_type: 'SERVICES',
          item_name: `Hotel Lodging & Folio Settlement (${folio.folio_number})`,
          quantity: 1,
          unit_price: Math.max(0, folio.total_charges),
          tax_rate_code: 'GST_12'
        }
      ],
      metadata: {
        folio_number: folio.folio_number,
        reservation_number: res.reservation_number,
        settlement_method: settlementMethod
      },
      created_by: userId
    });

    const postingResult = await postCommercialDocument({
      tenantId: res.tenant_id,
      companyId: res.company_id,
      documentId: draft._id,
      userId
    });
    const postedDoc = postingResult.document;

    folio.status = 'SETTLED';
    folio.commercial_document_id = postedDoc._id;
    folio.total_payments = folio.total_charges;
    folio.balance_due = 0;
    await folio.save();

    res.status = 'CHECKED_OUT';
    await res.save();

    if (res.room_id) {
      await HotelRoom.findByIdAndUpdate(res.room_id, {
        $set: { status: 'DIRTY', current_reservation_id: null }
      });
    }

    return {
      reservation: res,
      folio,
      commercial_document: postedDoc
    };
  }

  /**
   * Calculate hotel metrics: Occupancy %, ADR, RevPAR
   */
  async getMetrics(companyId) {
    const totalRooms = await HotelRoom.countDocuments({ company_id: companyId });
    const occupiedRooms = await HotelRoom.countDocuments({ company_id: companyId, status: 'OCCUPIED' });
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    // Sum revenue from folios for the current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const folios = await GuestFolio.find({
      company_id: companyId,
      created_at: { $gte: startOfMonth }
    });

    let totalRevenue = 0;
    for (const f of folios) {
      totalRevenue += f.total_charges || 0;
    }

    const adr = occupiedRooms > 0 ? totalRevenue / occupiedRooms : 0;
    const revPar = totalRooms > 0 ? totalRevenue / totalRooms : 0;

    return {
      total_rooms: totalRooms,
      occupied_rooms: occupiedRooms,
      occupancy_rate_pct: Math.round(occupancyRate * 100) / 100,
      total_month_revenue: totalRevenue,
      adr: Math.round(adr * 100) / 100,
      rev_par: Math.round(revPar * 100) / 100
    };
  }
}

module.exports = new HotelPmsService();
