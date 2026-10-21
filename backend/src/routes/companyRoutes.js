const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireTenantWorkspace, requirePermission } = require('../middleware/tenantMiddleware');
const companyController = require('../controllers/companyController');

// All company routes require authenticated user and active tenant workspace
router.use(requireAuth, requireTenantWorkspace);

// Catalog of available business profiles
router.get('/profiles', companyController.getBusinessProfilesList);

// List companies accessible to user
router.get('/', requirePermission('COMPANY:VIEW'), companyController.listCompanies);

// Create new company
router.post('/', requirePermission('COMPANY:CREATE'), companyController.createCompany);

// Switch active company context
router.post('/switch', requirePermission('COMPANY:VIEW'), companyController.switchCompany);

// Specific company details
router.get('/:id', requirePermission('COMPANY:VIEW'), companyController.getCompanyDetails);

// Update company configuration
router.patch('/:id', requirePermission('COMPANY:UPDATE'), companyController.updateCompany);

// Company business module management
router.get('/:id/modules', requirePermission('COMPANY:VIEW'), companyController.getCompanyModules);
router.patch('/:id/modules', requirePermission('COMPANY:UPDATE'), companyController.updateCompanyModules);

// Franchise & Commission sharing configuration
router.get('/:id/franchise-config', requirePermission('COMPANY:VIEW'), companyController.getCompanyFranchiseConfig);
router.put('/:id/franchise-config', requirePermission('COMPANY:UPDATE'), companyController.updateCompanyFranchiseConfig);

// Company membership management
router.get('/:id/members', requirePermission('COMPANY:MANAGE_MEMBERS'), companyController.listMembers);
router.post('/:id/members', requirePermission('COMPANY:MANAGE_MEMBERS'), companyController.addMember);

module.exports = router;
