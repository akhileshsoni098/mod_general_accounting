const mongoose = require('mongoose');

function serializeValue(val) {
  if (val === null || val === undefined) return val;
  if (val instanceof mongoose.Types.Decimal128) {
    return val.toString();
  }
  if (val instanceof mongoose.Types.ObjectId) {
    return val.toString();
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }
  if (typeof val === 'object' && val !== null) {
    // If it has toObject (Mongoose doc), serialize that
    const obj = (typeof val.toObject === 'function') ? val.toObject() : val;
    // Check if it's an ObjectId or Buffer
    if (obj && obj._bsontype === 'ObjectID') {
      return obj.toString();
    }
    const res = {};
    for (const key of Object.keys(obj)) {
      res[key] = serializeValue(obj[key]);
    }
    return res;
  }
  return val;
}

function apiEnvelope(req, res, next) {
  res.success = (data, meta = {}, statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      data: serializeValue(data),
      meta: {
        timestamp: new Date().toISOString(),
        tenant_id: req.tenantId || null,
        user_id: req.userId || null,
        ...meta
      }
    });
  };

  res.error = (message, statusCode = 400, errors = null) => {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        details: errors
      },
      meta: {
        timestamp: new Date().toISOString(),
        tenant_id: req.tenantId || null,
        user_id: req.userId || null
      }
    });
  };

  next();
}

module.exports = {
  serializeValue,
  apiEnvelope
};
