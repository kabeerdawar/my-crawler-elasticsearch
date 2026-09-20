// deduplicator.js
const { verifyEmail } = require("./email-verifier");

// 🎯 Shared/role emails — should NEVER be merge keys
const SHARED_EMAIL_LOCALS = [
  "info","contact","hello","admin","support","sales","team","office",
  "enquiries","enquiry","inquiries","inquiry","help","mail",
  "service","newaccounts","cashiering","shorts","billing","accounts",
  "marketing","media","press","hr","jobs","careers","legal","privacy",
  "noreply","no-reply","webmaster","abuse","hi","hey"
];

function isSharedEmail(email) {
  if (!email) return false;
  const local = email.split("@")[0].toLowerCase();
  return SHARED_EMAIL_LOCALS.includes(local);
}

function normalize(v) {
  return String(v || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").trim();
}

function getBaseDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const multiTLDs = ["co.uk","co.in","com.au","co.jp","co.kr","com.br","co.za","gov.in","gov.uk","ac.in","ac.uk","com.sg","com.hk","com.mx"];
    for (const tld of multiTLDs) {
      if (host.endsWith("." + tld)) {
        const beforeTLD = host.slice(0, -(tld.length + 1));
        return beforeTLD.split(".").pop() + "." + tld;
      }
    }
    const parts = host.split(".");
    return parts.length < 2 ? host : parts.slice(-2).join(".");
  } catch { return ""; }
}

function isRealPersonName(name) {
  if (!name) return false;
  const n = name.trim();
  if (n.length < 4 || n.length > 60) return false;
  const words = n.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (!/^[A-Z][a-z]/.test(n)) return false;
  if (/^(home|team|about|contact|portfolio|investments|privacy|terms|blog|news|library|directory|page|our|the|leadership|management|advisory|advisors)$/i.test(n)) return false;
  return true;
}

// 🎯 STRICT dedup key logic
function getRecordKey(record) {
  const name = record.name ? record.name.trim() : "";
  const company = record.company_name ? record.company_name.trim() : "";
  const isRealName = isRealPersonName(name);
  const baseDomain = getBaseDomain(record.source_url);

  // 1. LinkedIn /in/ + name → person-level merge
  const linkedinProfiles = (record.linkedin_details || []).filter(l => l.score === 5 && l.url);
  if (linkedinProfiles.length > 0 && isRealName) {
    return `li:${normalize(linkedinProfiles[0].url)}`;
  }

  // 2. PERSONAL email only (not shared) → person-level merge
  const personalEmails = (record.email_details || [])
    .filter(e => e.source !== "pattern" && !isSharedEmail(e.email))
    .map(e => e.email);
  if (personalEmails.length > 0) {
    return `email:${normalize(personalEmails[0])}`;
  }

  // 3. Person name + company → person-level
  if (isRealName && company) {
    return `nc:${normalize(name)}|${normalize(company)}`;
  }

  // 4. Person name + domain → person-level
  if (isRealName && baseDomain) {
    return `nd:${normalize(name)}|${baseDomain}`;
  }

  // 5. 🎯 FIRM-LEVEL (no person name) → merge ALL firm records by DOMAIN ONLY
  // Ignores company name variations like "First Round Capital" vs "First Round"
  if (!isRealName && baseDomain) {
    return `firm:${baseDomain}`;
  }

  return null;
}

function calculateConfidence(record) {
  let score = 0;
  const hasVerifiedEmail = (record.email_details || []).some(e => e.verified === true && !isSharedEmail(e.email));
  const hasRealEmail = (record.email_details || []).some(e => e.source !== "pattern" && !isSharedEmail(e.email));
  const hasLinkedInProfile = (record.linkedin_details || []).some(l => l.score === 5);

  if (hasVerifiedEmail) score += 0.5;
  else if (hasRealEmail) score += 0.3;

  if (hasLinkedInProfile) score += 0.3;
  if (record.name && record.name.length > 4) score += 0.1;
  if (record.company_name && record.company_name.length > 2) score += 0.1;
  if ((record.sectors || []).length > 0) score += 0.05;
  if (record.is_fresh) score += 0.05;

  return Math.min(1.0, score);
}

function addPatternEmailIfMissing(record) {
  if (record.emails && record.emails.length > 0) return;

  const personName = record.name ? record.name.trim() : "";
  const baseDomain = getBaseDomain(record.source_url);
  if (!baseDomain || !baseDomain.includes(".") || baseDomain.length < 5) return;
  if (/\.(gov|gov\.in|gov\.uk|edu|ac\.in|ac\.uk)$/i.test(baseDomain)) return;

  const candidates = [];

  if (isRealPersonName(personName)) {
    // Person-specific patterns — unique per person
    const parts = personName.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0].replace(/[^a-z]/g, "");
      const last = parts[parts.length - 1].replace(/[^a-z]/g, "");
      if (first && last) {
        candidates.push(`${first}@${baseDomain}`);
        candidates.push(`${first}.${last}@${baseDomain}`);
      }
    }
  } else {
    // Firm-level patterns — only ONE firm record per domain after merge
    candidates.push(`info@${baseDomain}`);
    candidates.push(`contact@${baseDomain}`);
  }

  if (candidates.length === 0) return;
  if (!record.emails) record.emails = [];
  if (!record.email_details) record.email_details = [];

  for (const candidate of candidates.slice(0, 2)) {
    if (!record.emails.includes(candidate)) {
      record.emails.push(candidate);
      record.email_details.push({ email: candidate, source: "pattern", weight: 1, score: 2 });
      record.email_score = (record.email_score || 0) + 2;
    }
  }
}

