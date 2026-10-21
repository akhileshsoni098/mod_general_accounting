const express = require('express');
const router = express.Router();
const dimensionController = require('../controllers/dimensionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');
const { requireCompanyModule } = require('../middleware/companyMiddleware');

// All endpoints require authentication, tenant workspace scope, and DIMENSIONS module when company context is active
router.use(requireAuth, requireTenantWorkspace, requireCompanyModule('DIMENSIONS', { optionalCompany: true }));

router.get('/', dimensionController.listDimensions);
router.get('/context', dimensionController.getDimensionContext);
router.post('/', dimensionController.createDimension);
router.patch('/:id', dimensionController.updateDimension);
router.delete('/:id', dimensionController.deleteDimension);

module.exports = router;
