// email-patterns.js
// 🎯 Email pattern generation from person name + domain

const COMMON_PATTERNS = [
  { template: "{first}.{last}", weight: 47.7 },
  { template: "{f}{last}", weight: 26.8 },
  { template: "{first}", weight: 10.0 },
  { template: "{first}{last}", weight: 8.5 },
  { template: "{f}.{last}", weight: 3.5 },
  { template: "{first}_{last}", weight: 2.0 },
  { template: "{last}.{first}", weight: 1.0 },
  { template: "{last}{f}", weight: 0.3 },
  { template: "{first}-{last}", weight: 0.2 }
];

const GENERIC_PREFIXES = ["info", "contact", "support", "admin", "hello", "sales"];

function normalizeName(name) {
  if (!name) return null;
  const parts = String(name)
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(p => p.length > 0);

  if (parts.length < 2) return null;

  const first = parts[0];
  const last = parts[parts.length - 1];

  if (first.length < 2 || last.length < 2) return null;

  return { first, last, f: first[0], l: last[0] };
}

function normalizeDomain(domain) {
  if (!domain) return null;
  let d = String(domain).toLowerCase().trim();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  if (/gmail|yahoo|hotmail|outlook|facebook|twitter|linkedin|instagram|youtube|wordpress|blogspot|medium|wixsite|squarespace|godaddysites/i.test(d)) {
    return null;
  }

  if (d.split(".").length > 3) return null;

  return d;
}

function generatePatterns(personName, domain, maxResults = 15) {
  const nameParts = normalizeName(personName);
  const d = normalizeDomain(domain);

  if (!nameParts || !d) return [];

  const patterns = [];
  const seen = new Set();

  for (const p of COMMON_PATTERNS) {
    const local = p.template
      .replace("{first}", nameParts.first)
      .replace("{last}", nameParts.last)
      .replace("{f}", nameParts.f)
      .replace("{l}", nameParts.l);

    const email = `${local}@${d}`;

    if (seen.has(email)) continue;
    if (local.length < 2 || local.length > 30) continue;
    if (GENERIC_PREFIXES.includes(local)) continue;

    seen.add(email);
    patterns.push({ email, weight: p.weight, pattern: p.template });

    if (patterns.length >= maxResults) break;
  }

  return patterns;
}

function detectPatternFromExisting(existingEmails, personName) {
  if (!existingEmails || existingEmails.length === 0) return null;
  const nameParts = normalizeName(personName);
  if (!nameParts) return null;

  for (const email of existingEmails) {
    const local = email.split("@")[0].toLowerCase();
    const { first, last, f, l } = nameParts;

    if (local === `${first}.${last}`) return "{first}.{last}";
    if (local === `${f}${last}`) return "{f}{last}";
    if (local === `${first}`) return "{first}";
    if (local === `${first}${last}`) return "{first}{last}";
    if (local === `${f}.${last}`) return "{f}.{last}";
    if (local === `${first}_${last}`) return "{first}_{last}";
  }

  return null;
}

function buildPatternEmails(personName, domain, detectedPattern = null) {
  const nameParts = normalizeName(personName);
  const d = normalizeDomain(domain);

  if (!nameParts || !d) return [];

  if (detectedPattern) {
    const local = detectedPattern
      .replace("{first}", nameParts.first)
      .replace("{last}", nameParts.last)
      .replace("{f}", nameParts.f)
      .replace("{l}", nameParts.l);
    return [{
      email: `${local}@${d}`,
      weight: 20,
      pattern: detectedPattern,
      source: "detected"
    }];
  }

  return generatePatterns(personName, d, 5);
}

module.exports = {
  generatePatterns,
  detectPatternFromExisting,
  buildPatternEmails,
  normalizeName,
  normalizeDomain
};
