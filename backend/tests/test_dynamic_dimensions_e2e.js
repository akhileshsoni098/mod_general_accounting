require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const {
  DimensionDefinition,
  JournalEntry,
  Journal,
  LedgerAccount,
  Party,
  PartyRole,
  Invoice
} = require('../src/models');
const { seedTenantDimensions } = require('../src/utils/seedDimensions');
const commissionsController = require('../src/controllers/commissionsController');
const { seedAllGuideScenarios } = require('../src/utils/seedAllGuideScenarios');

async function runTest() {
  console.log('--- STARTING DYNAMIC DIMENSIONS E2E TEST ---');
  await connectDB();
  const tenantId = '6acd045ef52f66e7422cf445';

  // 1. Ensure seed rules & dimensions
  await seedTenantDimensions(tenantId);
  await seedAllGuideScenarios(tenantId);

  // 2. Add or ensure custom counterparties
  let summit = await Party.findOne({ tenant_id: tenantId, party_code: 'SUMMIT-CARRIER' });
  if (!summit) {
    summit = await Party.create({
      tenant_id: tenantId,
      party_code: 'SUMMIT-CARRIER',
      legal_name: 'Summit Mutual Insurance Company',
      status: 'ACTIVE'
    });
    await PartyRole.create({
      tenant_id: tenantId,
      party_id: summit._id,
      role_type: 'CARRIER',
      status: 'ACTIVE'
    });
  }

  let brightline = await Party.findOne({ tenant_id: tenantId, party_code: 'BRIGHTLINE-BROKER' });
  if (!brightline) {
    brightline = await Party.create({
      tenant_id: tenantId,
      party_code: 'BRIGHTLINE-BROKER',
      legal_name: 'Brightline Retail Risk Agency',
      status: 'ACTIVE'
    });
    await PartyRole.create({
      tenant_id: tenantId,
      party_id: brightline._id,
      role_type: 'BROKER',
      status: 'ACTIVE'
    });
  }

  // 3. Test allocateCommissionShares with full dynamic dimensions
  const mockReq = {
    tenantId,
    user: { _id: new mongoose.Types.ObjectId() },
    body: {
      policy_reference: 'POL-TX-8821',
      invoice_reference: 'INV-2026-00001',
      installment_premium: 9412.50,
      carrier_id: 'SUMMIT-CARRIER',
      carrier_name: 'Summit Mutual Insurance Company',
      broker_id: 'BRIGHTLINE-BROKER',
      broker_name: 'Brightline Retail Risk Agency',
      mga_id: 'HARBOR-MGA',
      carrier_rate: 80.0,
      broker_rate: 10.0,
      mga_rate: 10.0,
      cost_center: 'CC-OPS-UNDERWRITING',
      company_code: 'VERIDEX-TX-001',
      dimensions: {
        custom_lob: 'COMMERCIAL_AUTO_FLEET',
        region: 'SOUTHWEST_TX',
        audit_tag: 'AUDIT-PASS-2026'
      }
    }
  };

  let responseData = null;
  let responseStatus = 200;
  const mockRes = {
    status: (s) => {
      responseStatus = s;
      return mockRes;
    },
    json: (d) => {
      responseData = d;
      return mockRes;
    }
  };

  await commissionsController.allocateCommissionShares(mockReq, mockRes);

  if (responseStatus !== 201) {
    console.error('Commission allocation failed:', responseData);
    process.exit(1);
  }

  console.log('✓ Commission allocation successful!');
  console.log('  Journal created:', responseData.data.journal.journal_number);

  // 4. Inspect General Ledger lines and their dimensions
  const journalId = responseData.data.journal._id;
  const lines = await JournalEntry.find({ tenant_id: tenantId, journal_id: journalId }).sort({ line_number: 1 });

  console.log(`\n--- INSPECTING ${lines.length} GENERAL LEDGER LINES & DYNAMIC DIMENSIONS ---`);
  for (const line of lines) {
    console.log(`Line #${line.line_number} [Account ${line.account_code}] Dr: $${line.debit} | Cr: $${line.credit}`);
    console.log('  Dimensions:', JSON.stringify(line.dimensions, null, 2));

    // Verify Account 2010 has carrier dimensions
    if (line.account_code === '2010') {
      if (!line.dimensions.carrier_id || !line.dimensions.carrier_name) {
        throw new Error('Account 2010 (Due to Carrier) is missing carrier_id or carrier_name dimension!');
      }
      console.log('  ✓ Verified 2010 Due to Carrier has carrier_id & carrier_name stamped!');
    }

    // Verify Account 2020 has broker dimensions
    if (line.account_code === '2020') {
      if (!line.dimensions.broker_id || !line.dimensions.broker_name) {
        throw new Error('Account 2020 (Broker Payable) is missing broker_id or broker_name dimension!');
      }
      console.log('  ✓ Verified 2020 Broker Payable has broker_id & broker_name stamped!');
    }

    // Verify custom dimensions passed through
    if (line.dimensions.cost_center !== 'CC-OPS-UNDERWRITING') {
      throw new Error(`Expected cost_center to be CC-OPS-UNDERWRITING, got: ${line.dimensions.cost_center}`);
    }
    if (line.dimensions.company_code !== 'VERIDEX-TX-001') {
      throw new Error(`Expected company_code to be VERIDEX-TX-001, got: ${line.dimensions.company_code}`);
    }
    if (line.dimensions.custom_lob !== 'COMMERCIAL_AUTO_FLEET') {
      throw new Error(`Expected custom_lob to be COMMERCIAL_AUTO_FLEET, got: ${line.dimensions.custom_lob}`);
    }
  }

  console.log('\n--- ALL DYNAMIC DIMENSIONS VERIFIED ON GL ENTRIES WITH 100% ACCURACY! ---');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
