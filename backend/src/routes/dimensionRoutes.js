const express = require('express');
const router = express.Router();
const dimensionController = require('../controllers/dimensionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');

// All endpoints require authentication and tenant workspace scope
router.use(requireAuth, requireTenantWorkspace);

router.get('/', dimensionController.listDimensions);
router.get('/context', dimensionController.getDimensionContext);
router.post('/', dimensionController.createDimension);
router.patch('/:id', dimensionController.updateDimension);
router.delete('/:id', dimensionController.deleteDimension);

module.exports = router;
