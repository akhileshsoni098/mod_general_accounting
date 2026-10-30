const mongoose = require('mongoose');
const {
  TaxJurisdiction,
  CompanyTaxProfile,
  TaxRegistration,
  NexusReview,
  TaxProviderSyncLog,
  Company,
  PlatformAuditLog
} = require('../models');
const { importJurisdictionSeeds, validateSeedFiles } = require('../services/taxSeedImportService');
const TaxProviderFactory = require('../services/taxProvider/TaxProviderFactory');
const usTaxCalculationService = require('../services/usTaxCalculationService');
const usTaxPeriodService = require('../services/usTaxPeriodService');
const usTaxSubledgerService = require('../services/usTaxSubledgerService');
const usTaxReturnService = require('../services/usTaxReturnService');
const usTaxPaymentService = require('../services/usTaxPaymentService');
const usTaxReconciliationService = require('../services/usTaxReconciliationService');

// ==========================================
// 1. COMPANY TAX PROFILE
// ==========================================

async function getCompanyTaxProfile(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    let profile = await CompanyTaxProfile.findOne({
      tenant_id: tenantId,
      company_id: companyId
    });

    if (!profile) {
      // Find company to align default country & year end
      const company = await Company.findById(companyId);
      profile = await CompanyTaxProfile.create({
        tenant_id: tenantId,
        company_id: companyId,
        tax_country: company?.country_code === 'US' ? 'US' : 'US',
        tax_classification: 'C_CORP',
        tax_year_end_month: company?.financial_year_start_month === 1 ? 12 : ((company?.financial_year_start_month || 1) + 10) % 12 + 1,
        profile_status: 'ACTIVE'
      });
    }

    return res.success(profile, { message: 'Company tax profile retrieved successfully' });
  } catch (err) {
    return res.error('Failed to retrieve company tax profile', 500, err.message);
  }
}

async function updateCompanyTaxProfile(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      tax_classification,
      tax_year_end_month,
      ein_masked,
      state_of_incorporation,
      tax_provider,
      profile_status
    } = req.body;

    let profile = await CompanyTaxProfile.findOne({
      tenant_id: tenantId,
      company_id: companyId
    });

    if (!profile) {
      profile = new CompanyTaxProfile({
        tenant_id: tenantId,
        company_id: companyId
      });
    }

    if (tax_classification) profile.tax_classification = tax_classification;
    if (tax_year_end_month !== undefined) profile.tax_year_end_month = Number(tax_year_end_month);
    if (state_of_incorporation !== undefined) profile.state_of_incorporation = state_of_incorporation.toUpperCase().trim();
    if (profile_status) profile.profile_status = profile_status;

    // Validate and mask EIN
    if (ein_masked !== undefined) {
      const cleanEin = ein_masked.trim();
      if (cleanEin) {
        // If 9 continuous digits "123456789", mask as "XX-XXX6789"
        if (/^\d{9}$/.test(cleanEin)) {
          profile.ein_masked = `XX-XXX${cleanEin.slice(5)}`;
        } else if (/^\d{2}-\d{7}$/.test(cleanEin)) {
          profile.ein_masked = `XX-XXX${cleanEin.slice(5)}`;
        } else {
          profile.ein_masked = cleanEin;
        }
      } else {
        profile.ein_masked = '';
      }
    }

    if (tax_provider) {
      profile.tax_provider = {
        ...profile.tax_provider.toObject(),
        ...tax_provider
      };
    }

    profile.audit_metadata = {
      updated_by_user_id: req.user?._id || null,
      last_updated_at: new Date(),
      change_notes: 'Updated via organization tax settings'
    };
    profile.row_version = (profile.row_version || 1) + 1;

    await profile.save();

    return res.success(profile, { message: 'Company tax profile updated successfully' });
  } catch (err) {
    return res.error('Failed to update company tax profile', 400, err.message);
  }
}

// ==========================================
// 2. JURISDICTIONS CATALOG
// ==========================================

