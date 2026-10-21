const { EventDefinition } = require('../models');

/**
 * Seeds standard commercial ERP event definitions for a tenant if none exist.
 * Ensures strict schema contract enforcement across event publishers and posting rules.
 */
async function seedDefaultEventDefinitions(tenantId) {
  if (!tenantId) return [];

  const existingCount = await EventDefinition.countDocuments({ tenant_id: tenantId });
  if (existingCount > 0) return [];

  const defaultEvents = [
    {
      tenant_id: tenantId,
      event_code: 'commercial.sales.invoice',
      display_name: 'Commercial Sales Invoice Posted',
      description: 'Triggered when a commercial sales invoice is posted to recognize revenue, customer receivable, and GST',
      source_module: 'COMMERCIAL',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Standard commercial sales invoice event contract',
          json_schema: {
            type: 'object',
            properties: {
              document_id: { type: 'string' },
              document_number: { type: 'string' },
              party_id: { type: 'string' },
              taxable_amount: { type: 'number' },
              cgst_amount: { type: 'number' },
              sgst_amount: { type: 'number' },
              igst_amount: { type: 'number' },
              total_amount: { type: 'number' }
            }
          },
          sample_payload: {
            document_id: 'DOC-2026-00001',
            document_number: 'INV-2026-0001',
            party_id: 'PTY-CUSTOMER-01',
            taxable_amount: 10000,
            cgst_amount: 900,
            sgst_amount: 900,
            igst_amount: 0,
            total_amount: 11800
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'commercial.sales.receipt',
      display_name: 'Commercial Customer Receipt',
      description: 'Triggered when a customer payment (Cash, Bank, UPI, NEFT) is received against invoices',
      source_module: 'COMMERCIAL',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Customer payment receipt contract',
          json_schema: {
            type: 'object',
            properties: {
              receipt_id: { type: 'string' },
              party_id: { type: 'string' },
              amount: { type: 'number' },
              payment_mode: { type: 'string' }
            }
          },
          sample_payload: {
            receipt_id: 'RCPT-001',
            party_id: 'PTY-CUSTOMER-01',
            amount: 11800,
            payment_mode: 'BANK_TRANSFER'
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'commercial.purchase.invoice',
      display_name: 'Commercial Purchase Invoice Posted',
      description: 'Triggered when a vendor purchase bill is posted for inventory and supplier credit',
      source_module: 'COMMERCIAL',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Purchase bill event contract',
          json_schema: {
            type: 'object',
            properties: {
              document_id: { type: 'string' },
              document_number: { type: 'string' },
              supplier_id: { type: 'string' },
              subtotal: { type: 'number' },
              tax_amount: { type: 'number' },
              total_amount: { type: 'number' }
            }
          },
          sample_payload: {
            document_id: 'PUR-001',
            document_number: 'BILL-SUPP-9921',
            supplier_id: 'PTY-SUPPLIER-01',
            subtotal: 50000,
            tax_amount: 9000,
            total_amount: 59000
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'commercial.pos.checkout',
      display_name: 'Retail POS Checkout',
      description: 'Triggered upon retail POS sale completion and tender settlement',
      source_module: 'RETAIL_POS',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'POS retail checkout event schema',
          json_schema: {
            type: 'object',
            properties: {
              pos_invoice_number: { type: 'string' },
              net_amount: { type: 'number' },
              tender_type: { type: 'string' }
            }
          },
          sample_payload: {
            pos_invoice_number: 'POS-2026-0001',
            net_amount: 1450,
            tender_type: 'CASH'
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'commercial.restaurant.bill',
      display_name: 'Restaurant Table Settle & Recipe Consumption',
      description: 'Triggered upon dining table bill settlement and dish ingredient consumption',
      source_module: 'RESTAURANT',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Restaurant order settlement event schema',
          json_schema: {
            type: 'object',
            properties: {
              order_id: { type: 'string' },
              table_number: { type: 'string' },
              bill_amount: { type: 'number' }
            }
          },
          sample_payload: {
            order_id: 'ORD-2026-0042',
            table_number: 'T-04',
            bill_amount: 2200
          }
        }
      ]
    },
    {
      tenant_id: tenantId,
      event_code: 'franchise.commission.calculated',
      display_name: 'Franchise Commission Calculated',
      description: 'Triggered when franchise commission and main hub revenue split are calculated for an eligible transaction',
      source_module: 'COMMERCIAL',
      category: 'TRANSACTION',
      status: 'ACTIVE',
      current_version: '1.0.0',
      versions: [
        {
          version: '1.0.0',
          status: 'ACTIVE',
          description: 'Franchise commission calculation event schema',
          json_schema: {
            type: 'object',
            properties: {
              transaction_id: { type: 'string' },
              franchise_id: { type: 'string' },
              hub_party_id: { type: 'string' },
              transaction_amount: { type: 'number' },
              franchise_share_pct: { type: 'number' },
              hub_share_pct: { type: 'number' },
              franchise_amount: { type: 'number' },
              hub_amount: { type: 'number' }
            }
          },
          sample_payload: {
            transaction_id: 'TXN-FRAN-001',
            franchise_id: 'FRAN-DOWNTOWN',
            hub_party_id: 'PTY-HUB-MAIN',
            transaction_amount: 200,
            franchise_share_pct: 70,
            hub_share_pct: 30,
            franchise_amount: 140,
            hub_amount: 60
          }
        }
      ]
    }
  ];

  return await EventDefinition.insertMany(defaultEvents);
}

module.exports = { seedDefaultEventDefinitions };
