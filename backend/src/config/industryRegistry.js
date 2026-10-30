/**
 * Industry & Operating Model Master Registry
 * Defines canonical industry classifications, subcategories, operating models,
 * default inventory policies, recommended modules, and operational capabilities
 * for the unified ERP platform.
 */

const INDUSTRY_TAXONOMY = {
  FOOD_BEVERAGE: {
    code: 'FOOD_BEVERAGE',
    name: 'Food & Beverage',
    category: 'PROCESS_AND_HOSPITALITY',
    description: 'Bakeries, dairy, breweries, confectionery, packaged foods, and beverages.',
    subcategories: [
      'Commercial Bakery & Confectionery',
      'Dairy & Cheese Processing',
      'Breweries, Wineries & Distilleries',
      'Snack Foods & Packaged Goods',
      'Meat, Poultry & Seafood Processing',
      'Beverages, Juices & Soft Drinks',
      'Spices, Grain Milling & Condiments'
    ],
    default_operating_models: ['BATCH_PROCESS', 'WHOLESALE_DISTRIBUTION'],
    default_inventory_policy: {
      tracking_mode: 'PERISHABLE',
      require_batch: true,
      require_serial: false,
      require_expiry: true,
      enable_quarantine: true,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      pos_checkout: true,
      recipe_bom: true,
      batch_lot_tracking: true,
      expiry_date_tracking: true,
      spoilage_waste_tracking: true,
      multi_godown: true,
      yield_loss_tracking: true,
      quality_inspection: true
    }
  },

  HARDWARE_METAL: {
    code: 'HARDWARE_METAL',
    name: 'Hardware & Metal Fabrication',
    category: 'DISCRETE_MANUFACTURING_TRADING',
    description: 'Fasteners, sheet metal, structural steel, tools, plumbing hardware, and CNC machining.',
    subcategories: [
      'Industrial Fasteners & Hardware',
      'Sheet Metal Fabrication & Stamping',
      'Structural Steel & Rebar Products',
      'Pipes, Valves & Plumbing Fittings',
      'Hand & Power Tools Distribution',
      'Precision CNC Machined Parts',
      'Welding & Fabrication Equipment'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION', 'MAKE_TO_STOCK'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX'],
    operational_capabilities: {
      pos_checkout: true,
      alternate_uom: true,
      multi_tier_pricing: true,
      multi_godown: true,
      weight_fractional_qty: true,
      production_bom: true,
      work_orders: true,
      reorder_alerts: true
    }
  },

  ELECTRONICS_ELECTRICAL: {
    code: 'ELECTRONICS_ELECTRICAL',
    name: 'Electronics & Electrical Products',
    category: 'ASSEMBLY_AND_TECHNOLOGY',
    description: 'Consumer electronics, PCBA assembly, electrical equipment, cables, and IoT devices.',
    subcategories: [
      'Consumer Electronics & Gadgets',
      'Printed Circuit Board Assembly (PCBA)',
      'Electrical Cables, Wires & Switchgear',
      'Sensors, IoT & Embedded Systems',
      'Power Supplies, Inverters & Batteries',
      'Lighting & LED Fixtures',
      'Computer Hardware & Peripherals'
    ],
    default_operating_models: ['ASSEMBLE_TO_ORDER', 'WHOLESALE_DISTRIBUTION'],
    default_inventory_policy: {
      tracking_mode: 'SERIAL',
      require_batch: true,
      require_serial: true,
      require_expiry: false,
      enable_quarantine: true,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      serial_number_tracking: true,
      warranty_tracking: true,
      component_kitting_bom: true,
      quarantine_inspection: true,
      multi_godown: true,
      barcodes: true,
      modular_assembly: true
    }
  },

  FURNITURE_WOOD: {
    code: 'FURNITURE_WOOD',
    name: 'Furniture & Wood Products',
    category: 'DISCRETE_MANUFACTURING_TRADING',
    description: 'Residential & office furniture, cabinetry, architectural millwork, and timber trading.',
    subcategories: [
      'Home & Residential Furniture',
      'Commercial & Office Workstations',
      'Modular Kitchens & Cabinetry',
      'Timber, Plywood & Veneer Trading',
      'Architectural Millwork & Doors',
      'Outdoor & Patio Furniture'
    ],
    default_operating_models: ['MAKE_TO_ORDER', 'BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      custom_dimension_bom: true,
      job_work_outsourcing: true,
      mto_sales_linkage: true,
      multi_godown: true,
      finish_variant_tracking: true
    }
  },

  TEXTILES_APPAREL: {
    code: 'TEXTILES_APPAREL',
    name: 'Textiles, Apparel & Footwear',
    category: 'CONSUMER_GOODS',
    description: 'Garments, woven fabrics, fashion accessories, leather products, and footwear.',
    subcategories: [
      'Ready-to-Wear Apparel & Fashion',
      'Woven, Knitted & Technical Textiles',
      'Footwear & Athletic Shoes',
      'Leather Goods & Accessories',
      'Home Textiles & Furnishings',
      'Uniforms & Workwear'
    ],
    default_operating_models: ['MAKE_TO_STOCK', 'WHOLESALE_DISTRIBUTION', 'RETAIL_POS'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: true,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
    operational_capabilities: {
      size_color_matrix: true,
      barcode_scanning: true,
      dye_lot_tracking: true,
      pos_checkout: true,
      multi_godown: true
    }
  },

  MACHINERY_EQUIPMENT: {
    code: 'MACHINERY_EQUIPMENT',
    name: 'Machinery & Industrial Equipment',
    category: 'CAPITAL_GOODS',
    description: 'Pumps, compressors, packaging machinery, CNC machines, and agricultural implements.',
    subcategories: [
      'Pumps, Valves & Fluid Power',
      'Packaging & Material Handling Machinery',
      'Agricultural & Farm Equipment',
      'Industrial Compressors & Generators',
      'Construction & Earthmoving Equipment',
      'Machine Tools & Metalworking Machinery'
    ],
    default_operating_models: ['ENGINEER_TO_ORDER', 'MAKE_TO_ORDER'],
    default_inventory_policy: {
      tracking_mode: 'SERIAL',
      require_batch: false,
      require_serial: true,
      require_expiry: false,
      enable_quarantine: true,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING', 'FIXED_ASSETS'],
    operational_capabilities: {
      serial_number_tracking: true,
      multi_level_bom: true,
      milestone_billing: true,
      after_sales_service: true,
      warranty_tracking: true
    }
  },

  PLASTICS_PACKAGING: {
    code: 'PLASTICS_PACKAGING',
    name: 'Plastics, Rubber & Packaging',
    category: 'PROCESS_AND_MANUFACTURING',
    description: 'Injection molding, corrugated boxes, flexible packaging films, and rubber seals.',
    subcategories: [
      'Plastic Injection & Blow Molding',
      'Corrugated Boxes & Cardboard Packaging',
      'Flexible Films & Pouches',
      'Rubber Seals, Gaskets & Extrusions',
      'Rigid Plastic Containers & Bottles'
    ],
    default_operating_models: ['MAKE_TO_STOCK', 'MAKE_TO_ORDER'],
    default_inventory_policy: {
      tracking_mode: 'BATCH_LOT',
      require_batch: true,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      batch_lot_tracking: true,
      resin_formula_bom: true,
      regrind_rework_tracking: true,
      scrap_reconciliation: true,
      multi_godown: true
    }
  },

  AUTOMOTIVE_PARTS: {
    code: 'AUTOMOTIVE_PARTS',
    name: 'Automotive & Spare Parts',
    category: 'DISCRETE_AND_DISTRIBUTION',
    description: 'Automotive OEM components, aftermarket parts, tyres, batteries, and accessories.',
    subcategories: [
      'Engine & Transmission Components',
      'Brake, Suspension & Steering Parts',
      'Automotive Electricals & Batteries',
      'Tyres, Wheels & Tubes',
      'Automotive Filters & Fluids',
      'Body Panels & Accessories'
    ],
    default_operating_models: ['WHOLESALE_DISTRIBUTION', 'BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX'],
    operational_capabilities: {
      cross_reference_part_numbers: true,
      multi_tier_pricing: true,
      bin_location_management: true,
      multi_godown: true,
      barcode_scanning: true
    }
  },

  PHARMACEUTICALS_HEALTHCARE: {
    code: 'PHARMACEUTICALS_HEALTHCARE',
    name: 'Pharmaceuticals & Healthcare Products',
    category: 'LIFE_SCIENCES',
    description: 'Prescription drugs, generics, medical devices, surgical disposables, and supplements.',
    subcategories: [
      'Pharmaceutical Formulations (Tablets/Syrups)',
      'Active Pharmaceutical Ingredients (API)',
      'Medical Devices & Diagnostic Kits',
      'Surgical Disposables & Hospital Supplies',
      'Nutraceuticals & Dietary Supplements',
      'Veterinary Pharmaceuticals'
    ],
    default_operating_models: ['BATCH_PROCESS', 'WHOLESALE_DISTRIBUTION'],
    default_inventory_policy: {
      tracking_mode: 'PERISHABLE',
      require_batch: true,
      require_serial: true,
      require_expiry: true,
      enable_quarantine: true,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      strict_batch_lot_tracking: true,
      fefo_picking: true,
      expiry_date_enforcement: true,
      quarantine_sample_inspection: true,
      regulatory_audit_trail: true
    }
  },

  CONSTRUCTION_MATERIALS: {
    code: 'CONSTRUCTION_MATERIALS',
    name: 'Construction & Building Materials',
    category: 'BULK_AND_COMMODITY',
    description: 'Cement, ready-mix concrete, ceramic tiles, aggregate, lumber, and paints.',
    subcategories: [
      'Cement, Clinker & Ready-Mix Concrete',
      'Ceramic Tiles, Marble & Granite',
      'Sand, Gravel & Aggregates',
      'Glass, Windows & Facades',
      'Drywall, Insulation & Roofing Materials'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX'],
    operational_capabilities: {
      bulk_tonnage_uom: true,
      freight_landed_cost: true,
      job_site_delivery_notes: true,
      multi_godown: true
    }
  },

  AGRICULTURE_PRODUCE: {
    code: 'AGRICULTURE_PRODUCE',
    name: 'Agriculture, Farming & Fresh Produce',
    category: 'PRIMARY_AND_AGRI',
    description: 'Grains, pulses, fresh fruits & vegetables, seeds, fertilizers, and animal feed.',
    subcategories: [
      'Grains, Cereals & Oilseeds',
      'Fresh Fruits & Vegetables Wholesale',
      'Seeds, Fertilizers & Crop Protection',
      'Animal Feed & Poultry Nutrition',
      'Commercial Greenhouses & Floriculture'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION'],
    default_inventory_policy: {
      tracking_mode: 'PERISHABLE',
      require_batch: true,
      require_serial: false,
      require_expiry: true,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX'],
    operational_capabilities: {
      catch_weight_pricing: true,
      perishables_spoilage_tracking: true,
      mandi_commission_accounting: true,
      lot_grading: true
    }
  },

  CHEMICALS_COATINGS: {
    code: 'CHEMICALS_COATINGS',
    name: 'Chemicals, Paints & Specialty Coatings',
    category: 'PROCESS_MANUFACTURING',
    description: 'Industrial chemicals, paints, dyes, industrial adhesives, and water treatment compounds.',
    subcategories: [
      'Architectural & Industrial Paints',
      'Industrial Adhesives & Sealants',
      'Specialty Solvents & Lubricants',
      'Dyes, Pigments & Colorants',
      'Water Treatment & Cleaning Chemicals'
    ],
    default_operating_models: ['BATCH_PROCESS', 'MAKE_TO_STOCK'],
    default_inventory_policy: {
      tracking_mode: 'BATCH_LOT',
      require_batch: true,
      require_serial: false,
      require_expiry: true,
      enable_quarantine: true,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      hazardous_material_flag: true,
      formula_density_conversions: true,
      batch_lot_tracking: true,
      quality_inspection: true
    }
  },

  PAPER_PRINTING: {
    code: 'PAPER_PRINTING',
    name: 'Paper, Printing & Publishing',
    category: 'MANUFACTURING_AND_SERVICES',
    description: 'Commercial offset printing, packaging cartons, paper reels, and stationery.',
    subcategories: [
      'Commercial Offset & Digital Printing',
      'Paper Reels & Board Wholesale',
      'Packaging Labels & Tags',
      'Books, Magazines & Periodicals',
      'Stationery & Office Paper Products'
    ],
    default_operating_models: ['MAKE_TO_ORDER', 'BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      gsm_sheet_unit_conversion: true,
      print_job_costing: true,
      trim_scrap_recovery: true,
      mto_production: true
    }
  },

  JEWELRY_LUXURY: {
    code: 'JEWELRY_LUXURY',
    name: 'Jewelry & Luxury Goods',
    category: 'HIGH_VALUE_RETAIL_TRADING',
    description: 'Gold, diamond and silver jewelry, luxury watches, and gemstone trading.',
    subcategories: [
      'Gold & Precious Metal Jewelry',
      'Diamond & Certified Gemstones',
      'Silver Ornaments & Tableware',
      'Luxury Watches & Timepieces',
      'Custom Designer Studio Jewelry'
    ],
    default_operating_models: ['RETAIL_POS', 'MAKE_TO_ORDER', 'BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'SERIAL',
      require_batch: false,
      require_serial: true,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
    operational_capabilities: {
      karat_purity_pricing: true,
      making_charge_breakup: true,
      tag_serial_tracking: true,
      hallmark_tracking: true,
      pos_counter_billing: true
    }
  },

  TOYS_SPORTING_GOODS: {
    code: 'TOYS_SPORTING_GOODS',
    name: 'Toys, Games & Sporting Goods',
    category: 'CONSUMER_GOODS',
    description: 'Toys, board games, athletic gear, sports apparel, and fitness equipment.',
    subcategories: [
      'Children Toys & Play Equipment',
      'Board Games, Puzzles & Hobbies',
      'Fitness & Gym Equipment',
      'Athletic Sports Gear & Balls',
      'Outdoor Recreation & Camping'
    ],
    default_operating_models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION', 'RETAIL_POS'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
    operational_capabilities: {
      pos_checkout: true,
      barcode_scanning: true,
      variant_management: true,
      multi_godown: true
    }
  },

  CONSUMER_PACKAGED_GOODS: {
    code: 'CONSUMER_PACKAGED_GOODS',
    name: 'Consumer Packaged Goods (CPG)',
    category: 'CONSUMER_GOODS',
    description: 'Cosmetics, personal care, soaps, detergents, cleaning products, and home essentials.',
    subcategories: [
      'Cosmetics & Skin Care',
      'Personal Hygiene & Oral Care',
      'Soaps, Detergents & Household Cleaners',
      'Fragrances & Deodorants',
      'Baby Care Essentials'
    ],
    default_operating_models: ['MAKE_TO_STOCK', 'WHOLESALE_DISTRIBUTION'],
    default_inventory_policy: {
      tracking_mode: 'BATCH_LOT',
      require_batch: true,
      require_serial: false,
      require_expiry: true,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'MANUFACTURING'],
    operational_capabilities: {
      batch_lot_tracking: true,
      expiry_date_tracking: true,
      fefo_dispatch: true,
      multi_tier_pricing: true
    }
  },

  GENERAL_TRADING: {
    code: 'GENERAL_TRADING',
    name: 'General Trading & Distribution',
    category: 'COMMERCIAL_TRADE',
    description: 'Multi-category B2B wholesale trading, import-export, and regional distribution.',
    subcategories: [
      'Import-Export Merchant Trading',
      'Regional FMCG Distribution',
      'Industrial Consumables Trading',
      'Multi-Category Commodity Brokerage',
      'Institutional & Corporate Supplies'
    ],
    default_operating_models: ['WHOLESALE_DISTRIBUTION', 'BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX'],
    operational_capabilities: {
      multi_godown: true,
      multi_tier_pricing: true,
      credit_limit_enforcement: true,
      dispatch_tracking: true,
      trade_discount_matrix: true
    }
  },

  RETAIL_SUPERMARKET: {
    code: 'RETAIL_SUPERMARKET',
    name: 'Retail Stores & Supermarkets',
    category: 'RETAIL_POINT_OF_SALE',
    description: 'Kirana stores, supermarkets, convenience stores, and multi-lane retail marts.',
    subcategories: [
      'Supermarkets & Grocery Marts',
      'Kirana & Neighborhood Provision Stores',
      'Convenience Stores & Mini-Marts',
      'Multi-Brand Departmental Stores',
      'Specialty Gourmet Food Stores'
    ],
    default_operating_models: ['RETAIL_POS', 'BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RETAIL_POS'],
    operational_capabilities: {
      fast_counter_pos: true,
      barcode_scanning: true,
      cash_drawer_reconciliation: true,
      daily_pos_summary: true,
      weighing_scale_integration: true
    }
  },

  HOSPITALITY_RESTAURANT: {
    code: 'HOSPITALITY_RESTAURANT',
    name: 'Hospitality & Food Service',
    category: 'FOOD_AND_LODGING',
    description: 'Fine dine, quick service (QSR), pizza parlors, bakeries, cafes, and hotels.',
    subcategories: [
      'Full-Service Dine-in Restaurant',
      'Quick Service Restaurant (QSR) & Pizza',
      'Cafe, Bakery & Dessert Bar',
      'Cloud Kitchen & Delivery-Only Brand',
      'Hotel Dining & Room Service'
    ],
    default_operating_models: ['FOOD_SERVICE', 'RETAIL_POS'],
    default_inventory_policy: {
      tracking_mode: 'PERISHABLE',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'FIFO'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING', 'GST_TAX', 'RESTAURANT', 'RETAIL_POS'],
    operational_capabilities: {
      table_management: true,
      kot_kitchen_tickets: true,
      recipe_bom: true,
      ingredient_auto_deduction: true,
      spoilage_waste_tracking: true,
      takeaway_delivery_dispatch: true
    }
  },

  OTHER_CUSTOM: {
    code: 'OTHER_CUSTOM',
    name: 'Custom / Other Goods Enterprise',
    category: 'GENERAL',
    description: 'Configurable enterprise setup with user-selected operational modules and inventory policies.',
    subcategories: [
      'General Merchandise & Miscellaneous',
      'Specialty Artisanal Products',
      'Custom Contract Enterprise',
      'Mixed Goods & Services Business'
    ],
    default_operating_models: ['BUY_AND_RESELL'],
    default_inventory_policy: {
      tracking_mode: 'STANDARD',
      require_batch: false,
      require_serial: false,
      require_expiry: false,
      enable_quarantine: false,
      allow_negative_stock: false,
      default_costing_method: 'MOVING_AVERAGE'
    },
    recommended_modules: ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS', 'INVENTORY', 'COMMERCIAL_BILLING'],
    operational_capabilities: {
      custom_vouchers: true,
      flexible_chart_of_accounts: true,
      configurable_rules: true
    }
  }
};

const OPERATING_MODELS = {
  BUY_AND_RESELL: {
    id: 'BUY_AND_RESELL',
    name: 'Buy & Resell / Trading',
    description: 'Standard inventory procurement, stocking, and merchant sales without assembly or transformation.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING'],
    capabilities: {
      direct_sales: true,
      stock_valuation: true
    }
  },
  WHOLESALE_DISTRIBUTION: {
    id: 'WHOLESALE_DISTRIBUTION',
    name: 'Wholesale & Bulk Distribution',
    description: 'B2B sales with multi-tier pricing, customer credit limits, bulk packing, and regional dispatch.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'PRICING_LANDED_COST'],
    capabilities: {
      multi_tier_pricing: true,
      credit_limits: true,
      dispatch_notes: true,
      multi_godown: true
    }
  },
  RETAIL_POS: {
    id: 'RETAIL_POS',
    name: 'Retail Store & Counter POS',
    description: 'Instant customer checkout, barcode scanning, register shift opening/closing, and immediate settlement.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'RETAIL_POS'],
    capabilities: {
      pos_checkout: true,
      barcode_scanning: true,
      cash_management: true
    }
  },
  MAKE_TO_STOCK: {
    id: 'MAKE_TO_STOCK',
    name: 'Make to Stock (MTS) - Discrete',
    description: 'Standard product manufacturing based on demand forecasts, finished goods stocking, and discrete work orders.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'MANUFACTURING'],
    capabilities: {
      multi_level_bom: true,
      work_orders: true,
      raw_material_issue: true,
      finished_goods_receipt: true
    }
  },
  MAKE_TO_ORDER: {
    id: 'MAKE_TO_ORDER',
    name: 'Make to Order (MTO) - Custom Fabrication',
    description: 'Production initiated directly upon receipt of customer sales order with custom configurations.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'MANUFACTURING'],
    capabilities: {
      sales_order_linked_work_order: true,
      custom_specifications: true,
      raw_material_reservation: true
    }
  },
  ASSEMBLE_TO_ORDER: {
    id: 'ASSEMBLE_TO_ORDER',
    name: 'Assemble to Order (ATO) - Modular Assembly',
    description: 'Pre-manufactured subassemblies and components assembled rapidly upon order placement.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'MANUFACTURING'],
    capabilities: {
      modular_kitting_bom: true,
      serial_number_tracking: true,
      subassembly_management: true
    }
  },
  ENGINEER_TO_ORDER: {
    id: 'ENGINEER_TO_ORDER',
    name: 'Engineer to Order (ETO) - Project Engineering',
    description: 'Highly customized engineering projects with unique design, milestone billing, and project tracking.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'MANUFACTURING', 'DIMENSIONS'],
    capabilities: {
      project_cost_accounting: true,
      milestone_billing: true,
      custom_engineering_bom: true
    }
  },
  BATCH_PROCESS: {
    id: 'BATCH_PROCESS',
    name: 'Batch / Process Manufacturing',
    description: 'Formula and recipe-based manufacturing with batch yields, scrap/loss tracking, and lot expiry control.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'MANUFACTURING'],
    capabilities: {
      recipe_formula_bom: true,
      batch_lot_tracking: true,
      yield_loss_calculation: true,
      expiry_enforcement: true
    }
  },
  FOOD_SERVICE: {
    id: 'FOOD_SERVICE',
    name: 'Food Service & Restaurant Operations',
    description: 'Food preparation, dine-in tables, KOT tickets, recipe ingredient deduction, and rapid waste logging.',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'RESTAURANT', 'RETAIL_POS'],
    capabilities: {
      table_management: true,
      kot_printing: true,
      recipe_ingredient_auto_deduct: true,
      spoilage_waste_logging: true
    }
  },
  HYBRID: {
    id: 'HYBRID',
    name: 'Multi-Model Hybrid Business',
    description: 'Enterprises combining multiple operational channels (e.g., manufacturing factory + wholesale + retail counter).',
    recommended_modules: ['INVENTORY', 'COMMERCIAL_BILLING', 'MANUFACTURING', 'RETAIL_POS', 'PRICING_LANDED_COST'],
    capabilities: {
      multi_channel_operations: true,
      multi_godown: true,
      cross_channel_reporting: true
    }
  }
};

const VALID_INDUSTRY_CODES = Object.keys(INDUSTRY_TAXONOMY);
const VALID_OPERATING_MODEL_IDS = Object.keys(OPERATING_MODELS);

// Legacy business_profile bridge mapping
const PROFILE_TO_INDUSTRY_MAP = {
  GENERAL_RETAIL: { industry: 'RETAIL_SUPERMARKET', models: ['RETAIL_POS', 'BUY_AND_RESELL'] },
  HARDWARE: { industry: 'HARDWARE_METAL', models: ['BUY_AND_RESELL', 'WHOLESALE_DISTRIBUTION', 'RETAIL_POS'] },
  GROCERY: { industry: 'RETAIL_SUPERMARKET', models: ['RETAIL_POS', 'BUY_AND_RESELL'] },
  WHOLESALE_DISTRIBUTION: { industry: 'GENERAL_TRADING', models: ['WHOLESALE_DISTRIBUTION'] },
  RESTAURANT_CAFE: { industry: 'HOSPITALITY_RESTAURANT', models: ['FOOD_SERVICE'] },
  PIZZA_QSR: { industry: 'HOSPITALITY_RESTAURANT', models: ['FOOD_SERVICE', 'RETAIL_POS'] },
  HOTEL_HOSPITALITY: { industry: 'HOSPITALITY_RESTAURANT', models: ['FOOD_SERVICE'] },
  MANUFACTURING: { industry: 'HARDWARE_METAL', models: ['MAKE_TO_STOCK'] },
  PROFESSIONAL_SERVICES: { industry: 'OTHER_CUSTOM', models: ['BUY_AND_RESELL'] },
  CUSTOM_OTHER: { industry: 'OTHER_CUSTOM', models: ['BUY_AND_RESELL'] }
};

module.exports = {
  INDUSTRY_TAXONOMY,
  OPERATING_MODELS,
  VALID_INDUSTRY_CODES,
  VALID_OPERATING_MODEL_IDS,
  PROFILE_TO_INDUSTRY_MAP
};
