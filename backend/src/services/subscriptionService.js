const mongoose = require('mongoose');
const { SubscriptionPlan, TenantSubscription, Tenant, Company, User, CommercialDocument, PlatformAuditLog } = require('../models');

const DEFAULT_PLANS = [
  {
    plan_code: 'FREE',
    plan_name: 'Free Starter',
    description: 'Free tier for micro-businesses and evaluation.',
    max_companies: 1,
    max_users: 2,
    max_documents_per_month: 100,
    price_per_month: 0,
    currency: 'INR',
    allowed_modules: ['GL', 'INVENTORY', 'COMMERCIAL', 'RETAIL_POS'],
    is_active: true
  },
  {
    plan_code: 'STARTER',
    plan_name: 'SME Starter',
    description: 'For growing retail shops, hardware stores, and cafes.',
    max_companies: 3,
    max_users: 10,
    max_documents_per_month: 2000,
    price_per_month: 1499,
    currency: 'INR',
    allowed_modules: ['GL', 'INVENTORY', 'COMMERCIAL', 'RETAIL_POS', 'RESTAURANT', 'SERVICES'],
    is_active: true
  },
  {
    plan_code: 'GROWTH',
    plan_name: 'Business Growth',
    description: 'For hotels, multi-outlet restaurants, and manufacturers.',
    max_companies: 10,
    max_users: 50,
    max_documents_per_month: 10000,
    price_per_month: 4999,
    currency: 'INR',
    allowed_modules: ['GL', 'INVENTORY', 'COMMERCIAL', 'RETAIL_POS', 'RESTAURANT', 'HOTEL_PMS', 'MANUFACTURING', 'SERVICES'],
    is_active: true
  },
  {
    plan_code: 'ENTERPRISE',
    plan_name: 'Enterprise Unlimited',
    description: 'Unlimited capacity with full multi-industry suite and custom SLA.',
    max_companies: 999,
    max_users: 999,
    max_documents_per_month: -1,
    price_per_month: 14999,
    currency: 'INR',
    allowed_modules: [
      'GL',
      'BILLING_AR',
      'COMMISSIONS_FIDUCIARY',
      'TREASURY_BANK_REC',
      'FINANCE_CLOSE',
      'INVENTORY',
      'COMMERCIAL',
      'RETAIL_POS',
      'RESTAURANT',
      'HOTEL_PMS',
      'MANUFACTURING',
      'SERVICES'
    ],
    is_active: true
  }
];

class SubscriptionService {
  /**
   * Seed default subscription plans idempotently
   */
  async seedDefaultPlans() {
    for (const plan of DEFAULT_PLANS) {
      await SubscriptionPlan.findOneAndUpdate(
        { plan_code: plan.plan_code },
        { $set: plan },
        { upsert: true, new: true }
      );
    }
  }

  /**
   * Get all active subscription plans
   */
  async getPlans() {
    await this.seedDefaultPlans();
    return SubscriptionPlan.find({ is_active: true }).sort({ price_per_month: 1 });
  }

  /**
   * Get or auto-provision subscription for a tenant
   */
  async getTenantSubscription(tenantId) {
    let sub = await TenantSubscription.findOne({ tenant_id: tenantId }).populate('plan_id');
    if (!sub) {
      await this.seedDefaultPlans();
      const starterPlan = await SubscriptionPlan.findOne({ plan_code: 'STARTER' });
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 30);

      sub = await TenantSubscription.create({
        tenant_id: tenantId,
        plan_id: starterPlan._id,
        status: 'TRIAL',
        trial_ends_at: trialEnds,
        current_period_start: new Date(),
        current_period_end: trialEnds,
        billing_cycle: 'MONTHLY',
        payment_provider: 'MANUAL'
      });
      sub = await TenantSubscription.findById(sub._id).populate('plan_id');
    }
    return sub;
  }

  /**
   * Check whether a tenant has exceeded their plan limits
   */
  async checkTenantLimit(tenantId, limitType) {
    const sub = await this.getTenantSubscription(tenantId);
    const plan = sub.plan_id;
    if (!plan) return { allowed: true };

    if (sub.status === 'SUSPENDED') {
      return { allowed: false, reason: 'Tenant subscription is suspended.' };
    }

    if (limitType === 'COMPANIES') {
      const companyCount = await Company.countDocuments({ tenant_id: tenantId });
      if (companyCount >= plan.max_companies) {
        return {
          allowed: false,
          reason: `Company limit reached (${companyCount}/${plan.max_companies}) for current plan ${plan.plan_code}. Upgrade your plan to add more companies.`
        };
      }
    } else if (limitType === 'USERS') {
      const userCount = await User.countDocuments({ tenant_id: tenantId });
      if (userCount >= plan.max_users) {
        return {
          allowed: false,
          reason: `User limit reached (${userCount}/${plan.max_users}) for current plan ${plan.plan_code}. Upgrade your plan to invite more users.`
        };
      }
    } else if (limitType === 'DOCUMENTS') {
      if (plan.max_documents_per_month > 0) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const docCount = await CommercialDocument.countDocuments({
          tenant_id: tenantId,
          created_at: { $gte: startOfMonth }
        });

        if (docCount >= plan.max_documents_per_month) {
          return {
            allowed: false,
            reason: `Monthly commercial document limit reached (${docCount}/${plan.max_documents_per_month}) for plan ${plan.plan_code}. Upgrade plan for higher throughput.`
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Change or upgrade tenant plan
   */
  async changePlan(tenantId, planCode, billingCycle = 'MONTHLY', actorUser = null) {
    const plan = await SubscriptionPlan.findOne({ plan_code: planCode });
    if (!plan) {
      throw new Error(`Invalid plan code: ${planCode}`);
    }

    const periodEnd = new Date();
    if (billingCycle === 'ANNUAL') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const sub = await TenantSubscription.findOneAndUpdate(
      { tenant_id: tenantId },
      {
        $set: {
          plan_id: plan._id,
          status: 'ACTIVE',
          billing_cycle: billingCycle,
          current_period_start: new Date(),
          current_period_end: periodEnd
        }
      },
      { upsert: true, new: true }
    ).populate('plan_id');

    if (actorUser) {
      await PlatformAuditLog.create({
        actor_user_id: actorUser._id,
        actor_email: actorUser.email,
        action: 'PLAN_CHANGE',
        target_tenant_id: tenantId,
        details: { new_plan: planCode, billing_cycle: billingCycle }
      });
    }

    return sub;
  }

  /**
   * Suspend or reactivate tenant
   */
  async updateTenantStatus(tenantId, newStatus, reason = '', actorUser = null) {
    if (!['ACTIVE', 'SUSPENDED', 'ONBOARDING'].includes(newStatus)) {
      throw new Error(`Invalid tenant status: ${newStatus}`);
    }

    const tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: { status: newStatus } }, { new: true });
    await TenantSubscription.findOneAndUpdate(
      { tenant_id: tenantId },
      { $set: { status: newStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE' } }
    );

    if (actorUser) {
      await PlatformAuditLog.create({
        actor_user_id: actorUser._id,
        actor_email: actorUser.email,
        action: `TENANT_STATUS_${newStatus}`,
        target_tenant_id: tenantId,
        details: { newStatus, reason }
      });
    }

    return tenant;
  }
}

module.exports = new SubscriptionService();
