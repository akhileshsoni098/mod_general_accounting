const express = require('express');
const router = express.Router();
const counterpartyController = require('../controllers/counterpartyController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace } = require('../middleware/tenantMiddleware');

// All endpoints require authentication and tenant workspace scope
router.use(requireAuth, requireTenantWorkspace);

router.get('/', counterpartyController.listParties);
router.post('/', counterpartyController.createParty);
router.post('/seed', counterpartyController.seedParties);
router.get('/:id', counterpartyController.getPartyById);
router.patch('/:id', counterpartyController.updateParty);
router.delete('/:id', counterpartyController.archiveParty);
router.post('/:id/roles', counterpartyController.addPartyRole);

module.exports = router;
