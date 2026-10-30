require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Company } = require('../models');
const { seedCompanyChartOfAccounts, COMMERCIAL_ERP_COA } = require('../utils/seedCoa');

async function run() {
  try {
    console.log('[Seed] Connecting to MongoDB...');
    await connectDB();
    console.log('[Seed] Connected to MongoDB.');

    const companies = await Company.find({ status: 'ACTIVE' }).limit(50);
    console.log(`[Seed] Found ${companies.length} active companies to seed.`);

    for (const comp of companies) {
      console.log(`[Seed] Seeding Chart of Accounts for company: "${comp.company_name}" (${comp.company_code})...`);
      await seedCompanyChartOfAccounts(comp.tenant_id, comp._id, {
        currency: comp.base_currency || 'INR'
      });
      console.log(`[Seed] OK: "${comp.company_name}"`);
    }

    console.log('[Seed] User accounts seeded successfully:');
    const userCodes = ['1002', '1010', '1100', '1210', '1220', '1300', '1410', '1500', '1590', '2000', '2120', '2210', '2220', '4000', '5010', '5020', '5210', '5300'];
    userCodes.forEach(code => {
      const itm = COMMERCIAL_ERP_COA.find(c => c.account_code === code);
      if (itm) {
        console.log(`  ✓ ${itm.account_code.padEnd(6)} | ${itm.account_name.padEnd(38)} | ${itm.account_type.padEnd(10)} | ${itm.normal_balance}`);
      }
    });

    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error seeding Chart of Accounts:', err);
    process.exit(1);
  }
}

run();
