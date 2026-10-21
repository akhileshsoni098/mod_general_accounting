/**
 * Central Business Module Registry
 * Defines canonical module identifiers, metadata, categories, dependencies,
 * default entitlements, and profile templates for commercial SaaS ERP companies.
 *
 * Core Principle: Simple by Default, Configurable by Business.
 * - Core modules are always enabled and cannot be disabled.
 * - Optional modules are toggled per company according to business needs.
 * - Disabling a module hides UI navigation and blocks new transactions non-destructively.
 */

const MODULE_DEFINITIONS = {
  // ==========================================
  // Core Modules (Always Active for every company)
  // ==========================================
  GL: {
    key: 'GL',
    name: 'General Ledger (GL)',
    description: 'Chart of Accounts, Double-Entry Journal Engine, Day Book, Trial Balance, Profit & Loss, Balance Sheet.',
    category: 'CORE',
    is_core: true,
    dependencies: [],
    default_enabled: true
  },
  BANKING_CASH: {
    key: 'BANKING_CASH',
    name: 'Banking & Cash Operations',
    description: 'Bank and cash accounts, contra voucher transfers, and bank transaction statements.',
    category: 'CORE',
    is_core: true,
    dependencies: ['GL'],
    default_enabled: true
  },
  PARTIES: {
    key: 'PARTIES',
    name: 'Parties & Ledgers',
    description: 'Customer, vendor, main hub, and franchise sub-ledgers and balances.',
    category: 'CORE',
    is_core: true,
    dependencies: ['GL'],
    default_enabled: true
  },
  REPORTS: {
    key: 'REPORTS',
    name: 'Financial Statements & Reports',
    description: 'Trial Balance, Profit & Loss, Balance Sheet, Ledger Statements, and Day Book.',
    category: 'CORE',
    is_core: true,
    dependencies: ['GL'],
    default_enabled: true
  },

  // ==========================================
  // Commercial & Operations Modules (Optional)
  // ==========================================
  INVENTORY: {
    key: 'INVENTORY',
    name: 'Inventory & Stock Management',
    description: 'Stock items, units of measure, godowns/warehouses, stock movement journal, and stock valuation.',
    category: 'OPERATIONS',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },
  COMMERCIAL_BILLING: {
    key: 'COMMERCIAL_BILLING',
    name: 'Commercial Invoicing & Trade',
    description: 'Sales invoices, purchase bills, debit/credit notes, and commercial posting rules.',
    category: 'OPERATIONS',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },
  GST_TAX: {
    key: 'GST_TAX',
    name: 'GST & Tax Accounting',
    description: 'GST tax slabs (CGST, SGST, IGST), HSN/SAC codes, and GSTR reporting summaries.',
    category: 'OPERATIONS',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },

  // ==========================================
  // Industry-Specific Workspaces (Optional)
  // ==========================================
  RETAIL_POS: {
    key: 'RETAIL_POS',
    name: 'Retail Point of Sale (POS)',
    description: 'Cash counter checkout, barcode scanning, shift management, and instant bill settlement.',
    category: 'INDUSTRY',
    is_core: false,
    dependencies: ['INVENTORY'],
    default_enabled: false
  },
  RESTAURANT: {
    key: 'RESTAURANT',
    name: 'Restaurant & Hospitality Food',
    description: 'Table management, Kitchen Order Tickets (KOT), recipe bills of material, and ingredient consumption.',
    category: 'INDUSTRY',
    is_core: false,
    dependencies: ['INVENTORY'],
    default_enabled: false
  },
  HOTEL_PMS: {
    key: 'HOTEL_PMS',
    name: 'Hotel Property Management (PMS)',
    description: 'Room types, room reservations, guest folios, check-in/out, and night audit.',
    category: 'INDUSTRY',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },
  MANUFACTURING: {
    key: 'MANUFACTURING',
    name: 'Manufacturing & Assembly',
    description: 'Multi-level Bill of Materials (BOM), work orders, raw material consumption, and finished goods assembly.',
    category: 'INDUSTRY',
    is_core: false,
    dependencies: ['INVENTORY'],
    default_enabled: false
  },

  // ==========================================
  // Advanced Financial & ERP Capabilities (Optional)
  // ==========================================
  FRANCHISE_COMMISSIONS: {
    key: 'FRANCHISE_COMMISSIONS',
    name: 'Franchise & Commission Sharing',
    description: 'Franchise store to main hub accounting, revenue share percentages, commission receivable/payable posting, and split settlements.',
    category: 'ADVANCED',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },
  RULES_ENGINE: {
    key: 'RULES_ENGINE',
    name: 'Configurable Journal Entry Rules Engine',
    description: 'Dynamic event posting rules, formula engine, event simulator, rule test cases, and configuration bundles.',
    category: 'ADVANCED',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },
  FINANCE_CLOSE: {
    key: 'FINANCE_CLOSE',
    name: 'Finance Close & Period Lock',
    description: 'Fiscal period hard locks, month-end closing runbooks, subledger reconciliation, and certified statements.',
    category: 'ADVANCED',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  },
  DIMENSIONS: {
    key: 'DIMENSIONS',
    name: 'Accounting Dimensions & Cost Centers',
    description: 'Multi-dimensional accounting tags, branches, cost centers, and departmental P&L reporting.',
    category: 'ADVANCED',
    is_core: false,
    dependencies: ['GL'],
    default_enabled: false
  }
};

