const { DimensionDefinition } = require('../models');

const DEFAULT_DIMENSIONS = [
  {
    dimension_code: 'CARRIER_ID',
    display_name: 'Underwriting Carrier',
    dimension_type: 'COUNTERPARTY',
    target_role: 'CARRIER',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Statutory underwriting paper carrier responsible for insurance risk'
  },
  {
    dimension_code: 'CARRIER_NAME',
    display_name: 'Carrier Name',
    dimension_type: 'TEXT',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Human-readable name of the Underwriting Carrier'
  },
  {
    dimension_code: 'BROKER_ID',
    display_name: 'Retail Broker / Producer',
    dimension_type: 'COUNTERPARTY',
    target_role: 'BROKER',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Retail agent or producer who originated the policy deal'
  },
  {
    dimension_code: 'BROKER_NAME',
    display_name: 'Broker Name',
    dimension_type: 'TEXT',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Human-readable name of the Retail Broker Agency'
  },
  {
    dimension_code: 'MGA_ID',
    display_name: 'Managing General Agent',
    dimension_type: 'COUNTERPARTY',
    target_role: 'MGA',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Managing General Agent holding delegated underwriting & claims authority'
  },
  {
    dimension_code: 'COST_CENTER',
    display_name: 'Cost Center / Department',
    dimension_type: 'ORGANIZATION_UNIT',
    allowed_values: ['CC-UNDERWRITING', 'CC-CLAIMS', 'CC-FINANCE', 'CC-OPS'],
    default_value: 'CC-OPS',
    is_system: false,
    is_required: false,
    status: 'ACTIVE',
    description: 'Internal cost center or operational department tag'
  },
  {
    dimension_code: 'COMPANY_CODE',
    display_name: 'Company / Legal Entity',
    dimension_type: 'TEXT',
    default_value: 'COMP-001',
    is_system: false,
    is_required: false,
    status: 'ACTIVE',
    description: 'Operating corporate legal entity or subsidiary'
  },
  {
    dimension_code: 'POLICY_ID',
    display_name: 'Policy Reference',
    dimension_type: 'POLICY',
    is_system: true,
    is_required: true,
    status: 'ACTIVE',
    description: 'Root insurance policy identifier for subledger binding'
  },
  {
    dimension_code: 'LINE_OF_BUSINESS',
    display_name: 'Line of Business (LOB)',
    dimension_type: 'LOOKUP_LIST',
    allowed_values: ['COMMERCIAL_AUTO', 'GENERAL_LIABILITY', 'CARGO', 'WORKERS_COMP', 'PROPERTY'],
    default_value: 'COMMERCIAL_AUTO',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Insurance underwriting class / line of business'
  },
  {
    dimension_code: 'JURISDICTION',
    display_name: 'State / Jurisdiction',
    dimension_type: 'TEXT',
    default_value: 'TX',
    is_system: true,
    is_required: false,
    status: 'ACTIVE',
    description: 'Statutory regulatory jurisdiction / governing US state'
  }
];

async function seedTenantDimensions(tenantId) {
  if (!tenantId) return [];

  const existingCount = await DimensionDefinition.countDocuments({ tenant_id: tenantId });
  if (existingCount > 0) {
    return await DimensionDefinition.find({ tenant_id: tenantId }).sort({ is_system: -1, dimension_code: 1 });
  }

  const docs = DEFAULT_DIMENSIONS.map(d => ({
    ...d,
    tenant_id: tenantId
  }));

  return await DimensionDefinition.insertMany(docs);
}

module.exports = {
  DEFAULT_DIMENSIONS,
  seedTenantDimensions
};
