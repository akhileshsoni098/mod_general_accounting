const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const {
  CommercialDocument,
  StockItem,
  Godown,
  StockBalance,
  StockMovement,
  BillAllocation,
  LedgerAccount,
  FiscalPeriod
} = require('../models');
const { withOptionalTransaction } = require('../utils/transactionHelper');
const { postJournalEntry } = require('./journalPostingService');
const { recordStockMovement } = require('./stockMovementService');
const { validateAndResolvePostingAccounts } = require('./commercialPostingConfigService');

/**
 * Master Posting Service for all commercial documents.
 * Guarantees that source document updates, stock movements, balance changes,
 * double-entry journals, and bill-wise allocations all commit or fail atomically within one session.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.tenantId
 * @param {string|ObjectId} params.companyId
 * @param {string|ObjectId} params.documentId
 * @param {string|ObjectId} params.userId
 * @param {Array<Object>} [params.allocations] - Optional bill-wise allocations for receipts/payments
 * @returns {Promise<Object>}
 */
async function postCommercialDocument({ tenantId, companyId, documentId, userId, allocations = [] }) {
  if (!tenantId || !companyId || !documentId) {
    throw new Error('tenantId, companyId, and documentId are required');
  }

  const operation = async (session) => {
    // 1. Fetch document within session
    const doc = await CommercialDocument.findOne({
      _id: documentId,
      tenant_id: tenantId,
      company_id: companyId
    }).session(session);

    if (!doc) {
      throw new Error(`Commercial document not found: ${documentId}`);
    }

    // Idempotency check: if already POSTED, return it safely
    if (doc.status === 'POSTED') {
      return {
        document: doc,
        is_duplicate: true,
        message: `Document "${doc.document_number}" has already been posted.`
      };
    }

    if (doc.status !== 'DRAFT') {
      throw new Error(`Cannot post document in status "${doc.status}". Only DRAFT documents can be posted.`);
    }

    // 2. Validate posting configuration and accounts
    const { config, accountMap } = await validateAndResolvePostingAccounts(tenantId, companyId, { session });

    // 3. Validate Fiscal Period Lock
    const pDate = doc.posting_date || doc.document_date || new Date();
    const period = await FiscalPeriod.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      start_date: { $lte: pDate },
      end_date: { $gte: pDate }
    }).session(session);

    if (period && (period.status === 'LOCKED' || period.status === 'HARD_CLOSED')) {
      throw new Error(`Fiscal period "${period.period_name}" is ${period.status}. Postings to closed periods are strictly prohibited.`);
    }

    let totalCogsBn = new BigNumber(0);
    const recordedMovements = [];

    // 4. Process Inventory & Stock Movements
    if (['SALES_INVOICE', 'PURCHASE_INVOICE', 'SALES_RETURN', 'PURCHASE_RETURN'].includes(doc.document_type)) {
      const defaultGodown = await Godown.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        is_default: true,
        status: 'ACTIVE'
      }).session(session) || await Godown.findOne({
        tenant_id: tenantId,
        company_id: companyId,
        status: 'ACTIVE'
      }).session(session);

      for (let i = 0; i < doc.lines.length; i++) {
        const line = doc.lines[i];
        if (!line.stock_item_id || line.line_type !== 'ITEM') {
          continue; // Service or account line, no stock movement
        }

        const godownId = line.godown_id || defaultGodown?._id;
        if (!godownId) {
          throw new Error(`Godown is required for inventory line ${line.line_number} (${line.item_name})`);
        }

        const baseQtyBn = new BigNumber(line.base_quantity.toString());
        const targetGodown = await Godown.findOne({ _id: godownId, tenant_id: tenantId, company_id: companyId }).session(session);
        if (!targetGodown || targetGodown.status !== 'ACTIVE') {
          throw new Error(`Godown for line ${line.line_number} is inactive or not found`);
        }

        // ==========================================
        // A. SALES INVOICE (Issue Goods)
        // ==========================================
        if (doc.document_type === 'SALES_INVOICE') {
          let balance = await StockBalance.findOne({
            tenant_id: tenantId,
            company_id: companyId,
            stock_item_id: line.stock_item_id,
            godown_id: godownId
          }).session(session);

          const currentQty = balance ? new BigNumber(balance.quantity_on_hand.toString()) : new BigNumber(0);

          if (!config.allow_negative_stock && currentQty.isLessThan(baseQtyBn)) {
            const err = new Error(
              `INSUFFICIENT_STOCK: Stock item "${line.item_name}" has on-hand balance of ${currentQty.toFixed(4)}, but requested issue is ${baseQtyBn.toFixed(4)} in godown "${targetGodown.godown_name}".`
            );
            err.code = 'INSUFFICIENT_STOCK';
            throw err;
          }

          // Read moving-average cost from balance
          const issueUnitCostBn = balance ? new BigNumber(balance.average_unit_cost.toString()) : new BigNumber(0);
          const lineCogsBn = baseQtyBn.times(issueUnitCostBn);
          totalCogsBn = totalCogsBn.plus(lineCogsBn);

          line.issue_unit_cost = mongoose.Types.Decimal128.fromString(issueUnitCostBn.toFixed(2));
          line.total_cogs_amount = mongoose.Types.Decimal128.fromString(lineCogsBn.toFixed(2));

          const movResult = await recordStockMovement({
            tenantId,
            companyId,
            stockItemId: line.stock_item_id,
            godownId,
            movementType: 'SALES_ISSUE',
            direction: 'OUT',
            quantity: line.quantity.toString(),
            uomId: line.uom_id,
            idempotencyKey: `MOV-SI-${doc._id}-${line.line_number}`,
            effectiveDate: pDate,
            unitRate: issueUnitCostBn.toFixed(2),
            totalCost: lineCogsBn.toFixed(2),
            sourceDocumentType: 'SALES_INVOICE',
            sourceDocumentId: doc.document_number,
            sourceLineId: String(line.line_number),
            notes: `Goods issued for sales invoice ${doc.document_number}`,
            userId,
            session
          });

          line.stock_movement_id = movResult.movement._id;
          recordedMovements.push(movResult.movement);
        }

        // ==========================================
        // B. PURCHASE INVOICE (Receive Goods)
        // ==========================================
        else if (doc.document_type === 'PURCHASE_INVOICE') {
          const lineCostBn = new BigNumber(line.taxable_amount.toString());
          const unitRateBn = baseQtyBn.isGreaterThan(0) ? lineCostBn.dividedBy(baseQtyBn) : new BigNumber(0);

          const movResult = await recordStockMovement({
            tenantId,
            companyId,
            stockItemId: line.stock_item_id,
            godownId,
            movementType: 'PURCHASE_RECEIPT',
            direction: 'IN',
            quantity: line.quantity.toString(),
            uomId: line.uom_id,
            idempotencyKey: `MOV-PI-${doc._id}-${line.line_number}`,
            effectiveDate: pDate,
            unitRate: unitRateBn.toFixed(2),
            totalCost: lineCostBn.toFixed(2),
            sourceDocumentType: 'PURCHASE_INVOICE',
            sourceDocumentId: doc.document_number,
            sourceLineId: String(line.line_number),
            notes: `Goods received from purchase invoice ${doc.document_number}`,
            userId,
            session
          });

          line.stock_movement_id = movResult.movement._id;
          recordedMovements.push(movResult.movement);
        }

        // ==========================================
        // C. SALES RETURN (Customer Return)
        // ==========================================
        else if (doc.document_type === 'SALES_RETURN') {
          if (line.restockable) {
            // Restore inventory at estimated or original issue cost
            let balance = await StockBalance.findOne({
              tenant_id: tenantId,
              company_id: companyId,
              stock_item_id: line.stock_item_id,
              godown_id: godownId
            }).session(session);

            const restockCostRateBn = balance ? new BigNumber(balance.average_unit_cost.toString()) : new BigNumber(0);
            const lineRestockValBn = baseQtyBn.times(restockCostRateBn);
            totalCogsBn = totalCogsBn.plus(lineRestockValBn); // COGS reversal amount

            const movResult = await recordStockMovement({
              tenantId,
              companyId,
              stockItemId: line.stock_item_id,
              godownId,
              movementType: 'PURCHASE_RECEIPT',
              direction: 'IN',
              quantity: line.quantity.toString(),
              uomId: line.uom_id,
              idempotencyKey: `MOV-SR-${doc._id}-${line.line_number}`,
              effectiveDate: pDate,
              unitRate: restockCostRateBn.toFixed(2),
              totalCost: lineRestockValBn.toFixed(2),
              sourceDocumentType: 'SALES_RETURN',
              sourceDocumentId: doc.document_number,
              sourceLineId: String(line.line_number),
              notes: `Restocked goods from sales return ${doc.document_number}`,
              userId,
              session
            });

            line.stock_movement_id = movResult.movement._id;
            recordedMovements.push(movResult.movement);
          }
        }

        // ==========================================
        // D. PURCHASE RETURN (Debit Note / Return to Vendor)
        // ==========================================
        else if (doc.document_type === 'PURCHASE_RETURN') {
          const lineCostBn = new BigNumber(line.taxable_amount.toString());
          const unitRateBn = baseQtyBn.isGreaterThan(0) ? lineCostBn.dividedBy(baseQtyBn) : new BigNumber(0);

          const movResult = await recordStockMovement({
            tenantId,
            companyId,
            stockItemId: line.stock_item_id,
            godownId,
            movementType: 'SALES_ISSUE',
            direction: 'OUT',
            quantity: line.quantity.toString(),
            uomId: line.uom_id,
            idempotencyKey: `MOV-PR-${doc._id}-${line.line_number}`,
            effectiveDate: pDate,
            unitRate: unitRateBn.toFixed(2),
            totalCost: lineCostBn.toFixed(2),
            sourceDocumentType: 'PURCHASE_RETURN',
            sourceDocumentId: doc.document_number,
            sourceLineId: String(line.line_number),
            notes: `Goods returned to supplier for debit note ${doc.document_number}`,
            userId,
            session
          });

          line.stock_movement_id = movResult.movement._id;
          recordedMovements.push(movResult.movement);
        }
      }
    }

    // 5. Generate and Post Double-Entry General Ledger Journals
    const journalLines = [];
    let memoText = `${doc.document_type}: ${doc.document_number}`;

    const grandTotalBn = new BigNumber(doc.grand_total.toString());
    const taxableBn = new BigNumber(doc.total_taxable_amount.toString());
    const cgstBn = new BigNumber(doc.total_cgst_amount.toString());
    const sgstBn = new BigNumber(doc.total_sgst_amount.toString());
    const igstBn = new BigNumber(doc.total_igst_amount.toString());
    const roundOffBn = new BigNumber(doc.round_off_amount.toString());

    // ==========================================
    // 5A. SALES INVOICE GL POSTING
    // ==========================================
    if (doc.document_type === 'SALES_INVOICE') {
      const partyAccountCode = doc.bank_or_cash_account_id
        ? (await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session))?.account_code || config.cash_account_code
        : config.receivable_account_code;

      journalLines.push({
        account_code: partyAccountCode,
        debit: grandTotalBn.toFixed(2),
        credit: '0.00',
        memo: `Receivable from ${doc.party_name || 'Customer'} for ${doc.document_number}`
      });

      journalLines.push({
        account_code: config.sales_revenue_account_code,
        debit: '0.00',
        credit: taxableBn.toFixed(2),
        memo: `Sales revenue for ${doc.document_number}`
      });

      if (cgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.output_cgst_account_code,
          debit: '0.00',
          credit: cgstBn.toFixed(2),
          memo: `Output CGST on ${doc.document_number}`
        });
      }
      if (sgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.output_sgst_account_code,
          debit: '0.00',
          credit: sgstBn.toFixed(2),
          memo: `Output SGST on ${doc.document_number}`
        });
      }
      if (igstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.output_igst_account_code,
          debit: '0.00',
          credit: igstBn.toFixed(2),
          memo: `Output IGST on ${doc.document_number}`
        });
      }

      // Round-off handling
      if (!roundOffBn.isZero()) {
        if (roundOffBn.isPositive()) {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: '0.00',
            credit: roundOffBn.toFixed(2),
            memo: `Round-off credit on ${doc.document_number}`
          });
        } else {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: roundOffBn.abs().toFixed(2),
            credit: '0.00',
            memo: `Round-off debit on ${doc.document_number}`
          });
        }
      }
    }

    // ==========================================
    // 5B. PURCHASE INVOICE GL POSTING
    // ==========================================
    else if (doc.document_type === 'PURCHASE_INVOICE') {
      const partyAccountCode = doc.bank_or_cash_account_id
        ? (await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session))?.account_code || config.bank_account_code
        : config.payable_account_code;

      journalLines.push({
        account_code: config.inventory_asset_account_code,
        debit: taxableBn.toFixed(2),
        credit: '0.00',
        memo: `Inventory received for purchase ${doc.document_number}`
      });

      if (cgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.input_cgst_account_code,
          debit: cgstBn.toFixed(2),
          credit: '0.00',
          memo: `Input CGST credit on ${doc.document_number}`
        });
      }
      if (sgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.input_sgst_account_code,
          debit: sgstBn.toFixed(2),
          credit: '0.00',
          memo: `Input SGST credit on ${doc.document_number}`
        });
      }
      if (igstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.input_igst_account_code,
          debit: igstBn.toFixed(2),
          credit: '0.00',
          memo: `Input IGST credit on ${doc.document_number}`
        });
      }

      // Round-off handling
      if (!roundOffBn.isZero()) {
        if (roundOffBn.isPositive()) {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: roundOffBn.toFixed(2),
            credit: '0.00',
            memo: `Round-off debit on purchase ${doc.document_number}`
          });
        } else {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: '0.00',
            credit: roundOffBn.abs().toFixed(2),
            memo: `Round-off credit on purchase ${doc.document_number}`
          });
        }
      }

      journalLines.push({
        account_code: partyAccountCode,
        debit: '0.00',
        credit: grandTotalBn.toFixed(2),
        memo: `Payable to ${doc.party_name || 'Supplier'} for ${doc.document_number}`
      });
    }

    // ==========================================
    // 5C. CUSTOMER RECEIPT GL POSTING
    // ==========================================
    else if (doc.document_type === 'RECEIPT') {
      const cashBankCode = doc.bank_or_cash_account_id
        ? (await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session))?.account_code || config.cash_account_code
        : config.cash_account_code;

      journalLines.push({
        account_code: cashBankCode,
        debit: grandTotalBn.toFixed(2),
        credit: '0.00',
        memo: `Cash/Bank received from ${doc.party_name || 'Customer'} (${doc.document_number})`
      });

      journalLines.push({
        account_code: config.receivable_account_code,
        debit: '0.00',
        credit: grandTotalBn.toFixed(2),
        memo: `Settlement of receivables for ${doc.party_name || 'Customer'}`
      });
    }

    // ==========================================
    // 5D. SUPPLIER PAYMENT GL POSTING
    // ==========================================
    else if (doc.document_type === 'PAYMENT') {
      const cashBankCode = doc.bank_or_cash_account_id
        ? (await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session))?.account_code || config.bank_account_code
        : config.bank_account_code;

      journalLines.push({
        account_code: config.payable_account_code,
        debit: grandTotalBn.toFixed(2),
        credit: '0.00',
        memo: `Settlement of payables to ${doc.party_name || 'Supplier'}`
      });

      journalLines.push({
        account_code: cashBankCode,
        debit: '0.00',
        credit: grandTotalBn.toFixed(2),
        memo: `Cash/Bank disbursed for ${doc.document_number}`
      });
    }

    // ==========================================
    // 5E. SALES RETURN GL POSTING
    // ==========================================
    else if (doc.document_type === 'SALES_RETURN') {
      journalLines.push({
        account_code: config.sales_revenue_account_code,
        debit: taxableBn.toFixed(2),
        credit: '0.00',
        memo: `Sales return adjustment on ${doc.document_number}`
      });

      if (cgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.output_cgst_account_code,
          debit: cgstBn.toFixed(2),
          credit: '0.00',
          memo: `Reverse Output CGST on ${doc.document_number}`
        });
      }
      if (sgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.output_sgst_account_code,
          debit: sgstBn.toFixed(2),
          credit: '0.00',
          memo: `Reverse Output SGST on ${doc.document_number}`
        });
      }
      if (igstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.output_igst_account_code,
          debit: igstBn.toFixed(2),
          credit: '0.00',
          memo: `Reverse Output IGST on ${doc.document_number}`
        });
      }

      journalLines.push({
        account_code: config.receivable_account_code,
        debit: '0.00',
        credit: grandTotalBn.toFixed(2),
        memo: `Credit customer account for return ${doc.document_number}`
      });
    }

    // ==========================================
    // 5F. PURCHASE RETURN GL POSTING
    // ==========================================
    else if (doc.document_type === 'PURCHASE_RETURN') {
      journalLines.push({
        account_code: config.payable_account_code,
        debit: grandTotalBn.toFixed(2),
        credit: '0.00',
        memo: `Debit supplier account for return ${doc.document_number}`
      });

      journalLines.push({
        account_code: config.inventory_asset_account_code,
        debit: '0.00',
        credit: taxableBn.toFixed(2),
        memo: `Relieve inventory asset for purchase return ${doc.document_number}`
      });

      if (cgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.input_cgst_account_code,
          debit: '0.00',
          credit: cgstBn.toFixed(2),
          memo: `Reverse Input CGST on ${doc.document_number}`
        });
      }
      if (sgstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.input_sgst_account_code,
          debit: '0.00',
          credit: sgstBn.toFixed(2),
          memo: `Reverse Input SGST on ${doc.document_number}`
        });
      }
      if (igstBn.isGreaterThan(0)) {
        journalLines.push({
          account_code: config.input_igst_account_code,
          debit: '0.00',
          credit: igstBn.toFixed(2),
          memo: `Reverse Input IGST on ${doc.document_number}`
        });
      }
    }

    // ==========================================
    // 5G. CONTRA TRANSFER GL POSTING
    // ==========================================
    else if (doc.document_type === 'CONTRA_TRANSFER') {
      if (!doc.bank_or_cash_account_id || !doc.to_bank_or_cash_account_id) {
        throw new Error('Both source and destination accounts are required for a contra transfer');
      }
      const fromAcc = await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session);
      const toAcc = await LedgerAccount.findById(doc.to_bank_or_cash_account_id).session(session);

      if (!fromAcc || !toAcc) {
        throw new Error('Source or destination account not found for contra transfer');
      }

      journalLines.push({
        account_code: toAcc.account_code,
        debit: grandTotalBn.toFixed(2),
        credit: '0.00',
        memo: `Transfer into ${toAcc.account_name} (${doc.document_number})`
      });

      journalLines.push({
        account_code: fromAcc.account_code,
        debit: '0.00',
        credit: grandTotalBn.toFixed(2),
        memo: `Transfer out from ${fromAcc.account_name} (${doc.document_number})`
      });
    }

    // Post Primary Financial Journal
    const postRes = await postJournalEntry({
      tenantId,
      companyId,
      userId,
      postingDate: pDate,
      sourceModule: 'COMMERCIAL_DOCS',
      referenceId: `${doc.document_type}:${doc.document_number}`,
      memo: memoText,
      currency: doc.currency || 'INR',
      accountingBasis: 'GAAP',
      lines: journalLines,
      session
    });

    doc.journal_id = postRes.journal._id;

    // Link movements to posted journal
    for (const mov of recordedMovements) {
      mov.gl_status = 'POSTED';
      mov.gl_journal_id = postRes.journal._id;
      mov.gl_posted_at = new Date();
      await mov.save({ session });
    }

    // Post Perpetual Inventory COGS Journal (if applicable for Sales / Sales Return)
    if (doc.document_type === 'SALES_INVOICE' && totalCogsBn.isGreaterThan(0)) {
      const cogsLines = [
        {
          account_code: config.cogs_account_code,
          debit: totalCogsBn.toFixed(2),
          credit: '0.00',
          memo: `Cost of goods sold for ${doc.document_number}`
        },
        {
          account_code: config.inventory_asset_account_code,
          debit: '0.00',
          credit: totalCogsBn.toFixed(2),
          memo: `Relieve inventory asset value for ${doc.document_number}`
        }
      ];

      const cogsRes = await postJournalEntry({
        tenantId,
        companyId,
        userId,
        postingDate: pDate,
        sourceModule: 'COMMERCIAL_COGS',
        referenceId: `COGS:${doc.document_number}`,
        memo: `COGS entry for ${doc.document_number}`,
        currency: doc.currency || 'INR',
        accountingBasis: 'GAAP',
        lines: cogsLines,
        session
      });

      doc.cogs_journal_id = cogsRes.journal._id;
    } else if (doc.document_type === 'SALES_RETURN' && totalCogsBn.isGreaterThan(0)) {
      // Reversal of COGS for restocked items
      const cogsRevLines = [
        {
          account_code: config.inventory_asset_account_code,
          debit: totalCogsBn.toFixed(2),
          credit: '0.00',
          memo: `Restore inventory asset value for return ${doc.document_number}`
        },
        {
          account_code: config.cogs_account_code,
          debit: '0.00',
          credit: totalCogsBn.toFixed(2),
          memo: `Reverse COGS for return ${doc.document_number}`
        }
      ];

      const cogsRes = await postJournalEntry({
        tenantId,
        companyId,
        userId,
        postingDate: pDate,
        sourceModule: 'COMMERCIAL_COGS',
        referenceId: `COGS-REV:${doc.document_number}`,
        memo: `COGS reversal for return ${doc.document_number}`,
        currency: doc.currency || 'INR',
        accountingBasis: 'GAAP',
        lines: cogsRevLines,
        session
      });

      doc.cogs_journal_id = cogsRes.journal._id;
    }

    // 6. Process Bill-Wise Outstanding Allocations
    if (['RECEIPT', 'PAYMENT'].includes(doc.document_type) && allocations && allocations.length > 0) {
      let totalAllocatedBn = new BigNumber(0);

      for (const alloc of allocations) {
        const inv = await CommercialDocument.findOne({
          _id: alloc.invoice_id,
          tenant_id: tenantId,
          company_id: companyId
        }).session(session);

        if (!inv) {
          throw new Error(`Target invoice not found for allocation: ${alloc.invoice_id}`);
        }
        if (inv.status !== 'POSTED') {
          throw new Error(`Cannot allocate payment against non-posted invoice "${inv.document_number}" (${inv.status})`);
        }

        const allocAmtBn = new BigNumber(alloc.amount ? alloc.amount.toString() : '0');
        if (allocAmtBn.isLessThanOrEqualTo(0)) {
          throw new Error('Allocation amount must be greater than zero');
        }

        const invBalDue = new BigNumber(inv.balance_due ? inv.balance_due.toString() : '0');
        if (allocAmtBn.isGreaterThan(invBalDue)) {
          throw new Error(
            `EXCESS_ALLOCATION: Allocation amount (${allocAmtBn.toFixed(2)}) exceeds invoice balance due (${invBalDue.toFixed(2)}) for "${inv.document_number}"`
          );
        }

        totalAllocatedBn = totalAllocatedBn.plus(allocAmtBn);

        // Update target invoice balances
        const currentPaid = new BigNumber(inv.amount_paid ? inv.amount_paid.toString() : '0');
        const newPaid = currentPaid.plus(allocAmtBn);
        const newBal = invBalDue.minus(allocAmtBn);

        inv.amount_paid = mongoose.Types.Decimal128.fromString(newPaid.toFixed(2));
        inv.balance_due = mongoose.Types.Decimal128.fromString(newBal.toFixed(2));
        inv.row_version = (inv.row_version || 1) + 1;
        await inv.save({ session });

        // Record BillAllocation
        const billAlloc = new BillAllocation({
          tenant_id: tenantId,
          company_id: companyId,
          payment_document_id: doc._id,
          invoice_document_id: inv._id,
          allocated_amount: mongoose.Types.Decimal128.fromString(allocAmtBn.toFixed(2)),
          allocation_date: pDate,
          status: 'ACTIVE'
        });
        await billAlloc.save({ session });
      }

      if (totalAllocatedBn.isGreaterThan(grandTotalBn)) {
        throw new Error(
          `TOTAL_ALLOCATION_EXCEEDS_PAYMENT: Total allocated amount (${totalAllocatedBn.toFixed(2)}) exceeds payment amount (${grandTotalBn.toFixed(2)})`
        );
      }

      const paymentBalDue = grandTotalBn.minus(totalAllocatedBn);
      doc.amount_paid = mongoose.Types.Decimal128.fromString(totalAllocatedBn.toFixed(2));
      doc.balance_due = mongoose.Types.Decimal128.fromString(paymentBalDue.toFixed(2));
    }

    // 7. Finalize Document Status
    doc.status = 'POSTED';
    doc.posted_by_user_id = userId || null;
    doc.posted_at = new Date();
    doc.row_version = (doc.row_version || 1) + 1;
    doc.audit_trail.push({
      action: 'POSTED',
      user_id: userId || null,
      timestamp: new Date(),
      note: `Posted ${doc.document_type} ${doc.document_number} with GL journal ${postRes.journal.journal_number}`
    });

    await doc.save({ session });

    return {
      document: doc,
      journal: postRes.journal,
      movements: recordedMovements,
      is_duplicate: false
    };
  };

  return withOptionalTransaction(operation);
}

module.exports = {
  postCommercialDocument
};
