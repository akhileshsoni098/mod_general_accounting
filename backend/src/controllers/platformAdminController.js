const subscriptionService = require('../services/subscriptionService');
const { Tenant, User, PlatformAuditLog } = require('../models');

class PlatformAdminController {
  async getPlans(req, res) {
    try {
      const plans = await subscriptionService.getPlans();
      return res.success(plans);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getTenants(req, res) {
    try {
      const tenants = await Tenant.find().sort({ created_at: -1 });
      const enriched = [];
      for (const t of tenants) {
        const sub = await subscriptionService.getTenantSubscription(t._id);
        const userCount = await User.countDocuments({ tenant_id: t._id });
        enriched.push({
          ...t.toObject(),
          subscription: sub,
          user_count: userCount
        });
      }
      return res.success(enriched);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getTenantSubscription(req, res) {
    try {
      const tenantId = req.params.tenantId || req.tenantId;
      const sub = await subscriptionService.getTenantSubscription(tenantId);
      return res.success(sub);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async updateTenantPlan(req, res) {
    try {
      const { plan_code, billing_cycle } = req.body;
      const tenantId = req.params.tenantId;
      const updated = await subscriptionService.changePlan(tenantId, plan_code, billing_cycle, req.user);
      return res.success(updated);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async updateTenantStatus(req, res) {
    try {
      const { status, reason } = req.body;
      const tenantId = req.params.tenantId;
      const updated = await subscriptionService.updateTenantStatus(tenantId, status, reason, req.user);
      return res.success(updated);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }

  async getAuditLogs(req, res) {
    try {
      const logs = await PlatformAuditLog.find().sort({ created_at: -1 }).limit(100);
      return res.success(logs);
    } catch (err) {
      return res.error(err.message, 400);
    }
  }
}

module.exports = new PlatformAdminController();
