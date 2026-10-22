const { Party, PartyRole } = require('../models');

/**
 * Legacy Insurance Counterparty Codes that must be cleaned up / replaced in General Accounting ERP
 */
const LEGACY_INSURANCE_PARTY_CODES = [
  'CARRIER-SUMMIT',
  'CARRIER-SOUTHLAKE',
  'CARRIER-CLEARSPRING',
  'BROKER-BRIGHTLINE',
  'BROKER-LONESTAR',
  'BROKER-AUSTIN',
  'MGA-HARBOR',
  'POLICYHOLDER-LONEPINE'
];

/**
 * Standard Commercial General Accounting ERP Counterparties:
 * Customers (Sundry Debtors), Suppliers (Sundry Creditors), Vendors, Franchise Stores, and Corporate Hub.
 */
const DEFAULT_COMMERCIAL_COUNTERPARTIES = [
  // 1. Customers / Sundry Debtors
  {
    party_code: 'CUST-APEX-001',
    legal_name: 'Apex Wholesale Mart Private Limited',
    trade_name: 'Apex Mart',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCA1234F1Z8',
    email: 'commercial@apexmart.com',
    phone: '022-25550122',
    address: {
      street1: 'Shop 12-14, APMC Commercial Market',
      city: 'Navi Mumbai',
      state: 'MH',
      postal_code: '400703',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'CUSTOMER',
    role_details: {
      subledger_code: '1101',
      credit_limit: 500000,
      credit_days: 30,
      customer_category: 'WHOLESALE_TRADER',
      gstin: '27AABCA1234F1Z8',
      pan: 'AABCA1234F',
      state_code: '27'
    }
  },
  {
    party_code: 'CUST-METRO-002',
    legal_name: 'Metro Hypermarket Retail Enterprises LLP',
    trade_name: 'Metro Hypermarket',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCM2234G1Z9',
    email: 'finance@metrohyper.com',
    phone: '022-25550180',
    address: {
      street1: 'Plot 45, MIDC Industrial Area',
      city: 'Pune',
      state: 'MH',
      postal_code: '411018',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'CUSTOMER',
    role_details: {
      subledger_code: '1101',
      credit_limit: 750000,
      credit_days: 45,
      customer_category: 'RETAIL_CHAIN',
      gstin: '27AABCM2234G1Z9',
      pan: 'AABCM2234G',
      state_code: '27'
    }
  },
  {
    party_code: 'CUST-HORIZON-003',
    legal_name: 'Horizon Tech Solutions & Trading Pvt Ltd',
    trade_name: 'Horizon Corp',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCH3344H1Z1',
    email: 'accounts@horizoncorp.in',
    phone: '020-25550199',
    address: {
      street1: 'Tower B, Cyber City Park',
      city: 'Nagpur',
      state: 'MH',
      postal_code: '440022',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'CUSTOMER',
    role_details: {
      subledger_code: '1101',
      credit_limit: 300000,
      credit_days: 15,
      customer_category: 'CORPORATE_SERVICES',
      gstin: '27AABCH3344H1Z1',
      pan: 'AABCH3344H',
      state_code: '27'
    }
  },

  // 2. Suppliers / Sundry Creditors
  {
    party_code: 'SUPP-BHARAT-001',
    legal_name: 'Bharat Logistics & Commercial Suppliers',
    trade_name: 'Bharat Logistics',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCB5566J1Z3',
    email: 'orders@bharatlogistics.in',
    phone: '022-25550144',
    address: {
      street1: 'Warehouse 8, Transport Nagar',
      city: 'Thane',
      state: 'MH',
      postal_code: '400601',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'SUPPLIER',
    role_details: {
      subledger_code: '2001',
      payment_terms: 'NET_30',
      vendor_category: 'RAW_MATERIALS_LOGISTICS',
      gstin: '27AABCB5566J1Z3',
      pan: 'AABCB5566J',
      msme_registered: true
    }
  },
  {
    party_code: 'SUPP-GLOBAL-002',
    legal_name: 'Global Goods Trading & Distributors Ltd',
    trade_name: 'Global Supply Co',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCG7788K1Z5',
    email: 'dispatch@globalsupply.in',
    phone: '022-25550100',
    address: {
      street1: 'Trade Center, Sector 17',
      city: 'Navi Mumbai',
      state: 'MH',
      postal_code: '400705',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'SUPPLIER',
    role_details: {
      subledger_code: '2001',
      payment_terms: 'NET_45',
      vendor_category: 'TRADING_MERCHANDISE',
      gstin: '27AABCG7788K1Z5',
      pan: 'AABCG7788K',
      msme_registered: false
    }
  },

  // 3. Vendors / Contractors
  {
    party_code: 'VEND-PREMIER-001',
    legal_name: 'Premier Commercial Packaging & Facilities',
    trade_name: 'Premier Packaging',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCP9900L1Z7',
    email: 'billing@premierpack.in',
    phone: '022-25550150',
    address: {
      street1: 'Plot 22, Ambad Industrial Estate',
      city: 'Nashik',
      state: 'MH',
      postal_code: '422010',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'VENDOR',
    role_details: {
      subledger_code: '2001',
      service_type: 'PACKAGING_AND_MAINTENANCE',
      gstin: '27AABCP9900L1Z7',
      pan: 'AABCP9900L',
      msme_registered: true
    }
  },

  // 4. Franchise & Main Hub Partners
  {
    party_code: 'FRANCHISE-MUM-01',
    legal_name: 'Mumbai Central Franchise Retail Store',
    trade_name: 'Veridex Hub Store #1',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCF1122M1Z2',
    email: 'operations@mumbaicentral-store.in',
    phone: '022-25550188',
    address: {
      street1: 'Unit 5, Prime Commercial Galleria',
      city: 'Mumbai',
      state: 'MH',
      postal_code: '400001',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'FRANCHISE',
    role_details: {
      subledger_code: '1150',
      franchise_store_id: 'FR-MUM-01',
      commission_split_pct: 70.0,
      hub_split_pct: 30.0,
      agreement_ref: 'AGR-FR-2026-01',
      gstin: '27AABCF1122M1Z2'
    }
  },
  {
    party_code: 'HUB-CENTRAL-01',
    legal_name: 'Veridex Central Corporate Hub Operations',
    trade_name: 'Veridex Corporate Hub',
    party_type: 'ORGANIZATION',
    tax_id: '27AABCV3344N1Z4',
    email: 'centralhub@veridexsolutions.ai',
    phone: '022-25550190',
    address: {
      street1: 'HQ Tower, BKC Commercial Complex',
      city: 'Mumbai',
      state: 'MH',
      postal_code: '400051',
      country: 'IND'
    },
    status: 'ACTIVE',
    role_type: 'MAIN_HUB',
    role_details: {
      subledger_code: '2020',
      hub_code: 'HUB-CENTRAL-01',
      hub_split_pct: 30.0,
      hub_type: 'CENTRAL_DISTRIBUTION_AND_ROYALTY',
      gstin: '27AABCV3344N1Z4'
    }
  }
];

const DEFAULT_COUNTERPARTIES = DEFAULT_COMMERCIAL_COUNTERPARTIES;

async function seedDefaultCounterparties(tenantId) {
  if (!tenantId) return [];

  // 1. Clean up legacy insurance parties if present for this tenant
  const legacyParties = await Party.find({
    tenant_id: tenantId,
    party_code: { $in: LEGACY_INSURANCE_PARTY_CODES }
  });

  if (legacyParties.length > 0) {
    const legacyIds = legacyParties.map(p => p._id);
    await PartyRole.deleteMany({ tenant_id: tenantId, party_id: { $in: legacyIds } });
    await Party.deleteMany({ tenant_id: tenantId, _id: { $in: legacyIds } });
  }

  // 2. Seed standard commercial general accounting counterparties
  const createdParties = [];

  for (const item of DEFAULT_COMMERCIAL_COUNTERPARTIES) {
    const { role_type, role_details, ...partyProps } = item;

    let party = await Party.findOne({
      tenant_id: tenantId,
      party_code: partyProps.party_code
    });

    if (!party) {
      party = await Party.create({
        ...partyProps,
        tenant_id: tenantId
      });
    } else {
      party.legal_name = partyProps.legal_name;
      party.trade_name = partyProps.trade_name;
      party.email = partyProps.email;
      party.phone = partyProps.phone;
      party.address = partyProps.address;
      party.status = partyProps.status;
      party.tax_id = partyProps.tax_id;
      await party.save();
    }

    if (role_type) {
      let role = await PartyRole.findOne({
        tenant_id: tenantId,
        party_id: party._id,
        role_type: role_type.toUpperCase()
      });

      if (!role) {
        role = await PartyRole.create({
          tenant_id: tenantId,
          party_id: party._id,
          role_type: role_type.toUpperCase(),
          status: 'ACTIVE',
          role_details: role_details || {}
        });
      } else {
        role.status = 'ACTIVE';
        role.role_details = { ...(role.role_details || {}), ...(role_details || {}) };
        await role.save();
      }
    }

    createdParties.push(party);
  }

  return createdParties;
}

module.exports = {
  LEGACY_INSURANCE_PARTY_CODES,
  DEFAULT_COMMERCIAL_COUNTERPARTIES,
  DEFAULT_COUNTERPARTIES,
  seedDefaultCounterparties
};
