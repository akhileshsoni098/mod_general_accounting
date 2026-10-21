const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { apiEnvelope } = require('./middleware/apiEnvelope');
const { seedRbacCatalog } = require('./utils/seedRbac');
const { seedPersonas } = require('./utils/seedPersonas');

const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const companyRoutes = require('./routes/companyRoutes');

const glRoutes = require('./routes/glRoutes');
const financeCloseRoutes = require('./routes/financeCloseRoutes');
const counterpartyRoutes = require('./routes/counterpartyRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const commercialRoutes = require('./routes/commercialRoutes');
const platformAdminRoutes = require('./routes/platformAdminRoutes');
const retailPosRoutes = require('./routes/retailPosRoutes');
const restaurantRoutes = require('./routes/restaurantRoutes');
const hotelPmsRoutes = require('./routes/hotelPmsRoutes');
const manufacturingRoutes = require('./routes/manufacturingRoutes');
const importExportRoutes = require('./routes/importExportRoutes');

const eventDefinitionRoutes = require('./routes/eventDefinitionRoutes');
const postingRuleRoutes = require('./routes/postingRuleRoutes');
const ruleTestCaseRoutes = require('./routes/ruleTestCaseRoutes');
const configBundleRoutes = require('./routes/configBundleRoutes');
const eventPipelineRoutes = require('./routes/eventPipelineRoutes');
const dimensionRoutes = require('./routes/dimensionRoutes');
const commissionsRoutes = require('./routes/commissionsRoutes');
const { createCorsOptions } = require('./config/corsConfig');

const app = express();
const PORT = process.env.PORT || 5050;

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS Configuration (Strict origin enforcement in production)
app.use(cors(createCorsOptions()));
app.use(express.json());
app.use(apiEnvelope);

const { getDatabaseTopologyInfo } = require('./utils/transactionHelper');

// Health check
app.get('/health', (req, res) => {
  const topologyInfo = getDatabaseTopologyInfo();
  return res.success({
    status: 'HEALTHY',
    service: 'veridex-finance-saas-backend',
    version: '4.6.0',
    timestamp: new Date().toISOString(),
    database: {
      status: topologyInfo.status,
      topology: topologyInfo.topology,
      transactions_supported: topologyInfo.transactionsSupported
    }
  });
});

// Readiness probe
app.get('/ready', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const topologyInfo = getDatabaseTopologyInfo();
  if (!isDbConnected) {
    return res.status(503).json({ status: 'NOT_READY', database: 'DISCONNECTED' });
  }
  return res.success({
    status: 'READY',
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/platform', platformAdminRoutes);
app.use('/api/v1/tenant', tenantRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/counterparties', counterpartyRoutes);
app.use('/api/v1/gl', glRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/commercial', commercialRoutes);
app.use('/api/v1/retail-pos', retailPosRoutes);
app.use('/api/v1/restaurant', restaurantRoutes);
app.use('/api/v1/hotel', hotelPmsRoutes);
app.use('/api/v1/manufacturing', manufacturingRoutes);
app.use('/api/v1/data-exchange', importExportRoutes);

app.use('/api/v1/close', financeCloseRoutes);
app.use('/api/v1/events', eventDefinitionRoutes);
app.use('/api/v1/rules', postingRuleRoutes);
app.use('/api/v1/rule-tests', ruleTestCaseRoutes);
app.use('/api/v1/config-bundle', configBundleRoutes);
app.use('/api/v1/event-pipeline', eventPipelineRoutes);
app.use('/api/v1/dimensions', dimensionRoutes);
app.use('/api/v1/commissions', commissionsRoutes);

// 404 Handler
app.use((req, res) => {
  return res.error(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  return res.error(err.message || 'Internal server error', 500);
});

async function startServer(portOverride) {
  await connectDB();
  await seedRbacCatalog();
  if (process.env.ENABLE_DEMO_SEEDING === 'true') {
    await seedPersonas();
  }

  const activePort = portOverride || process.env.PORT || PORT;
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(activePort, () => {
      console.log(`=======================================================`);
      console.log(`  VERIDEX ONE FINANCE SAAS BACKEND LISTENING ON ${activePort}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=======================================================`);
      resolve(s);
    });
    s.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${activePort} already in use. Reusing existing running server.`);
        resolve(null);
      } else {
        reject(err);
      }
    });
  });

  return { app, server };
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
