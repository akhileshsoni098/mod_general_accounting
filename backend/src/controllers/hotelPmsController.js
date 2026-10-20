const hotelPmsService = require('../services/hotelPmsService');
const { HotelReservation, GuestFolio } = require('../models');

class HotelPmsController {
  async getRoomTypes(req, res) {
    try {
      const types = await hotelPmsService.getRoomTypes(req.companyId);
      return res.success(types);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createRoomType(req, res) {
    try {
      const { type_code, type_name, base_rate, max_occupancy, amenities } = req.body;
      const type = await hotelPmsService.createRoomType({
        tenantId: req.tenantId,
        companyId: req.companyId,
        typeCode: type_code,
        typeName: type_name,
        baseRate: base_rate,
        maxOccupancy: max_occupancy,
        amenities
      });
      return res.success(type);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getRooms(req, res) {
    try {
      const rooms = await hotelPmsService.getRooms(req.companyId);
      return res.success(rooms);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createRoom(req, res) {
    try {
      const { room_number, room_type_id, floor } = req.body;
      const room = await hotelPmsService.createRoom({
        tenantId: req.tenantId,
        companyId: req.companyId,
        roomNumber: room_number,
        roomTypeId: room_type_id,
        floor
      });
      return res.success(room);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getReservations(req, res) {
    try {
      const reservations = await HotelReservation.find({ company_id: req.companyId })
        .populate('room_type_id room_id')
        .sort({ check_in_date: -1 })
        .limit(50);
      return res.success(reservations);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async createReservation(req, res) {
    try {
      const {
        guest_name,
        guest_email,
        guest_phone,
        room_type_id,
        check_in_date,
        check_out_date,
        rate_per_night,
        deposit_amount
      } = req.body;

      const reservation = await hotelPmsService.createReservation({
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user._id,
        guestName: guest_name,
        guestEmail: guest_email,
        guestPhone: guest_phone,
        roomTypeId: room_type_id,
        checkInDate: check_in_date,
        checkOutDate: check_out_date,
        ratePerNight: rate_per_night,
        depositAmount: deposit_amount
      });
      return res.success(reservation);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async checkIn(req, res) {
    try {
      const { reservation_id, room_id } = req.body;
      const result = await hotelPmsService.checkInGuest({
        reservationId: reservation_id,
        roomId: room_id,
        userId: req.user._id
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getFolio(req, res) {
    try {
      const { reservationId } = req.params;
      const folio = await GuestFolio.findOne({ reservation_id: reservationId });
      return res.success(folio);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async addFolioCharge(req, res) {
    try {
      const { folioId } = req.params;
      const { charge_type, description, amount } = req.body;
      const updated = await hotelPmsService.addFolioCharge({
        folioId,
        chargeType: charge_type,
        description,
        amount
      });
      return res.success(updated);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async checkOut(req, res) {
    try {
      const { reservation_id, settlement_method } = req.body;
      const result = await hotelPmsService.checkOutGuest({
        reservationId: reservation_id,
        settlementMethod: settlement_method,
        userId: req.user._id
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async runNightAudit(req, res) {
    try {
      const { audit_date } = req.body;
      const result = await hotelPmsService.runNightAudit({
        tenantId: req.tenantId,
        companyId: req.companyId,
        auditDate: audit_date,
        userId: req.user._id
      });
      return res.success(result);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getMetrics(req, res) {
    try {
      const metrics = await hotelPmsService.getMetrics(req.companyId);
      return res.success(metrics);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new HotelPmsController();
