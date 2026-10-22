const { Party, PartyRole } = require('../models');
const { seedDefaultCounterparties, LEGACY_INSURANCE_PARTY_CODES } = require('../utils/seedDefaultCounterparties');

/**
 * List all Counterparties for active tenant with populated roles
 */
async function listParties(req, res) {
  try {
    const tenantId = req.tenantId;
    const { role_type, status, search } = req.query;

    const query = { tenant_id: tenantId };
    if (status) query.status = status.toUpperCase();
    if (search) {
      query.$or = [
        { legal_name: { $regex: search, $options: 'i' } },
        { party_code: { $regex: search, $options: 'i' } },
        { trade_name: { $regex: search, $options: 'i' } }
      ];
    }

    let parties = await Party.find(query).sort({ legal_name: 1 }).lean();

    // Auto-seed default commercial counterparties if none exist, or if legacy insurance counterparties are detected
    const hasLegacy = parties.some(p => LEGACY_INSURANCE_PARTY_CODES.includes(p.party_code));
    if ((parties.length === 0 && !search && !status) || hasLegacy) {
      await seedDefaultCounterparties(tenantId);
      parties = await Party.find(query).sort({ legal_name: 1 }).lean();
    }

    // Fetch roles for all matching parties
    const partyIds = parties.map(p => p._id);
    const roleQuery = { tenant_id: tenantId, party_id: { $in: partyIds } };
    if (role_type) {
      roleQuery.role_type = role_type.toUpperCase();
    }

    const allRoles = await PartyRole.find(roleQuery).lean();

    // Group roles by party_id
    const rolesByParty = {};
    for (const r of allRoles) {
      const pid = r.party_id.toString();
      if (!rolesByParty[pid]) rolesByParty[pid] = [];
      rolesByParty[pid].push(r);
    }

    // Attach roles to parties; filter if role_type query was specified
    let result = parties.map(p => ({
      ...p,
      roles: rolesByParty[p._id.toString()] || []
    }));

    if (role_type) {
      result = result.filter(p => p.roles.length > 0);
    }

    return res.success(result);
  } catch (err) {
    return res.error('Failed to list counterparties', 500, err.message);
  }
}

/**
 * Create a new Party and optional initial PartyRole
 */
async function createParty(req, res) {
  try {
    const tenantId = req.tenantId;
    const {
      party_code,
      legal_name,
      trade_name = '',
      party_type = 'ORGANIZATION',
      tax_id = '',
      email = '',
      phone = '',
      address = {},
      initial_role_type = null,
      role_details = {}
    } = req.body;

    if (!party_code || !legal_name) {
      return res.error('party_code and legal_name are required', 400);
    }

    const cleanCode = party_code.toUpperCase().trim();

    // Prevent duplicate party_code within tenant
    const existing = await Party.findOne({ tenant_id: tenantId, party_code: cleanCode });
    if (existing) {
      return res.error(`Counterparty with code "${cleanCode}" already exists in this tenant`, 409);
    }

    const party = await Party.create({
      tenant_id: tenantId,
      party_code: cleanCode,
      legal_name: legal_name.trim(),
      trade_name: trade_name.trim(),
      party_type,
      tax_id: tax_id.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: {
        street1: address.street1 || '',
        street2: address.street2 || '',
        city: address.city || '',
        state: address.state || '',
        postal_code: address.postal_code || '',
        country: address.country || 'USA'
      },
      status: 'ACTIVE'
    });

    let createdRole = null;
    if (initial_role_type) {
      const validRoles = [
        'CUSTOMER',
        'SUPPLIER',
        'VENDOR',
        'DEBTOR',
        'CREDITOR',
        'GUEST',
        'EMPLOYEE',
        'PARTNER',
        'AGENT',
        'CARRIER',
        'MGA',
        'BROKER',
        'POLICYHOLDER',
        'PRODUCER',
        'REINSURER',
        'REGULATOR'
      ];
      const normRole = initial_role_type.toUpperCase().trim();
      if (validRoles.includes(normRole)) {
        createdRole = await PartyRole.create({
          tenant_id: tenantId,
          party_id: party._id,
          role_type: normRole,
          role_details: role_details || {},
          status: 'ACTIVE'
        });
      }
    }

    return res.success({
      ...party.toObject(),
      roles: createdRole ? [createdRole] : []
    }, { message: `Counterparty "${party.legal_name}" created successfully` }, 201);
  } catch (err) {
    return res.error('Failed to create counterparty', 500, err.message);
  }
}

