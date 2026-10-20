const API_BASE = '/api/v1';

export async function apiRequest(endpoint, { method = 'GET', body = null, token = null, tenantId = null, headers: customHeaders = {} } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  const storedToken = token || localStorage.getItem('veridex_token');
  const storedTenantId = tenantId || localStorage.getItem('veridex_tenant_id');
  const storedCompanyId = customHeaders['x-company-id'] || localStorage.getItem('veridex_company_id');

  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  if (storedTenantId) {
    headers['x-tenant-id'] = storedTenantId;
  }
  if (storedCompanyId) {
    headers['x-company-id'] = storedCompanyId;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    const errorMsg = (data && data.error && data.error.message) || data.message || `Request failed with code ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

export const authApi = {
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: { email, password } }),
  registerTenant: (payload) => apiRequest('/auth/register-tenant', { method: 'POST', body: payload }),
  getMe: () => apiRequest('/auth/me'),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  switchWorkspace: (tenant_id) => apiRequest('/tenant/switch-workspace', { method: 'POST', body: { tenant_id } }),
  getTenantUsers: () => apiRequest('/tenant/users'),
  inviteUser: (payload) => apiRequest('/tenant/users/invite', { method: 'POST', body: payload }),
  getModules: () => apiRequest('/tenant/modules'),
  updateModule: (module_code, is_enabled) => apiRequest('/tenant/modules', { method: 'PATCH', body: { module_code, is_enabled } }),
  getRoles: () => apiRequest('/tenant/roles'),
  refreshToken: (refreshToken) => apiRequest('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } }),
  forgotPassword: (email) => apiRequest('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, new_password) => apiRequest('/auth/reset-password', { method: 'POST', body: { token, new_password } }),
  resetDevData: () => apiRequest('/tenant/reset-dev-data', {
    method: 'POST',
    headers: { 'x-confirm-destructive-reset': 'CONFIRM_RESET_ALL_DATA' }
  }),

  // Company & Multi-Entity Endpoints
  getCompanies: () => apiRequest('/companies'),
  getCompanyDetails: (id) => apiRequest(`/companies/${id}`),
  createCompany: (payload) => apiRequest('/companies', { method: 'POST', body: payload }),
  updateCompany: (id, payload) => apiRequest(`/companies/${id}`, { method: 'PATCH', body: payload }),
  switchCompany: (company_id, make_default = true) => apiRequest('/companies/switch', { method: 'POST', body: { company_id, make_default } }),
  getCompanyMembers: (id) => apiRequest(`/companies/${id}/members`),
  addCompanyMember: (id, payload) => apiRequest(`/companies/${id}/members`, { method: 'POST', body: payload }),
  getBusinessProfiles: () => apiRequest('/companies/profiles'),

  // GL Module Endpoints
  getAccounts: () => apiRequest('/gl/accounts'),
  getAccountDetail: (id) => apiRequest(`/gl/accounts/${id}`),
  createAccount: (payload) => apiRequest('/gl/accounts', { method: 'POST', body: payload }),
  updateAccount: (id, payload) => apiRequest(`/gl/accounts/${id}`, { method: 'PATCH', body: payload }),
  getPeriods: () => apiRequest('/gl/periods'),
  createPeriod: (payload) => apiRequest('/gl/periods', { method: 'POST', body: payload }),
  updatePeriodStatus: (period_id, status, close_notes) => apiRequest('/gl/periods/status', { method: 'PATCH', body: { period_id, status, close_notes } }),
  getJournals: (params = '') => apiRequest(`/gl/journals${params}`),
  getJournalById: (id) => apiRequest(`/gl/journals/${id}`),
  previewJournal: (payload) => apiRequest('/gl/journals/preview', { method: 'POST', body: payload }),
  postJournal: (payload) => apiRequest('/gl/journals', { method: 'POST', body: payload }),
  reverseJournal: (id, payload) => apiRequest(`/gl/journals/${id}/reverse`, { method: 'POST', body: payload }),
  getTrialBalance: () => apiRequest('/gl/trial-balance'),
  getPostingRules: () => apiRequest('/gl/posting-rules'),
  createPostingRule: (payload) => apiRequest('/gl/posting-rules', { method: 'POST', body: payload }),
  getExchangeRates: () => apiRequest('/gl/exchange-rates'),
  createExchangeRate: (payload) => apiRequest('/gl/exchange-rates', { method: 'POST', body: payload }),

  // Billing & AR Module Endpoints
  getBillingOverview: () => apiRequest('/billing/overview'),
  getBillingAccounts: () => apiRequest('/billing/accounts'),
  createBillingAccount: (payload) => apiRequest('/billing/accounts', { method: 'POST', body: payload }),
  getBillingAccountDetail: (id) => apiRequest(`/billing/accounts/${id}`),
  getBillingPlans: () => apiRequest('/billing/plans'),
  createBillingPlan: (payload) => apiRequest('/billing/plans', { method: 'POST', body: payload }),
  generateSchedule: (payload) => apiRequest('/billing/policies/schedule', { method: 'POST', body: payload }),
  getInvoices: (params = '') => apiRequest(`/billing/invoices${params}`),
  getInvoiceDetail: (id) => apiRequest(`/billing/invoices/${id}`),
  issueInvoice: (payload) => apiRequest('/billing/invoices', { method: 'POST', body: payload }),
  getPayments: () => apiRequest('/billing/payments'),
  postPaymentReceipt: (payload) => apiRequest('/billing/payments', { method: 'POST', body: payload }),
  getAdjustments: () => apiRequest('/billing/adjustments'),
  createAdjustment: (payload) => apiRequest('/billing/adjustments', { method: 'POST', body: payload }),

  // Treasury, Cash & Bank Reconciliation Endpoints
  getTreasuryOverview: () => apiRequest('/treasury/overview'),
  getMandates: () => apiRequest('/treasury/mandates'),
  createMandate: (payload) => apiRequest('/treasury/mandates', { method: 'POST', body: payload }),
  updateMandateStatus: (id, status) => apiRequest(`/treasury/mandates/${id}/status`, { method: 'PATCH', body: { status } }),
  getAttempts: () => apiRequest('/treasury/attempts'),
  postPaymentAttempt: (payload) => apiRequest('/treasury/attempts', { method: 'POST', body: payload }),
  getProcessorTransactions: (params = '') => apiRequest(`/treasury/processor-transactions${params}`),
  getBankStatementLines: (params = '') => apiRequest(`/treasury/bank-lines${params}`),
  importBankStatement: (payload) => apiRequest('/treasury/bank-lines/import', { method: 'POST', body: payload }),
  getReconciliationMatches: () => apiRequest('/treasury/matches'),
  autoReconcile: () => apiRequest('/treasury/auto-reconcile', { method: 'POST' }),
  manualMatch: (payload) => apiRequest('/treasury/manual-match', { method: 'POST', body: payload }),
  getPaymentReturns: () => apiRequest('/treasury/returns'),
  postPaymentReturn: (payload) => apiRequest('/treasury/returns', { method: 'POST', body: payload }),
  getRefunds: () => apiRequest('/treasury/refunds'),
  postRefund: (payload) => apiRequest('/treasury/refunds', { method: 'POST', body: payload }),
  getDunningPlans: () => apiRequest('/treasury/dunning/plans'),
  getDelinquencyCases: () => apiRequest('/treasury/dunning/cases'),
  getDunningActions: () => apiRequest('/treasury/dunning/actions'),
  getCollectionAssignments: () => apiRequest('/treasury/dunning/assignments')
};

export const billingApi = {
  getBillingOverview: () => apiRequest('/billing/overview'),
  getBillingAccounts: () => apiRequest('/billing/accounts'),
  createBillingAccount: (payload) => apiRequest('/billing/accounts', { method: 'POST', body: payload }),
  getBillingAccountDetail: (id) => apiRequest(`/billing/accounts/${id}`),
  getBillingPlans: () => apiRequest('/billing/plans'),
  createBillingPlan: (payload) => apiRequest('/billing/plans', { method: 'POST', body: payload }),
  generateSchedule: (payload) => apiRequest('/billing/policies/schedule', { method: 'POST', body: payload }),
  getInstallmentSchedules: (params = '') => apiRequest(`/billing/schedules${params}`),
  getInvoices: (params = '') => apiRequest(`/billing/invoices${params}`),
  getInvoiceDetail: (id) => apiRequest(`/billing/invoices/${id}`),
  issueInvoice: (payload) => apiRequest('/billing/invoices', { method: 'POST', body: payload }),
  getPayments: () => apiRequest('/billing/payments'),
  postPaymentReceipt: (payload) => apiRequest('/billing/payments', { method: 'POST', body: payload }),
  getAdjustments: () => apiRequest('/billing/adjustments'),
  createAdjustment: (payload) => apiRequest('/billing/adjustments', { method: 'POST', body: payload })
};

export const commissionsApi = {
  getOverview: () => apiRequest('/commissions/overview'),
  seedCommissions: () => apiRequest('/commissions/seed', { method: 'POST' }),
  getAgreements: () => apiRequest('/commissions/agreements'),
  createAgreement: (payload) => apiRequest('/commissions/agreements', { method: 'POST', body: payload }),
  getSchedules: (params = '') => apiRequest(`/commissions/schedules${params}`),
  createSchedule: (payload) => apiRequest('/commissions/schedules', { method: 'POST', body: payload }),
  previewChain: (grossPremium) => apiRequest(`/commissions/preview-chain?gross_premium=${grossPremium || 37650}`),
  getProfitSchedules: () => apiRequest('/commissions/profit-schedules'),
  createProfitSchedule: (payload) => apiRequest('/commissions/profit-schedules', { method: 'POST', body: payload }),
  getSplits: (params = '') => apiRequest(`/commissions/splits${params}`),
  createSplit: (payload) => apiRequest('/commissions/splits', { method: 'POST', body: payload }),
  getTransactions: () => apiRequest('/commissions/transactions'),
  processTransaction: (payload) => apiRequest('/commissions/transactions', { method: 'POST', body: payload }),
  disburseBrokerCommission: (id, payload) => apiRequest(`/commissions/transactions/${id}/disburse`, { method: 'POST', body: payload }),
  allocateShares: (payload) => apiRequest('/commissions/allocate-shares', { method: 'POST', body: payload }),
  getFiduciaryAccounts: () => apiRequest('/commissions/fiduciary-accounts'),
  seedFiduciaryAccounts: () => apiRequest('/commissions/fiduciary-accounts/seed', { method: 'POST' }),
  createFiduciaryAccount: (payload) => apiRequest('/commissions/fiduciary-accounts', { method: 'POST', body: payload }),
  executeSweep: (payload) => apiRequest('/commissions/sweeps/execute', { method: 'POST', body: payload }),
  getBordereauDefinitions: () => apiRequest('/commissions/bordereau/definitions'),
  getBordereauRuns: () => apiRequest('/commissions/bordereau/runs'),
  generateBordereauRun: (payload) => apiRequest('/commissions/bordereau/runs', { method: 'POST', body: payload }),
  transmitBordereauRun: (runId, payload) => apiRequest(`/commissions/bordereau/runs/${runId}/transmit`, { method: 'POST', body: payload }),
  getBordereauRunLines: (runId) => apiRequest(`/commissions/bordereau/runs/${runId}/lines`),
  getSettlements: () => apiRequest('/commissions/settlements'),
  generateSettlement: (payload) => apiRequest('/commissions/settlements', { method: 'POST', body: payload }),
  disburseSettlement: (id, payload) => apiRequest(`/commissions/settlements/${id}/disburse`, { method: 'POST', body: payload })
};

export const financeCloseApi = {
  getOverview: () => apiRequest('/close/overview'),
  previewUPR: (params = '') => apiRequest(`/close/upr/preview${params}`),
  runUPR: (payload) => apiRequest('/close/upr/run', { method: 'POST', body: payload }),
  getSubledgerBalances: (params = '') => apiRequest(`/close/reconciliation/subledgers${params}`),
  getReconciliationCases: () => apiRequest('/close/reconciliation/cases'),
  resolveCase: (id, payload) => apiRequest(`/close/reconciliation/cases/${id}/resolve`, { method: 'PATCH', body: payload }),
  getChecklist: () => apiRequest('/close/checklist'),
  executeChecklistStep: (step) => apiRequest(`/close/checklist/step/${step}/execute`, { method: 'POST' }),
  getTrialBalance: (params = '') => apiRequest(`/close/trial-balance${params}`),
  certifyTrialBalance: (payload) => apiRequest('/close/trial-balance/certify', { method: 'POST', body: payload }),
  getFinancialStatements: () => apiRequest('/close/reports/financial-statements'),
  getExportBatches: () => apiRequest('/close/export-batches'),
  createExportBatch: (payload) => apiRequest('/close/export-batches', { method: 'POST', body: payload }),
  getAdjustments: () => apiRequest('/close/adjustments'),
  getDisputes: () => apiRequest('/close/disputes')
};

export const counterpartiesApi = {
  getParties: (params = '') => apiRequest(`/counterparties${params}`),
  createParty: (payload) => apiRequest('/counterparties', { method: 'POST', body: payload }),
  getPartyDetail: (id) => apiRequest(`/counterparties/${id}`),
  updateParty: (id, payload) => apiRequest(`/counterparties/${id}`, { method: 'PATCH', body: payload }),
  addPartyRole: (id, payload) => apiRequest(`/counterparties/${id}/roles`, { method: 'POST', body: payload }),
  seedParties: () => apiRequest('/counterparties/seed', { method: 'POST' })
};

export const dashboardApi = {
  getMetrics: () => apiRequest('/dashboard/metrics')
};

export const settingsApi = {
  getSettings: () => apiRequest('/tenant/settings'),
  updateSettings: (payload) => apiRequest('/tenant/settings', { method: 'PATCH', body: payload })
};

export const eventsApi = {
  getEvents: (params = '') => apiRequest(`/events${params}`),
  getEventById: (id) => apiRequest(`/events/${id}`),
  createEvent: (payload) => apiRequest('/events', { method: 'POST', body: payload }),
  addVersion: (id, payload) => apiRequest(`/events/${id}/versions`, { method: 'POST', body: payload }),
  validatePayload: (id, payload, version) => apiRequest(`/events/${id}/validate-payload`, { method: 'POST', body: { payload, version } }),
  updateStatus: (id, status) => apiRequest(`/events/${id}/status`, { method: 'PATCH', body: { status } })
};

export const rulesApi = {
  getRules: (params = '') => apiRequest(`/rules${params}`),
  getRuleById: (id) => apiRequest(`/rules/${id}`),
  createRule: (payload) => apiRequest('/rules', { method: 'POST', body: payload }),
  updateRule: (id, payload) => apiRequest(`/rules/${id}`, { method: 'PATCH', body: payload }),
  forkRule: (id) => apiRequest(`/rules/${id}/fork`, { method: 'POST' }),
  validateRule: (id) => apiRequest(`/rules/${id}/validate`, { method: 'POST' }),
  publishRule: (id) => apiRequest(`/rules/${id}/publish`, { method: 'POST' }),
  retireRule: (id, reason) => apiRequest(`/rules/${id}/retire`, { method: 'POST', body: { reason } }),
  reactivateRule: (id) => apiRequest(`/rules/${id}/reactivate`, { method: 'POST' }),
  deleteRule: (id) => apiRequest(`/rules/${id}`, { method: 'DELETE' }),
  simulate: (payload) => apiRequest('/rules/simulate', { method: 'POST', body: payload }),
  postSimulated: (payload) => apiRequest('/rules/simulate/post', { method: 'POST', body: payload })
};

export const ruleTestsApi = {
  getTestCases: (params = '') => apiRequest(`/rule-tests${params}`),
  createTestCase: (payload) => apiRequest('/rule-tests', { method: 'POST', body: payload }),
  runTestCase: (id) => apiRequest(`/rule-tests/${id}/run`, { method: 'POST' })
};

export const configBundleApi = {
  exportBundle: () => apiRequest('/config-bundle/export'),
  previewBundle: (bundle) => apiRequest('/config-bundle/preview', { method: 'POST', body: { bundle } }),
  importBundle: (bundle) => apiRequest('/config-bundle/import', { method: 'POST', body: { bundle } })
};

export const eventPipelineApi = {
  getStats: () => apiRequest('/event-pipeline/stats'),
  getOutbox: (params = '') => apiRequest(`/event-pipeline/outbox${params}`),
  retryOutbox: (eventId) => apiRequest(`/event-pipeline/outbox/${eventId}/retry`, { method: 'POST' }),
  replayOutbox: (eventId, reason) => apiRequest(`/event-pipeline/outbox/${eventId}/replay`, { method: 'POST', body: { reason } }),
  getInbox: (params = '') => apiRequest(`/event-pipeline/inbox${params}`),
  retryInbox: (id) => apiRequest(`/event-pipeline/inbox/${id}/retry`, { method: 'POST' }),
  replayInbox: (id, reason) => apiRequest(`/event-pipeline/inbox/${id}/replay`, { method: 'POST', body: { reason } }),
  triggerDispatch: (limit = 20) => apiRequest('/event-pipeline/dispatch', { method: 'POST', body: { limit } }),
  getTrace: (identifier) => apiRequest(`/event-pipeline/trace/${encodeURIComponent(identifier)}`),
  getSubscriptions: () => apiRequest('/event-pipeline/subscriptions'),
  upsertSubscription: (payload) => apiRequest('/event-pipeline/subscriptions', { method: 'POST', body: payload }),
  toggleSubscription: (id) => apiRequest(`/event-pipeline/subscriptions/${id}/toggle`, { method: 'PATCH' })
};

export const dimensionsApi = {
  getDimensions: (params = '') => apiRequest(`/dimensions${params}`),
  getDimensionContext: () => apiRequest('/dimensions/context'),
  createDimension: (payload) => apiRequest('/dimensions', { method: 'POST', body: payload }),
  updateDimension: (id, payload) => apiRequest(`/dimensions/${id}`, { method: 'PATCH', body: payload }),
  deleteDimension: (id) => apiRequest(`/dimensions/${id}`, { method: 'DELETE' })
};

export const inventoryApi = {
  getGroups: (params = '') => apiRequest(`/inventory/groups${params}`),
  getGroupById: (id) => apiRequest(`/inventory/groups/${id}`),
  createGroup: (payload) => apiRequest('/inventory/groups', { method: 'POST', body: payload }),
  updateGroup: (id, payload) => apiRequest(`/inventory/groups/${id}`, { method: 'PATCH', body: payload }),
  deleteGroup: (id) => apiRequest(`/inventory/groups/${id}`, { method: 'DELETE' }),

  getCategories: (params = '') => apiRequest(`/inventory/categories${params}`),
  getCategoryById: (id) => apiRequest(`/inventory/categories/${id}`),
  createCategory: (payload) => apiRequest('/inventory/categories', { method: 'POST', body: payload }),
  updateCategory: (id, payload) => apiRequest(`/inventory/categories/${id}`, { method: 'PATCH', body: payload }),
  deleteCategory: (id) => apiRequest(`/inventory/categories/${id}`, { method: 'DELETE' }),

  getUnits: (params = '') => apiRequest(`/inventory/uom${params}`),
  getUnitById: (id) => apiRequest(`/inventory/uom/${id}`),
  createUnit: (payload) => apiRequest('/inventory/uom', { method: 'POST', body: payload }),
  updateUnit: (id, payload) => apiRequest(`/inventory/uom/${id}`, { method: 'PATCH', body: payload }),
  simulateConversion: (payload) => apiRequest('/inventory/uom/convert', { method: 'POST', body: payload }),

  getGodowns: (params = '') => apiRequest(`/inventory/godowns${params}`),
  getGodownById: (id) => apiRequest(`/inventory/godowns/${id}`),
  createGodown: (payload) => apiRequest('/inventory/godowns', { method: 'POST', body: payload }),
  updateGodown: (id, payload) => apiRequest(`/inventory/godowns/${id}`, { method: 'PATCH', body: payload }),

  getItems: (params = '') => apiRequest(`/inventory/items${params}`),
  getItemById: (id) => apiRequest(`/inventory/items/${id}`),
  createItem: (payload) => apiRequest('/inventory/items', { method: 'POST', body: payload }),
  updateItem: (id, payload) => apiRequest(`/inventory/items/${id}`, { method: 'PATCH', body: payload }),

  postOpeningStock: (payload) => apiRequest('/inventory/opening-stock', { method: 'POST', body: payload }),

  getBalances: (params = '') => apiRequest(`/inventory/balances${params}`),
  getSummary: () => apiRequest('/inventory/summary'),

  getMovements: (params = '') => apiRequest(`/inventory/movements${params}`),
  reverseMovement: (id, payload) => apiRequest(`/inventory/movements/${id}/reverse`, { method: 'POST', body: payload }),

  reconcileBalances: (payload = {}) => apiRequest('/inventory/reconcile', { method: 'POST', body: payload })
};



