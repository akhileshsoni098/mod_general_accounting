/**
 * Abstract Base Interface for US Tax Providers.
 * Defines standard contract for jurisdiction lookup, address normalization,
 * rate lookup, and transaction-level tax calculation.
 */
class ITaxProvider {
  /**
   * @param {Object} config - Provider configuration
   */
  constructor(config = {}) {
    if (new.target === ITaxProvider) {
      throw new TypeError('Cannot construct ITaxProvider instances directly');
    }
    this.config = config;
  }

  /**
   * Returns provider unique identifier (e.g. 'MOCK', 'AVALARA', 'TAXJAR', 'VERTEX')
   * @returns {string}
   */
  getProviderId() {
    throw new Error('getProviderId() must be implemented by subclass');
  }

  /**
   * Checks provider connectivity, API credentials, and latency.
   * @returns {Promise<{ status: 'CONNECTED'|'ERROR'|'NOT_CONFIGURED', latencyMs: number, message: string }>}
   */
  async checkHealth() {
    throw new Error('checkHealth() must be implemented by subclass');
  }

  /**
   * Looks up and normalizes postal address into a geographic tax jurisdiction.
   * @param {Object} addressParams - { street, city, state, zip, country }
   * @returns {Promise<Object>} Normalized jurisdiction result
   */
  async lookupJurisdiction(addressParams) {
    throw new Error('lookupJurisdiction() must be implemented by subclass');
  }

  /**
   * Looks up combined and component tax rates for a given location.
   * @param {Object} locationParams - { state, zip, city, street, country }
   * @returns {Promise<Object>} Normalized rate result
   */
  async lookupRates(locationParams) {
    throw new Error('lookupRates() must be implemented by subclass');
  }

  /**
   * Calculates taxes on a commercial transaction.
   * @param {Object} transactionPayload
   * @returns {Promise<Object>} Normalized tax calculation result
   */
  async calculateTax(transactionPayload) {
    throw new Error('calculateTax() must be implemented by subclass');
  }

  /**
   * Commits/finalizes a calculated transaction with the external tax provider.
   * @param {Object} params - { provider_transaction_id, document_number, grand_total }
   * @returns {Promise<Object>}
   */
  async commitTransaction(params) {
    throw new Error('commitTransaction() must be implemented by subclass');
  }

  /**
   * Voids or cancels a transaction with the external tax provider.
   * @param {Object} params - { provider_transaction_id, document_number, reason }
   * @returns {Promise<Object>}
   */
  async voidTransaction(params) {
    throw new Error('voidTransaction() must be implemented by subclass');
  }
}

module.exports = ITaxProvider;
