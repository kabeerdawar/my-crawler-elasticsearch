// email-inference.js
// Generates common corporate email patterns using DNS (public data).
// Does NOT send any emails — only queries public DNS records.

const dns = require("dns").promises;
dns.setServers(["8.8.8.8", "1.1.1.1"]);   // Use Google + Cloudflare DNS

function generatePatterns(firstName, lastName, domain) {
  const f = (firstName || "").toLowerCase().trim();
  const l = (lastName || "").toLowerCase().trim();
  if (!f || !domain) return [];

  const patterns = [
    `${f}@${domain}`,
    `${f}.${l}@${domain}`,
    `${f[0]}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `contact@${domain}`,
    `info@${domain}`
  ];

  return [...new Set(patterns.filter(Boolean))];
}

async function checkDomainMx(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

async function getSpfRecord(domain) {
  try {
    const records = await dns.resolveTxt(domain);
    for (const r of records) {
      const txt = Array.isArray(r) ? r.join("") : String(r);
      if (txt.startsWith("v=spf1")) return txt;
    }
    return null;
  } catch {
    return null;
  }
}

async function inferEmails(firstName, lastName, domain) {
  const hasMx = await checkDomainMx(domain);
  if (!hasMx) {
    return { domain, valid: false, patterns: [], spf: null };
  }
  const spf = await getSpfRecord(domain);
  const patterns = generatePatterns(firstName, lastName, domain);
  return { domain, valid: true, spf, patterns };
}

module.exports = { inferEmails, generatePatterns, checkDomainMx };