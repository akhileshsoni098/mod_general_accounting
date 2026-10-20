require('dotenv').config();
const mongoose = require('mongoose');
const {
  SubledgerBalance,
  ReconciliationCase,
  TrialBalanceSnapshot,
  TrialBalanceLine,
  PeriodCloseTask,
  GLExportBatch,
  CommissionAdjustment,
  CommissionDispute
} = require('../models');
const { connectDB } = require('../config/db');

async function dropModule41LegacyIndexes() {
  await connectDB();
  console.log('[INDEX REFRESH] Checking and dropping legacy non-tenant indexes on Module 41 collections...');

  const models = [
    SubledgerBalance,
    ReconciliationCase,
    TrialBalanceSnapshot,
    TrialBalanceLine,
    PeriodCloseTask,
    GLExportBatch,
    CommissionAdjustment,
    CommissionDispute
  ];

  for (const model of models) {
    try {
      const indexes = await model.collection.indexes();
      console.log(`Indexes for ${model.collection.name}:`, indexes.map(i => i.name));
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

dropModule41LegacyIndexes().catch(err => {
  console.error(err);
  process.exit(1);
});