async function deduplicateInvestors(records) {
  console.log(`Deduplicating ${records.length} records...`);

  const groups = new Map();

  for (const record of records) {
    const key = getRecordKey(record);
    if (!key) {
      groups.set(`unique:${Math.random()}`, [record]);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  console.log(`Merged into ${groups.size} groups (from ${records.length})`);

  const investors = [];
  const reviewQueue = [];
  let totalEmails = 0;
  let verifiedOk = 0;
  let verifiedFail = 0;

  for (const group of groups.values()) {
    const merged = mergeRecords(group);
    addPatternEmailIfMissing(merged);

    if (merged.email_details && merged.email_details.length > 0) {
      const verifiedEmails = [];
      const verifiedDetails = [];

      for (const ed of merged.email_details) {
        try {
          totalEmails++;
          const result = await verifyEmail(ed.email);
          ed.verified = result.valid;
          ed.verification_method = result.method;
          ed.verification_reason = result.reason;

          if (result.valid) {
            verifiedOk++;
            verifiedEmails.push(ed.email);
            verifiedDetails.push(ed);
          } else {
            verifiedFail++;
            verifiedDetails.push(ed);
          }
        } catch {
          verifiedDetails.push(ed);
        }
      }

      merged.emails = verifiedEmails.length > 0 ? verifiedEmails : merged.emails;
      merged.email_details = verifiedDetails;
    }

    const confidenceScore = calculateConfidence(merged);
    merged.confidence_score = Math.round(confidenceScore * 100) / 100;
    merged.source_count = group.length;
    merged.all_sources = [...new Set(group.map(r => r.source_url).filter(Boolean))];
    merged.last_verified_at = new Date().toISOString();

    const hasContact = (merged.emails && merged.emails.length > 0) ||
                       (merged.linkedin && merged.linkedin.length > 0);

    if (!hasContact || confidenceScore < 0.4) {
      merged.confidence = "QUARANTINE";
      merged.quarantine_reason = !hasContact ? "no_contact" : "low_confidence";
      reviewQueue.push(merged);
    } else {
      merged.confidence = confidenceScore >= 0.5 ? "HIGH" : "MEDIUM";
      investors.push(merged);
    }
  }

  console.log(`Email verification: ${verifiedOk} valid, ${verifiedFail} invalid (of ${totalEmails})`);

  return { investors, reviewQueue };
}

function mergeRecords(group) {
  group.sort((a, b) => {
    const sA = (a.emails?.length || 0) * 10 + (a.linkedin?.length || 0) * 5 + (a.name ? 3 : 0) + (a.company_name ? 2 : 0);
    const sB = (b.emails?.length || 0) * 10 + (b.linkedin?.length || 0) * 5 + (b.name ? 3 : 0) + (b.company_name ? 2 : 0);
    return sB - sA;
  });

  const base = { ...group[0] };

  for (let i = 1; i < group.length; i++) {
    const r = group[i];
    base.emails = [...new Set([...(base.emails || []), ...(r.emails || [])])].slice(0, 5);
    base.linkedin = [...new Set([...(base.linkedin || []), ...(r.linkedin || [])])].slice(0, 5);
    base.sectors = [...new Set([...(base.sectors || []), ...(r.sectors || [])])];
    base.tags = [...new Set([...(base.tags || []), ...(r.tags || [])])];
    base.name = base.name || r.name;
    base.company_name = base.company_name || r.company_name;
    base.investor_type = base.investor_type || r.investor_type;
    base.region = base.region || r.region;
    base.hq_city = base.hq_city || r.hq_city;
    base.description = base.description || r.description;
    base.email_score = Math.max(base.email_score || 0, r.email_score || 0);
    base.linkedin_score = Math.max(base.linkedin_score || 0, r.linkedin_score || 0);
    base.investor_score = Math.max(base.investor_score || 0, r.investor_score || 0);
    base.is_fresh = base.is_fresh || r.is_fresh;
    base.latest_year = Math.max(base.latest_year || 0, r.latest_year || 0) || null;

    if (base.email_details && r.email_details) {
      const seen = new Set();
      base.email_details = [...base.email_details, ...r.email_details].filter(e => {
        if (seen.has(e.email)) return false;
        seen.add(e.email); return true;
      }).slice(0, 5);
    }
    if (base.linkedin_details && r.linkedin_details) {
      const seen = new Set();
      base.linkedin_details = [...base.linkedin_details, ...r.linkedin_details].filter(l => {
        if (seen.has(l.url)) return false;
        seen.add(l.url); return true;
      }).slice(0, 5);
    }
  }

  return base;
}

module.exports = { deduplicateInvestors, calculateConfidence, getBaseDomain, isRealPersonName, isSharedEmail };