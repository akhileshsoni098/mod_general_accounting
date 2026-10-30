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
  FiscalPeriod,
  RecipeBOM,
  ManufacturingBOM
} = require('../models');
const transactionHelper = require('../utils/transactionHelper');
const journalPostingService = require('./journalPostingService');
const { recordStockMovement } = require('./stockMovementService');
const commercialPostingConfigService = require('./commercialPostingConfigService');

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
async function postCommercialDocument({ tenantId, companyId, documentId, userId, allocations = [], customJournalLines = null, options = {} }) {
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
    const { config, accountMap } = await commercialPostingConfigService.validateAndResolvePostingAccounts(tenantId, companyId, { session });

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
    if (['SALES_INVOICE', 'PURCHASE_INVOICE', 'SALES_RETURN', 'PURCHASE_RETURN', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(doc.document_type)) {
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
          // Check if this item has an active Recipe BOM (Restaurant) or Manufacturing BOM (Production)
          const recipeBom = await RecipeBOM.findOne({
            $or: [
              { company_id: companyId, menu_item_id: line.stock_item_id },
              { tenant_id: tenantId, menu_item_id: line.stock_item_id },
              { menu_item_id: line.stock_item_id }
            ],
            is_active: { $ne: false }
          }).session(session);

          let mfgBom = null;
          if (!recipeBom) {
            mfgBom = await ManufacturingBOM.findOne({
              $or: [
                { company_id: companyId, finished_item_id: line.stock_item_id },
                { tenant_id: tenantId, finished_item_id: line.stock_item_id },
                { finished_item_id: line.stock_item_id }
              ],
              is_active: { $ne: false }
            }).session(session);
          }

          if (recipeBom && recipeBom.ingredients && recipeBom.ingredients.length > 0) {
            // ==========================================
            // A1. RECIPE BOM AUTO-CONSUMPTION FOR SALES
            // Deduct ONLY non-excluded raw materials (e.g. skip Sauce if customer requested No Sauce)
            // ==========================================
            const excludedSet = new Set((line.excluded_ingredients || []).map(id => String(id)));
            let totalBomCogsBn = new BigNumber(0);

            for (const ing of recipeBom.ingredients) {
              const ingItemId = String(ing.ingredient_item_id?._id || ing.ingredient_item_id);
              if (excludedSet.has(ingItemId)) {
                // Customer customized to exclude this ingredient (e.g. NO SAUCE) - SKIP deduction!
                continue;
              }

              const wasteFactor = 1 + (ing.waste_percentage || 0) / 100;
              const consumeQtyBn = baseQtyBn.times(ing.quantity.toString()).times(wasteFactor).dividedBy(recipeBom.yield_quantity || 1);

              let ingBalance = await StockBalance.findOne({
                tenant_id: tenantId,
                company_id: companyId,
                stock_item_id: ing.ingredient_item_id,
                godown_id: godownId
              }).session(session);

              const ingUnitCostBn = ingBalance ? new BigNumber(ingBalance.average_unit_cost.toString()) : new BigNumber(0);
              const ingLineCogsBn = consumeQtyBn.times(ingUnitCostBn);
              totalBomCogsBn = totalBomCogsBn.plus(ingLineCogsBn);

              const movResult = await recordStockMovement({
                tenantId,
                companyId,
                stockItemId: ing.ingredient_item_id,
                godownId,
                movementType: 'RECIPE_CONSUMPTION',
                direction: 'OUT',
                quantity: consumeQtyBn.toFixed(4),
                uomId: ing.uom_id,
                idempotencyKey: `MOV-SI-BOM-${doc._id}-${line.line_number}-${ingItemId}`,
                effectiveDate: pDate,
                unitRate: ingUnitCostBn.toFixed(2),
                totalCost: ingLineCogsBn.toFixed(2),
                sourceDocumentType: 'SALES_INVOICE',
                sourceDocumentId: doc.document_number,
                sourceLineId: String(line.line_number),
                notes: `BOM raw material consumed for ${line.item_name} (Invoice ${doc.document_number})`,
                userId,
                session
              });

              recordedMovements.push(movResult.movement);
            }

            line.total_cogs_amount = mongoose.Types.Decimal128.fromString(totalBomCogsBn.toFixed(2));
            totalCogsBn = totalCogsBn.plus(totalBomCogsBn);
          } else if (mfgBom && mfgBom.raw_materials && mfgBom.raw_materials.length > 0) {
            // ==========================================
            // A1.2 MANUFACTURING BOM AUTO-CONSUMPTION FOR SALES
            // Deduct raw material components defined in Manufacturing BOM (e.g. Capsicum, Tamatar for Salad)
            // ==========================================
            let totalBomCogsBn = new BigNumber(0);
            const yieldQty = mfgBom.output_quantity || 1;

            for (const rm of mfgBom.raw_materials) {
              const rmItemId = String(rm.item_id?._id || rm.item_id);
              const scrapFactor = 1 + (rm.scrap_percentage || 0) / 100;
              const consumeQtyBn = baseQtyBn.times(rm.quantity.toString()).times(scrapFactor).dividedBy(yieldQty);

              let rmBalance = await StockBalance.findOne({
                tenant_id: tenantId,
                company_id: companyId,
                stock_item_id: rm.item_id,
                godown_id: godownId
              }).session(session);

              const currentRmQty = rmBalance ? new BigNumber(rmBalance.quantity_on_hand.toString()) : new BigNumber(0);
              if (!config.allow_negative_stock && currentRmQty.isLessThan(consumeQtyBn)) {
                const rawItemDoc = await StockItem.findById(rm.item_id).session(session);
                const rawName = rawItemDoc ? rawItemDoc.item_name : 'Raw Material';
                const err = new Error(
                  `INSUFFICIENT_STOCK: Raw material "${rawName}" has on-hand balance of ${currentRmQty.toFixed(4)}, but requested consumption is ${consumeQtyBn.toFixed(4)} in godown "${targetGodown.godown_name}".`
                );
                err.code = 'INSUFFICIENT_STOCK';
                throw err;
              }

              const rmUnitCostBn = rmBalance ? new BigNumber(rmBalance.average_unit_cost.toString()) : new BigNumber(0);
              const rmLineCogsBn = consumeQtyBn.times(rmUnitCostBn);
              totalBomCogsBn = totalBomCogsBn.plus(rmLineCogsBn);

              const movResult = await recordStockMovement({
                tenantId,
                companyId,
                stockItemId: rm.item_id,
                godownId,
                movementType: 'PRODUCTION_ISSUE',
                direction: 'OUT',
                quantity: consumeQtyBn.toFixed(4),
                uomId: rm.uom_id,
                idempotencyKey: `MOV-SI-MFG-${doc._id}-${line.line_number}-${rmItemId}`,
                effectiveDate: pDate,
                unitRate: rmUnitCostBn.toFixed(2),
                totalCost: rmLineCogsBn.toFixed(2),
                sourceDocumentType: 'SALES_INVOICE',
                sourceDocumentId: doc.document_number,
                sourceLineId: String(line.line_number),
                notes: `Manufacturing BOM raw material consumed for ${line.item_name} (Invoice ${doc.document_number})`,
                userId,
                session
              });

              recordedMovements.push(movResult.movement);
            }

            // Add allocated overhead costs if any
            if (mfgBom.overhead_costs && mfgBom.overhead_costs.length > 0) {
              for (const oc of mfgBom.overhead_costs) {
                const ohCostBn = baseQtyBn.times(Number(oc.cost_amount) || 0).dividedBy(yieldQty);
                totalBomCogsBn = totalBomCogsBn.plus(ohCostBn);
              }
            }

            line.total_cogs_amount = mongoose.Types.Decimal128.fromString(totalBomCogsBn.toFixed(2));
            totalCogsBn = totalCogsBn.plus(totalBomCogsBn);
          } else {
            // ==========================================
            // A2. STANDARD GOODS ISSUE FOR REGULAR INVENTORY
            // ==========================================
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
              batchNumber: line.batch_number || '',
              serialNumbers: line.serial_numbers || [],
              expiryDate: line.expiry_date || null,
              session
            });

            line.stock_movement_id = movResult.movement._id;
            recordedMovements.push(movResult.movement);
          }
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
            batchNumber: line.batch_number || '',
            serialNumbers: line.serial_numbers || [],
            expiryDate: line.expiry_date || null,
            session
          });

          line.stock_movement_id = movResult.movement._id;
          recordedMovements.push(movResult.movement);
        }

        // ==========================================
        // C. SALES RETURN / CREDIT NOTE (Customer Return with Dispositions)
        // ==========================================
        else if (doc.document_type === 'SALES_RETURN' || doc.document_type === 'CREDIT_NOTE') {
          // Perishable / Restaurant Food Check: Prepared items with recipes (e.g. Pizzas, Burgers)
          // must NEVER be restocked back into saleable inventory upon return. They are spoiled food.
          const itemRecipe = await RecipeBOM.findOne({
            company_id: companyId,
            menu_item_id: line.stock_item_id,
            is_active: true
          }).session(session);

          const isFoodSpoilage = Boolean(itemRecipe) ||
            options?.eventCode?.includes('spoilage') ||
            options?.eventCode?.includes('waste') ||
            options?.eventCode?.includes('scrap') ||
            line.disposition === 'SPOILAGE' ||
            line.disposition === 'SCRAP';

          if (isFoodSpoilage) {
            line.restockable = false;
            line.disposition = 'SPOILAGE';
            // Do not restock ruined food items into godown inventory
            continue;
          }

          const isPriceAdjustment = options?.eventCode?.includes('price_adjustment') ||
            options?.eventCode?.includes('bad_debt') ||
            line.disposition === 'PRICE_ADJUSTMENT_ONLY';

          if (!isPriceAdjustment) {
            const disposition = line.disposition || (line.restockable === false ? 'SCRAP' : 'RESTOCK');

            if (disposition === 'RESTOCK' && line.restockable !== false) {
              // Standard resalable return: return to saleable godown and reverse COGS
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
                movementType: 'SALES_RETURN',
                direction: 'IN',
                quantity: line.quantity.toString(),
                uomId: line.uom_id,
                idempotencyKey: `MOV-SR-${doc._id}-${line.line_number}`,
                effectiveDate: pDate,
                unitRate: restockCostRateBn.toFixed(2),
                totalCost: lineRestockValBn.toFixed(2),
                sourceDocumentType: doc.document_type,
                sourceDocumentId: doc.document_number,
                sourceLineId: String(line.line_number),
                notes: `Restocked goods from ${doc.document_type} ${doc.document_number}`,
                userId,
                batchNumber: line.batch_number || '',
                serialNumbers: line.serial_numbers || [],
                expiryDate: line.expiry_date || null,
                disposition: 'RESTOCK',
                inspectionStatus: line.inspection_status || 'PASSED',
                session
              });

              line.stock_movement_id = movResult.movement._id;
              recordedMovements.push(movResult.movement);
            } else if (disposition === 'QUARANTINE') {
              // Defective / inspection-required return: receive into Quarantine Godown
              let quarantineGodown = await Godown.findOne({
                tenant_id: tenantId,
                company_id: companyId,
                godown_code: 'QUARANTINE',
                status: 'ACTIVE'
              }).session(session);

              if (!quarantineGodown) {
                quarantineGodown = await Godown.findOneAndUpdate(
                  { tenant_id: tenantId, company_id: companyId, godown_code: 'QUARANTINE' },
                  {
                    godown_name: 'Quarantine & Inspection Godown',
                    is_default: false,
                    status: 'ACTIVE'
                  },
                  { upsert: true, new: true, session }
                );
              }

              let balance = await StockBalance.findOne({
                tenant_id: tenantId,
                company_id: companyId,
                stock_item_id: line.stock_item_id,
                godown_id: quarantineGodown._id
              }).session(session);

              const qUnitCostBn = balance ? new BigNumber(balance.average_unit_cost.toString()) : new BigNumber(0);
              const lineQValBn = baseQtyBn.times(qUnitCostBn);

              const movResult = await recordStockMovement({
                tenantId,
                companyId,
                stockItemId: line.stock_item_id,
                godownId: quarantineGodown._id,
                movementType: 'QUARANTINE_IN',
                direction: 'IN',
                quantity: line.quantity.toString(),
                uomId: line.uom_id,
                idempotencyKey: `MOV-QR-${doc._id}-${line.line_number}`,
                effectiveDate: pDate,
                unitRate: qUnitCostBn.toFixed(2),
                totalCost: lineQValBn.toFixed(2),
                sourceDocumentType: doc.document_type,
                sourceDocumentId: doc.document_number,
                sourceLineId: String(line.line_number),
                notes: `Defective return routed to quarantine from ${doc.document_type} ${doc.document_number}`,
                userId,
                batchNumber: line.batch_number || '',
                serialNumbers: line.serial_numbers || [],
                expiryDate: line.expiry_date || null,
                disposition: 'QUARANTINE',
                inspectionStatus: line.inspection_status || 'PENDING_INSPECTION',
                session
              });

              line.stock_movement_id = movResult.movement._id;
              recordedMovements.push(movResult.movement);
            } else if (disposition === 'SPOILAGE' || disposition === 'SCRAP') {
              // Food waste, fresh pizza return, or damaged goods:
              // Customer receives credit, but ruined goods are discarded, NOT added back to saleable inventory.
              // COGS is NOT reversed (no addition to totalCogsBn).
              line.restockable = false;
            }
          }
        }

        // ==========================================
        // D. PURCHASE RETURN / DEBIT NOTE (Return to Vendor)
        // ==========================================
        else if (doc.document_type === 'PURCHASE_RETURN' || doc.document_type === 'DEBIT_NOTE') {
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
            sourceDocumentType: doc.document_type,
            sourceDocumentId: doc.document_number,
            sourceLineId: String(line.line_number),
            notes: `Goods returned to supplier for ${doc.document_type} ${doc.document_number}`,
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

    const grandTotalBn = new BigNumber((doc.grand_total || 0).toString());
    const taxableBn = new BigNumber((doc.total_taxable_amount || 0).toString());
    const totalTaxBn = new BigNumber((doc.total_tax_amount || 0).toString());
    const cgstBn = new BigNumber((doc.total_cgst_amount || 0).toString());
    const sgstBn = new BigNumber((doc.total_sgst_amount || 0).toString());
    const igstBn = new BigNumber((doc.total_igst_amount || 0).toString());
    const roundOffBn = new BigNumber((doc.round_off_amount || 0).toString());
    const isUsDoc = doc.tax_regime === 'US_SALES_TAX';

    // US Tax Strict Production & Validation Guard
    if (isUsDoc) {
      if (process.env.NODE_ENV === 'production' && doc.is_mock_tax) {
        const err = new Error(
          'PRODUCTION_MOCK_DISALLOWED: Document was calculated using synthetic mock tax provider. Mock tax calculations cannot be posted to General Ledger in production. Configure a verified commercial tax provider (Avalara, TaxJar, Vertex).'
        );
        err.code = 'PRODUCTION_MOCK_DISALLOWED';
        throw err;
      }
      if (process.env.NODE_ENV === 'production' && doc.tax_calculation_status !== 'CALCULATED' && doc.tax_calculation_status !== 'COMMITTED') {
        const err = new Error(
          `TAX_CALCULATION_REQUIRED: Commercial document "${doc.document_number}" requires validated tax calculation before GL posting in US tax jurisdiction.`
        );
        err.code = 'TAX_CALCULATION_REQUIRED';
        throw err;
      }
    }

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

      if (isUsDoc) {
        if (totalTaxBn.isGreaterThan(0)) {
          journalLines.push({
            account_code: config.sales_tax_payable_account_code || '2110',
            debit: '0.00',
            credit: totalTaxBn.toFixed(2),
            memo: `US Sales Tax Payable on ${doc.document_number}`
          });
        }
      } else {
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

      if (isUsDoc) {
        const taxTreatment = config.purchase_tax_treatment || 'CAPITALIZE_TO_ITEM';
        if (taxTreatment === 'BLOCKED') {
          const err = new Error(
            `BLOCKED_TAX_CONFIGURATION: Purchase tax treatment for company is BLOCKED. Posting cannot proceed without explicit account configuration.`
          );
          err.code = 'BLOCKED_TAX_CONFIGURATION';
          throw err;
        }

        if (taxTreatment === 'EXPENSE_SEPARATE' && totalTaxBn.isGreaterThan(0)) {
          journalLines.push({
            account_code: config.inventory_asset_account_code,
            debit: taxableBn.toFixed(2),
            credit: '0.00',
            memo: `Inventory received for purchase ${doc.document_number}`
          });
          journalLines.push({
            account_code: config.tax_expense_account_code || '5110',
            debit: totalTaxBn.toFixed(2),
            credit: '0.00',
            memo: `Non-recoverable purchase tax expense on ${doc.document_number}`
          });
        } else {
          // CAPITALIZE_TO_ITEM: Total inventory cost = taxable + tax
          const totalInvCostBn = taxableBn.plus(totalTaxBn);
          journalLines.push({
            account_code: config.inventory_asset_account_code,
            debit: totalInvCostBn.toFixed(2),
            credit: '0.00',
            memo: `Inventory received for purchase (cost capitalized) ${doc.document_number}`
          });
        }
      } else {
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
      let cashBankCode = config.cash_account_code;
      if (doc.bank_or_cash_account_id) {
        if (mongoose.Types.ObjectId.isValid(doc.bank_or_cash_account_id)) {
          const acc = await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session);
          if (acc) cashBankCode = acc.account_code;
        } else {
          const acc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: String(doc.bank_or_cash_account_id) }).session(session);
          if (acc) cashBankCode = acc.account_code;
          else cashBankCode = String(doc.bank_or_cash_account_id);
        }
      }

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
      let cashBankCode = config.bank_account_code;
      if (doc.bank_or_cash_account_id) {
        if (mongoose.Types.ObjectId.isValid(doc.bank_or_cash_account_id)) {
          const acc = await LedgerAccount.findById(doc.bank_or_cash_account_id).session(session);
          if (acc) cashBankCode = acc.account_code;
        } else {
          const acc = await LedgerAccount.findOne({ tenant_id: tenantId, company_id: companyId, account_code: String(doc.bank_or_cash_account_id) }).session(session);
          if (acc) cashBankCode = acc.account_code;
          else cashBankCode = String(doc.bank_or_cash_account_id);
        }
      }

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

      if (isUsDoc) {
        if (totalTaxBn.isGreaterThan(0)) {
          journalLines.push({
            account_code: config.sales_tax_payable_account_code || '2110',
            debit: totalTaxBn.toFixed(2),
            credit: '0.00',
            memo: `Reverse Sales Tax Payable on return ${doc.document_number}`
          });
        }
      } else {
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
      }

      // Round-off handling for sales return
      if (!roundOffBn.isZero()) {
        if (roundOffBn.isPositive()) {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: roundOffBn.toFixed(2),
            credit: '0.00',
            memo: `Round-off debit on return ${doc.document_number}`
          });
        } else {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: '0.00',
            credit: roundOffBn.abs().toFixed(2),
            memo: `Round-off credit on return ${doc.document_number}`
          });
        }
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

      if (isUsDoc) {
        const taxTreatment = config.purchase_tax_treatment || 'CAPITALIZE_TO_ITEM';
        if (taxTreatment === 'BLOCKED') {
          const err = new Error(
            `BLOCKED_TAX_CONFIGURATION: Purchase tax treatment for company is BLOCKED. Posting cannot proceed without explicit account configuration.`
          );
          err.code = 'BLOCKED_TAX_CONFIGURATION';
          throw err;
        }

        if (taxTreatment === 'EXPENSE_SEPARATE' && totalTaxBn.isGreaterThan(0)) {
          journalLines.push({
            account_code: config.inventory_asset_account_code,
            debit: '0.00',
            credit: taxableBn.toFixed(2),
            memo: `Relieve inventory asset for purchase return ${doc.document_number}`
          });
          journalLines.push({
            account_code: config.tax_expense_account_code || '5110',
            debit: '0.00',
            credit: totalTaxBn.toFixed(2),
            memo: `Reverse purchase tax expense on return ${doc.document_number}`
          });
        } else {
          // CAPITALIZE_TO_ITEM
          const totalInvCostBn = taxableBn.plus(totalTaxBn);
          journalLines.push({
            account_code: config.inventory_asset_account_code,
            debit: '0.00',
            credit: totalInvCostBn.toFixed(2),
            memo: `Relieve inventory asset (capitalized cost) for purchase return ${doc.document_number}`
          });
        }
      } else {
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

      // Round-off handling for purchase return
      if (!roundOffBn.isZero()) {
        if (roundOffBn.isPositive()) {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: '0.00',
            credit: roundOffBn.toFixed(2),
            memo: `Round-off credit on return ${doc.document_number}`
          });
        } else {
          journalLines.push({
            account_code: config.round_off_account_code,
            debit: roundOffBn.abs().toFixed(2),
            credit: '0.00',
            memo: `Round-off debit on return ${doc.document_number}`
          });
        }
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
    let finalJournalLines = journalLines;
    if (Array.isArray(customJournalLines) && customJournalLines.length > 0) {
      let totalDr = new BigNumber(0);
      let totalCr = new BigNumber(0);
      const validatedLines = [];
      for (const cl of customJournalLines) {
        const drBn = new BigNumber(cl.debit || 0);
        const crBn = new BigNumber(cl.credit || 0);
        totalDr = totalDr.plus(drBn);
        totalCr = totalCr.plus(crBn);
        validatedLines.push({
          account_code: String(cl.account_code),
          debit: drBn.toFixed(2),
          credit: crBn.toFixed(2),
          memo: cl.memo || cl.description || memoText
        });
      }
      if (!totalDr.isEqualTo(totalCr)) {
        throw new Error(`Custom Journal Entry lines are unbalanced. Total Debit (${totalDr.toFixed(2)}) must equal Total Credit (${totalCr.toFixed(2)})`);
      }
      finalJournalLines = validatedLines;
    }

    const postRes = await journalPostingService.postJournalEntry({
      tenantId,
      companyId,
      userId,
      postingDate: pDate,
      sourceModule: 'COMMERCIAL_DOCS',
      referenceId: `${doc.document_type}:${doc.document_number}`,
      memo: options?.eventCode ? `[${options.eventCode}] ${memoText}` : memoText,
      currency: doc.currency || 'INR',
      accountingBasis: 'GAAP',
      lines: finalJournalLines,
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

      const cogsRes = await journalPostingService.postJournalEntry({
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
    let targetAllocations = allocations && allocations.length > 0 ? allocations : [];
    if (targetAllocations.length === 0 && doc.linked_source_document_id && ['RECEIPT', 'PAYMENT'].includes(doc.document_type)) {
      targetAllocations = [{
        invoice_id: doc.linked_source_document_id,
        amount: grandTotalBn.toNumber()
      }];
    }

    if (['RECEIPT', 'PAYMENT'].includes(doc.document_type) && targetAllocations.length > 0) {
      let totalAllocatedBn = new BigNumber(0);

      for (const alloc of targetAllocations) {
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

    // 7. Finalize US Tax Snapshot & External Provider Finalization
    if (isUsDoc) {
      if (doc.tax_snapshot_id) {
        try {
          const snapshot = await mongoose.model('TaxCalculationSnapshot').findById(doc.tax_snapshot_id).session(session);
          if (snapshot) {
            snapshot.status = 'COMMITTED';
            snapshot.document_id = doc._id;
            snapshot.document_number = doc.document_number;
            snapshot.row_version = (snapshot.row_version || 1) + 1;
            await snapshot.save({ session });
          }
          doc.tax_calculation_status = 'COMMITTED';
          doc.tax_reconciliation_status = 'SYNCED';
        } catch (snapErr) {
          console.warn('[commercialPostingService] Warning committing tax calculation snapshot:', snapErr.message);
        }
      }

      // External provider finalization (safe try-catch so failure does not roll back GL posting)
      try {
        const TaxProviderFactory = require('./taxProvider/TaxProviderFactory');
        const CompanyTaxProfile = mongoose.model('CompanyTaxProfile');
        const taxProfile = await CompanyTaxProfile.findOne({ tenant_id: tenantId, company_id: companyId }).session(session);
        const providerName = doc.tax_provider_name || (taxProfile ? taxProfile.provider_name : 'MOCK');
        const provider = TaxProviderFactory.createProvider(providerName, {
          environment: (taxProfile && taxProfile.environment) || 'SANDBOX',
          apiKey: taxProfile?.api_credentials?.api_key,
          allowMockInProduction: options?.allowMockInProduction || false
        });

        if (typeof provider.commitTransaction === 'function') {
          await provider.commitTransaction({
            provider_transaction_id: doc.tax_provider_transaction_id || `TX-${doc.document_number}`,
            document_number: doc.document_number,
            grand_total: grandTotalBn.toFixed(2)
          });
          doc.tax_reconciliation_status = 'SYNCED';
        }
      } catch (providerErr) {
        console.warn('[commercialPostingService] External tax provider finalization failed, marking for reconciliation:', providerErr.message);
        doc.tax_reconciliation_status = 'PENDING_RETRY';
        doc.tax_calculation_status = 'RECONCILIATION_PENDING';
        doc.audit_trail.push({
          action: 'TAX_RECONCILIATION_PENDING',
          user_id: userId || null,
          timestamp: new Date(),
          note: `External tax provider finalization deferred: ${providerErr.message}`
        });
      }

      // Phase 5: Record entry in US Tax Liability Subledger
      try {
        const usTaxSubledgerService = require('./usTaxSubledgerService');
        await usTaxSubledgerService.recordDocumentLiabilityEntry({
          tenantId,
          companyId,
          document: doc,
          snapshot: doc.tax_snapshot_id ? await mongoose.model('TaxCalculationSnapshot').findById(doc.tax_snapshot_id).session(session) : null,
          journalId: postRes.journal?._id,
          userId,
          session
        });
      } catch (subledgerErr) {
        console.warn('[commercialPostingService] Warning recording US tax liability entry:', subledgerErr.message);
      }
    }

    // 8. Finalize Document Status
    doc.status = 'POSTED';
    doc.posted_by_user_id = userId || null;
    doc.posted_at = new Date();
    doc.row_version = (doc.row_version || 1) + 1;
    const eventName = options?.eventCode || (
      doc.document_type === 'CREDIT_NOTE' || doc.document_type === 'SALES_RETURN' ? 'commercial.credit_note.posted' :
      doc.document_type === 'SALES_INVOICE' ? 'commercial.sales_invoice.posted' :
      doc.document_type === 'PURCHASE_INVOICE' ? 'commercial.purchase_invoice.posted' :
      doc.document_type === 'PAYMENT' ? 'commercial.payment.posted' :
      doc.document_type === 'RECEIPT' ? 'commercial.receipt.posted' : 'commercial.document.posted'
    );
    const ruleName = options?.postingRuleCode || 'RULE-AUTO-POST';

    doc.audit_trail.push({
      action: 'POSTED',
      user_id: userId || null,
      timestamp: new Date(),
      note: `Posted ${doc.document_type} ${doc.document_number} with GL journal ${postRes.journal.journal_number} [Event: ${eventName}, Rule: ${ruleName}]`
    });

    await doc.save({ session });

    return {
      document: doc,
      journal: postRes.journal,
      movements: recordedMovements,
      is_duplicate: false
    };
  };

  return transactionHelper.withOptionalTransaction(operation);
}

module.exports = {
  postCommercialDocument
};
