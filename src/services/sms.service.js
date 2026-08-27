const env = require('../config/env');
const { TOKEN_EXPIRY } = require('../constants');
const { getProvider, logDiagnostic, maskPhone } = require('./sms/provider.registry');

let activeSender = null;

const isEnabled = () => {
  if (activeSender) return true;
  return env.sms.enabled === true;
};

const buildPhoneVerificationMessage = (code) => {
  const expiryMinutes = TOKEN_EXPIRY.PHONE_VERIFICATION / (60 * 1000);
  return `Your verification code is ${code}. It expires in ${expiryMinutes} minutes.`;
};

/**
 * Provider-neutral SMS transport service.
 * Supports custom sender injection for unit tests and dynamic provider lookup
 * via provider registry when enabled in production configuration.
 */
const send = async ({ to, message }) => {
  if (activeSender) {
    return activeSender({ to, message });
  }

  if (!isEnabled()) {
    return { accepted: false, ambiguous: false, reason: 'disabled' };
  }

  if (!to || !message) {
    return { accepted: false, ambiguous: false, reason: 'invalid-message' };
  }

  const providerName = env.sms.provider;
  if (!providerName) {
    return { accepted: false, ambiguous: false, reason: 'configuration-error' };
  }

  const adapter = getProvider(providerName);
  if (!adapter) {
    return { accepted: false, ambiguous: false, reason: 'configuration-error' };
  }

  try {
    const timeoutMs = env.sms.timeoutMs || 5000;
    const result = await adapter({
      to,
      message,
      config: env.sms,
      timeoutMs,
    });

    return {
      accepted: result.accepted === true,
      providerMessageId: result.providerMessageId,
      status: result.status || (result.accepted ? 'sent' : 'failed'),
      reason: result.reason || (result.accepted ? undefined : 'provider-error'),
      ambiguous: result.ambiguous === true,
    };
  } catch (error) {
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return { accepted: false, ambiguous: true, reason: 'timeout' };
    }
    return { accepted: false, ambiguous: false, reason: 'provider-error' };
  }
};

const setSender = (senderFn) => {
  activeSender = senderFn;
};

const resetSender = () => {
  activeSender = null;
};

module.exports = {
  isEnabled,
  buildPhoneVerificationMessage,
  send,
  setSender,
  resetSender,
  maskPhone,
  logDiagnostic,
};
