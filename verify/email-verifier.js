const { getMxRecords, normalizeMx, smtpProbe } = require('./smtp-probe');
const { detectCatchAll } = require('./catch-all-detector');
const { computeConfidence, gradeLabel } = require('./confidence-scorer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Protected email providers that block anonymous SMTP probes
// Microsoft 365, Google Workspace, Proofpoint, Mimecast, etc.
const PROTECTED_PROVIDERS = [
  'protection.outlook.com',
  'outlook.com',
  'google.com',
  'googlemail.com',
  'pphosted.com',
  'mimecast.com',
  'barracuda.com',
  'iphmx.com',
  'messagelabs.com',
];

function isProtectedProvider(mxHost) {
  if (!mxHost) return false;
  const lower = mxHost.toLowerCase();
  return PROTECTED_PROVIDERS.some(p => lower.includes(p));
}

async function verifyEmail(email, options = {}) {
  const startTime = Date.now();
  const result = {
    email,
    syntaxValid: false,
    domain: null,
    mxRecords: [],
    mxExists: false,
    softFail: false,
    isProtectedProvider: false,
    smtpStatus: 'not_checked',
    smtpMessage: null,
    isCatchAll: null,
    catchAllReason: null,
    confidence: 0,
    grade: 'F',
    verified: false,
    durationMs: 0,
    error: null,
  };

  try {
    // STAGE 1: Syntax
    if (!email || typeof email !== 'string') {
      result.error = 'Invalid input';
      result.durationMs = Date.now() - startTime;
      return result;
    }
    result.syntaxValid = EMAIL_REGEX.test(email.trim());
    if (!result.syntaxValid) {
      result.error = 'Syntax invalid';
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const domain = email.split('@')[1].toLowerCase();
    result.domain = domain;

    // STAGE 2: MX Records
    const mxRaw = await getMxRecords(domain);
    const { mx, softFail } = normalizeMx(mxRaw);

    result.mxRecords = mx;
    result.mxExists = mx.length > 0;
    result.softFail = softFail;

    if (!result.mxExists) {
      result.error = softFail
        ? 'Domain exists but no MX records'
        : 'No MX records — domain may not exist';
      result.confidence = computeConfidence({
        email: result.email,
        syntaxValid: result.syntaxValid,
        mxExists: result.mxExists,
        smtpStatus: result.smtpStatus,
        isCatchAll: result.isCatchAll,
        isProtectedProvider: result.isProtectedProvider,
        sourceType: options.sourceType || 'unknown',
        patternMatched: options.patternMatched || false,
        hasSourceUrl: options.hasSourceUrl || false,
      });
      result.grade = gradeLabel(result.confidence);
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // STAGE 2.5: Detect protected provider
    result.isProtectedProvider = isProtectedProvider(result.mxRecords[0]);

    // STAGE 3: SMTP Probe
    if (result.isProtectedProvider) {
      // Skip SMTP — protected providers give false negatives
      result.smtpStatus = 'protected_provider';
      result.smtpMessage = 'Skipped (protected provider blocks probes)';
    } else {
      // Normal provider — do full SMTP probe with multi-MX fallback
      let smtpResult = null;
      for (const mxHost of result.mxRecords.slice(0, 3)) {
        smtpResult = await smtpProbe(email, mxHost, {
          timeout: options.smtpTimeout || 15000,
          fromEmail: options.fromEmail || 'verify@example.com',
        });
        if (smtpResult.status === 'valid' || smtpResult.status === 'invalid') break;
      }
      result.smtpStatus = smtpResult.status;
      result.smtpMessage = smtpResult.message;

      // STAGE 4: Catch-all Detection (only for normal providers)
      if (smtpResult.status === 'valid') {
        const catchAllResult = await detectCatchAll(domain, result.mxRecords[0], {
          timeout: options.smtpTimeout || 15000,
          fromEmail: options.fromEmail || 'verify@example.com',
        });
        result.isCatchAll = catchAllResult.isCatchAll;
        result.catchAllReason = catchAllResult.reason;

        if (catchAllResult.isCatchAll === true) {
          result.smtpStatus = 'catch_all';
        }
      }
    }

    // STAGE 5: Confidence Scoring (includes pattern analysis)
    result.confidence = computeConfidence({
      email: result.email,
      syntaxValid: result.syntaxValid,
      mxExists: result.mxExists,
      smtpStatus: result.smtpStatus,
      isCatchAll: result.isCatchAll,
      isProtectedProvider: result.isProtectedProvider,
      sourceType: options.sourceType || 'unknown',
      patternMatched: options.patternMatched || false,
      hasSourceUrl: options.hasSourceUrl || false,
    });
    result.grade = gradeLabel(result.confidence);
    result.verified = result.confidence >= (options.threshold || 80);

  } catch (err) {
    result.error = err.message;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

async function verifyBatch(emails, options = {}) {
  const concurrency = options.concurrency || 5;
  const results = [];
  const queue = [...emails];

  async function worker() {
    while (queue.length > 0) {
      const email = queue.shift();
      if (!email) break;
      const res = await verifyEmail(email, options);
      results.push(res);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

module.exports = { verifyEmail, verifyBatch };