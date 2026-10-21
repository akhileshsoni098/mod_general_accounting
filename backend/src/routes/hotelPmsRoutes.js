const express = require('express');
const router = express.Router();
const hotelPmsController = require('../controllers/hotelPmsController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext, requireCompanyModule } = require('../middleware/companyMiddleware');

router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireCompanyContext);
router.use(requireCompanyModule('HOTEL_PMS'));

router.get('/room-types', (req, res) => hotelPmsController.getRoomTypes(req, res));
router.post('/room-types', (req, res) => hotelPmsController.createRoomType(req, res));
router.get('/rooms', (req, res) => hotelPmsController.getRooms(req, res));
router.post('/rooms', (req, res) => hotelPmsController.createRoom(req, res));
router.get('/reservations', (req, res) => hotelPmsController.getReservations(req, res));
router.post('/reservations', (req, res) => hotelPmsController.createReservation(req, res));
router.post('/check-in', (req, res) => hotelPmsController.checkIn(req, res));
router.get('/folios/:reservationId', (req, res) => hotelPmsController.getFolio(req, res));
router.post('/folios/:folioId/charges', (req, res) => hotelPmsController.addFolioCharge(req, res));
router.post('/check-out', (req, res) => hotelPmsController.checkOut(req, res));
router.post('/night-audit', (req, res) => hotelPmsController.runNightAudit(req, res));
router.get('/metrics', (req, res) => hotelPmsController.getMetrics(req, res));

module.exports = router;
