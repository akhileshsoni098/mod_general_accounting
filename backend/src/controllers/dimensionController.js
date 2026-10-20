const { DimensionDefinition, Party, PartyRole } = require('../models');
const { seedTenantDimensions } = require('../utils/seedDimensions');

/**
 * List all Dimension Definitions for the tenant (seeds defaults if none exist)
 */
async function listDimensions(req, res) {
  try {
    const tenantId = req.tenantId;
    const { status, dimension_type } = req.query;

    let dimensions = await seedTenantDimensions(tenantId);

    const query = { tenant_id: tenantId };
    if (status) query.status = status.toUpperCase();
    if (dimension_type) query.dimension_type = dimension_type.toUpperCase();

    dimensions = await DimensionDefinition.find(query).sort({ is_system: -1, dimension_code: 1 }).lean();

    return res.success(dimensions);
  } catch (err) {
    return res.error('Failed to list dimensions', 500, err.message);
  }
}

/**
 * Get dynamic dimension runtime choices (Counterparties by role, LOBs, Cost Centers, etc.)
 */
async function getDimensionContext(req, res) {
  try {
    const tenantId = req.tenantId;

    // Ensure default dimensions exist
    const dimensions = await seedTenantDimensions(tenantId);

    // Fetch active counterparties and their roles (auto-seed if empty)
    let parties = await Party.find({ tenant_id: tenantId, status: 'ACTIVE' }).lean();
    if (parties.length === 0) {
      const { seedDefaultCounterparties } = require('../utils/seedDefaultCounterparties');
      await seedDefaultCounterparties(tenantId);
      parties = await Party.find({ tenant_id: tenantId, status: 'ACTIVE' }).lean();
    }
    const partyIds = parties.map(p => p._id);
    const roles = await PartyRole.find({ tenant_id: tenantId, party_id: { $in: partyIds }, status: 'ACTIVE' }).lean();

    const rolesByParty = {};
    for (const r of roles) {
      const pid = r.party_id.toString();
      if (!rolesByParty[pid]) rolesByParty[pid] = [];
      rolesByParty[pid].push(r.role_type);
    }

    const carriers = [];
    const brokers = [];
    const mgas = [];
    const reinsurers = [];

    for (const p of parties) {
      const pRoles = rolesByParty[p._id.toString()] || [];
      const item = {
        _id: p._id,
        party_code: p.party_code,
        legal_name: p.legal_name,
        trade_name: p.trade_name || p.legal_name,
        roles: pRoles
      };

      if (pRoles.includes('CARRIER')) carriers.push(item);
      if (pRoles.includes('BROKER') && !p.party_code.startsWith('POLICYHOLDER')) brokers.push(item);
      if (pRoles.includes('MGA')) mgas.push(item);
      if (pRoles.includes('REINSURER')) reinsurers.push(item);
    }

    return res.success({
      dimensions,
      counterparties: {
        carriers,
        brokers,
        mgas,
        reinsurers,
        all: parties.map(p => ({
          _id: p._id,
          party_code: p.party_code,
          legal_name: p.legal_name,
          trade_name: p.trade_name || p.legal_name,
          roles: rolesByParty[p._id.toString()] || []
        }))
      }
    });
  } catch (err) {
    return res.error('Failed to get dimension context', 500, err.message);
  }
}

/**
 * Create a new custom Dimension Definition
 */
async function createDimension(req, res) {
  try {
    const tenantId = req.tenantId;
    const {
      dimension_code,
      display_name,
      dimension_type = 'CUSTOM',
      target_role = null,
      is_required = false,
      allowed_values = [],
      default_value = null,
      description = ''
    } = req.body;

    if (!dimension_code || !display_name) {
      return res.error('dimension_code and display_name are required', 400);
    }

    const cleanCode = dimension_code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    const exists = await DimensionDefinition.findOne({ tenant_id: tenantId, dimension_code: cleanCode });
    if (exists) {
      return res.error(`Dimension with code "${cleanCode}" already exists`, 409);
    }

    const doc = await DimensionDefinition.create({
      tenant_id: tenantId,
      dimension_code: cleanCode,
      display_name: display_name.trim(),
      dimension_type: dimension_type.toUpperCase(),
      target_role: target_role ? target_role.trim().toUpperCase() : null,
      is_required: Boolean(is_required),
      is_system: false,
      status: 'ACTIVE',
      allowed_values: Array.isArray(allowed_values) ? allowed_values.map(v => String(v).trim()).filter(Boolean) : [],
      default_value: default_value ? String(default_value).trim() : null,
      description: description || ''
    });

    return res.success(doc, { message: `Dimension "${cleanCode}" created successfully` }, 201);
  } catch (err) {
    return res.error('Failed to create dimension', 500, err.message);
  }
}

/**
 * Update an existing Dimension Definition
 */
async function updateDimension(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const {
      display_name,
      status,
      allowed_values,
      default_value,
      description,
      is_required
    } = req.body;

    const doc = await DimensionDefinition.findOne({ _id: id, tenant_id: tenantId });
    if (!doc) {
      return res.error('Dimension not found', 404);
    }

    if (display_name !== undefined) doc.display_name = display_name.trim();
    if (status !== undefined) doc.status = status.toUpperCase();
    if (is_required !== undefined) doc.is_required = Boolean(is_required);
    if (default_value !== undefined) doc.default_value = default_value;
    if (description !== undefined) doc.description = description;
    if (Array.isArray(allowed_values)) {
      doc.allowed_values = allowed_values.map(v => String(v).trim()).filter(Boolean);
    }

    await doc.save();
    return res.success(doc, { message: 'Dimension updated successfully' });
  } catch (err) {
    return res.error('Failed to update dimension', 500, err.message);
  }
}

/**
 * Delete or Inactivate a Dimension Definition
 */
async function deleteDimension(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const doc = await DimensionDefinition.findOne({ _id: id, tenant_id: tenantId });
    if (!doc) {
      return res.error('Dimension not found', 404);
    }

    if (doc.is_system) {
      // System dimensions cannot be deleted; toggle to INACTIVE instead
      doc.status = 'INACTIVE';
      await doc.save();
      return res.success(doc, { message: 'System dimension deactivated' });
    }

    await DimensionDefinition.deleteOne({ _id: id, tenant_id: tenantId });
    return res.success({ deleted: true }, { message: `Dimension "${doc.dimension_code}" deleted successfully` });
  } catch (err) {
    return res.error('Failed to delete dimension', 500, err.message);
  }
}

module.exports = {
  listDimensions,
  getDimensionContext,
  createDimension,
  updateDimension,
  deleteDimension
};
