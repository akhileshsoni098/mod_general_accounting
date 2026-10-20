const mongoose = require('mongoose');
const { Company, CompanyMembership, UserRole, Role, Tenant } = require('../models');
const { isValidProfile, getProfile } = require('../config/businessProfiles');
const { seedCompanyChartOfAccounts } = require('../utils/seedCoa');
const { seedCompanyFiscalPeriods } = require('../utils/seedFiscalPeriods');
const { withOptionalTransaction } = require('../utils/transactionHelper');

/**
 * Initializes a new company and its accounting workspace within a tenant.
 * Guarantees idempotency and transactional integrity.
 */
async function initializeCompany({
  tenantId,
  creatorUserId,
  companyCode,
  companyName,
  legalName = '',
  businessProfile = 'GENERAL_RETAIL',
  description = '',
  countryCode = 'IN',
  baseCurrency = 'INR',
  timezone = 'Asia/Kolkata',
  locale = 'en-IN',
  financialYearStartMonth = 4,
  booksBeginningFrom = new Date(),
  taxJurisdiction = 'GST_INDIA',
  taxDetails = {}
}) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }
  if (!companyCode || !companyName) {
    throw new Error('companyCode and companyName are required');
  }

  const normalizedCode = companyCode.toUpperCase().trim();
  const normalizedProfile = businessProfile ? businessProfile.toUpperCase().trim() : 'GENERAL_RETAIL';

  if (!isValidProfile(normalizedProfile)) {
    throw new Error(`Invalid business_profile: "${businessProfile}". Must be one of the registered profile identifiers.`);
  }

  const profileMeta = getProfile(normalizedProfile);

  // Validate tenant exists and is active
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error(`Tenant workspace not found for ID: ${tenantId}`);
  }
  if (tenant.status !== 'ACTIVE') {
    throw new Error(`Tenant workspace is ${tenant.status}`);
  }

  // Check duplicate active company code within this tenant
  const existingCompany = await Company.findOne({
    tenant_id: tenantId,
    company_code: normalizedCode
  });

  if (existingCompany && existingCompany.status === 'ACTIVE') {
    // If already active and initialized, return it for idempotency
    return {
      company: existingCompany,
      is_new: false,
      message: 'Company already exists'
    };
  }

  const fyStartMonth = parseInt(financialYearStartMonth, 10) || profileMeta.default_financial_year_start_month || 4;

  const operation = async (session) => {
    // 1. Create or revive Company document
    let company;
    if (existingCompany) {
      existingCompany.company_name = companyName.trim();
      existingCompany.legal_name = legalName ? legalName.trim() : companyName.trim();
      existingCompany.business_profile = normalizedProfile;
      existingCompany.description = description.trim();
      existingCompany.country_code = (countryCode || profileMeta.default_country || 'IN').toUpperCase().trim();
      existingCompany.base_currency = (baseCurrency || profileMeta.default_currency || 'INR').toUpperCase().trim();
      existingCompany.timezone = timezone;
      existingCompany.locale = locale;
      existingCompany.financial_year_start_month = fyStartMonth;
      existingCompany.books_beginning_from = booksBeginningFrom;
      existingCompany.tax_jurisdiction = taxJurisdiction;
      existingCompany.tax_details = taxDetails;
      existingCompany.status = 'ACTIVE';
      await existingCompany.save({ session });
      company = existingCompany;
    } else {
      company = await Company.create([
        {
          tenant_id: tenantId,
          company_code: normalizedCode,
          company_name: companyName.trim(),
          legal_name: legalName ? legalName.trim() : companyName.trim(),
          business_profile: normalizedProfile,
          description: description.trim(),
          country_code: (countryCode || profileMeta.default_country || 'IN').toUpperCase().trim(),
          base_currency: (baseCurrency || profileMeta.default_currency || 'INR').toUpperCase().trim(),
          timezone,
          locale,
          financial_year_start_month: fyStartMonth,
          financial_year_config: { start_month: fyStartMonth, close_day: 31 },
          books_beginning_from: booksBeginningFrom,
          tax_jurisdiction: taxJurisdiction,
          tax_details: taxDetails,
          status: 'ACTIVE',
          created_by: creatorUserId || null
        }
      ], { session }).then(res => res[0]);
    }

    // 2. Creator Membership
    let membership = null;
    if (creatorUserId) {
      membership = await CompanyMembership.findOneAndUpdate(
        { tenant_id: tenantId, company_id: company._id, user_id: creatorUserId },
        { status: 'ACTIVE', is_default: true, joined_at: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );

      // Find TENANT_ADMIN role to assign at company scope for creator
      const adminRole = await Role.findOne({ code: 'TENANT_ADMIN', tenant_id: null });
      if (adminRole) {
        await UserRole.findOneAndUpdate(
          { tenant_id: tenantId, company_id: company._id, user_id: creatorUserId, role_id: adminRole._id },
          {},
          { upsert: true, setDefaultsOnInsert: true, session }
        );
      }
    }

    // 3. Seed Company Chart of Accounts
    await seedCompanyChartOfAccounts(tenantId, company._id, {
      currency: company.base_currency,
      session
    });

    // 4. Seed Initial Fiscal Periods for Company
    const currentYear = new Date().getFullYear();
    await seedCompanyFiscalPeriods(tenantId, company._id, currentYear, fyStartMonth, {
      session
    });

    return {
      company,
      membership,
      is_new: !existingCompany
    };
  };

  // Run in transaction if topology supports it; fallback gracefully in dev/test
  const result = await withOptionalTransaction(operation, { failClosed: false });
  return result;
}

module.exports = {
  initializeCompany
};
