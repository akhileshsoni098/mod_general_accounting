const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { EventDefinition } = require('../models');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Validates a JSON Schema draft-07 structure itself
 */
function validateSchemaStructure(schema) {
  if (!schema || typeof schema !== 'object') {
    return { valid: false, errors: ['Schema must be an object'] };
  }
  try {
    const isSchemaValid = ajv.validateSchema(schema);
    if (!isSchemaValid) {
      return {
        valid: false,
        errors: (ajv.errors || []).map(e => `${e.instancePath || 'root'}: ${e.message}`)
      };
    }
    return { valid: true, errors: [] };
  } catch (err) {
    return { valid: false, errors: [err.message] };
  }
}

/**
 * Validates a payload against a JSON schema
 */
function validateEventPayloadAgainstSchema(schema, payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  try {
    const validate = ajv.compile(schema);
    const valid = validate(payload);
    if (!valid) {
      const errors = (validate.errors || []).map(e => {
        const field = e.instancePath ? e.instancePath.replace(/^\//, '') : e.params.missingProperty || 'root';
        return `Field "${field}": ${e.message}`;
      });
      return { valid: false, errors };
    }
    return { valid: true, errors: [] };
  } catch (err) {
    return { valid: false, errors: [`Schema compilation error: ${err.message}`] };
  }
}

/**
 * Validates an event payload against a tenant's stored EventDefinition
 */
async function validateEventPayload(tenantId, eventCode, schemaVersion, payload) {
  const definition = await EventDefinition.findOne({
    tenant_id: tenantId,
    event_code: eventCode.toLowerCase().trim()
  });

  if (!definition) {
    return {
      valid: false,
      errors: [`Event definition "${eventCode}" not found for active tenant`],
      definition: null
    };
  }

  if (definition.status !== 'ACTIVE') {
    return {
      valid: false,
      errors: [`Event definition "${eventCode}" is currently ${definition.status}`],
      definition
    };
  }

  const ver = schemaVersion || definition.current_version;
  const versionRecord = (definition.versions || []).find(v => v.version === ver);

  if (!versionRecord) {
    return {
      valid: false,
      errors: [`Schema version "${ver}" does not exist for event "${eventCode}"`],
      definition
    };
  }

  const result = validateEventPayloadAgainstSchema(versionRecord.json_schema, payload);
  return {
    valid: result.valid,
    errors: result.errors,
    definition,
    schemaVersion: ver
  };
}

module.exports = {
  validateSchemaStructure,
  validateEventPayloadAgainstSchema,
  validateEventPayload
};