async function listJurisdictions(req, res) {
  try {
    const {
      type,
      state,
      search,
      coverage_status,
      page = 1,
      limit = 100
    } = req.query;

    const query = { is_active: true };

    if (type) query.jurisdiction_type = type.toUpperCase().trim();
    if (state) query.state_code = state.toUpperCase().trim();
    if (coverage_status) query.provider_coverage_status = coverage_status.toUpperCase().trim();
    if (search) {
      query.$or = [
        { jurisdiction_code: { $regex: search.trim(), $options: 'i' } },
        { jurisdiction_name: { $regex: search.trim(), $options: 'i' } },
        { fips_code: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      TaxJurisdiction.find(query)
        .populate('parent_jurisdiction_id', 'jurisdiction_code jurisdiction_name')
        .sort({ jurisdiction_type: 1, state_code: 1, jurisdiction_name: 1 })
        .skip(skip)
        .limit(Number(limit)),
      TaxJurisdiction.countDocuments(query)
    ]);

    return res.success({
      records,
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    }, { message: 'Tax jurisdictions retrieved successfully' });
  } catch (err) {
    return res.error('Failed to list tax jurisdictions', 500, err.message);
  }
}

async function getJurisdictionDetail(req, res) {
  try {
    const { idOrCode } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrCode);

    const jurisdiction = isObjectId
      ? await TaxJurisdiction.findById(idOrCode).populate('parent_jurisdiction_id')
      : await TaxJurisdiction.findOne({ jurisdiction_code: idOrCode.toUpperCase().trim() }).populate('parent_jurisdiction_id');

    if (!jurisdiction) {
      return res.error(`Tax jurisdiction not found: "${idOrCode}"`, 404);
    }

    return res.success(jurisdiction, { message: 'Tax jurisdiction retrieved successfully' });
  } catch (err) {
    return res.error('Failed to retrieve tax jurisdiction details', 500, err.message);
  }
}

// ==========================================
// 3. TAX REGISTRATIONS
// ==========================================

async function listRegistrations(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const registrations = await TaxRegistration.find({
      tenant_id: tenantId,
      company_id: companyId
    })
      .populate('jurisdiction_id', 'jurisdiction_code jurisdiction_name jurisdiction_type state_code')
      .sort({ created_at: -1 });

    return res.success(registrations, { message: 'Tax registrations retrieved successfully' });
  } catch (err) {
    return res.error('Failed to list tax registrations', 500, err.message);
  }
}

async function createRegistration(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      jurisdiction_id,
      tax_type = 'SALES_USE_TAX',
      registration_number,
      registration_status = 'ACTIVE',
      filing_frequency = 'MONTHLY',
      effective_from = new Date(),
      effective_to = null,
      notes = ''
    } = req.body;

    if (!jurisdiction_id || !registration_number) {
      return res.error('jurisdiction_id and registration_number are required', 400);
    }

    // Verify jurisdiction exists
    const jurisdiction = await TaxJurisdiction.findById(jurisdiction_id);
    if (!jurisdiction) {
      return res.error('Specified tax jurisdiction does not exist', 404);
    }

    // Check duplicate active registration for same jurisdiction and tax type
    if (registration_status === 'ACTIVE' && !effective_to) {
      const existingActive = await TaxRegistration.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        jurisdiction_id,
        tax_type,
        registration_status: 'ACTIVE',
        effective_to: null
      });

      if (existingActive) {
        return res.error(
          `Company already has an active registration for ${jurisdiction.jurisdiction_name} (${tax_type}): "${existingActive.registration_number}". To replace, expire or revoke the existing registration first.`,
          409
        );
      }
    }

    const registration = await TaxRegistration.create({
      tenant_id: tenantId,
      company_id: companyId,
      jurisdiction_id,
      tax_type,
      registration_number: registration_number.trim(),
      registration_status,
      filing_frequency,
      effective_from: new Date(effective_from),
      effective_to: effective_to ? new Date(effective_to) : null,
      notes: notes.trim()
    });

    const populated = await TaxRegistration.findById(registration._id).populate('jurisdiction_id');
    return res.success(populated, { message: 'Tax registration created successfully' }, 201);
  } catch (err) {
    return res.error('Failed to create tax registration', 400, err.message);
  }
}

