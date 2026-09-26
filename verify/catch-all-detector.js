const { smtpProbe } = require('./smtp-probe');

/**
 * Detect if a domain is a catch-all
 * Strategy: Probe with a random non-existent email.
 *   - If SMTP accepts it → catch-all
 *   - If SMTP rejects it → not catch-all
 */
async function detectCatchAll(domain, mxHost, options = {}) {
  // Generate a random, very unlikely email
  const randomLocal = `zzz-no-such-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const randomEmail = `${randomLocal}@${domain}`;

  const result = await smtpProbe(randomEmail, mxHost, options);

  if (result.status === 'valid') {
    return { isCatchAll: true, confidence: 95, reason: 'SMTP accepted random address' };
  }
  if (result.status === 'invalid') {
    return { isCatchAll: false, confidence: 90, reason: 'SMTP rejected random address' };
  }
  // unknown or error
  return { isCatchAll: null, confidence: 30, reason: `Inconclusive: ${result.message}` };
}

module.exports = { detectCatchAll };