const COMPANY_SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|srl|plc|pvt|private|group|holdings|technologies|tech|solutions|services|systems|labs|studios)\b\.?/gi;

const COMPANY_ALIASES = {
  'microsoft': ['microsoft', 'msft', 'microsoft corp', 'microsoft corporation'],
  'google': ['google', 'alphabet', 'google llc', 'google inc'],
  'apple': ['apple', 'apple inc', 'aapl'],
  'amazon': ['amazon', 'amzn', 'aws', 'amazon web services'],
  'meta': ['meta', 'facebook', 'fb', 'meta platforms'],
  'stripe': ['stripe', 'stripe inc', 'stripe payments'],
};

function normalizeCompanyName(name) {
  if (!name) return null;
  let normalized = name.toLowerCase().trim();
  normalized = normalized.replace(COMPANY_SUFFIXES, '');
  normalized = normalized.replace(/[^\w\s]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return null;
  }
}

function resolveCompany(name) {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;
  for (const [canonical, aliases] of Object.entries(COMPANY_ALIASES)) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }
  return normalized;
}

function isSameCompany(nameA, nameB, domainA, domainB) {
  if (domainA && domainB) {
    const dA = extractDomain(domainA);
    const dB = extractDomain(domainB);
    if (dA && dB && dA === dB) return true;
  }
  const rA = resolveCompany(nameA);
  const rB = resolveCompany(nameB);
  if (rA && rB && rA === rB) return true;
  return false;
}

function mergeCompanies(a, b) {
  return {
    name: a.name || b.name,
    domain: a.domain || b.domain,
    industry: a.industry || b.industry,
    size: a.size || b.size,
    revenue: a.revenue || b.revenue,
    location: a.location || b.location,
    website: a.website || b.website,
    description: a.description || b.description,
    techStack: [...new Set([...(a.techStack || []), ...(b.techStack || [])])],
    crawledAt: a.crawledAt || b.crawledAt,
  };
}

function mergeContacts(a, b) {
  return {
    email: a.email || b.email,
    name: a.name || b.name,
    title: a.title || b.title,
    seniority: a.seniority || b.seniority,
    department: a.department || b.department,
    phone: a.phone || b.phone,
    linkedin: a.linkedin || b.linkedin,
    confidence: Math.max(a.confidence || 0, b.confidence || 0),
    grade: a.confidence >= b.confidence ? a.grade : b.grade,
    verified: a.verified || b.verified,
    source: a.source || b.source,
    sourceUrl: a.sourceUrl || b.sourceUrl,
    company: a.company || b.company,
    crawledAt: a.crawledAt || b.crawledAt,
  };
}

function dedupeContacts(contacts) {
  const map = new Map();
  for (const contact of contacts) {
    if (!contact.email) continue;
    const key = contact.email.toLowerCase().trim();
    if (map.has(key)) {
      map.set(key, mergeContacts(map.get(key), contact));
    } else {
      map.set(key, contact);
    }
  }
  return Array.from(map.values());
}

function dedupeCompanies(companies) {
  const map = new Map();
  for (const company of companies) {
    if (!company.domain) continue;
    const key = extractDomain(company.domain);
    if (map.has(key)) {
      map.set(key, mergeCompanies(map.get(key), company));
    } else {
      map.set(key, company);
    }
  }
  return Array.from(map.values());
}

module.exports = {
  normalizeCompanyName,
  extractDomain,
  resolveCompany,
  isSameCompany,
  mergeCompanies,
  mergeContacts,
  dedupeContacts,
  dedupeCompanies,
};