async function updateRegistration(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { id } = req.params;
    const {
      registration_status,
      filing_frequency,
      effective_to,
      verification_status,
      notes
    } = req.body;

    const registration = await TaxRegistration.findOne({
      _id: id,
      tenant_id: tenantId,
      company_id: companyId
    });

    if (!registration) {
      return res.error('Tax registration not found', 404);
    }

    if (registration_status) registration.registration_status = registration_status;
    if (filing_frequency) registration.filing_frequency = filing_frequency;
    if (effective_to !== undefined) registration.effective_to = effective_to ? new Date(effective_to) : null;
    if (verification_status) registration.verification_status = verification_status;
    if (notes !== undefined) registration.notes = notes.trim();

    registration.row_version = (registration.row_version || 1) + 1;
    await registration.save();

    const populated = await TaxRegistration.findById(registration._id).populate('jurisdiction_id');
    return res.success(populated, { message: 'Tax registration updated successfully' });
  } catch (err) {
    return res.error('Failed to update tax registration', 400, err.message);
  }
}

// ==========================================
// 4. NEXUS REVIEWS
// ==========================================

async function listNexusReviews(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const reviews = await NexusReview.find({
      tenant_id: tenantId,
      company_id: companyId
    })
      .populate('jurisdiction_id', 'jurisdiction_code jurisdiction_name state_code')
      .populate('related_registration_id', 'registration_number registration_status')
      .populate('reviewer_user_id', 'name email')
      .sort({ review_status: 1, created_at: -1 });

    return res.success(reviews, { message: 'Nexus reviews retrieved successfully' });
  } catch (err) {
    return res.error('Failed to list nexus reviews', 500, err.message);
  }
}

async function upsertNexusReview(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const {
      jurisdiction_id,
      review_status = 'REVIEW_REQUIRED',
      nexus_type = 'PHYSICAL',
      evidence_sources = [],
      decision_notes = '',
      follow_up_action = '',
      follow_up_date = null,
      related_registration_id = null
    } = req.body;

    if (!jurisdiction_id) {
      return res.error('jurisdiction_id is required', 400);
    }

    let review = await NexusReview.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      jurisdiction_id
    });

    const isNew = !review;
    if (!review) {
      review = new NexusReview({
        tenant_id: tenantId,
        company_id: companyId,
        jurisdiction_id
      });
    }

    const previousStatus = review.review_status;
    review.review_status = review_status;
    review.nexus_type = nexus_type;
    review.evidence_sources = Array.isArray(evidence_sources) ? evidence_sources : [];
    review.decision_notes = decision_notes.trim();
    review.follow_up_action = follow_up_action.trim();
    review.follow_up_date = follow_up_date ? new Date(follow_up_date) : null;
    review.related_registration_id = related_registration_id || null;
    review.reviewer_user_id = req.user?._id || null;
    review.reviewed_at = new Date();

    // Append to audit history
    review.audit_history.push({
      status: review_status,
      changed_by_user_id: req.user?._id || null,
      changed_at: new Date(),
      notes: isNew ? 'Initial review recorded' : `Status changed from ${previousStatus} to ${review_status}`
    });

    review.row_version = (review.row_version || 1) + 1;
    await review.save();

    const populated = await NexusReview.findById(review._id)
      .populate('jurisdiction_id')
      .populate('reviewer_user_id', 'name email');

    return res.success(populated, { message: 'Nexus review recorded successfully' });
  } catch (err) {
    return res.error('Failed to record nexus review', 400, err.message);
  }
}

// ==========================================
// 5. TAX PROVIDER INTEGRATION & HEALTH
// ==========================================

async function getProviderHealth(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;

    const profile = await CompanyTaxProfile.findOne({
      tenant_id: tenantId,
      company_id: companyId
    });

    const providerConfig = profile?.tax_provider || { provider_name: 'MOCK', environment: 'SANDBOX' };
    const provider = TaxProviderFactory.getProvider({
      providerName: providerConfig.provider_name,
      environment: providerConfig.environment
    });

    const health = await provider.checkHealth();
    return res.success(health, { message: 'Tax provider health checked successfully' });
  } catch (err) {
    return res.error('Provider health check failed', 503, err.message);
  }
}

