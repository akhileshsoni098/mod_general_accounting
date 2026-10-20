const mongoose = require('mongoose');

function sanitizeUri(uri) {
  if (!uri) return 'UNDEFINED';
  return uri.replace(/\/\/(.*):(.*)@/, '//$1:***@');
}

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veridex_finance';
  const sanitized = sanitizeUri(uri);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: true
    });
    console.log(`[Database] MongoDB connected successfully (${sanitized})`);
    return conn;
  } catch (err) {
    console.error(`[Database] MongoDB connection error (${sanitized}):`, err.message);
    throw err;
  }
}

async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('[Database] MongoDB connection closed.');
  } catch (err) {
    console.error('[Database] Disconnect error:', err.message);
  }
}

module.exports = { connectDB, disconnectDB, sanitizeUri };
