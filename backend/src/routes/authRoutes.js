const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

// Public SaaS Auth with rate-limiting protection
router.post('/register-tenant', authLimiter, authController.registerTenant);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refreshToken);

// Password Recovery Foundations
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

// Authenticated Endpoints
router.get('/me', requireAuth, authController.getMe);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
