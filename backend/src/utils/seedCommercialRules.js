const { PostingRule, PostingRuleLine, EventDefinition } = require('../models');

const COMMERCIAL_RULES_DATA = [
  {
    rule_code: 'RULE_COMMERCIAL_SALES_INVOICE',
    rule_name: 'Commercial Sales Invoice Posting Rule',
    description: 'Posts customer receivables, product sales revenue, output GST, and rounding for sales invoices',
    event_code: 'commercial.sales.invoice',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_RECEIVABLE', account_code: '1101', direction: 'DEBIT', amount_expression: 'payload.grand_total', description_template: 'Sales invoice {{payload.document_number}} receivable' },
      { line_number: 2, line_key: 'CR_REVENUE', account_code: '4001', direction: 'CREDIT', amount_expression: 'payload.total_taxable_amount', description_template: 'Sales revenue for {{payload.document_number}}' },
      { line_number: 3, line_key: 'CR_OUTPUT_CGST', account_code: '2101', direction: 'CREDIT', amount_expression: 'payload.total_cgst_amount', description_template: 'Output CGST on {{payload.document_number}}' },
      { line_number: 4, line_key: 'CR_OUTPUT_SGST', account_code: '2102', direction: 'CREDIT', amount_expression: 'payload.total_sgst_amount', description_template: 'Output SGST on {{payload.document_number}}' },
      { line_number: 5, line_key: 'CR_OUTPUT_IGST', account_code: '2103', direction: 'CREDIT', amount_expression: 'payload.total_igst_amount', description_template: 'Output IGST on {{payload.document_number}}' },
      { line_number: 6, line_key: 'CR_ROUND_OFF', account_code: '5900', direction: 'CREDIT', amount_expression: 'payload.round_off_amount', description_template: 'Round-off difference on {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_SALES_COGS',
    rule_name: 'Perpetual Inventory COGS Posting Rule',
    description: 'Recognizes Cost of Goods Sold and relieves inventory asset balance upon goods issue',
    event_code: 'commercial.sales.cogs',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_COGS', account_code: '5004', direction: 'DEBIT', amount_expression: 'payload.total_cogs_amount', description_template: 'COGS for sales invoice {{payload.document_number}}' },
      { line_number: 2, line_key: 'CR_INVENTORY', account_code: '1201', direction: 'CREDIT', amount_expression: 'payload.total_cogs_amount', description_template: 'Relieve stock-in-hand for {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_PURCHASE_INVOICE',
    rule_name: 'Commercial Purchase Invoice Posting Rule',
    description: 'Capitalizes inventory asset cost, records recoverable input GST, and credits supplier payables',
    event_code: 'commercial.purchase.invoice',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_INVENTORY', account_code: '1201', direction: 'DEBIT', amount_expression: 'payload.total_taxable_amount', description_template: 'Stock received for purchase {{payload.document_number}}' },
      { line_number: 2, line_key: 'DR_INPUT_CGST', account_code: '1301', direction: 'DEBIT', amount_expression: 'payload.total_cgst_amount', description_template: 'Input CGST credit on {{payload.document_number}}' },
      { line_number: 3, line_key: 'DR_INPUT_SGST', account_code: '1302', direction: 'DEBIT', amount_expression: 'payload.total_sgst_amount', description_template: 'Input SGST credit on {{payload.document_number}}' },
      { line_number: 4, line_key: 'DR_INPUT_IGST', account_code: '1303', direction: 'DEBIT', amount_expression: 'payload.total_igst_amount', description_template: 'Input IGST credit on {{payload.document_number}}' },
      { line_number: 5, line_key: 'DR_ROUND_OFF', account_code: '5900', direction: 'DEBIT', amount_expression: 'payload.round_off_amount', description_template: 'Round-off difference on {{payload.document_number}}' },
      { line_number: 6, line_key: 'CR_PAYABLE', account_code: '2001', direction: 'CREDIT', amount_expression: 'payload.grand_total', description_template: 'Trade payable for purchase {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_RECEIPT',
    rule_name: 'Customer Receipt Posting Rule',
    description: 'Debits bank/cash and credits trade receivables for customer payments',
    event_code: 'commercial.receipt',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_CASH_BANK', account_code: '1001', direction: 'DEBIT', amount_expression: 'payload.amount', description_template: 'Customer collection receipt {{payload.document_number}}' },
      { line_number: 2, line_key: 'CR_RECEIVABLE', account_code: '1101', direction: 'CREDIT', amount_expression: 'payload.amount', description_template: 'Relieve customer receivable for {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_PAYMENT',
    rule_name: 'Supplier Payment Posting Rule',
    description: 'Debits trade payables and credits bank/cash for supplier disbursements',
    event_code: 'commercial.payment',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_PAYABLE', account_code: '2001', direction: 'DEBIT', amount_expression: 'payload.amount', description_template: 'Supplier payment disbursement {{payload.document_number}}' },
      { line_number: 2, line_key: 'CR_CASH_BANK', account_code: '1001', direction: 'CREDIT', amount_expression: 'payload.amount', description_template: 'Relieve bank/cash for payment {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_SALES_RETURN',
    rule_name: 'Sales Return & Credit Note Posting Rule',
    description: 'Reverses sales revenue, reverses output GST liability, and credits customer receivable',
    event_code: 'commercial.sales.return',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_SALES_RETURN', account_code: '4001', direction: 'DEBIT', amount_expression: 'payload.total_taxable_amount', description_template: 'Sales return revenue adjustment {{payload.document_number}}' },
      { line_number: 2, line_key: 'DR_OUTPUT_CGST_REV', account_code: '2101', direction: 'DEBIT', amount_expression: 'payload.total_cgst_amount', description_template: 'Reverse Output CGST on return {{payload.document_number}}' },
      { line_number: 3, line_key: 'DR_OUTPUT_SGST_REV', account_code: '2102', direction: 'DEBIT', amount_expression: 'payload.total_sgst_amount', description_template: 'Reverse Output SGST on return {{payload.document_number}}' },
      { line_number: 4, line_key: 'DR_OUTPUT_IGST_REV', account_code: '2103', direction: 'DEBIT', amount_expression: 'payload.total_igst_amount', description_template: 'Reverse Output IGST on return {{payload.document_number}}' },
      { line_number: 5, line_key: 'CR_RECEIVABLE_CREDIT', account_code: '1101', direction: 'CREDIT', amount_expression: 'payload.grand_total', description_template: 'Credit customer account for return {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_PURCHASE_RETURN',
    rule_name: 'Purchase Return & Debit Note Posting Rule',
    description: 'Debits supplier payables, relieves inventory asset, and reverses input GST credit',
    event_code: 'commercial.purchase.return',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_PAYABLE_DEBIT', account_code: '2001', direction: 'DEBIT', amount_expression: 'payload.grand_total', description_template: 'Debit supplier account for return {{payload.document_number}}' },
      { line_number: 2, line_key: 'CR_INVENTORY_OUT', account_code: '1201', direction: 'CREDIT', amount_expression: 'payload.total_taxable_amount', description_template: 'Relieve stock for purchase return {{payload.document_number}}' },
      { line_number: 3, line_key: 'CR_INPUT_CGST_REV', account_code: '1301', direction: 'CREDIT', amount_expression: 'payload.total_cgst_amount', description_template: 'Reverse Input CGST on return {{payload.document_number}}' },
      { line_number: 4, line_key: 'CR_INPUT_SGST_REV', account_code: '1302', direction: 'CREDIT', amount_expression: 'payload.total_sgst_amount', description_template: 'Reverse Input SGST on return {{payload.document_number}}' },
      { line_number: 5, line_key: 'CR_INPUT_IGST_REV', account_code: '1303', direction: 'CREDIT', amount_expression: 'payload.total_igst_amount', description_template: 'Reverse Input IGST on return {{payload.document_number}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_OPENING_STOCK',
    rule_name: 'Opening Stock GL Integration Posting Rule',
    description: 'Initializes inventory asset ledger balance balanced against Opening Stock Offset / Valuation Reserve',
    event_code: 'commercial.opening.stock',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_INVENTORY_ASSET', account_code: '1201', direction: 'DEBIT', amount_expression: 'payload.total_cost', description_template: 'Opening inventory asset initialization for {{payload.stock_item_name}}' },
      { line_number: 2, line_key: 'CR_OPENING_OFFSET', account_code: '3990', direction: 'CREDIT', amount_expression: 'payload.total_cost', description_template: 'Opening stock balancing equity reserve for {{payload.stock_item_name}}' }
    ]
  },
  {
    rule_code: 'RULE_COMMERCIAL_CONTRA_TRANSFER',
    rule_name: 'Cash / Bank Contra Transfer Rule',
    description: 'Transfers funds between internal bank and cash accounts without affecting P&L',
    event_code: 'commercial.contra.transfer',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      { line_number: 1, line_key: 'DR_DEST_ACCOUNT', account_code: '1002', direction: 'DEBIT', amount_expression: 'payload.amount', description_template: 'Transfer in to {{payload.to_account_name}}' },
      { line_number: 2, line_key: 'CR_SRC_ACCOUNT', account_code: '1001', direction: 'CREDIT', amount_expression: 'payload.amount', description_template: 'Transfer out from {{payload.from_account_name}}' }
    ]
  },
  {
    rule_code: 'RULE_FRANCHISE_COMMISSION_SPLIT',
    rule_name: 'Franchise Commission & Main Hub Split Posting Rule',
    description: 'Debits settlement clearing cash 1010, credits franchise commission revenue 4200 (70%), and credits main hub payable 2020 (30%)',
    event_code: 'franchise.commission.calculated',
    applicable_module: 'GL',
    priority: 10,
    lines: [
      {
        line_number: 1,
        line_key: 'DR_SETTLEMENT_CASH',
        account_code: '1010',
        direction: 'DEBIT',
        amount_expression: 'payload.transaction_amount',
        description_template: 'Collected settlement cash for {{payload.transaction_id}}'
      },
      {
        line_number: 2,
        line_key: 'CR_FRANCHISE_REVENUE',
        account_code: '4200',
        direction: 'CREDIT',
        amount_expression: 'payload.franchise_amount || (payload.transaction_amount * 0.70)',
        description_template: 'Franchise commission revenue for {{payload.transaction_id}}'
      },
      {
        line_number: 3,
        line_key: 'CR_DUE_TO_MAIN_HUB',
        account_code: '2020',
        direction: 'CREDIT',
        amount_expression: 'payload.hub_amount || (payload.transaction_amount * 0.30)',
        description_template: 'Payable to Main Hub for {{payload.transaction_id}}'
      }
    ]
  }
];

/**
 * Seeds default commercial event definitions and posting rules for a tenant and company.
 */
async function seedDefaultCommercialRules(tenantId, companyId = null, options = {}) {
  if (!tenantId) return [];

  const createdRules = [];

  for (const rData of COMMERCIAL_RULES_DATA) {
    const { lines, ...ruleProps } = rData;

    const query = {
      tenant_id: tenantId,
      rule_code: ruleProps.rule_code
    };
    if (companyId) query.company_id = companyId;

    let rule = await PostingRule.findOne(query).session(options.session || null);
    if (!rule) {
      rule = new PostingRule({
        ...ruleProps,
        tenant_id: tenantId,
        company_id: companyId || null,
        status: 'PUBLISHED',
        published_at: new Date(),
        version: 1,
        accounting_basis: 'GAAP',
        effective_from: new Date('2020-01-01')
      });
      await rule.save({ session: options.session });
    }

    // Upsert lines
    await PostingRuleLine.deleteMany({ posting_rule_id: rule._id }).session(options.session || null);

    const linesToInsert = lines.map(l => ({
      ...l,
      posting_rule_id: rule._id,
      tenant_id: tenantId,
      rounding_mode: 'ROUND_HALF_UP',
      currency_expression: 'INR'
    }));

    await PostingRuleLine.insertMany(linesToInsert, { session: options.session });
    createdRules.push(rule);
  }

  return createdRules;
}

module.exports = {
  COMMERCIAL_RULES_DATA,
  seedDefaultCommercialRules
};
