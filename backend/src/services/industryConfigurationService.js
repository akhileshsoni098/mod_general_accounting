const {
  INDUSTRY_TAXONOMY,
  OPERATING_MODELS,
  VALID_INDUSTRY_CODES,
  VALID_OPERATING_MODEL_IDS,
  PROFILE_TO_INDUSTRY_MAP
} = require('../config/industryRegistry');
const {
  CORE_MODULE_KEYS,
  resolveModuleDependencies,
  validateModuleDependencies
} = require('../config/moduleRegistry');

/**
 * Industry Configuration Service
 * Provides dynamic feature recommendations, inventory tracking policies,
 * and operational capability mapping based on industry classification
 * and operating business models.
 */

function getIndustryDefinition(industryCode) {
  if (!industryCode) return INDUSTRY_TAXONOMY.OTHER_CUSTOM;
  const norm = String(industryCode).toUpperCase().trim();
  return INDUSTRY_TAXONOMY[norm] || INDUSTRY_TAXONOMY.OTHER_CUSTOM;
}

function getOperatingModelDefinition(modelId) {
  if (!modelId) return null;
  const norm = String(modelId).toUpperCase().trim();
  return OPERATING_MODELS[norm] || null;
}

/**
 * Computes recommended ERP configuration given an industry and set of operating models.
 */
function computeIndustryRecommendations({
  industryCode = 'GENERAL_TRADING',
  operatingModels = [],
  countryCode = 'IN',
  customOverrides = {}
} = {}) {
  const industry = getIndustryDefinition(industryCode);
  const models = Array.isArray(operatingModels) && operatingModels.length > 0
    ? operatingModels.map(m => String(m).toUpperCase().trim()).filter(m => VALID_OPERATING_MODEL_IDS.includes(m))
    : (industry.default_operating_models || ['BUY_AND_RESELL']);

  // Base inventory policy from industry
  const inventoryPolicy = {
    ...industry.default_inventory_policy,
    ...(customOverrides.inventory_policy || {})
  };

  // Aggregate operational capabilities from industry and operating models
  const operationalCapabilities = {
    ...industry.operational_capabilities
  };

  // Collect recommended modules
  const rawModules = new Set([
    ...CORE_MODULE_KEYS,
    ...(industry.recommended_modules || [])
  ]);

  for (const modelId of models) {
    const modelDef = OPERATING_MODELS[modelId];
    if (modelDef) {
      if (modelDef.recommended_modules) {
        modelDef.recommended_modules.forEach(mod => rawModules.add(mod));
      }
      if (modelDef.capabilities) {
        Object.assign(operationalCapabilities, modelDef.capabilities);
      }
    }
  }

  // Country tax module auto-activation
  const normCountry = (countryCode || 'IN').toUpperCase().trim();
  if (normCountry === 'IN') {
    rawModules.add('GST_TAX');
  }

  // If any manufacturing model is selected, ensure MANUFACTURING module is included
  const hasMfgModel = models.some(m => [
    'MAKE_TO_STOCK',
    'MAKE_TO_ORDER',
    'ASSEMBLE_TO_ORDER',
    'ENGINEER_TO_ORDER',
    'BATCH_PROCESS'
  ].includes(m));

  if (hasMfgModel) {
    rawModules.add('MANUFACTURING');
  }

  // If food service, ensure RESTAURANT module is included
  if (models.includes('FOOD_SERVICE')) {
    rawModules.add('RESTAURANT');
    rawModules.add('INVENTORY');
  }

  // If retail pos, ensure RETAIL_POS module is included
  if (models.includes('RETAIL_POS')) {
    rawModules.add('RETAIL_POS');
    rawModules.add('INVENTORY');
  }

  // Resolve module dependencies
  const resolvedModules = resolveModuleDependencies(Array.from(rawModules));

  // Determine godown requirements
  const requiresQuarantineGodown = Boolean(inventoryPolicy.enable_quarantine || inventoryPolicy.require_serial);

  return {
    industry_code: industry.code,
    industry_name: industry.name,
    category: industry.category,
    subcategories: industry.subcategories,
    selected_operating_models: models,
    recommended_modules: resolvedModules,
    inventory_policy: inventoryPolicy,
    operational_capabilities: operationalCapabilities,
    requires_quarantine_godown: requiresQuarantineGodown
  };
}

/**
 * Returns full taxonomy data for frontend setup wizard.
 */
function getTaxonomyCatalog() {
  return {
    industries: Object.values(INDUSTRY_TAXONOMY).map(ind => ({
      code: ind.code,
      name: ind.name,
      category: ind.category,
      description: ind.description,
      subcategories: ind.subcategories,
      default_operating_models: ind.default_operating_models,
      default_inventory_policy: ind.default_inventory_policy
    })),
    operating_models: Object.values(OPERATING_MODELS).map(om => ({
      id: om.id,
      name: om.name,
      description: om.description
    }))
  };
}

/**
 * Maps a legacy business_profile into its industry and operating model equivalent.
 */
function mapLegacyProfile(profileId) {
  const norm = profileId ? String(profileId).toUpperCase().trim() : 'GENERAL_RETAIL';
  const mapped = PROFILE_TO_INDUSTRY_MAP[norm] || PROFILE_TO_INDUSTRY_MAP.GENERAL_RETAIL;
  return {
    industry_code: mapped.industry,
    operating_models: mapped.models
  };
}

module.exports = {
  getIndustryDefinition,
  getOperatingModelDefinition,
  computeIndustryRecommendations,
  getTaxonomyCatalog,
  mapLegacyProfile,
  VALID_INDUSTRY_CODES,
  VALID_OPERATING_MODEL_IDS
};
