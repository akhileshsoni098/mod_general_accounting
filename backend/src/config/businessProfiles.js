/**
 * Business Profiles Registry
 * Defines canonical profile identifiers, metadata, recommended modules,
 * and accounting presets for commercial SaaS ERP tenants.
 */

const BUSINESS_PROFILES = {
  GENERAL_RETAIL: {
    id: 'GENERAL_RETAIL',
    label: 'General Trading / Retail',
    description: 'Retail stores, clothing, electronics, and multi-category retail shops.',
    category: 'RETAIL',
    recommended_modules: ['GL', 'INVENTORY', 'POS', 'BILLING_AR', 'PURCHASES'],
    suggested_reports: ['DAILY_POS_REGISTER', 'STOCK_SUMMARY', 'SALES_MARGIN_ANALYSIS', 'GST_GSTR1'],
    features: {
      pos_checkout: true,
      barcode_scanning: true,
      price_lists: true,
      multi_godown: true,
      batch_tracking: false,
      serial_tracking: false,
      recipe_bom: false
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  HARDWARE: {
    id: 'HARDWARE',
    label: 'Hardware & Building Materials',
    description: 'Hardware, sanitary, electrical, timber, paints, and construction materials trading.',
    category: 'RETAIL_WHOLESALE',
    recommended_modules: ['GL', 'INVENTORY', 'POS', 'PURCHASES', 'BILLING_AR'],
    suggested_reports: ['STOCK_VALUATION', 'REORDER_STATUS', 'CREDIT_AGING', 'SUPPLIER_PAYABLES'],
    features: {
      pos_checkout: true,
      barcode_scanning: true,
      alternate_uom: true,
      weight_fractional_qty: true,
      multi_godown: true,
      batch_tracking: false,
      serial_tracking: false,
      recipe_bom: false
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  GROCERY: {
    id: 'GROCERY',
    label: 'Grocery & Kirana Store',
    description: 'Supermarkets, FMCG, daily provisions, and grocery retail with fast counter sales.',
    category: 'RETAIL',
    recommended_modules: ['GL', 'INVENTORY', 'POS', 'PURCHASES'],
    suggested_reports: ['EXPIRY_AGING', 'FAST_MOVING_ITEMS', 'DAILY_CASH_SUMMARY', 'MARGIN_ANALYSIS'],
    features: {
      pos_checkout: true,
      barcode_scanning: true,
      weighing_scale_integration: true,
      batch_tracking: true,
      expiry_date_tracking: true,
      multi_godown: false,
      recipe_bom: false
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  WHOLESALE_DISTRIBUTION: {
    id: 'WHOLESALE_DISTRIBUTION',
    label: 'Wholesale & Distribution',
    description: 'B2B trading, regional distribution, bulk supply, and multi-tier pricing.',
    category: 'DISTRIBUTION',
    recommended_modules: ['GL', 'INVENTORY', 'SALES_ORDERS', 'PURCHASES', 'BILLING_AR', 'LOGISTICS'],
    suggested_reports: ['OUTSTANDING_RECEIVABLES', 'SALES_REP_PERFORMANCE', 'STOCK_MOVEMENT', 'BATCH_DISPATCH'],
    features: {
      pos_checkout: false,
      credit_limits: true,
      multi_tier_pricing: true,
      multi_godown: true,
      batch_tracking: true,
      dispatch_notes: true,
      recipe_bom: false
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  RESTAURANT_CAFE: {
    id: 'RESTAURANT_CAFE',
    label: 'Restaurant & Cafe',
    description: 'Dine-in, cafes, bakeries with table management, KOTs, and ingredient consumption.',
    category: 'HOSPITALITY_FOOD',
    recommended_modules: ['GL', 'RESTAURANT_POS', 'INVENTORY', 'RECIPE_BOM'],
    suggested_reports: ['KITCHEN_ORDER_METRICS', 'FOOD_COST_ANALYSIS', 'DAILY_COVERS_SALES', 'WASTE_LOG'],
    features: {
      table_management: true,
      kot_printing: true,
      menu_modifiers: true,
      recipe_bom: true,
      ingredient_auto_deduction: true,
      wastage_tracking: true
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  PIZZA_QSR: {
    id: 'PIZZA_QSR',
    label: 'Pizza Shop & Quick-Service Restaurant',
    description: 'Quick counter ordering, pizza crust/size/topping customization, takeaway, and delivery.',
    category: 'HOSPITALITY_FOOD',
    recommended_modules: ['GL', 'RESTAURANT_POS', 'INVENTORY', 'RECIPE_BOM', 'DELIVERY'],
    suggested_reports: ['SPEED_OF_SERVICE', 'TOPPING_CONSUMPTION', 'DELIVERY_DISPATCH', 'HOURLY_SALES'],
    features: {
      fast_counter_pos: true,
      size_crust_matrix: true,
      multi_toppings_pricing: true,
      recipe_bom: true,
      ingredient_auto_deduction: true,
      rider_dispatch: true
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  HOTEL_HOSPITALITY: {
    id: 'HOTEL_HOSPITALITY',
    label: 'Hotel & Hospitality',
    description: 'Hotels, resorts, guest houses with room reservations, guest folios, and amenities.',
    category: 'HOSPITALITY_LODGING',
    recommended_modules: ['GL', 'HOTEL_PMS', 'ROOM_BOOKING', 'BILLING_AR', 'RESTAURANT_POS'],
    suggested_reports: ['ROOM_OCCUPANCY_RATE', 'REVPAR', 'GUEST_FOLIO_REGISTER', 'NIGHT_AUDIT'],
    features: {
      room_reservations: true,
      guest_folio: true,
      check_in_out: true,
      housekeeping_status: true,
      night_audit: true,
      pos_cross_billing: true
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  MANUFACTURING: {
    id: 'MANUFACTURING',
    label: 'Manufacturing & Assembly',
    description: 'Production factories, job-work, raw material consumption, and finished goods assembly.',
    category: 'MANUFACTURING',
    recommended_modules: ['GL', 'INVENTORY', 'PRODUCTION_BOM', 'PURCHASES', 'BILLING_AR'],
    suggested_reports: ['WORK_IN_PROGRESS', 'PRODUCTION_COST_VARIANCE', 'RAW_MATERIAL_REQUIREMENT', 'SCRAP_AUDIT'],
    features: {
      multi_level_bom: true,
      production_orders: true,
      work_in_progress: true,
      overhead_cost_allocation: true,
      raw_material_consumption: true,
      byproduct_scrap: true
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  PROFESSIONAL_SERVICES: {
    id: 'PROFESSIONAL_SERVICES',
    label: 'Professional & Service Business',
    description: 'Consultancies, IT services, agencies, legal, and accounting firms.',
    category: 'SERVICES',
    recommended_modules: ['GL', 'BILLING_AR', 'TIME_EXPENSE', 'EXPENSE_MANAGEMENT'],
    suggested_reports: ['CLIENT_PROFITABILITY', 'UNBILLED_SERVICES', 'AGED_RECEIVABLES', 'EXPENSE_SUMMARY'],
    features: {
      service_invoicing: true,
      time_tracking: false,
      client_retainers: true,
      expense_claims: true,
      inventory_tracking: false
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  },
  CUSTOM_OTHER: {
    id: 'CUSTOM_OTHER',
    label: 'Other / Custom Business',
    description: 'Generic commercial enterprise with customizable chart of accounts and modules.',
    category: 'GENERAL',
    recommended_modules: ['GL', 'BILLING_AR', 'PURCHASES'],
    suggested_reports: ['TRIAL_BALANCE', 'PROFIT_AND_LOSS', 'BALANCE_SHEET', 'GENERAL_LEDGER'],
    features: {
      pos_checkout: false,
      inventory_tracking: false,
      custom_vouchers: true
    },
    default_currency: 'INR',
    default_country: 'IN',
    default_financial_year_start_month: 4
  }
};

const VALID_PROFILE_IDS = Object.keys(BUSINESS_PROFILES);

function isValidProfile(profileId) {
  return typeof profileId === 'string' && VALID_PROFILE_IDS.includes(profileId.toUpperCase().trim());
}

function getProfile(profileId) {
  if (!isValidProfile(profileId)) return null;
  return BUSINESS_PROFILES[profileId.toUpperCase().trim()];
}

function getAllProfiles() {
  return Object.values(BUSINESS_PROFILES);
}

module.exports = {
  BUSINESS_PROFILES,
  VALID_PROFILE_IDS,
  isValidProfile,
  getProfile,
  getAllProfiles
};