/**
 * Get Party Details with all associated roles
 */
async function getPartyById(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const party = await Party.findOne({ _id: id, tenant_id: tenantId }).lean();
    if (!party) {
      return res.error('Counterparty not found', 404);
    }

    const roles = await PartyRole.find({ tenant_id: tenantId, party_id: party._id }).lean();

    return res.success({
      ...party,
      roles
    });
  } catch (err) {
    return res.error('Failed to fetch counterparty', 500, err.message);
  }
}

/**
 * Update Counterparty details
 */
async function updateParty(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const updates = req.body;

    const party = await Party.findOne({ _id: id, tenant_id: tenantId });
    if (!party) {
      return res.error('Counterparty not found', 404);
    }

    if (updates.legal_name) party.legal_name = updates.legal_name.trim();
    if (updates.trade_name !== undefined) party.trade_name = updates.trade_name.trim();
    if (updates.tax_id !== undefined) party.tax_id = updates.tax_id.trim();
    if (updates.email !== undefined) party.email = updates.email.trim().toLowerCase();
    if (updates.phone !== undefined) party.phone = updates.phone.trim();
    if (updates.status) party.status = updates.status.toUpperCase();
    if (updates.address) {
      party.address = {
        ...party.address,
        ...updates.address
      };
    }
    party.row_version = (party.row_version || 1) + 1;
    await party.save();

    const roles = await PartyRole.find({ tenant_id: tenantId, party_id: party._id }).lean();

    return res.success({
      ...party.toObject(),
      roles
    }, { message: 'Counterparty updated successfully' });
  } catch (err) {
    return res.error('Failed to update counterparty', 500, err.message);
  }
}

/**
 * Add or update PartyRole on an existing Counterparty
 */
async function addPartyRole(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { role_type, role_details = {}, effective_from, effective_to } = req.body;

    if (!role_type) {
      return res.error('role_type is required', 400);
    }

    const party = await Party.findOne({ _id: id, tenant_id: tenantId });
    if (!party) {
      return res.error('Counterparty not found', 404);
    }

    const normRole = role_type.toUpperCase().trim();
    const roleDoc = await PartyRole.findOneAndUpdate(
      { tenant_id: tenantId, party_id: party._id, role_type: normRole },
      {
        status: 'ACTIVE',
        role_details,
        ...(effective_from ? { effective_from: new Date(effective_from) } : {}),
        ...(effective_to ? { effective_to: new Date(effective_to) } : {}),
        $inc: { row_version: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.success(roleDoc, { message: `Assigned role ${normRole} to ${party.legal_name}` });
  } catch (err) {
    return res.error('Failed to assign party role', 500, err.message);
  }
}

/**
 * Seed standard default commercial counterparties (Apex Wholesale, Metro Hypermarket, Horizon Tech, Bharat Logistics, Global Goods, Premier Packaging, Franchise Store, Corporate Hub)
 */
async function seedParties(req, res) {
  try {
    const tenantId = req.tenantId;
    const seeded = await seedDefaultCounterparties(tenantId);
    return res.success(seeded, { message: `Seeded ${seeded.length} default commercial counterparties successfully` });
  } catch (err) {
    return res.error('Failed to seed default counterparties', 500, err.message);
  }
}

module.exports = {
  listParties,
  createParty,
  getPartyById,
  updateParty,
  addPartyRole,
  seedParties
};
