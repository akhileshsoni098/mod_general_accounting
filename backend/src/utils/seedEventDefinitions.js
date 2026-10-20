const { EventDefinition } = require('../models');

/**
 * Seeds standard system event definitions for a tenant if none exist.
 * Ensures strict schema contract enforcement across event publishers and posting rules.
 */
async function seedDefaultEventDefinitions(tenantId) {
  if (!tenantId) return [];

  const existingCount = await EventDefinition.countDocuments({ tenant_id: tenantId });
  if (existingCount > 0) return [];

  const defaultEvents = [
    {
      tenant_id: tenantId,
      event_code: 'billing.invoice.issued',
      display_name: 'Billing Invoice Issued',
      description: 'Triggered when a policy invoice or installment is issued to an insured/customer',
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
            properties: {
              invoice_id: { type: 'string' },
              policy_id: { type: 'string' },
              transaction_type: { type: 'string' },
              gross_premium: { type: 'number' },
              policy_fee: { type: 'number' },
              commission_amount: { type: 'number' },
              total_amount: { type: 'number' }
            }
          },
          sample_payload: {
            invoice_id: 'INV-2026-00001',
            policy_id: 'POL-TX-8821',
            transaction_type: 'DIRECT_BILL',
            gross_premium: 37650,
            policy_fee: 150,
            commission_amount: 5647.5,
            total_amount: 37800
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'billing.payment.received',
      display_name: 'Billing Payment Received',
      description: 'Triggered when a customer payment (ACH, Wire, Check) is captured into trust/operating cash',
      source_module: 'BILLING',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Payment receipt contract',
          json_schema: {
            type: 'object',
            properties: {
              payment_id: { type: 'string' },
              amount: { type: 'number' },
              payment_method: { type: 'string' }
            }
          },
          sample_payload: {
            payment_id: 'PMT-001',
            amount: 9562.5,
            payment_method: 'ACH'
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'commissions.fiduciary.sweep',
      display_name: 'Texas § 4053 Fiduciary Sweep',
      description: 'Triggered when earned commissions are swept from premium trust to operating bank',
      source_module: 'COMMISSIONS',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Fiduciary commission sweep contract',
          json_schema: {
            type: 'object',
            properties: {
              sweep_id: { type: 'string' },
              amount: { type: 'number' }
            }
          },
          sample_payload: {
            sweep_id: 'SWP-001',
            amount: 500
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'treasury.payment.returned',
      display_name: 'NSF Payment Return',
      description: 'Triggered upon bank dishonor of a premium payment',
      source_module: 'TREASURY',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'NSF return event schema',
          json_schema: {
            type: 'object',
            properties: {
              return_id: { type: 'string' },
              amount: { type: 'number' },
              fee_amount: { type: 'number' }
            }
          },
          sample_payload: {
            return_id: 'RET-001',
            amount: 9200,
            fee_amount: 35
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'upr.earning.requested',
      display_name: 'UPR Earning Amortization',
      description: 'Triggered by month-end straight-line unearned premium earning schedule',
      source_module: 'FINANCE_CLOSE',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Unearned premium amortization earning contract',
          json_schema: {
            type: 'object',
            properties: {
              policy_id: { type: 'string' },
              earned_amount: { type: 'number' }
            }
          },
          sample_payload: {
            policy_id: 'POL-TX-8821',
            earned_amount: 764.38
          }
        }
      ]
    }
  ];

  return await EventDefinition.insertMany(defaultEvents);
}

module.exports = { seedDefaultEventDefinitions };
