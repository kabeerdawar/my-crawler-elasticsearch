// email-verifier.js
// 🎯 Apollo-level: MX + SMTP + Catch-all detection + Caching

const dns = require("dns").promises;
const net = require("net");

const SMTP_TIMEOUT = 10000;
const FROM_EMAIL = "verify@mycrawler.dev";
const FROM_DOMAIN = "mycrawler.dev";

const mxCache = new Map();
const verifyCache = new Map();
const catchAllCache = new Map(); // 🎯 NEW: Track catch-all domains

async function getMXRecords(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  try {
    const records = await dns.resolveMx(domain);
    const sorted = records.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
    mxCache.set(domain, sorted);
    return sorted;
  } catch {
    mxCache.set(domain, []);
    return [];
  }
}

// 🎯 SMTP probe for a specific email
function smtpProbe(mxHost, email) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let buffer = "";
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.write("QUIT\r\n"); } catch {}
      try { socket.end(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => finish({ status: "unknown", code: "timeout" }), SMTP_TIMEOUT);

    socket.on("error", () => { clearTimeout(timer); finish({ status: "unknown", code: "conn_error" }); });
    socket.on("close", () => { clearTimeout(timer); if (!resolved) finish({ status: "unknown", code: "closed" }); });

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\r\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      const code = parseInt(lastLine.slice(0, 3), 10);

      if (isNaN(code)) return;
      if (lastLine.length >= 4 && lastLine[3] === "-") return;

      buffer = "";

      if (step === 0 && code === 220) {
        socket.write(`HELO ${FROM_DOMAIN}\r\n`);
        step = 1;
      } else if (step === 1 && code === 250) {
        socket.write(`MAIL FROM:<${FROM_EMAIL}>\r\n`);
        step = 2;
      } else if (step === 2 && code === 250) {
        socket.write(`RCPT TO:<${email}>\r\n`);
        step = 3;
      } else if (step === 3) {
        clearTimeout(timer);
        if (code === 250 || code === 251) finish({ status: "valid", code });
        else if (code === 550 || code === 551 || code === 553 || code === 501) finish({ status: "invalid", code });
        else if (code === 450 || code === 451 || code === 452) finish({ status: "greylisted", code });
        else finish({ status: "unknown", code });
      }
    });
  });
}

// 🎯 Check if domain is catch-all
async function isCatchAll(domain, mxHost) {
  if (catchAllCache.has(domain)) return catchAllCache.get(domain);
  
  // Generate random fake email
  const randomStr = Math.random().toString(36).substring(2, 15);
  const fakeEmail = `no-reply-${randomStr}-not-real@${domain}`;
  
  const result = await smtpProbe(mxHost, fakeEmail);
  const isCatch = result.status === "valid"; // If fake email is accepted, domain is catch-all
  
  catchAllCache.set(domain, isCatch);
  return isCatch;
}

async function verifyEmail(email) {
  if (!email || typeof email !== "string") return { status: "invalid", verified: false };
  const lower = email.toLowerCase().trim();

  if (verifyCache.has(lower)) return verifyCache.get(lower);

  // Syntax
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/i.test(lower)) {
    const r = { status: "invalid", reason: "syntax", verified: false };
    verifyCache.set(lower, r);
    return r;
  }

  const [, domain] = lower.split("@");

  // MX
  const mxRecords = await getMXRecords(domain);
  if (mxRecords.length === 0) {
    const r = { status: "invalid", reason: "no_mx", verified: false };
    verifyCache.set(lower, r);
    return r;
  }

  const mxHost = mxRecords[0];

  // 🎯 Check catch-all first (cached)
  const catchAll = await isCatchAll(domain, mxHost);
  if (catchAll) {
    const r = { status: "catch_all", reason: "domain_catch_all", verified: false };
    verifyCache.set(lower, r);
    return r;
  }

  // SMTP probe
  const result = await smtpProbe(mxHost, lower);
  const final = {
    status: result.status,
    reason: result.status === "valid" ? "accepted" : `smtp_${result.code}`,
    verified: result.status === "valid"
  };
  verifyCache.set(lower, final);
  return final;
}

async function verifyEmails(emails) {
  const uniqueEmails = [...new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))];
  const results = new Map();

  const BATCH = 3;
  for (let i = 0; i < uniqueEmails.length; i += BATCH) {
    const batch = uniqueEmails.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(e => verifyEmail(e)));
    batch.forEach((e, idx) => results.set(e, batchResults[idx]));
  }

  return results;
}

function clearCache() {
  mxCache.clear();
  verifyCache.clear();
  catchAllCache.clear();
}

module.exports = { verifyEmail, verifyEmails, getMXRecords, isCatchAll, clearCache };