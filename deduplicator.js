// deduplicator.js
// MyCrawler - multi-entity entity resolution
//
// Goals:
// - deterministic deduplication
// - strong identity matching
// - conservative fuzzy matching
// - preserve the richest record
// - merge provenance/evidence
// - prevent false merges between different people/entities

// ============================================================
// NORMALIZATION
// ============================================================

function normalizeText(str) {
  return String(str || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(str) {
  return normalizeText(str)
    .replace(/\b(mr|mrs|ms|miss|dr|prof)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompany(str) {
  return normalizeText(str)
    .replace(
      /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|plc)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(-10);
  }

  return digits;
}

function normalizeLinkedIn(url) {
  try {
    const parsed = new URL(String(url || "").trim());

    parsed.hash = "";
    parsed.search = "";

    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url || "")
      .trim()
      .toLowerCase()
      .replace(/\/$/, "");
  }
}

function normalizeDomain(url) {
  try {
    return new URL(url)
      .hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

// ============================================================
// ARRAY HELPERS
// ============================================================

function unique(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function mergeUniqueArrays(...arrays) {
  return unique(
    arrays.flatMap(arr => Array.isArray(arr) ? arr : [])
  );
}

function safeString(value) {
  return String(value || "").trim();
}

// ============================================================
// RECORD IDENTITY
// ============================================================

function getEmails(record) {
  return unique(
    (record.emails || [])
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

function getLinkedIns(record) {
  return unique(
    (record.linkedin || [])
      .map(normalizeLinkedIn)
      .filter(Boolean)
  );
}

function getPhones(record) {
  return unique(
    (record.phones || [])
      .map(normalizePhone)
      .filter(Boolean)
  );
}

function getCompany(record) {
  return normalizeCompany(record.company_name);
}

function getName(record) {
  return normalizeName(record.name);
}

function getCity(record) {
  return normalizeText(record.hq_city);

}

function getRegion(record) {
  return normalizeText(record.region);
}

function hasCompany(record) {
  return getCompany(record).length >= 2;
}

function hasName(record) {
  return getName(record).length >= 2;
}

function hasContact(record) {
  return (
    getEmails(record).length > 0 ||
    getLinkedIns(record).length > 0 ||
    getPhones(record).length > 0
  );
}

// ============================================================
// CANONICAL KEY
// ============================================================

function generateKey(record) {
  const emails = getEmails(record);

  if (emails.length > 0) {
    return `email:${emails[0]}`;
  }

  const linkedin = getLinkedIns(record);

  const personLinkedIn = linkedin.find(
    url => /linkedin\.com\/in\//i.test(url)
  );

  if (personLinkedIn) {
    return `linkedin-person:${personLinkedIn}`;
  }

  const companyLinkedIn = linkedin.find(
    url => /linkedin\.com\/company\//i.test(url)
  );

  if (companyLinkedIn && hasCompany(record)) {
    return `linkedin-company:${companyLinkedIn}`;
  }

  const company = getCompany(record);
  const city = getCity(record);
  const region = getRegion(record);
  const name = getName(record);

  if (name && company) {
    return `person:${name}|${company}`;
  }

  if (company && city) {
    return `company:${company}|city:${city}`;
  }

  if (company && region) {
    return `company:${company}|region:${region}`;
  }

  if (company) {
    return `company:${company}`;
  }

  if (name) {
    return `person:${name}`;
  }

  const source = safeString(record.source_url);

  if (source) {
    return `url:${source}`;
  }

  return `unresolved:${stableRecordSignature(record)}`;
}

// ============================================================
// STABLE FALLBACK SIGNATURE
// ============================================================

function stableRecordSignature(record) {
  const parts = [
    normalizeText(record.entity_type),
    normalizeText(record.investor_type),
    normalizeText(record.company_name),
    normalizeText(record.name),
    normalizeText(record.region),
    normalizeText(record.hq_city),
    normalizeDomain(record.source_url)
  ];

  return parts
    .filter(Boolean)
    .join("|");
}

// ============================================================
// EVIDENCE / QUALITY
// ============================================================

function recordQualityScore(record) {
  let score = 0;

  const company = getCompany(record);
  const name = getName(record);
  const emails = getEmails(record);
  const phones = getPhones(record);
  const linkedin = getLinkedIns(record);

  if (company) score += 3;
  if (name) score += 2;

  if (emails.length > 0) score += 5;
  if (phones.length > 0) score += 3;
  if (linkedin.length > 0) score += 4;

  if (record.evidence?.structured_data) {
    score += 4;
  }

  if ((record.sectors || []).length > 0) {
    score += 2;
  }

  if ((record.stages || []).length > 0) {
    score += 2;
  }

  if (record.thesis) {
    score += 2;
  }

  if (record.description && record.description.length >= 100) {
    score += 1;
  }

  const confidence = String(
    record.confidence || ""
  ).toUpperCase();

  if (confidence === "HIGH") score += 3;
  if (confidence === "MEDIUM") score += 1;

  return score;
}

function highestConfidence(a, b) {
  const order = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    "": 0
  };

  const aValue = order[String(a || "").toUpperCase()] || 0;
  const bValue = order[String(b || "").toUpperCase()] || 0;

  return aValue >= bValue
    ? (a || b || "LOW")
    : (b || a || "LOW");
}

// ============================================================
// FIELD MERGING
// ============================================================

function chooseBetterString(a, b, field) {
  const left = safeString(a);
  const right = safeString(b);

  if (!left) return right;
  if (!right) return left;

  if (left === right) return left;

  const fieldPriority = {
    company_name: true,
    name: true,
    description: true,
    thesis: true
  };

  if (fieldPriority[field]) {
    if (right.length > left.length && right.length <= 1000) {
      return right;
    }
  }

  return left;
}

function mergeEmailDetails(a, b) {
  const all = [
    ...(a || []),
    ...(b || [])
  ];

  const byEmail = new Map();

  for (const item of all) {
    if (!item || !item.email) continue;

    const key = normalizeEmail(item.email);

    const existing = byEmail.get(key);

    if (!existing) {
      byEmail.set(key, {
        ...item,
        email: key
      });
      continue;
    }

    byEmail.set(key, {
      ...existing,
      ...item,
      score: Math.max(
        existing.score || 0,
        item.score || 0
      ),
      weight: Math.max(
        existing.weight || 0,
        item.weight || 0
      ),
      candidate:
        Boolean(existing.candidate) &&
        Boolean(item.candidate)
    });
  }

  return [...byEmail.values()];
}

function mergeLinkedinDetails(a, b) {
  const all = [
    ...(a || []),
    ...(b || [])
  ];

  const byUrl = new Map();

  for (const item of all) {
    if (!item || !item.url) continue;

    const key = normalizeLinkedIn(item.url);

    const existing = byUrl.get(key);

    if (!existing) {
      byUrl.set(key, {
        ...item,
        url: key
      });
      continue;
    }

    byUrl.set(key, {
      ...existing,
      ...item,
      score: Math.max(
        existing.score || 0,
        item.score || 0
      )
    });
  }

  return [...byUrl.values()];
}

function mergeEvidence(a, b) {
  return {
    ...(a || {}),
    ...(b || {}),

    email_count: Math.max(
      a?.email_count || 0,
      b?.email_count || 0
    ),

    phone_count: Math.max(
      a?.phone_count || 0,
      b?.phone_count || 0
    ),

    linkedin_count: Math.max(
      a?.linkedin_count || 0,
      b?.linkedin_count || 0
    ),

    content_length: Math.max(
      a?.content_length || 0,
      b?.content_length || 0
    ),

    structured_data:
      Boolean(a?.structured_data) ||
      Boolean(b?.structured_data)
  };
}

function mergeProvenance(a, b) {
  return {
    ...(a || {}),
    ...(b || {})
  };
}

// ============================================================
// RECORD MERGE
// ============================================================

function mergeRecords(a, b) {
  const aQuality = recordQualityScore(a);
  const bQuality = recordQualityScore(b);

  const preferred =
    bQuality > aQuality ? b : a;

  const secondary =
    preferred === a ? b : a;

  const mergedEmails = mergeUniqueArrays(
    getEmails(a),
    getEmails(b)
  );

  const mergedPhones = mergeUniqueArrays(
    getPhones(a),
    getPhones(b)
  );

  const mergedLinkedIn = mergeUniqueArrays(
    getLinkedIns(a),
    getLinkedIns(b)
  );

  const mergedSources = mergeUniqueArrays(
    a.source_urls,
    b.source_urls,
    [a.source_url],
    [b.source_url]
  );

  const result = {
    ...secondary,
    ...preferred,

    name: chooseBetterString(
      preferred.name,
      secondary.name,
      "name"
    ),

    company_name: chooseBetterString(
      preferred.company_name,
      secondary.company_name,
      "company_name"
    ),

    investor_type:
      preferred.investor_type ||
      secondary.investor_type ||
      "",

    region:
      preferred.region ||
      secondary.region ||
      "",

    hq_city:
      preferred.hq_city ||
      secondary.hq_city ||
      null,

    sectors: mergeUniqueArrays(
      a.sectors,
      b.sectors
    ),

    stages: mergeUniqueArrays(
      a.stages,
      b.stages
    ),

    tags: mergeUniqueArrays(
      a.tags,
      b.tags
    ),

    portfolio: mergeUniqueArrays(
      a.portfolio,
      b.portfolio
    ),

    thesis: chooseBetterString(
      preferred.thesis,
      secondary.thesis,
      "thesis"
    ),

    emails: mergedEmails,

    email_candidates: mergeUniqueArrays(
      a.email_candidates,
      b.email_candidates
    ),

    email_details: mergeEmailDetails(
      a.email_details,
      b.email_details
    ),

    email_score: Math.max(
      a.email_score || 0,
      b.email_score || 0
    ),

    linkedin: mergedLinkedIn,

    linkedin_details: mergeLinkedinDetails(
      a.linkedin_details,
      b.linkedin_details
    ),

    linkedin_score: Math.max(
      a.linkedin_score || 0,
      b.linkedin_score || 0
    ),

    phones: mergedPhones,

    latest_year:
      preferred.latest_year ||
      secondary.latest_year ||
      null,

    is_fresh:
      Boolean(a.is_fresh) ||
      Boolean(b.is_fresh),

    description: chooseBetterString(
      preferred.description,
      secondary.description,
      "description"
    ),

    website:
      preferred.website ||
      secondary.website ||
      "",

    source_url:
      preferred.source_url ||
      secondary.source_url ||
      "",

    source_urls: mergedSources,

    investor_score: Math.max(
      a.investor_score || 0,
      b.investor_score || 0
    ),

    confidence: highestConfidence(
      a.confidence,
      b.confidence
    ),

    status_code:
      preferred.status_code ||
      secondary.status_code ||
      null,

    crawl_type:
      preferred.crawl_type ||
      secondary.crawl_type ||
      "",

    crawl_query:
      preferred.crawl_query ||
      secondary.crawl_query ||
      "",

    entity_type:
      preferred.entity_type ||
      secondary.entity_type ||
      "investor",

    extraction_version:
      preferred.extraction_version ||
      secondary.extraction_version ||
      "",

    extracted_at:
      preferred.extracted_at ||
      secondary.extracted_at ||
      null,

    evidence: mergeEvidence(
      a.evidence,
      b.evidence
    ),

    field_provenance: mergeProvenance(
      a.field_provenance,
      b.field_provenance
    )
  };

  result.email_score = result.email_details.reduce(
    (sum, item) =>
      sum + (item.candidate ? 0 : item.score || 0),
    0
  );

  result.linkedin_score =
    result.linkedin_details.reduce(
      (sum, item) =>
        sum + (item.score || 0),
      0
    );

  return result;
}

// ============================================================
// ENTITY MATCHING
// ============================================================

function arraysIntersect(a, b) {
  const setB = new Set(b);

  return a.some(value => setB.has(value));
}

function sameCompany(a, b) {
  const ca = getCompany(a);
  const cb = getCompany(b);

  return Boolean(ca && cb && ca === cb);
}

function samePerson(a, b) {
  const na = getName(a);
  const nb = getName(b);

  return Boolean(na && nb && na === nb);
}

function sameCity(a, b) {
  const ca = getCity(a);
  const cb = getCity(b);

  return Boolean(ca && cb && ca === cb);
}

function sameRegion(a, b) {
  const ra = getRegion(a);
  const rb = getRegion(b);

  return Boolean(ra && rb && ra === rb);
}

function sameDomain(a, b) {
  const da = normalizeDomain(a.source_url);
  const db = normalizeDomain(b.source_url);

  return Boolean(da && db && da === db);
}

function isSameEntity(a, b) {
  // ----------------------------------------------------------
  // 1. Exact email = very strong
  // ----------------------------------------------------------

  const aEmails = getEmails(a);
  const bEmails = getEmails(b);

  if (
    aEmails.length > 0 &&
    bEmails.length > 0 &&
    arraysIntersect(aEmails, bEmails)
  ) {
    return {
      match: true,
      reason: "shared_email",
      score: 100
    };
  }

  // ----------------------------------------------------------
  // 2. Exact person LinkedIn = extremely strong
  // ----------------------------------------------------------

  const aLinkedIn = getLinkedIns(a);
  const bLinkedIn = getLinkedIns(b);

  const sharedLinkedIn =
    aLinkedIn.length > 0 &&
    bLinkedIn.length > 0 &&
    aLinkedIn.find(x => bLinkedIn.includes(x));

  if (sharedLinkedIn) {
    return {
      match: true,
      reason: "shared_linkedin",
      score: 95
    };
  }

  // ----------------------------------------------------------
  // 3. Exact person + company
  // ----------------------------------------------------------

  if (
    samePerson(a, b) &&
    sameCompany(a, b)
  ) {
    return {
      match: true,
      reason: "same_person_company",
      score: 90
    };
  }

  // ----------------------------------------------------------
  // 4. Same company + same city
  // ----------------------------------------------------------

  if (
    sameCompany(a, b) &&
    sameCity(a, b)
  ) {
    return {
      match: true,
      reason: "same_company_city",
      score: 85
    };
  }

  // ----------------------------------------------------------
  // 5. Same company + same region
  // ----------------------------------------------------------

  if (
    sameCompany(a, b) &&
    sameRegion(a, b)
  ) {
    return {
      match: true,
      reason: "same_company_region",
      score: 78
    };
  }

  // ----------------------------------------------------------
  // 6. Same company + same domain
  //
  // This is intentionally NOT sufficient by itself.
  // ----------------------------------------------------------

  if (
    sameCompany(a, b) &&
    sameDomain(a, b)
  ) {
    return {
      match: true,
      reason: "same_company_domain",
      score: 72
    };
  }

  // ----------------------------------------------------------
  // 7. Same company with strong structured evidence
  // ----------------------------------------------------------

  if (
    sameCompany(a, b) &&
    Boolean(a.evidence?.structured_data) &&
    Boolean(b.evidence?.structured_data)
  ) {
    return {
      match: true,
      reason: "same_company_structured",
      score: 75
    };
  }

  // ----------------------------------------------------------
  // Do NOT merge same-domain records without identity.
  // This protects team pages, portfolio pages, and multiple
  // people at the same firm from becoming one person.
  // ----------------------------------------------------------

  return {
    match: false,
    reason: "insufficient_identity_evidence",
    score: 0
  };
}

// ============================================================
// GROUP MERGING
// ============================================================

function mergeGroup(group) {
  if (!group.length) return null;

  const sorted = [...group].sort(
    (a, b) =>
      recordQualityScore(b) -
      recordQualityScore(a)
  );

  let result = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    result = mergeRecords(
      result,
      sorted[i]
    );
  }

  return result;
}

function mergeMatchingGroups(groups) {
  const output = [];
  const consumed = new Set();

  for (let i = 0; i < groups.length; i++) {
    if (consumed.has(i)) continue;

    let current = groups[i];

    for (let j = i + 1; j < groups.length; j++) {
      if (consumed.has(j)) continue;

      const result = isSameEntity(
        current,
        groups[j]
      );

      if (!result.match) continue;

      current = mergeRecords(
        current,
        groups[j]
      );

      consumed.add(j);
    }

    consumed.add(i);

    output.push(current);
  }

  return output;
}

// ============================================================
// REVIEW QUEUE
// ============================================================

function getReviewReason(record) {
  const reasons = [];

  if (!hasCompany(record)) {
    reasons.push("missing company");
  }

  if (!hasName(record) && !hasCompany(record)) {
    reasons.push("missing identity");
  }

  if (!hasContact(record)) {
    reasons.push("missing contact");
  }

  if (
    !record.description &&
    !(record.sectors || []).length &&
    !(record.stages || []).length
  ) {
    reasons.push("weak business evidence");
  }

  if (
    record.confidence === "LOW"
  ) {
    reasons.push("low confidence");
  }

  return reasons.length
    ? reasons.join("; ")
    : "requires manual review";
}

// ============================================================
// MAIN DEDUPLICATOR
// ============================================================

async function deduplicateInvestors(records) {
  if (
    !Array.isArray(records) ||
    records.length === 0
  ) {
    return {
      investors: [],
      reviewQueue: []
    };
  }

  console.log(
    `Deduplicating ${records.length} records...`
  );

  // ----------------------------------------------------------
  // Step 1: Remove null/invalid records
  // ----------------------------------------------------------

  const validRecords = records.filter(
    record =>
      record &&
      typeof record === "object"
  );

  // ----------------------------------------------------------
  // Step 2: Exact-key grouping
  // ----------------------------------------------------------

  const groups = new Map();

  for (const record of validRecords) {
    const key = generateKey(record);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(record);
  }

  console.log(
    `Initial identity groups: ${groups.size}`
  );

  // ----------------------------------------------------------
  // Step 3: Merge records inside exact groups
  // ----------------------------------------------------------

  const mergedGroups = [];

  for (const group of groups.values()) {
    const merged = mergeGroup(group);

    if (merged) {
      mergedGroups.push(merged);
    }
  }

  // ----------------------------------------------------------
  // Step 4: Conservative cross-group matching
  // ----------------------------------------------------------

  const finalRecords =
    mergeMatchingGroups(mergedGroups);

  // ----------------------------------------------------------
  // Step 5: Final quality classification
  // ----------------------------------------------------------

  const investors = [];
  const reviewQueue = [];

  for (const record of finalRecords) {
    const score = recordQualityScore(record);

    const hasContactInfo =
      hasContact(record);

    const hasIdentity =
      hasName(record) ||
      hasCompany(record);

    const hasBusinessEvidence =
      (record.sectors || []).length > 0 ||
      (record.stages || []).length > 0 ||
      Boolean(record.thesis) ||
      Boolean(record.evidence?.structured_data);

    const isHighQuality =
      hasIdentity &&
      (
        hasContactInfo ||
        hasBusinessEvidence
      );

    if (isHighQuality) {
      if (
        !record.confidence ||
        record.confidence === "LOW"
      ) {
        record.confidence =
          hasContactInfo
            ? "MEDIUM"
            : "LOW";
      }

      record.dedup_score = score;

      investors.push(record);
    } else {
      record.review_reason =
        getReviewReason(record);

      record.dedup_score = score;

      reviewQueue.push(record);
    }
  }

  console.log(
    `Final entities: ${investors.length}`
  );

  console.log(
    `Review queue: ${reviewQueue.length}`
  );

  console.log(
    `HIGH: ${
      investors.filter(
        r => r.confidence === "HIGH"
      ).length
    }`
  );

  console.log(
    `MEDIUM: ${
      investors.filter(
        r => r.confidence === "MEDIUM"
      ).length
    }`
  );

  console.log(
    `LOW: ${
      investors.filter(
        r => r.confidence === "LOW"
      ).length
    }`
  );

  return {
    investors,
    reviewQueue
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  deduplicateInvestors,
  generateKey,
  mergeRecords,
  isSameEntity,
  recordQualityScore
};