async function lookupRates(req, res) {
  try {
    const tenantId = req.tenantId;
    const companyId = req.companyId;
    const { state, zip, city, street } = req.query;

    if (!state) {
      return res.error('state code is required for rate lookup', 400);
    }

    const profile = await CompanyTaxProfile.findOne({
      tenant_id: tenantId,
      company_id: companyId
    });

    const provider = TaxProviderFactory.getProvider({
      providerName: profile?.tax_provider?.provider_name || 'MOCK',
      environment: profile?.tax_provider?.environment || 'SANDBOX'
    });

    const rates = await provider.lookupRates({ state, zip, city, street });
    return res.success(rates, { message: 'Tax rates retrieved successfully' });
  } catch (err) {
    return res.error('Rate lookup failed', err.statusCode || 500, err.message);
  }
}

// ==========================================
// 6. SEED DATA IMPORT & PROVENANCE
// ==========================================

async function previewSeedImport(req, res) {
  try {
    const preview = await importJurisdictionSeeds({
      dryRun: true,
      userId: req.user?._id || null,
      tenantId: req.tenantId || null
    });

    return res.success(preview, { message: 'Seed import preview generated successfully' });
  } catch (err) {
    return res.error('Seed import preview failed', 500, err.message);
  }
}

async function executeSeedImport(req, res) {
  try {
    const result = await importJurisdictionSeeds({
      dryRun: false,
      userId: req.user?._id || null,
      tenantId: req.tenantId || null
    });

    if (!result.success) {
      return res.error(result.message, 400, result.errors);
    }

    return res.success(result, { message: 'Seed import completed successfully' });
  } catch (err) {
    return res.error('Seed import execution failed', 500, err.message);
  }
}

async function getSyncLogs(req, res) {
  try {
    const logs = await TaxProviderSyncLog.find()
      .populate('executed_by_user_id', 'name email')
      .sort({ created_at: -1 })
      .limit(50);

    return res.success(logs, { message: 'Tax sync logs retrieved successfully' });
  } catch (err) {
    return res.error('Failed to retrieve tax sync logs', 500, err.message);
  }
}

// ==========================================
// 7. TRANSACTION TAX CALCULATION & SNAPSHOTS (PHASE 3)
// ==========================================

async function calculateTax(req, res) {
  try {
    const result = await usTaxCalculationService.calculateTransactionTax(req.body, {
      tenantId: req.tenantId,
      companyId: req.companyId,
      userId: req.user?._id
    });

    return res.success(result, { message: 'Tax calculated successfully' });
  } catch (err) {
    const status = err.statusCode || (err.code === 'PRODUCTION_MOCK_DISALLOWED' ? 503 : 500);
    return res.error(err.message, status, err.code || null);
  }
}

async function listSnapshots(req, res) {
  try {
    const result = await usTaxCalculationService.listCalculationSnapshots(
      req.query,
      { tenantId: req.tenantId, companyId: req.companyId },
      { limit: req.query.limit, skip: req.query.skip }
    );

    return res.success(result, { message: 'Tax snapshots retrieved successfully' });
  } catch (err) {
    return res.error('Failed to retrieve tax snapshots', 500, err.message);
  }
}

async function getSnapshot(req, res) {
  try {
    const snapshot = await usTaxCalculationService.getCalculationSnapshot(
      req.params.transactionId,
      { tenantId: req.tenantId, companyId: req.companyId }
    );

    return res.success(snapshot, { message: 'Tax snapshot retrieved successfully' });
  } catch (err) {
    return res.error(err.message, err.statusCode || 500);
  }
}

async function commitSnapshot(req, res) {
  try {
    const snapshot = await usTaxCalculationService.commitCalculationSnapshot(
      req.params.transactionId,
      { tenantId: req.tenantId, companyId: req.companyId }
    );

    return res.success(snapshot, { message: 'Tax snapshot committed successfully' });
  } catch (err) {
    return res.error(err.message, err.statusCode || 500);
  }
}

// ==========================================
// 8. TAX RETURN PERIODS (Phase 5)
// ==========================================