const MODULE_CATEGORIES = {
  CORE: { key: 'CORE', label: 'Core Accounting', order: 1, description: 'Fundamental general accounting ledgers, banking, and financial statements' },
  OPERATIONS: { key: 'OPERATIONS', label: 'Commercial Operations', order: 2, description: 'Inventory stock, trade invoicing, and GST tax management' },
  INDUSTRY: { key: 'INDUSTRY', label: 'Industry Workspaces', order: 3, description: 'Dedicated vertical operational workspaces for retail, hospitality, and manufacturing' },
  ADVANCED: { key: 'ADVANCED', label: 'Advanced Capabilities', order: 4, description: 'Franchise sharing, rules engine, period closing, and multi-dimensional analysis' }
};

const CORE_MODULE_KEYS = Object.values(MODULE_DEFINITIONS)
  .filter(m => m.is_core)
  .map(m => m.key);

const ALL_MODULE_KEYS = Object.keys(MODULE_DEFINITIONS);

const OPTIONAL_MODULE_KEYS = ALL_MODULE_KEYS.filter(k => !CORE_MODULE_KEYS.includes(k));

/**
 * Industry setup templates for quick one-click company configuration
 */
const INDUSTRY_TEMPLATES = {
  GENERAL_ACCOUNTING: {
    id: 'GENERAL_ACCOUNTING',
    name: 'General Accounting Only (Simple Default)',
    description: 'Pure general ledger, chart of accounts, party ledgers, banking/contra vouchers, and financial reports.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS']
  },
  RETAIL_TRADING: {
    id: 'RETAIL_TRADING',
    name: 'Retail & Trading Store',
    description: 'General accounting plus inventory stock tracking, commercial trade invoicing, GST, and Retail POS checkout.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS']
  },
  RESTAURANT_CAFE: {
    id: 'RESTAURANT_CAFE',
    name: 'Restaurant & Cafe',
    description: 'General accounting plus inventory, GST, commercial billing, tables, KOTs, and menu recipes.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RESTAURANT']
  },
  HOTEL_HOSPITALITY: {
    id: 'HOTEL_HOSPITALITY',
    name: 'Hotel & Hospitality Resort',
    description: 'General accounting plus commercial billing, GST, hotel room PMS, guest folios, and dining.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'COMMERCIAL_BILLING', 'GST_TAX', 'HOTEL_PMS', 'RESTAURANT']
  },
  MANUFACTURING: {
    id: 'MANUFACTURING',
    name: 'Manufacturing & Assembly',
    description: 'General accounting plus inventory, commercial trade, multi-level BOMs, and work order assembly.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING']
  },
  FRANCHISE_BUSINESS: {
    id: 'FRANCHISE_BUSINESS',
    name: 'Franchise & Commission Sharing Store',
    description: 'General accounting, commercial trade, POS, and automated franchise commission sharing with Main Hub.',
    modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS', 'FRANCHISE_COMMISSIONS']
  }
};

/**
 * Map business profile IDs from businessProfiles.js to default enabled modules
 */
