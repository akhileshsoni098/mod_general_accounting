const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  StockMovement,
  BillAllocation
} = require('../models');
const transactionHelper = require('../utils/transactionHelper');
const journalPostingService = require('./journalPostingService');
const stockMovementService = require('./stockMovementService');

/**
 * Reverses a posted commercial document, its financial journals,
 * its stock movements, and its bill-wise allocations atomically.
 */
async function reverseCommercialDocument({ tenantId, companyId, documentId, userId, reason = '' }) {
  if (!tenantId || !companyId || !documentId) {
    throw new Error('tenantId, companyId, and documentId are required');
  }

  const operation = async (session) => {
    const doc = await CommercialDocument.findOne({
      _id: documentId,
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    if (!doc) {
      throw new Error(`Commercial document not found: ${documentId}`);
    }
    if (doc.status !== 'POSTED') {
      throw new Error(`Cannot reverse document with status "${doc.status}". Only POSTED documents can be reversed.`);
    }

    // 1. Reverse Primary Journal
    let revJournal = null;
    if (doc.journal_id) {
      const revRes = await journalPostingService.reverseJournalEntry({
        tenantId,
        companyId,
        userId,
        journalId: doc.journal_id,
        reversalDate: new Date(),
        reversalMemo: `Reversal of ${doc.document_number}: ${reason || 'Commercial Document Reversal'}`,
        session
      });
      revJournal = revRes.reversal_journal;
    }

    // 2. Reverse COGS Journal (if exists)
    let revCogsJournal = null;
    if (doc.cogs_journal_id) {
      const revCogsRes = await journalPostingService.reverseJournalEntry({
        tenantId,
        companyId,
        userId,
        journalId: doc.cogs_journal_id,
        reversalDate: new Date(),
        reversalMemo: `Reversal of COGS for ${doc.document_number}: ${reason || 'Commercial Document Reversal'}`,
        session
      });
      revCogsJournal = revCogsRes.reversal_journal;
    }

    // 3. Reverse Stock Movements
    for (const line of doc.lines) {
      if (line.stock_movement_id) {
        await reverseStockMovement({
          tenantId,
          companyId,
          movementId: line.stock_movement_id,
          reason: `Reversal of ${doc.document_number}`,
          userId,
          session
        });
      }
    }

    // 4. Reverse Bill Allocations (if this document was a receipt or payment)
    const activeAllocations = await BillAllocation.find({
      tenant_id: tenantId,
      company_id: companyId,
      payment_document_id: doc._id,
      status: 'ACTIVE'
    }).session(session);

    for (const alloc of activeAllocations) {
      alloc.status = 'REVERSED';
      alloc.reversal_reason = reason || 'Payment document reversed';
      await alloc.save({ session });

      // Restore target invoice balance
      const inv = await CommercialDocument.findOne({
        _id: alloc.invoice_document_id,
        tenant_id: tenantId,
        company_id: companyId
      }).session(session);

      if (inv) {
        const allocBn = new BigNumber(alloc.allocated_amount.toString());
        const curPaidBn = new BigNumber(inv.amount_paid ? inv.amount_paid.toString() : '0');
        const curBalBn = new BigNumber(inv.balance_due ? inv.balance_due.toString() : '0');

        inv.amount_paid = mongoose.Types.Decimal128.fromString(curPaidBn.minus(allocBn).toFixed(2));
        inv.balance_due = mongoose.Types.Decimal128.fromString(curBalBn.plus(allocBn).toFixed(2));
        inv.row_version = (inv.row_version || 1) + 1;
        await inv.save({ session });
      }
    }

    // 5. Handle US Tax Snapshot Cancellation
    if (doc.tax_snapshot_id) {
      try {
        const TaxCalculationSnapshot = mongoose.model('TaxCalculationSnapshot');
        const snapshot = await TaxCalculationSnapshot.findById(doc.tax_snapshot_id).session(session);
        if (snapshot) {
          snapshot.status = 'CANCELLED';
          snapshot.row_version = (snapshot.row_version || 1) + 1;
          await snapshot.save({ session });
        }
      } catch (snapErr) {
        console.warn('[commercialReversalService] Warning updating tax snapshot on reversal:', snapErr.message);
      }

      try {
        const TaxProviderFactory = require('./taxProvider/TaxProviderFactory');
        const CompanyTaxProfile = mongoose.model('CompanyTaxProfile');
        const taxProfile = await CompanyTaxProfile.findOne({ tenant_id: tenantId, company_id: companyId }).session(session);
        const providerName = doc.tax_provider_name || (taxProfile ? taxProfile.provider_name : 'MOCK');
        const provider = TaxProviderFactory.createProvider(providerName, {
          environment: (taxProfile && taxProfile.environment) || 'SANDBOX',
          apiKey: taxProfile?.api_credentials?.api_key
        });
        if (typeof provider.voidTransaction === 'function') {
          await provider.voidTransaction({
            provider_transaction_id: doc.tax_provider_transaction_id || `TX-${doc.document_number}`,
            document_number: doc.document_number,
            reason: reason || 'Commercial Document Reversal'
          });
        }
      } catch (providerErr) {
        console.warn('[commercialReversalService] Warning voiding tax provider transaction on reversal:', providerErr.message);
      }

      // Phase 5: Reverse US Tax Liability Subledger Entry
      try {
        const usTaxSubledgerService = require('./usTaxSubledgerService');
        await usTaxSubledgerService.reverseDocumentLiabilityEntry({
          tenantId,
          companyId,
          document: doc,
          reversalJournalId: revJournal?._id,
          userId,
          reason,
          session
        });
      } catch (subledgerErr) {
        console.warn('[commercialReversalService] Warning recording tax liability reversal entry:', subledgerErr.message);
      }
    }

    // 6. Update document status
    doc.status = 'REVERSED';
    doc.reversal_reason = reason || 'Reversed by user';
    doc.row_version = (doc.row_version || 1) + 1;
    doc.audit_trail.push({
      action: 'REVERSED',
      user_id: userId || null,
      timestamp: new Date(),
      note: `Reversed document ${doc.document_number}: ${reason}`
    });

    await doc.save({ session });

    return {
      document: doc,
      reversal_journal: revJournal,
      reversal_cogs_journal: revCogsJournal
    };
  };

  return transactionHelper.withOptionalTransaction(operation);
}

module.exports = {
  reverseCommercialDocument
};
