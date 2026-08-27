const env = require('../../config/env');

/**
 * Mask destination phone number for safe diagnostic logging
 * e.g., '+251912345678' -> '+251****5678'
 */
const maskPhone = (phone) => {
  if (typeof phone !== 'string' || phone.length < 7) return '****';
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-4);
  return `${prefix}****${suffix}`;
};

/**
 * Log diagnostic SMS delivery outcome safely without exposing OTPs or API keys.
 */
const logDiagnostic = ({ provider, to, accepted, reason, providerMessageId }) => {
  const maskedTo = maskPhone(to);
  const statusStr = accepted ? 'ACCEPTED' : `REJECTED (${reason || 'unknown'})`;
  const msgIdStr = providerMessageId ? ` [MsgId: ${providerMessageId}]` : '';
  console.log(`[SMS:${provider || 'unconfigured'}] Delivery to ${maskedTo}: ${statusStr}${msgIdStr}`);
};

/**
 * Provider adapter registry mechanism.
 * Allows dynamic registration and selection of concrete SMS gateway adapters.
 */
const registry = new Map();

/**
 * Register a provider adapter implementation.
 * Signature: async ({ to, message, config, timeoutMs }) => { accepted, providerMessageId, status, reason, ambiguous }
 */
const registerProvider = (name, adapterFn) => {
  if (!name || typeof adapterFn !== 'function') {
    throw new Error('Invalid SMS provider registration');
  }
  registry.set(name.toLowerCase().trim(), adapterFn);
};

/**
 * Retrieve a registered provider adapter function by name.
 */
const getProvider = (name) => {
  if (!name) return null;
  return registry.get(name.toLowerCase().trim()) || null;
};

// Register generic REST adapter boundary placeholder for pre-activation validation
registerProvider('generic_rest', async ({ config }) => {
  if (!config.apiBaseUrl || !config.apiKey) {
    return {
      accepted: false,
      ambiguous: false,
      reason: 'configuration-error',
    };
  }
  return {
    accepted: false,
    ambiguous: false,
    reason: 'provider-adapter-not-configured',
  };
});

module.exports = {
  maskPhone,
  logDiagnostic,
  registerProvider,
  getProvider,
};
