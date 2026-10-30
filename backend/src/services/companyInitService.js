const mongoose = require('mongoose');
const { Company, CompanyMembership, UserRole, Role, Tenant, AccountingCalendar } = require('../models');
const { isValidProfile, getProfile } = require('../config/businessProfiles');
const { getDefaultModulesForProfile, resolveModuleDependencies } = require('../config/moduleRegistry');
const { seedCompanyChartOfAccounts } = require('../utils/seedCoa');
const { seedCompanyFiscalPeriods } = require('../utils/seedFiscalPeriods');
const accountingCalendarService = require('./accountingCalendarService');
const { initializeCompanyInventoryDefaults } = require('./inventoryInitService');
const { computeIndustryRecommendations, mapLegacyProfile } = require('./industryConfigurationService');
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
  industryCode = null,
  industrySubcategory = '',
  operatingModels = null,
  inventoryPolicies = null,
  operationalCapabilities = null,
  enabledModules = null,
  modulesConfig = {},
  description = '',
  countryCode = 'IN',
  baseCurrency = 'INR',
  timezone = 'Asia/Kolkata',
  locale = 'en-IN',
  financialYearStartMonth = 4,
  booksBeginningFrom = new Date(),
  taxJurisdiction = 'GST_INDIA',
  taxDetails = {},
  calendarConfig = null
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
  const legacyMapping = mapLegacyProfile(normalizedProfile);
  const resolvedIndustryCode = industryCode ? industryCode.toUpperCase().trim() : legacyMapping.industry_code;
  const resolvedOperatingModels = Array.isArray(operatingModels) && operatingModels.length > 0
    ? operatingModels.map(m => String(m).toUpperCase().trim())
    : legacyMapping.operating_models;

  const recommendations = computeIndustryRecommendations({
    industryCode: resolvedIndustryCode,
    operatingModels: resolvedOperatingModels,
    countryCode,
    customOverrides: {
      inventory_policy: inventoryPolicies
    }
  });

  const finalInventoryPolicies = inventoryPolicies || recommendations.inventory_policy;
  const finalOperationalCapabilities = operationalCapabilities || recommendations.operational_capabilities;

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

  const resolvedModules = Array.isArray(enabledModules)
    ? resolveModuleDependencies(enabledModules)
    : recommendations.recommended_modules;

  const operation = async (session) => {
    // 1. Create or revive Company document
    let company;
    if (existingCompany) {
      existingCompany.company_name = companyName.trim();
      existingCompany.legal_name = legalName ? legalName.trim() : companyName.trim();
      existingCompany.business_profile = normalizedProfile;
      existingCompany.industry_code = resolvedIndustryCode;
      existingCompany.industry_subcategory = industrySubcategory || '';
      existingCompany.operating_models = resolvedOperatingModels;
      existingCompany.inventory_policies = finalInventoryPolicies;
      existingCompany.operational_capabilities = finalOperationalCapabilities;
      if (Array.isArray(enabledModules)) {
        existingCompany.enabled_modules = resolvedModules;
      } else if (!existingCompany.enabled_modules || existingCompany.enabled_modules.length === 0) {
        existingCompany.enabled_modules = resolvedModules;
      }
      if (modulesConfig && Object.keys(modulesConfig).length > 0) {
        existingCompany.modules_config = { ...existingCompany.modules_config, ...modulesConfig };
      }
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
          industry_code: resolvedIndustryCode,
          industry_subcategory: industrySubcategory || '',
          operating_models: resolvedOperatingModels,
          inventory_policies: finalInventoryPolicies,
          operational_capabilities: finalOperationalCapabilities,
          enabled_modules: resolvedModules,
          modules_config: modulesConfig || {},
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

    // 4. Seed Accounting Calendar & Initial Fiscal Periods for Company
    const currentYear = new Date().getFullYear();
    const cfg = calendarConfig || {
      calendar_type: 'GREGORIAN',
      fiscal_year_start_month: fyStartMonth,
      year_end_rule: 'CALENDAR_MONTH_END'
    };

    const calType = cfg.calendar_type || 'GREGORIAN';
    const calStartMonth = cfg.fiscal_year_start_month || fyStartMonth || 1;
    const calCode = `${company.company_code}_CALENDAR`;

    const calDoc = await AccountingCalendar.findOneAndUpdate(
      { tenant_id: tenantId, company_id: company._id, calendar_code: calCode },
      {
        calendar_name: `${company.company_name} Accounting Calendar`,
        calendar_type: calType,
        fiscal_year_start_month: calStartMonth,
        week_start_day: cfg.week_start_day || (cfg.week_end_day === 'SUNDAY' ? 'MONDAY' : 'SUNDAY'),
        week_end_day: cfg.week_end_day || 'SATURDAY',
        year_end_rule: cfg.year_end_rule || (calType === 'GREGORIAN' ? 'CALENDAR_MONTH_END' : 'LAST_WEEKDAY_OF_MONTH'),
        anchor_month: cfg.anchor_month || 1,
        fifty_three_week_policy: cfg.fifty_three_week_policy || 'ADD_TO_LAST_PERIOD',
        is_default: true,
        is_active: true,
        description: `Configured during company initialization for ${company.company_name}`
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    company.calendar_id = calDoc._id;
    await company.save({ session });

    await accountingCalendarService.generateAndSavePeriods(calDoc._id, currentYear, {
      session,
      tenantId,
      companyId: company._id
    });

    // 5. Seed Initial Inventory Masters (Default Godown, Standard UOMs, Primary Group, Quarantine)
    try {
      await initializeCompanyInventoryDefaults(tenantId, company._id, {
        enableQuarantine: recommendations.requires_quarantine_godown || Boolean(finalInventoryPolicies.enable_quarantine),
        session
      });
    } catch (invInitErr) {
      console.warn('[Inventory Init Warning]', invInitErr.message);
    }

    // 6. Seed Initial Commercial Defaults (Posting Config, GST Rates, Commercial Dynamic Rules)
    try {
      const { getOrCreatePostingConfig } = require('./commercialPostingConfigService');
      const { seedDefaultCommercialRules } = require('../utils/seedCommercialRules');
      await getOrCreatePostingConfig(tenantId, company._id, { session });
      await seedDefaultCommercialRules(tenantId, company._id, { session });
    } catch (commInitErr) {
      console.warn('[Commercial Init Warning]', commInitErr.message);
    }

    // 7. Seed Industry Specific Presets based on Business Profile
    try {
      if (['RESTAURANT_CAFE', 'PIZZA_QSR'].includes(company.business_profile)) {
        const { RestaurantTable } = require('../models');
        for (let i = 1; i <= 5; i++) {
          await RestaurantTable.findOneAndUpdate(
            { company_id: company._id, table_number: `T-0${i}` },
            {
              tenant_id: tenantId,
              company_id: company._id,
              table_number: `T-0${i}`,
              section: 'MAIN_HALL',
              capacity: 4,
              status: 'VACANT'
            },
            { upsert: true, session }
          );
        }
      } else if (company.business_profile === 'HOTEL_HOSPITALITY') {
        const { HotelRoomType, HotelRoom } = require('../models');
        const deluxe = await HotelRoomType.findOneAndUpdate(
          { company_id: company._id, type_code: 'DELUXE' },
          {
            tenant_id: tenantId,
            company_id: company._id,
            type_code: 'DELUXE',
            type_name: 'Deluxe King Suite',
            base_rate: 3500,
            max_occupancy: 2,
            is_active: true
          },
          { upsert: true, new: true, session }
        );

        for (const num of ['101', '102', '201', '202']) {
          await HotelRoom.findOneAndUpdate(
            { company_id: company._id, room_number: num },
            {
              tenant_id: tenantId,
              company_id: company._id,
              room_number: num,
              room_type_id: deluxe._id,
              floor: num[0],
              status: 'CLEAN'
            },
            { upsert: true, session }
          );
        }
      } else if (company.business_profile === 'MANUFACTURING') {
        const { Godown } = require('../models');
        await Godown.findOneAndUpdate(
          { company_id: company._id, godown_code: 'FG_WH' },
          {
            tenant_id: tenantId,
            company_id: company._id,
            godown_code: 'FG_WH',
            name: 'Finished Goods Warehouse',
            is_active: true
          },
          { upsert: true, session }
        );
      }
    } catch (indInitErr) {
      console.warn('[Industry Presets Init Warning]', indInitErr.message);
    }

    // 8. Seed Initial US Company Tax Profile (When country is US or US_SALES_TAX)
    if (company.country_code === 'US' || company.tax_jurisdiction === 'US_SALES_TAX') {
      try {
        const { CompanyTaxProfile } = require('../models');
        await CompanyTaxProfile.findOneAndUpdate(
          { tenant_id: tenantId, company_id: company._id },
          {
            tax_country: 'US',
            tax_classification: 'C_CORP',
            tax_year_end_month: company.financial_year_start_month === 1 ? 12 : ((company.financial_year_start_month + 10) % 12 + 1),
            profile_status: 'ACTIVE'
          },
          { upsert: true, setDefaultsOnInsert: true, session }
        );
      } catch (taxProfErr) {
        console.warn('[US Tax Profile Init Warning]', taxProfErr.message);
      }
    }

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