const PROFILE_MODULE_MAP = {
  PROFESSIONAL_SERVICES: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'COMMERCIAL_BILLING'],
  CUSTOM_OTHER: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS'],
  GENERAL_RETAIL: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
  HARDWARE: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
  GROCERY: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
  WHOLESALE_DISTRIBUTION: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX'],
  RESTAURANT_CAFE: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RESTAURANT'],
  PIZZA_QSR: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RESTAURANT', 'RETAIL_POS'],
  HOTEL_HOSPITALITY: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'COMMERCIAL_BILLING', 'GST_TAX', 'HOTEL_PMS', 'RESTAURANT'],
  MANUFACTURING: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING']
};

function isValidModuleKey(key) {
  return typeof key === 'string' && ALL_MODULE_KEYS.includes(key.toUpperCase().trim());
}

function isCoreModule(key) {
  if (!key) return false;
  return CORE_MODULE_KEYS.includes(key.toUpperCase().trim());
}

function getModuleDefinition(key) {
  if (!isValidModuleKey(key)) return null;
  return MODULE_DEFINITIONS[key.toUpperCase().trim()];
}

/**
 * Resolve default modules for a given business profile
 */
function getDefaultModulesForProfile(profileId) {
  const norm = profileId ? profileId.toUpperCase().trim() : 'CUSTOM_OTHER';
  const list = PROFILE_MODULE_MAP[norm] || PROFILE_MODULE_MAP.CUSTOM_OTHER;
  // Ensure core modules are always present
  return [...new Set([...CORE_MODULE_KEYS, ...list])];
}

/**
 * Validates dependencies for a list of enabled module keys.
 * Returns { valid: boolean, missingDependencies: { [module]: string[] } }
 */
function validateModuleDependencies(enabledList = []) {
  const normList = new Set(enabledList.map(k => String(k).toUpperCase().trim()));
  const missingDependencies = {};

  for (const modKey of normList) {
    const def = MODULE_DEFINITIONS[modKey];
    if (def && Array.isArray(def.dependencies)) {
      const missing = def.dependencies.filter(dep => !normList.has(dep));
      if (missing.length > 0) {
        missingDependencies[modKey] = missing;
      }
    }
  }

  const valid = Object.keys(missingDependencies).length === 0;
  return { valid, missingDependencies };
}

/**
 * Given a target set of modules to enable, automatically resolves all required dependencies.
 */
function resolveModuleDependencies(modulesToEnable = [], currentEnabled = []) {
  const resultSet = new Set([
    ...CORE_MODULE_KEYS,
    ...currentEnabled.map(k => String(k).toUpperCase().trim()),
    ...modulesToEnable.map(k => String(k).toUpperCase().trim())
  ]);

  let added = true;
  while (added) {
    added = false;
    for (const modKey of Array.from(resultSet)) {
      const def = MODULE_DEFINITIONS[modKey];
      if (def && Array.isArray(def.dependencies)) {
        for (const dep of def.dependencies) {
          if (!resultSet.has(dep)) {
            resultSet.add(dep);
            added = true;
          }
        }
      }
    }
  }

  return Array.from(resultSet);
}

/**
 * Generates an enriched module catalog indicating whether each module is currently enabled.
 */
function getModuleCatalog(enabledList = []) {
  const normEnabled = new Set(
    (enabledList && enabledList.length > 0 ? enabledList : CORE_MODULE_KEYS)
      .map(k => String(k).toUpperCase().trim())
  );

  return Object.values(MODULE_DEFINITIONS).map(m => ({
    key: m.key,
    name: m.name,
    description: m.description,
    category: m.category,
    category_label: MODULE_CATEGORIES[m.category]?.label || m.category,
    is_core: m.is_core,
    is_enabled: m.is_core || normEnabled.has(m.key),
    dependencies: m.dependencies,
    default_enabled: m.default_enabled
  }));
}

module.exports = {
  MODULE_DEFINITIONS,
  MODULE_CATEGORIES,
  CORE_MODULE_KEYS,
  ALL_MODULE_KEYS,
  OPTIONAL_MODULE_KEYS,
  INDUSTRY_TEMPLATES,
  PROFILE_MODULE_MAP,
  isValidModuleKey,
  isCoreModule,
  getModuleDefinition,
  getDefaultModulesForProfile,
  validateModuleDependencies,
  resolveModuleDependencies,
  getModuleCatalog
};
