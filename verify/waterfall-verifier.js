const { verifyEmail } = require('./email-verifier');
const { apifyVerifyEmail, apifyVerifyBatch } = require('./apify-verifier');

let totalCost = 0;
let apifyCallCount = 0;

function getCostStats() { return { totalCost, apifyCallCount }; }
function resetCostStats() { totalCost = 0; apifyCallCount = 0; }

/**
 * Determine if Apify is needed for this email
 */
function shouldUseApify(local) {
  if (!local.syntaxValid) return false;
  if (!local.mxExists) return false;
  // Definitive valid on normal server
  if (local.smtpStatus === 'valid' && local.isCatchAll === false) return false;
  // Definitive invalid on normal server
  if (local.smtpStatus === 'invalid' && !local.isProtectedProvider) return false;
  // High confidence already
  if (local.confidence >= 85) return false;
  return true;
}

async function waterfallVerify(email, options = {}) {
  const startTime = Date.now();
  const useApify = options.useApify !== false;

  const localResult = await verifyEmail(email, options);

  if (!shouldUseApify(localResult) || !useApify) {
    return {
      ...localResult,
      verificationSource: 'local',
      apifyUsed: false,
      localConfidence: localResult.confidence,
      finalConfidence: localResult.confidence,
      finalGrade: localResult.grade,
      finalVerified: localResult.verified,
      totalDurationMs: Date.now() - startTime,
    };
  }

  const apifyResult = await apifyVerifyEmail(email, options);
  apifyCallCount += 1;
  totalCost += apifyResult.cost || 0;

  const merged = mergeResults(localResult, apifyResult);

  return {
    ...merged,
    verificationSource: 'local + apify',
    apifyUsed: true,
    apifyStatus: apifyResult.status,
    apifyReason: apifyResult.reason,
    apifyCost: apifyResult.cost,
    localConfidence: localResult.confidence,
    apifyConfidence: apifyResult.deliverable ? 95 : apifyResult.deliverable === false ? 10 : null,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Merge local + Apify results with pattern-safety
 */
function mergeResults(local, apify) {
  const merged = { ...local };

  // Extract local pattern suspicion from confidence gap
  // If local confidence was low due to suspicious prefix, don't let Apify override
  const localLocalPart = local.email.split('@')[0].toLowerCase();
  const suspiciousPatterns = ['test', 'demo', 'fake', 'dummy', 'sample', 'temp', 'trial', 'zzz', 'xxx', 'aaa', 'abc', 'xyz', 'foo', 'bar', 'baz'];
  const isSuspicious = suspiciousPatterns.some(s => 
    localLocalPart === s || localLocalPart.startsWith(s + '.') || localLocalPart.startsWith(s + '-')
  );

  if (apify.deliverable === true) {
    // Even if Apify says deliverable, respect suspicious pattern flag
    if (isSuspicious) {
      merged.smtpStatus = 'apify_deliverable_suspicious';
      merged.confidence = 45;
      merged.grade = 'D';
      merged.verified = false;
      merged.finalConfidence = 45;
      merged.finalGrade = 'D';
      merged.finalVerified = false;
      merged.apifyNote = 'Apify: deliverable, but pattern looks fake';
      return merged;
    }

    // If local was protected provider with decent confidence, boost to 95
    merged.smtpStatus = 'apify_deliverable';
    merged.confidence = 95;
    merged.grade = 'A+';
    merged.verified = true;
    merged.finalConfidence = 95;
    merged.finalGrade = 'A+';
    merged.finalVerified = true;
    return merged;
  }

  if (apify.deliverable === false) {
    merged.smtpStatus = 'apify_undeliverable';
    merged.confidence = 5;
    merged.grade = 'F';
    merged.verified = false;
    merged.finalConfidence = 5;
    merged.finalGrade = 'F';
    merged.finalVerified = false;
    return merged;
  }

  // Apify uncertain — keep local result
  merged.finalConfidence = local.confidence;
  merged.finalGrade = local.grade;
  merged.finalVerified = local.verified;
  return merged;
}

async function waterfallVerifyBatch(emails, options = {}) {
  const useApify = options.useApify !== false;
  const localResults = [];
  const concurrency = options.concurrency || 5;
  const queue = [...emails];

  async function worker() {
    while (queue.length > 0) {
      const email = queue.shift();
      if (!email) break;
      const res = await verifyEmail(email, options);
      localResults.push(res);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Always set localConfidence field
  localResults.forEach(r => { r.localConfidence = r.confidence; });

  if (!useApify) {
    return localResults.map(r => ({
      ...r,
      verificationSource: 'local',
      apifyUsed: false,
      finalConfidence: r.confidence,
      finalGrade: r.grade,
      finalVerified: r.verified,
    }));
  }

  const needsApify = localResults.filter(shouldUseApify);

  if (needsApify.length === 0) {
    return localResults.map(r => ({
      ...r,
      verificationSource: 'local',
      apifyUsed: false,
      finalConfidence: r.confidence,
      finalGrade: r.grade,
      finalVerified: r.verified,
    }));
  }

  const apifyResults = await apifyVerifyBatch(needsApify.map(r => r.email), options);
  apifyCallCount += 1;
  totalCost += apifyResults.reduce((s, r) => s + (r.cost || 0), 0);

  // Build a map keyed by lowercase email
  const apifyMap = new Map();
  apifyResults.forEach(r => {
    if (r.email) apifyMap.set(r.email.toLowerCase().trim(), r);
  });

  return localResults.map((local) => {
    const apify = apifyMap.get(local.email.toLowerCase().trim());

    if (!apify) {
      // Apify wasn't needed for this email OR result missing
      return {
        ...local,
        verificationSource: 'local',
        apifyUsed: false,
        localConfidence: local.confidence,
        finalConfidence: local.confidence,
        finalGrade: local.grade,
        finalVerified: local.verified,
      };
    }

    const m = mergeResults(local, apify);
    return {
      ...m,
      verificationSource: 'local + apify',
      apifyUsed: true,
      apifyStatus: apify.status,
      apifyReason: apify.reason,
      apifyCost: apify.cost,
      localConfidence: local.confidence,
      apifyConfidence: apify.deliverable ? 95 : apify.deliverable === false ? 10 : null,
    };
  });
}

module.exports = { waterfallVerify, waterfallVerifyBatch, getCostStats, resetCostStats };