async function createReturnPeriod(req, res) {
  try {
    const period = await usTaxPeriodService.createReturnPeriod({
      tenantId: req.tenantId,
      companyId: req.companyId,
      userId: req.user?._id,
      ...req.body
    });
    return res.success(period, { message: 'Tax return period created successfully' });
  } catch (err) {
    return res.error(err.message, err.code === 'DUPLICATE_PERIOD' ? 409 : 400);
  }
}

async function listReturnPeriods(req, res) {
  try {
    const result = await usTaxPeriodService.listReturnPeriods({
      tenantId: req.tenantId,
      companyId: req.companyId,
      jurisdictionCode: req.query.jurisdiction_code,
      status: req.query.status,
      year: req.query.year
    });
    return res.success(result, { message: 'Tax return periods retrieved successfully' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function getReturnPeriod(req, res) {
  try {
    const period = await usTaxPeriodService.getReturnPeriod(req.params.id, {
      tenantId: req.tenantId,
      companyId: req.companyId
    });
    return res.success(period, { message: 'Tax return period retrieved successfully' });
  } catch (err) {
    return res.error(err.message, 404);
  }
}

async function updateReturnPeriodStatus(req, res) {
  try {
    const period = await usTaxPeriodService.updateReturnPeriodStatus(
      req.params.id,
      req.body.status,
      {
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user?._id
      }
    );
    return res.success(period, { message: `Return period status updated to ${req.body.status}` });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

// ==========================================
// 9. TAX LIABILITY SUBLEDGER (Phase 5)
// ==========================================

async function getLiabilityEntries(req, res) {
  try {
    const result = await usTaxSubledgerService.getLiabilityEntries({
      tenantId: req.tenantId,
      companyId: req.companyId,
      jurisdictionCode: req.query.jurisdiction_code,
      entryType: req.query.entry_type,
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      sourceDocumentNumber: req.query.document_number,
      page: req.query.page,
      limit: req.query.limit
    });
    return res.success(result, { message: 'Tax liability subledger entries retrieved' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function getLiabilitySummary(req, res) {
  try {
    const summary = await usTaxSubledgerService.getLiabilitySummary({
      tenantId: req.tenantId,
      companyId: req.companyId,
      jurisdictionCode: req.query.jurisdiction_code,
      startDate: req.query.start_date,
      endDate: req.query.end_date
    });
    return res.success(summary, { message: 'Tax liability summary computed' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

// ==========================================
// 10. TAX RETURNS DRAFT & LIFECYCLE (Phase 5)
// ==========================================

async function prepareDraftReturn(req, res) {
  try {
    const draft = await usTaxReturnService.prepareDraftReturn({
      tenantId: req.tenantId,
      companyId: req.companyId,
      returnPeriodId: req.body.return_period_id,
      schemaVersion: req.body.schema_version,
      userId: req.user?._id
    });
    return res.success(draft, { message: 'Draft tax return prepared successfully' });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function transitionReturnStatus(req, res) {
  try {
    const ret = await usTaxReturnService.transitionReturnStatus(
      req.params.id,
      req.body.status,
      {
        filingConfirmationReference: req.body.filing_confirmation_reference || req.body.external_filing_reference,
        notes: req.body.notes,
        filingMethod: req.body.filing_method,
        verificationStatus: req.body.verification_status,
        filingNotes: req.body.filing_notes,
        externalFiledAt: req.body.external_filed_at
      },
      {
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user?._id
      }
    );
    return res.success(ret, { message: `Tax return moved to ${req.body.status}` });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function listReturns(req, res) {
  try {
    const result = await usTaxReturnService.listReturns({
      tenantId: req.tenantId,
      companyId: req.companyId,
      jurisdictionCode: req.query.jurisdiction_code,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit
    });
    return res.success(result, { message: 'Tax returns retrieved successfully' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function getReturnDetail(req, res) {
  try {
    const ret = await usTaxReturnService.getReturnById({
      tenantId: req.tenantId,
      companyId: req.companyId,
      returnId: req.params.id
    });
    return res.success(ret, { message: 'Tax return details retrieved' });
  } catch (err) {
    return res.error(err.message, 404);
  }
}

// ==========================================
// 11. TAX PAYMENTS & CREDITS (Phase 5)
// ==========================================

async function recordTaxPayment(req, res) {
  try {
    const payment = await usTaxPaymentService.recordTaxPayment({
      tenantId: req.tenantId,
      companyId: req.companyId,
      returnId: req.body.return_id,
      returnPeriodId: req.body.return_period_id,
      amount: req.body.amount,
      paymentDate: req.body.payment_date,
      paymentMethod: req.body.payment_method,
      bankAccountId: req.body.bank_account_id,
      bankAccountCode: req.body.bank_account_code,
      paymentReference: req.body.payment_reference,
      confirmationReference: req.body.confirmation_reference,
      postToGl: req.body.post_to_gl !== false,
      userId: req.user?._id
    });
    return res.success(payment, { message: 'Tax payment recorded successfully' });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function confirmTaxPayment(req, res) {
  try {
    const payment = await usTaxPaymentService.confirmTaxPayment(
      req.params.id,
      {
        confirmationReference: req.body.confirmation_reference,
        paymentStatus: req.body.payment_status
      },
      {
        tenantId: req.tenantId,
        companyId: req.companyId,
        userId: req.user?._id
      }
    );
    return res.success(payment, { message: 'Tax payment confirmed successfully' });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function listTaxPayments(req, res) {
  try {
    const result = await usTaxPaymentService.listPayments({
      tenantId: req.tenantId,
      companyId: req.companyId,
      jurisdictionCode: req.query.jurisdiction_code,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit
    });
    return res.success(result, { message: 'Tax payments retrieved successfully' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

// ==========================================
// 12. RECONCILIATIONS & PROVIDER RETRY (Phase 5)
// ==========================================

async function reconcileDocumentsToSubledger(req, res) {
  try {
    const result = await usTaxReconciliationService.reconcileDocumentsToSubledger({
      tenantId: req.tenantId,
      companyId: req.companyId,
      startDate: req.query.start_date,
      endDate: req.query.end_date
    });
    return res.success(result, { message: 'Document-to-Subledger reconciliation completed' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function reconcileSubledgerToGl(req, res) {
  try {
    const result = await usTaxReconciliationService.reconcileSubledgerToGl({
      tenantId: req.tenantId,
      companyId: req.companyId,
      startDate: req.query.start_date,
      endDate: req.query.end_date
    });
    return res.success(result, { message: 'Subledger-to-GL reconciliation completed' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

async function reconcileReturnToPayments(req, res) {
  try {
    const result = await usTaxReconciliationService.reconcileReturnToPayments({
      tenantId: req.tenantId,
      companyId: req.companyId,
      returnId: req.params.returnId
    });
    return res.success(result, { message: 'Return-to-Payments reconciliation completed' });
  } catch (err) {
    return res.error(err.message, 400);
  }
}

async function retryProviderReconciliations(req, res) {
  try {
    const result = await usTaxReconciliationService.retryPendingProviderReconciliations({
      tenantId: req.tenantId,
      companyId: req.companyId,
      limit: req.body.limit,
      userId: req.user?._id
    });
    return res.success(result, { message: 'Provider reconciliation retry worker completed' });
  } catch (err) {
    return res.error(err.message, 500);
  }
}

module.exports = {
  getCompanyTaxProfile,
  updateCompanyTaxProfile,
  listJurisdictions,
  getJurisdictionDetail,
  listRegistrations,
  createRegistration,
  updateRegistration,
  listNexusReviews,
  upsertNexusReview,
  getProviderHealth,
  lookupRates,
  previewSeedImport,
  executeSeedImport,
  getSyncLogs,
  calculateTax,
  listSnapshots,
  getSnapshot,
  commitSnapshot,
  // Phase 5 exports
  createReturnPeriod,
  listReturnPeriods,
  getReturnPeriod,
  updateReturnPeriodStatus,
  getLiabilityEntries,
  getLiabilitySummary,
  prepareDraftReturn,
  transitionReturnStatus,
  listReturns,
  getReturnDetail,
  recordTaxPayment,
  confirmTaxPayment,
  listTaxPayments,
  reconcileDocumentsToSubledger,
  reconcileSubledgerToGl,
  reconcileReturnToPayments,
  retryProviderReconciliations
};
