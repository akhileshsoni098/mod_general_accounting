const mongoose = require('mongoose');
const { EventDefinition, PostingRule, PostingRuleLine, LedgerAccount } = require('../models');

/**
 * Master Seeder for all 7 Scenarios from accounting_architecture_guide.html:
 * Scenario 1: New Business (Invoice Issue, Payment Receipt, Commission Allocation, Fiduciary Sweep)
 * Scenario 2: Mid-Term Endorsement (T5 Truck Delta Booking)
 * Scenario 3: Pro-Rata Cancellation & Commission Clawback
 * Scenario 4: Policy Reinstatement
 * Scenario 5: Earned vs Unearned Premium (Daily Pro-Rata Engine)
 * Scenario 6: Claims Reserves & Settlement Payout
 * Scenario 7 / Treasury: NSF Payment Return & Carrier Disbursement
 */
async function seedAllGuideScenarios(tenantId) {
  if (!tenantId) throw new Error('tenantId is required');

  console.log(`[Guide Seeder] Seeding all guide event definitions and posting rules for tenant ${tenantId}...`);

  // =========================================================================
  // 1. EVENT DEFINITIONS MASTER CATALOG
  // =========================================================================
  const eventDefinitionsData = [
    {
      event_code: 'billing.invoice.issued',
      display_name: 'Billing Invoice Issued (Scenario 1 & 2)',
      description: 'Triggered when a policy invoice or installment is issued (Dr 1100 AR / Cr 2200 UPR & Cr 4100 Fee)',
      source_module: 'BILLING',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Standard insurance billing invoice issue event contract',
          json_schema: {
            type: 'object',
            required: ['invoice_id', 'gross_premium'],
            properties: {
              invoice_id: { type: 'string' },
              policy_id: { type: 'string' },
              transaction_type: { type: 'string' },
              gross_premium: { type: 'number' },
              policy_fee: { type: 'number' },
              total_amount: { type: 'number' }
            }
          },
          sample_payload: {
            invoice_id: 'INV-2026-00001',
            policy_id: 'POL-TX-8821',
            transaction_type: 'DIRECT_BILL',
            gross_premium: 9412.50,
            policy_fee: 150.00,
            total_amount: 9562.50
          }
        }
      ]
    },
    {
      event_code: 'billing.payment.received',
      display_name: 'Customer Cash Receipt & AR Clear (Scenario 1 & 2)',
      description: 'Triggered when cash is collected into Texas Fiduciary Trust (Dr 1010 Trust / Cr 1100 AR)',
      source_module: 'BILLING',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Customer payment collection contract',
          json_schema: {
            type: 'object',
            required: ['payment_id', 'amount'],
            properties: {
              payment_id: { type: 'string' },
              invoice_id: { type: 'string' },
              amount: { type: 'number' },
              payment_method: { type: 'string' }
            }
          },
          sample_payload: {
            payment_id: 'PAY-2026-00001',
            invoice_id: 'INV-2026-00001',
            amount: 9562.50,
            payment_method: 'ACH'
          }
        }
      ]
    },
    {
      event_code: 'finance.commission.allocated',
      display_name: 'Commission & Carrier Share Allocation (Step 1.3)',
      description: 'Allocates paid premium from UPR to Carrier Payable, Broker Payable & MGA Commission (Dr 2200 / Cr 2010, Cr 2020, Cr 4200)',
      source_module: 'COMMISSIONS_FIDUCIARY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Multi-party commission chain allocation contract',
          json_schema: {
            type: 'object',
            required: ['policy_id', 'installment_premium', 'carrier_amount', 'broker_amount', 'mga_amount'],
            properties: {
              policy_id: { type: 'string' },
              invoice_id: { type: 'string' },
              installment_premium: { type: 'number' },
              carrier_amount: { type: 'number' },
              broker_amount: { type: 'number' },
              mga_amount: { type: 'number' },
              carrier_id: { type: 'string' },
              carrier_name: { type: 'string' },
              broker_id: { type: 'string' },
              broker_name: { type: 'string' },
              mga_id: { type: 'string' },
              cost_center: { type: 'string' },
              company_code: { type: 'string' },
              dimensions: { type: 'object' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            invoice_id: 'INV-2026-00001',
            installment_premium: 9412.50,
            carrier_amount: 7530.00,
            broker_amount: 941.25,
            mga_amount: 941.25
          }
        }
      ]
    },
    {
      event_code: 'fiduciary.sweep.executed',
      display_name: '30-Day Texas Fiduciary Sweep (Step 1.4)',
      description: 'Sweeps earned agency commission from Trust (1010) to Operating Cash (1000)',
      source_module: 'COMMISSIONS_FIDUCIARY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Fiduciary trust sweep contract',
          json_schema: {
            type: 'object',
            required: ['amount'],
            properties: {
              sweep_reference: { type: 'string' },
              amount: { type: 'number' },
              fiduciary_account_code: { type: 'string' }
            }
          },
          sample_payload: {
            sweep_reference: 'SWEEP-2026-00001',
            amount: 3765.00,
            fiduciary_account_code: '1010'
          }
        }
      ]
    },
    {
      event_code: 'policy.endorsement.issued',
      display_name: 'Policy Endorsement Issued (Scenario 2 Truck T5)',
      description: 'Mid-term addition of vehicle with pro-rata delta calculation (Dr 1100 AR / Cr 2200 UPR)',
      source_module: 'POLICY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Policy endorsement delta booking contract',
          json_schema: {
            type: 'object',
            required: ['policy_id', 'endorsement_number', 'delta_premium'],
            properties: {
              policy_id: { type: 'string' },
              endorsement_number: { type: 'string' },
              vehicle_id: { type: 'string' },
              delta_premium: { type: 'number' },
              active_days: { type: 'number' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            endorsement_number: 'END-001-T5',
            vehicle_id: 'TRUCK-T5-BOX',
            delta_premium: 7222.19,
            active_days: 303
          }
        }
      ]
    },
    {
      event_code: 'policy.cancelled.prorata',
      display_name: 'Pro-Rata Policy Cancellation (Scenario 3)',
      description: 'Carrier cancels policy pro-rata, unearned premium returned to client (Dr 2200 UPR / Cr 2100 Return Premium Payable)',
      source_module: 'POLICY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Pro-rata return premium contract',
          json_schema: {
            type: 'object',
            required: ['policy_id', 'return_premium'],
            properties: {
              policy_id: { type: 'string' },
              cancellation_reason: { type: 'string' },
              return_premium: { type: 'number' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            cancellation_reason: 'Underwriting carrier portfolio withdrawal',
            return_premium: 10000.00
          }
        }
      ]
    },
    {
      event_code: 'finance.commission.clawback',
      display_name: 'Broker Commission Clawback (Scenario 3)',
      description: 'Claws back unearned commission from broker upon cancellation (Dr 2020 Broker Payable / Cr 5010 Commission Expense)',
      source_module: 'COMMISSIONS_FIDUCIARY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Commission clawback reversal contract',
          json_schema: {
            type: 'object',
            required: ['policy_id', 'clawback_amount'],
            properties: {
              policy_id: { type: 'string' },
              broker_id: { type: 'string' },
              clawback_amount: { type: 'number' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            broker_id: 'BROKER-BRIGHTLINE',
            clawback_amount: 1000.00
          }
        }
      ]
    },
    {
      event_code: 'policy.reinstated',
      display_name: 'Policy Reinstatement with Fee (Scenario 4)',
      description: 'Policy reinstated after payment with fee (Dr 1100 AR / Cr 2200 UPR & Cr 4100 Fee Income)',
      source_module: 'POLICY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Reinstatement booking contract',
          json_schema: {
            type: 'object',
            required: ['policy_id', 'reinstated_premium', 'reinstatement_fee'],
            properties: {
              policy_id: { type: 'string' },
              reinstated_premium: { type: 'number' },
              reinstatement_fee: { type: 'number' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            reinstated_premium: 10000.00,
            reinstatement_fee: 50.00
          }
        }
      ]
    },
    {
      event_code: 'finance.earned_premium.calculated',
      display_name: 'Daily Straight-Line Earned Premium (Scenario 5)',
      description: 'ASC 944 pro-rata daily earning amortization (Dr 2200 UPR / Cr 4000 Earned Premium Revenue)',
      source_module: 'FINANCE_CLOSE',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Earned premium amortization contract',
          json_schema: {
            type: 'object',
            required: ['policy_id', 'earned_amount'],
            properties: {
              policy_id: { type: 'string' },
              period: { type: 'string' },
              earned_amount: { type: 'number' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            period: '2026-07',
            earned_amount: 3197.67
          }
        }
      ]
    },
    {
      event_code: 'claim.reserve.established',
      display_name: 'Claim Reserve Established (Scenario 6)',
      description: 'Initial loss reserves booked for accident (Dr 5000 Losses Incurred / Cr 2500 Loss Reserves Liability)',
      source_module: 'CLAIMS',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Claim loss reserve contract',
          json_schema: {
            type: 'object',
            required: ['claim_number', 'reserve_amount'],
            properties: {
              claim_number: { type: 'string' },
              policy_id: { type: 'string' },
              claimant_name: { type: 'string' },
              reserve_amount: { type: 'number' }
            }
          },
          sample_payload: {
            claim_number: 'CLM-2026-0041',
            policy_id: 'POL-TX-8821',
            claimant_name: 'Susan Park',
            reserve_amount: 39000.00
          }
        }
      ]
    },
    {
      event_code: 'claim.payment.issued',
      display_name: 'Claim Settlement Payment Issued (Scenario 6)',
      description: 'Settlement check disbursed to claimant (Dr 2500 Loss Reserves / Cr 1000 Operating Cash)',
      source_module: 'CLAIMS',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Claim payout disbursement contract',
          json_schema: {
            type: 'object',
            required: ['claim_number', 'payout_amount'],
            properties: {
              claim_number: { type: 'string' },
              payee_name: { type: 'string' },
              payout_amount: { type: 'number' },
              check_number: { type: 'string' }
            }
          },
          sample_payload: {
            claim_number: 'CLM-2026-0041',
            payee_name: 'Susan Park',
            payout_amount: 7400.00,
            check_number: 'CHK-90412'
          }
        }
      ]
    },
    {
      event_code: 'treasury.payment.returned',
      display_name: 'NSF Payment Return Dishonor',
      description: 'Bank dishonor R01 reverses payment (Dr 1100 AR / Cr 1010 Trust Bank)',
      source_module: 'TREASURY_BANK_REC',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'NSF dishonor reversal contract',
          json_schema: {
            type: 'object',
            required: ['return_reference', 'amount'],
            properties: {
              return_reference: { type: 'string' },
              return_code: { type: 'string' },
              amount: { type: 'number' }
            }
          },
          sample_payload: {
            return_reference: 'NSF-ACH-9912',
            return_code: 'R01',
            amount: 9562.50
          }
        }
      ]
    },
    {
      event_code: 'carrier.settlement.disbursed',
      display_name: 'Carrier Net Premium Remittance Disbursement',
      description: 'Monthly bordereau net premium paid to carrier (Dr 2010 Due to Carrier / Cr 1010 Premium Trust)',
      source_module: 'COMMISSIONS_FIDUCIARY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Carrier remittance disbursement contract',
          json_schema: {
            type: 'object',
            required: ['statement_number', 'net_due_carrier'],
            properties: {
              statement_number: { type: 'string' },
              carrier_name: { type: 'string' },
              carrier_id: { type: 'string' },
              net_due_carrier: { type: 'number' },
              cost_center: { type: 'string' },
              company_code: { type: 'string' },
              dimensions: { type: 'object' }
            }
          },
          sample_payload: {
            statement_number: 'SETTLE-2026-07-SUMMIT',
            carrier_name: 'Summit Mutual Insurance',
            net_due_carrier: 7530.00
          }
        }
      ]
    }
  ];

  // Upsert event definitions
  for (const def of eventDefinitionsData) {
    await EventDefinition.findOneAndUpdate(
      { tenant_id: tenantId, event_code: def.event_code },
      { ...def, tenant_id: tenantId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`[Guide Seeder] ${eventDefinitionsData.length} Event Definitions registered.`);

  // =========================================================================
  // 2. POSTING RULES & LINES MASTER CATALOG
  // =========================================================================
  const rulesData = [
    // 1. Scenario 1.1: Invoice Issue
    {
      rule_code: 'RULE_INV_ISSUE',
      rule_name: 'Direct Bill Premium Invoice Issue',
      description: 'Books AR, UPR and Policy Fee upon invoice generation (Guide Step 1.1)',
      event_code: 'billing.invoice.issued',
      applicable_module: 'BILLING_AR',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_RECEIVABLE',
          account_code: '1100',
          direction: 'DEBIT',
          amount_expression: 'payload.gross_premium + (payload.policy_fee || 0)',
          description_template: 'Premium Receivable billed to policyholder'
        },
        {
          line_number: 2,
          line_key: 'CR_UPR',
          account_code: '2200',
          direction: 'CREDIT',
          amount_expression: 'payload.gross_premium',
          description_template: 'Unearned Premium Reserve liability'
        },
        {
          line_number: 3,
          line_key: 'CR_POLICY_FEE',
          account_code: '4100',
          direction: 'CREDIT',
          amount_expression: 'payload.policy_fee || 0',
          description_template: 'Upfront Policy Fee Income recognized'
        }
      ]
    },

    // 2. Scenario 1.2: Payment Receipt
    {
      rule_code: 'RULE_PMT_RECEIVED',
      rule_name: 'Customer Cash Receipt & AR Knock-off',
      description: 'Collects cash into Texas Trust Bank and knocks off AR (Guide Step 1.2)',
      event_code: 'billing.payment.received',
      applicable_module: 'BILLING_AR',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_TRUST_CASH',
          account_code: '1010',
          direction: 'DEBIT',
          amount_expression: 'payload.amount',
          description_template: 'Cash received into Texas § 4053 Premium Trust'
        },
        {
          line_number: 2,
          line_key: 'CR_RECEIVABLE',
          account_code: '1100',
          direction: 'CREDIT',
          amount_expression: 'payload.amount',
          description_template: 'Premium Receivable cleared by payment'
        }
      ]
    },

    // 3. Scenario 1.3: Commission & Carrier Allocation
    {
      rule_code: 'RULE_COMMISSION_ALLOCATED',
      rule_name: 'Commission & Carrier Share Allocation',
      description: 'Reclassifies paid UPR to Carrier Payable, Broker Payable & MGA Commission (Guide Step 1.3)',
      event_code: 'finance.commission.allocated',
      applicable_module: 'COMMISSIONS_FIDUCIARY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_UPR',
          account_code: '2200',
          direction: 'DEBIT',
          amount_expression: 'payload.installment_premium',
          description_template: 'UPR released upon payment allocation',
          dimension_mappings: {
            policy_id: 'payload.policy_id',
            cost_center: 'payload.cost_center',
            company_code: 'payload.company_code'
          }
        },
        {
          line_number: 2,
          line_key: 'CR_DUE_TO_CARRIER',
          account_code: '2010',
          direction: 'CREDIT',
          amount_expression: 'payload.carrier_amount',
          description_template: 'Due to Underwriting Carrier',
          dimension_mappings: {
            policy_id: 'payload.policy_id',
            carrier_id: 'payload.carrier_id',
            carrier_name: 'payload.carrier_name',
            cost_center: 'payload.cost_center',
            company_code: 'payload.company_code'
          }
        },
        {
          line_number: 3,
          line_key: 'CR_BROKER_PAYABLE',
          account_code: '2020',
          direction: 'CREDIT',
          amount_expression: 'payload.broker_amount',
          description_template: 'Commission Payable to Retail Broker',
          dimension_mappings: {
            policy_id: 'payload.policy_id',
            broker_id: 'payload.broker_id',
            broker_name: 'payload.broker_name',
            producer_id: 'payload.broker_id',
            cost_center: 'payload.cost_center',
            company_code: 'payload.company_code'
          }
        },
        {
          line_number: 4,
          line_key: 'CR_MGA_COMMISSION',
          account_code: '4200',
          direction: 'CREDIT',
          amount_expression: 'payload.mga_amount',
          description_template: 'MGA Earned Commission Income',
          dimension_mappings: {
            policy_id: 'payload.policy_id',
            mga_id: 'payload.mga_id',
            cost_center: 'payload.cost_center',
            company_code: 'payload.company_code'
          }
        }
      ]
    },

    // 4. Scenario 1.4: Fiduciary Sweep
    {
      rule_code: 'RULE_FIDUCIARY_SWEEP',
      rule_name: 'Texas § 4053 Fiduciary Sweep',
      description: 'Sweeps earned agency fee/commission from Trust (1010) to Operating Cash (1000) (Guide Step 1.4)',
      event_code: 'fiduciary.sweep.executed',
      applicable_module: 'COMMISSIONS_FIDUCIARY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_OPERATING_CASH',
          account_code: '1000',
          direction: 'DEBIT',
          amount_expression: 'payload.amount',
          description_template: 'MGA operating cash transfer'
        },
        {
          line_number: 2,
          line_key: 'CR_PREMIUM_TRUST',
          account_code: '1010',
          direction: 'CREDIT',
          amount_expression: 'payload.amount',
          description_template: 'Release from statutory premium trust'
        }
      ]
    },

    // 5. Scenario 2: Endorsement Delta Booking
    {
      rule_code: 'RULE_POLICY_ENDORSEMENT',
      rule_name: 'Mid-Term Endorsement Delta Booking (T5 Truck)',
      description: 'Books pro-rata endorsement delta premium to AR and UPR (Guide Scenario 2)',
      event_code: 'policy.endorsement.issued',
      applicable_module: 'POLICY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_RECEIVABLE',
          account_code: '1100',
          direction: 'DEBIT',
          amount_expression: 'payload.delta_premium',
          description_template: 'Endorsement Delta Premium Receivable'
        },
        {
          line_number: 2,
          line_key: 'CR_UPR',
          account_code: '2200',
          direction: 'CREDIT',
          amount_expression: 'payload.delta_premium',
          description_template: 'Endorsement UPR Coverage Reserve'
        }
      ]
    },

    // 6. Scenario 3: Pro-Rata Policy Cancellation
    {
      rule_code: 'RULE_POLICY_CANCEL_PRORATA',
      rule_name: 'Pro-Rata Policy Cancellation Return Premium',
      description: 'Reclassifies unearned UPR to Return Premium Payable (Guide Scenario 3)',
      event_code: 'policy.cancelled.prorata',
      applicable_module: 'POLICY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_UPR',
          account_code: '2200',
          direction: 'DEBIT',
          amount_expression: 'payload.return_premium',
          description_template: 'UPR cancelled upon pro-rata policy termination'
        },
        {
          line_number: 2,
          line_key: 'CR_RETURN_PAYABLE',
          account_code: '2100',
          direction: 'CREDIT',
          amount_expression: 'payload.return_premium',
          description_template: 'Return Premium Payable to insured'
        }
      ]
    },

    // 7. Scenario 3: Commission Clawback
    {
      rule_code: 'RULE_COMMISSION_CLAWBACK',
      rule_name: 'Broker Commission Clawback on Cancellation',
      description: 'Recovers broker unearned commission against expense (Guide Scenario 3)',
      event_code: 'finance.commission.clawback',
      applicable_module: 'COMMISSIONS_FIDUCIARY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_BROKER_PAYABLE',
          account_code: '2020',
          direction: 'DEBIT',
          amount_expression: 'payload.clawback_amount',
          description_template: 'Clawback recovered from retail broker'
        },
        {
          line_number: 2,
          line_key: 'CR_COMMISSION_EXPENSE',
          account_code: '5010',
          direction: 'CREDIT',
          amount_expression: 'payload.clawback_amount',
          description_template: 'Commission Expense reversal'
        }
      ]
    },

    // 8. Scenario 4: Policy Reinstatement
    {
      rule_code: 'RULE_POLICY_REINSTATED',
      rule_name: 'Policy Reinstatement with Reinstatement Fee',
      description: 'Restores UPR and books reinstatement fee revenue upon policy reactivation (Guide Scenario 4)',
      event_code: 'policy.reinstated',
      applicable_module: 'POLICY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_RECEIVABLE',
          account_code: '1100',
          direction: 'DEBIT',
          amount_expression: 'payload.reinstated_premium + (payload.reinstatement_fee || 0)',
          description_template: 'Reinstated Premium & Fee Receivable'
        },
        {
          line_number: 2,
          line_key: 'CR_UPR',
          account_code: '2200',
          direction: 'CREDIT',
          amount_expression: 'payload.reinstated_premium',
          description_template: 'UPR restored upon reinstatement'
        },
        {
          line_number: 3,
          line_key: 'CR_FEE_INCOME',
          account_code: '4100',
          direction: 'CREDIT',
          amount_expression: 'payload.reinstatement_fee || 0',
          description_template: 'Reinstatement Fee Income'
        }
      ]
    },

    // 9. Scenario 5: Daily Pro-Rata Earned Premium
    {
      rule_code: 'RULE_EARNED_PREMIUM_RUN',
      rule_name: 'Daily Straight-Line Earned Premium Recognition',
      description: 'ASC 944 monthly straight-line unearned premium earning (Guide Scenario 5)',
      event_code: 'finance.earned_premium.calculated',
      applicable_module: 'FINANCE_CLOSE',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_UPR',
          account_code: '2200',
          direction: 'DEBIT',
          amount_expression: 'payload.earned_amount',
          description_template: 'UPR liability amortization'
        },
        {
          line_number: 2,
          line_key: 'CR_EARNED_REVENUE',
          account_code: '4000',
          direction: 'CREDIT',
          amount_expression: 'payload.earned_amount',
          description_template: 'Earned Premium Revenue recognized in P&L'
        }
      ]
    },

    // 10. Scenario 6: Claim Reserve Established
    {
      rule_code: 'RULE_CLAIM_RESERVE',
      rule_name: 'Loss Reserve Established for Accident',
      description: 'Books claim loss incurred expense and loss reserves liability (Guide Scenario 6)',
      event_code: 'claim.reserve.established',
      applicable_module: 'CLAIMS',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_LOSSES_INCURRED',
          account_code: '5000',
          direction: 'DEBIT',
          amount_expression: 'payload.reserve_amount',
          description_template: 'Losses Incurred Expense on claim'
        },
        {
          line_number: 2,
          line_key: 'CR_LOSS_RESERVES',
          account_code: '2500',
          direction: 'CREDIT',
          amount_expression: 'payload.reserve_amount',
          description_template: 'Loss Reserves Liability established'
        }
      ]
    },

    // 11. Scenario 6: Claim Settlement Payment Issued
    {
      rule_code: 'RULE_CLAIM_PAYMENT',
      rule_name: 'Claim Settlement Payment Issued',
      description: 'Disburses settlement check against loss reserve (Guide Scenario 6)',
      event_code: 'claim.payment.issued',
      applicable_module: 'CLAIMS',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_LOSS_RESERVES',
          account_code: '2500',
          direction: 'DEBIT',
          amount_expression: 'payload.payout_amount',
          description_template: 'Loss Reserves Liability relieved'
        },
        {
          line_number: 2,
          line_key: 'CR_OPERATING_CASH',
          account_code: '1000',
          direction: 'CREDIT',
          amount_expression: 'payload.payout_amount',
          description_template: 'Operating Bank Cash disbursed for claim settlement'
        }
      ]
    },

    // 12. NSF Payment Return
    {
      rule_code: 'RULE_NSF_RETURN',
      rule_name: 'NSF Dishonor Payment Reversal',
      description: 'Reverses dishonored payment back to Receivable (Treasury Module)',
      event_code: 'treasury.payment.returned',
      applicable_module: 'TREASURY_BANK_REC',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_RECEIVABLE',
          account_code: '1100',
          direction: 'DEBIT',
          amount_expression: 'payload.amount',
          description_template: 'Receivable reinstated due to NSF bank return'
        },
        {
          line_number: 2,
          line_key: 'CR_TRUST_CASH',
          account_code: '1010',
          direction: 'CREDIT',
          amount_expression: 'payload.amount',
          description_template: 'Trust Cash reversed for NSF dishonor'
        }
      ]
    },

    // 13. Carrier Settlement Disbursement
    {
      rule_code: 'RULE_CARRIER_DISBURSE',
      rule_name: 'Carrier Net Premium Remittance Disbursement',
      description: 'Disburses net premium due carrier from Premium Trust (Guide Scenario 1 & Settlements)',
      event_code: 'carrier.settlement.disbursed',
      applicable_module: 'COMMISSIONS_FIDUCIARY',
      priority: 100,
      lines: [
        {
          line_number: 1,
          line_key: 'DR_DUE_TO_CARRIER',
          account_code: '2010',
          direction: 'DEBIT',
          amount_expression: 'payload.net_due_carrier',
          description_template: 'Discharge Due to Carrier liability',
          dimension_mappings: {
            statement_number: 'payload.statement_number',
            carrier_id: 'payload.carrier_id',
            carrier_name: 'payload.carrier_name',
            cost_center: 'payload.cost_center',
            company_code: 'payload.company_code'
          }
        },
        {
          line_number: 2,
          line_key: 'CR_PREMIUM_TRUST',
          account_code: '1010',
          direction: 'CREDIT',
          amount_expression: 'payload.net_due_carrier',
          description_template: 'Remittance wire from Texas § 4053 Premium Trust',
          dimension_mappings: {
            statement_number: 'payload.statement_number',
            carrier_id: 'payload.carrier_id',
            carrier_name: 'payload.carrier_name',
            cost_center: 'payload.cost_center',
            company_code: 'payload.company_code'
          }
        }
      ]
    }
  ];

  // Upsert rules and their lines
  for (const rData of rulesData) {
    const { lines, ...ruleProps } = rData;

    let rule = await PostingRule.findOne({ tenant_id: tenantId, rule_code: ruleProps.rule_code });
    if (!rule) {
      rule = new PostingRule({
        ...ruleProps,
        tenant_id: tenantId,
        status: 'PUBLISHED',
        published_at: new Date(),
        version: 1,
        accounting_basis: 'GAAP',
        effective_from: new Date('2020-01-01')
      });
      await rule.save();
    } else {
      rule.rule_name = ruleProps.rule_name;
      rule.description = ruleProps.description;
      rule.event_code = ruleProps.event_code;
      rule.applicable_module = ruleProps.applicable_module;
      rule.priority = ruleProps.priority;
      rule.conditions = rData.conditions || [];
      rule.status = 'PUBLISHED';
      await rule.save();
    }

    // Delete existing lines and re-insert
    await PostingRuleLine.deleteMany({ posting_rule_id: rule._id });

    const linesToInsert = lines.map(l => ({
      ...l,
      posting_rule_id: rule._id,
      tenant_id: tenantId,
      rounding_mode: 'ROUND_HALF_UP',
      currency_expression: 'USD'
    }));

    await PostingRuleLine.insertMany(linesToInsert);
  }

  console.log(`[Guide Seeder] ${rulesData.length} Posting Rules and all lines registered and published!`);
  return { eventCount: eventDefinitionsData.length, ruleCount: rulesData.length };
}

if (require.main === module) {
  require('dotenv').config();
  const tenantId = process.env.TEST_TENANT_ID || '6acd045ef52f66e7422cf445';
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => seedAllGuideScenarios(tenantId))
    .then(res => {
      console.log('Seeding finished successfully:', res);
      return mongoose.disconnect();
    })
    .catch(err => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}

module.exports = { seedAllGuideScenarios };
