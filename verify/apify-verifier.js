const { ApifyClient } = require('apify-client');

// Free actor — pay per usage
const ACTOR_ID = 'fatihtahta/email-verifier-free-to-use';

let client = null;

function getClient() {
  if (client) return client;
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN missing in .env');
  client = new ApifyClient({ token });
  return client;
}

/**
 * Parse Apify actor response into a normalized result
 * Actual response format from fatihtahta/email-verifier-free-to-use:
 * {
 *   "status": "valid" | "invalid" | ...,
 *   "input_email": "user@example.com",
 *   "details": { ... }
 * }
 */
function parseApifyItem(item, fallbackEmail) {
  if (!item) {
    return {
      email: fallbackEmail,
      deliverable: null,
      status: 'unknown',
      reason: 'Empty Apify response',
      cost: 0.0003,
      source: 'apify',
    };
  }

  // Extract email — Apify uses "input_email", but check all variants
  const email =
    item.input_email ||
    item.email ||
    item.input ||
    item.address ||
    (item.details && item.details.original) ||
    (item.details && item.details.normalized) ||
    fallbackEmail ||
    null;

  // Determine deliverability from status field
  let deliverable = null;
  let isUndeliverable = false;

  const status = (item.status || '').toLowerCase();

  if (status === 'valid' || status === 'deliverable' || status === 'ok') {
    deliverable = true;
  } else if (
    status === 'invalid' ||
    status === 'undeliverable' ||
    status === 'bad' ||
    status === 'rejected'
  ) {
    isUndeliverable = true;
  }
  // Fallback to other possible field names
  else if (item.deliverable === true || item.valid === true || item.is_valid === true || item.isValid === true) {
    deliverable = true;
  } else if (item.deliverable === false || item.valid === false || item.is_valid === false || item.isValid === false) {
    isUndeliverable = true;
  }

  const normalizedStatus = deliverable
    ? 'deliverable'
    : isUndeliverable
    ? 'undeliverable'
    : 'unknown';

  return {
    email,
    deliverable: deliverable === true ? true : isUndeliverable === true ? false : null,
    status: normalizedStatus,
    reason:
      deliverable
        ? 'Apify: deliverable'
        : isUndeliverable
        ? 'Apify: undeliverable'
        : `Apify: ${item.status || 'unknown'}`,
    isCatchAll: null,
    isDisposable: null,
    cost: 0.0003,
    source: 'apify',
    rawStatus: item.status,
  };
}

/**
 * Verify a single email via Apify
 */
async function apifyVerifyEmail(email, options = {}) {
  const startTime = Date.now();
  try {
    const apifyClient = getClient();

    const run = await apifyClient
      .actor(ACTOR_ID)
      .call({ emails: [email] }, { timeout: options.timeout || 120000 });

    const { items } = await apifyClient
      .dataset(run.defaultDatasetId)
      .listItems();

    if (!items || items.length === 0) {
      return {
        email,
        deliverable: null,
        status: 'unknown',
        reason: 'No result from Apify',
        cost: 0,
        durationMs: Date.now() - startTime,
        source: 'apify',
      };
    }

    const parsed = parseApifyItem(items[0], email);
    parsed.durationMs = Date.now() - startTime;
    return parsed;
  } catch (err) {
    return {
      email,
      deliverable: null,
      status: 'error',
      reason: err.message,
      cost: 0,
      durationMs: Date.now() - startTime,
      source: 'apify',
      error: err.message,
    };
  }
}

/**
 * Verify multiple emails in one Apify run
 */
async function apifyVerifyBatch(emails, options = {}) {
  const startTime = Date.now();
  if (!emails || emails.length === 0) return [];

  try {
    const apifyClient = getClient();

    const run = await apifyClient
      .actor(ACTOR_ID)
      .call({ emails }, { timeout: options.timeout || 300000 });

    const { items } = await apifyClient
      .dataset(run.defaultDatasetId)
      .listItems();

    if (!items || items.length === 0) {
      return emails.map((email) => ({
        email,
        deliverable: null,
        status: 'unknown',
        reason: 'No result from Apify',
        cost: 0,
        source: 'apify',
      }));
    }

    // Build map keyed by lowercase email
    const resultMap = new Map();
    for (const item of items) {
      const parsed = parseApifyItem(item, null);
      if (parsed.email) {
        resultMap.set(parsed.email.toLowerCase().trim(), parsed);
      }
    }

    // Return in same order as input
    return emails.map((email) => {
      const key = email.toLowerCase().trim();
      const parsed = resultMap.get(key);
      if (parsed) {
        parsed.durationMs = Date.now() - startTime;
        return parsed;
      }
      return {
        email,
        deliverable: null,
        status: 'unknown',
        reason: 'Email not in Apify response',
        cost: 0,
        source: 'apify',
      };
    });
  } catch (err) {
    return emails.map((email) => ({
      email,
      deliverable: null,
      status: 'error',
      reason: err.message,
      cost: 0,
      source: 'apify',
      error: err.message,
    }));
  }
}

module.exports = { apifyVerifyEmail, apifyVerifyBatch, parseApifyItem };