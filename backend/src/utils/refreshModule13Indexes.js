require('dotenv').config();
const mongoose = require('mongoose');
const {
  CommissionAgreement,
  CommissionSchedule,
  ProfitCommissionSchedule,
  CommissionSplit,
  CommissionTransaction,
  FiduciaryAccount,
  BordereauDefinition,
  BordereauRun,
  BordereauLine,
  SettlementStatement,
  SettlementLine
} = require('../models');
const { connectDB } = require('../config/db');

async function dropLegacyIndexes() {
  await connectDB();
  console.log('[INDEX REFRESH] Checking and dropping legacy indexes on Module 13 collections...');

  const models = [
    CommissionAgreement,
    CommissionSchedule,
    ProfitCommissionSchedule,
    CommissionSplit,
    CommissionTransaction,
    FiduciaryAccount,
    BordereauDefinition,
    BordereauRun,
    BordereauLine,
    SettlementStatement,
    SettlementLine
  ];

  for (const model of models) {
    try {
      const indexes = await model.collection.indexes();
      console.log(`Indexes for ${model.collection.name}:`, indexes.map(i => i.name));
      // Drop any non-tenant unique index if present
      for (const idx of indexes) {
        if (idx.name !== '_id_' && !idx.name.includes('tenant_id')) {
          console.log(`Dropping non-tenant index ${idx.name} on ${model.collection.name}`);
          await model.collection.dropIndex(idx.name);
        }
      }
    } catch (err) {
      console.log(`Collection ${model.collection.name} not found or no indexes to drop.`);
    }
  }

  console.log('[INDEX REFRESH] Done.');
  process.exit(0);
}

dropLegacyIndexes().catch(err => {
  console.error(err);
  process.exit(1);
});
