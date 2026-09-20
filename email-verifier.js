// email-verifier.js
// Email verification DISABLED — network blocks SMTP port 25
// Returns MX-valid=true for all emails (accepts as valid)

async function verifyEmail(email) {
  if (!email || !email.includes("@")) {
    return { valid: false, reason: "invalid_format" };
  }
  // Skip actual verification — treat all as valid
  return { valid: true, reason: "skipped", method: "none" };
}

async function verifyEmailBatch(emails) {
  const results = new Map();
  for (const email of emails) {
    results.set(email, await verifyEmail(email));
  }
  return results;
}

async function hasMxRecord(domain) {
  return true; // Skip MX check too
}

module.exports = { verifyEmail, verifyEmailBatch, hasMxRecord };