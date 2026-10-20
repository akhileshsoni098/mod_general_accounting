const { EventDefinition } = require('../models');
const { validateSchemaStructure, validateEventPayloadAgainstSchema } = require('../services/eventSchemaValidator');
const { seedDefaultEventDefinitions } = require('../utils/seedEventDefinitions');

// List event definitions for active tenant
async function getEventDefinitions(req, res) {
  try {
    const tenantId = req.tenantId;
    const { source_module, status, search } = req.query;

    // Ensure default event catalog is seeded for tenant if empty
    await seedDefaultEventDefinitions(tenantId);

    const query = { tenant_id: tenantId };
    if (source_module) query.source_module = source_module.toUpperCase();
    if (status) query.status = status.toUpperCase();
    if (search) {
      query.$or = [
        { event_code: { $regex: search, $options: 'i' } },
        { display_name: { $regex: search, $options: 'i' } }
      ];
    }

    const events = await EventDefinition.find(query).sort({ event_code: 1 });
    return res.success(events);
  } catch (err) {
    return res.error('Failed to list event definitions', 500, err.message);
  }
}

// Get single event definition by ID
async function getEventDefinitionById(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const event = await EventDefinition.findOne({ _id: id, tenant_id: tenantId });
    if (!event) {
      return res.error('Event definition not found', 404);
    }

    return res.success(event);
  } catch (err) {
    return res.error('Failed to get event definition', 500, err.message);
  }
}

// Create new Event Definition
async function createEventDefinition(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const {
      event_code,
      display_name,
      description,
      source_module,
      category,
      initial_version = '1.0.0',
      json_schema,
      sample_payload
    } = req.body;

    if (!event_code || !display_name || !json_schema) {
      return res.error('event_code, display_name, and json_schema are required', 400);
    }

    const cleanCode = event_code.toLowerCase().trim();

    // Check duplicate code within tenant
    const exists = await EventDefinition.findOne({ tenant_id: tenantId, event_code: cleanCode });
    if (exists) {
      return res.error(`Event code "${cleanCode}" already exists for this tenant`, 409);
    }

    // Validate Schema structure
    const schemaValidation = validateSchemaStructure(json_schema);
    if (!schemaValidation.valid) {
      return res.error(`Invalid JSON Schema: ${schemaValidation.errors.join('; ')}`, 400);
    }

    // Validate sample payload if provided
    if (sample_payload) {
      const payloadValidation = validateEventPayloadAgainstSchema(json_schema, sample_payload);
      if (!payloadValidation.valid) {
        return res.error(`Sample payload does not conform to schema: ${payloadValidation.errors.join('; ')}`, 400);
      }
    }

    const versionDoc = {
      version: initial_version,
      json_schema,
      sample_payload: sample_payload || null,
      description: 'Initial schema version',
      created_by_user_id: userId
    };

    const doc = await EventDefinition.create({
      tenant_id: tenantId,
      event_code: cleanCode,
      display_name: display_name.trim(),
      description: description || '',
      source_module: (source_module || 'BILLING').toUpperCase(),
      category: category || 'TRANSACTION',
      current_version: initial_version,
      versions: [versionDoc],
      status: 'ACTIVE'
    });

    return res.success(doc, { message: 'Event definition created successfully' }, 201);
  } catch (err) {
    return res.error('Failed to create event definition', 500, err.message);
  }
}

// Add a new schema version to an existing Event Definition
async function addSchemaVersion(req, res) {
  try {
    const tenantId = req.tenantId;
    const userId = req.user ? req.user._id : null;
    const { id } = req.params;
    const { version, json_schema, sample_payload, description } = req.body;

    if (!version || !json_schema) {
      return res.error('version and json_schema are required', 400);
    }

    const doc = await EventDefinition.findOne({ _id: id, tenant_id: tenantId });
    if (!doc) {
      return res.error('Event definition not found', 404);
    }

    // Check duplicate version
    const verExists = (doc.versions || []).some(v => v.version === version.trim());
    if (verExists) {
      return res.error(`Version "${version.trim()}" already exists for this event definition`, 409);
    }

    // Validate Schema structure
    const schemaValidation = validateSchemaStructure(json_schema);
    if (!schemaValidation.valid) {
      return res.error(`Invalid JSON Schema: ${schemaValidation.errors.join('; ')}`, 400);
    }

    // Validate sample payload if provided
    if (sample_payload) {
      const payloadValidation = validateEventPayloadAgainstSchema(json_schema, sample_payload);
      if (!payloadValidation.valid) {
        return res.error(`Sample payload does not conform to schema: ${payloadValidation.errors.join('; ')}`, 400);
      }
    }

    doc.versions.push({
      version: version.trim(),
      json_schema,
      sample_payload: sample_payload || null,
      description: description || '',
      created_by_user_id: userId
    });
    doc.current_version = version.trim();
    doc.row_version = (doc.row_version || 1) + 1;
    await doc.save();

    return res.success(doc, { message: `Version ${version.trim()} published to event contract` });
  } catch (err) {
    return res.error('Failed to add schema version', 500, err.message);
  }
}

// Validate a payload directly against an event schema
async function validatePayload(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { payload, version } = req.body;

    const doc = await EventDefinition.findOne({ _id: id, tenant_id: tenantId });
    if (!doc) {
      return res.error('Event definition not found', 404);
    }

    const targetVersion = version || doc.current_version;
    const versionRecord = (doc.versions || []).find(v => v.version === targetVersion);
    if (!versionRecord) {
      return res.error(`Version "${targetVersion}" not found`, 404);
    }

    const validation = validateEventPayloadAgainstSchema(versionRecord.json_schema, payload);
    return res.success({
      valid: validation.valid,
      errors: validation.errors,
      event_code: doc.event_code,
      version: targetVersion
    });
  } catch (err) {
    return res.error('Failed to validate payload', 500, err.message);
  }
}

// Update status (ACTIVE / INACTIVE / ARCHIVED)
async function updateStatus(req, res) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) {
      return res.error('Invalid status. Must be ACTIVE, INACTIVE, or ARCHIVED', 400);
    }

    const doc = await EventDefinition.findOne({ _id: id, tenant_id: tenantId });
    if (!doc) return res.error('Event definition not found', 404);

    doc.status = status;
    doc.row_version = (doc.row_version || 1) + 1;
    await doc.save();

    return res.success(doc, { message: `Status updated to ${status}` });
  } catch (err) {
    return res.error('Failed to update event status', 500, err.message);
  }
}

module.exports = {
  getEventDefinitions,
  getEventDefinitionById,
  createEventDefinition,
  addSchemaVersion,
  validatePayload,
  updateStatus
};
