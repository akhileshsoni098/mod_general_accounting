const mongoose = require('mongoose');

function sanitizeUri(uri) {
  if (!uri) return 'UNDEFINED';
  return uri.replace(/\/\/(.*):(.*)@/, '//$1:***@');
}

async function connectDB(retries = 3, delayMs = 2000) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veridex_finance';
  const sanitized = sanitizeUri(uri);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        autoIndex: true
      });
      console.log(`[Database] MongoDB connected successfully (${sanitized})`);
      return conn;
    } catch (err) {
      console.error(`[Database] MongoDB connection error (attempt ${attempt}/${retries}):`, err.message);
      if (attempt === retries) throw err;
      await new Promise(res => setTimeout(res, delayMs));
    }
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
