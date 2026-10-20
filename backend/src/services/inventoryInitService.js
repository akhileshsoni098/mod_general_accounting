const {
  UnitOfMeasurement,
  StockGroup,
  Godown
} = require('../models');

const STANDARD_UOMS = [
  { unit_code: 'PCS', unit_name: 'Pieces', unit_type: 'COUNT', decimal_places: 0, is_system_standard: true },
  { unit_code: 'BOX', unit_name: 'Boxes', unit_type: 'PACKAGING', decimal_places: 0, is_system_standard: true },
  { unit_code: 'DOZEN', unit_name: 'Dozens', unit_type: 'COUNT', decimal_places: 0, is_system_standard: true },
  { unit_code: 'KG', unit_name: 'Kilograms', unit_type: 'MASS', decimal_places: 3, is_system_standard: true },
  { unit_code: 'GRAM', unit_name: 'Grams', unit_type: 'MASS', decimal_places: 2, is_system_standard: true },
  { unit_code: 'LTR', unit_name: 'Litres', unit_type: 'VOLUME', decimal_places: 3, is_system_standard: true },
  { unit_code: 'ML', unit_name: 'Millilitres', unit_type: 'VOLUME', decimal_places: 2, is_system_standard: true },
  { unit_code: 'MTR', unit_name: 'Metres', unit_type: 'LENGTH', decimal_places: 3, is_system_standard: true }
];

/**
 * Idempotently provisions initial inventory masters (Godown, UOMs, StockGroup) for a company.
 *
 * @param {string|ObjectId} tenantId
 * @param {string|ObjectId} companyId
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function initializeCompanyInventoryDefaults(tenantId, companyId, options = {}) {
  const session = options.session || null;

  // 1. Provision Default Godown
  let defaultGodown = await Godown.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    is_default: true
  }).session(session);

  if (!defaultGodown) {
    defaultGodown = await Godown.findOneAndUpdate(
      { tenant_id: tenantId, company_id: companyId, godown_code: 'MAIN' },
      {
        godown_name: 'Main Godown',
        is_default: true,
        status: 'ACTIVE',
        address: {
          street: 'Main Facility',
          city: '',
          state: '',
          country: '',
          postal_code: ''
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
  }

  // 2. Provision Standard UOMs
  const seededUoms = [];
  for (const u of STANDARD_UOMS) {
    const doc = await UnitOfMeasurement.findOneAndUpdate(
      { tenant_id: tenantId, company_id: companyId, unit_code: u.unit_code },
      {
        unit_name: u.unit_name,
        unit_type: u.unit_type,
        decimal_places: u.decimal_places,
        is_system_standard: u.is_system_standard,
        status: 'ACTIVE'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    seededUoms.push(doc);
  }

  // 3. Provision Default Primary Stock Group
  const defaultGroup = await StockGroup.findOneAndUpdate(
    { tenant_id: tenantId, company_id: companyId, group_code: 'PRIMARY' },
    {
      group_name: 'Primary Group',
      description: 'Root stock group for uncategorized trading goods and inventory',
      parent_group_id: null,
      status: 'ACTIVE'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );

  return {
    defaultGodown,
    defaultGroup,
    uomCount: seededUoms.length
  };
}

module.exports = {
  initializeCompanyInventoryDefaults,
  STANDARD_UOMS
};
