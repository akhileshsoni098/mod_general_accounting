const MockTaxProvider = require('./MockTaxProvider');

class TaxProviderFactory {
  /**
   * Resolves and instantiates the tax provider adapter based on company or platform configuration.
   *
   * @param {Object} [options]
   * @param {string} [options.providerName='MOCK']
   * @param {string} [options.environment='SANDBOX']
   * @param {Object} [options.credentials={}]
   * @param {boolean} [options.allowMockInProduction=false]
   * @returns {ITaxProvider}
   */
  static createProvider(nameOrOpts, opts = {}) {
    if (typeof nameOrOpts === 'string') {
      return TaxProviderFactory.getProvider({ providerName: nameOrOpts, ...opts });
    }
    return TaxProviderFactory.getProvider(nameOrOpts || opts);
  }

  static getProvider(options = {}) {
    const providerName = (typeof options === 'string' ? options : (options && options.providerName) || 'MOCK').toUpperCase();
    const opts = typeof options === 'string' ? {} : (options || {});
    const environment = opts.environment || (process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX');

    switch (providerName) {
      case 'MOCK':
        return new MockTaxProvider({
          environment,
          allowMockInProduction: Boolean(opts.allowMockInProduction)
        });

      case 'AVALARA':
      case 'TAXJAR':
      case 'VERTEX':
      case 'STRIPE_TAX': {
        // When commercial provider is selected, require credentials
        const apiKey = options.credentials?.apiKey || process.env[`${providerName}_API_KEY`];
        if (!apiKey) {
          const err = new Error(
            `Tax provider "${providerName}" is selected, but API credentials are not configured. Please provide API credentials or switch to test/mock mode.`
          );
          err.code = 'PROVIDER_CREDENTIALS_MISSING';
          err.statusCode = 503;
          throw err;
        }

        // Future live adapter initialization hook
        throw new Error(
          `Live provider adapter for "${providerName}" has not been integrated yet. Adapter interface and MockTaxProvider are active for sandbox and offline testing.`
        );
      }

      default:
        throw new Error(`Unsupported tax provider: "${providerName}". Supported choices: MOCK, AVALARA, TAXJAR, VERTEX, STRIPE_TAX.`);
    }
  }
}

module.exports = TaxProviderFactory;
