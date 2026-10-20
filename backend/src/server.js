const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { apiEnvelope } = require('./middleware/apiEnvelope');
const { seedRbacCatalog } = require('./utils/seedRbac');
const { seedPersonas } = require('./utils/seedPersonas');

const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const companyRoutes = require('./routes/companyRoutes');
const glRoutes = require('./routes/glRoutes');
const billingRoutes = require('./routes/billingRoutes');
const treasuryRoutes = require('./routes/treasuryRoutes');
const commissionsRoutes = require('./routes/commissionsRoutes');
const financeCloseRoutes = require('./routes/financeCloseRoutes');
const counterpartyRoutes = require('./routes/counterpartyRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const commercialRoutes = require('./routes/commercialRoutes');

const eventDefinitionRoutes = require('./routes/eventDefinitionRoutes');
const postingRuleRoutes = require('./routes/postingRuleRoutes');
const ruleTestCaseRoutes = require('./routes/ruleTestCaseRoutes');
const configBundleRoutes = require('./routes/configBundleRoutes');
const eventPipelineRoutes = require('./routes/eventPipelineRoutes');
const dimensionRoutes = require('./routes/dimensionRoutes');
const { createCorsOptions } = require('./config/corsConfig');

const app = express();
const PORT = process.env.PORT || 5050;

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

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenant', tenantRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/counterparties', counterpartyRoutes);
app.use('/api/v1/gl', glRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/commercial', commercialRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/treasury', treasuryRoutes);
app.use('/api/v1/commissions', commissionsRoutes);
app.use('/api/v1/close', financeCloseRoutes);
app.use('/api/v1/events', eventDefinitionRoutes);
app.use('/api/v1/rules', postingRuleRoutes);
app.use('/api/v1/rule-tests', ruleTestCaseRoutes);
app.use('/api/v1/config-bundle', configBundleRoutes);
app.use('/api/v1/event-pipeline', eventPipelineRoutes);
app.use('/api/v1/dimensions', dimensionRoutes);

// 404 Handler
app.use((req, res) => {
  return res.error(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  return res.error(err.message || 'Internal server error', 500);
});

async function startServer() {
  await connectDB();
  await seedRbacCatalog();
  if (process.env.ENABLE_DEMO_SEEDING === 'true') {
    await seedPersonas();
  }

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  VERIDEX ONE FINANCE SAAS BACKEND LISTENING ON ${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=======================================================`);
      resolve(s);
    });
    s.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${PORT} already in use. Reusing existing running server.`);
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
