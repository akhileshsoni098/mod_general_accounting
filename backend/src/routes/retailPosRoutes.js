const express = require('express');
const router = express.Router();
const retailPosController = require('../controllers/retailPosController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyContext } = require('../middleware/companyMiddleware');

router.use(requireAuth);
router.use(requireTenantWorkspace);
router.use(requireCompanyContext);

router.post('/shifts/open', (req, res) => retailPosController.openShift(req, res));
router.get('/shifts/current', (req, res) => retailPosController.getCurrentShift(req, res));
router.post('/shifts/close', (req, res) => retailPosController.closeShift(req, res));
router.post('/checkout', (req, res) => retailPosController.checkout(req, res));

module.exports = router;
