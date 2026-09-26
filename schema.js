// schema.js
// 🎯 Multi-entity validation with explainable confidence scoring

// ---------- HELPERS ----------
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 100) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

function cleanString(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cleanArray(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(Boolean).map(v => cleanString(v)))];
}

// ---------- SOURCE RELIABILITY ----------
function getSourceReliability(url) {
  if (!url) return 30;
  const u = String(url).toLowerCase();
  
  // Government
  if (/\.gov(\.|$|\/)/.test(u) || /\.gov\.in/.test(u) || /\.nic\.in/.test(u)) return 100;
  
  // Academic
  if (/\.edu(\.|$|\/)/.test(u) || /\.ac\.in/.test(u)) return 90;
  
  // Official company sites (no known directory)
  if (!/crunchbase|dealroom|linkedin|twitter|facebook|wikipedia|medium|reddit|quora/i.test(u)) return 80;
  
  // Known directories
  if (/crunchbase\.com/.test(u)) return 75;
  if (/dealroom\.co/.test(u)) return 75;
  if (/signal\.nfx\.com/.test(u)) return 75;
  
  // Social
  if (/linkedin\.com/.test(u)) return 70;
  if (/twitter\.com|x\.com/.test(u)) return 60;
  
  // News / Blog
  if (/techcrunch|yourstory|inc42|entrackr|economictimes|livemint/i.test(u)) return 50;
  if (/medium\.com|blogspot|wordpress\.com/i.test(u)) return 40;
  
  // Default
  return 50;
}

// ---------- CONFIDENCE SCORING ----------
function calculateConfidence(record) {
  const breakdown = [];
  let score = 0;

  // 1. Source Reliability (max 30 points)
  const sourceScore = getSourceReliability(record.source_url);
  const sourceContribution = Math.round((sourceScore / 100) * 30);
  score += sourceContribution;
  breakdown.push({
    factor: "source_reliability",
    value: sourceScore,
    contribution: sourceContribution,
    max: 30
  });

  // 2. Contact Completeness (max 25 points)
  let contactScore = 0;
  if (record.emails && record.emails.length > 0) contactScore += 10;
  if (record.linkedin && record.linkedin.length > 0) contactScore += 8;
  if (record.phones && record.phones.length > 0) contactScore += 7;
  const contactContribution = Math.min(25, contactScore);
  score += contactContribution;
  breakdown.push({
    factor: "contact_completeness",
    value: contactScore,
    contribution: contactContribution,
    max: 25
  });

  // 3. Cross-Source Count (max 20 points)
  const sourceCount = (record.source_urls || [record.source_url]).filter(Boolean).length;
  const crossContribution = Math.min(20, sourceCount * 7);
  score += crossContribution;
  breakdown.push({
    factor: "cross_source_count",
    value: sourceCount,
    contribution: crossContribution,
    max: 20
  });

  // 4. Email Verification Status (max 15 points)
  const emailDetails = record.email_details || [];
  let verificationScore = 0;
  if (emailDetails.some(e => e.verified === true)) verificationScore = 15;
  else if (emailDetails.some(e => e.source === "mailto" || e.source === "body")) verificationScore = 10;
  else if (emailDetails.some(e => e.source === "pattern")) verificationScore = 5;
  score += verificationScore;
  breakdown.push({
    factor: "email_verification",
    value: verificationScore,
    contribution: verificationScore,
    max: 15
  });

  // 5. Field Richness (max 10 points)
  let richnessScore = 0;
  if (record.company_name && record.company_name.length > 2) richnessScore += 3;
  if (record.region || record.hq_city) richnessScore += 3;
  if (record.sectors && record.sectors.length > 0) richnessScore += 2;
  if (record.description && record.description.length > 50) richnessScore += 2;
  score += richnessScore;
  breakdown.push({
    factor: "field_richness",
    value: richnessScore,
    contribution: richnessScore,
    max: 10
  });

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Assign confidence level
  let level = "LOW";
  if (score >= 70) level = "HIGH";
  else if (score >= 45) level = "MEDIUM";

  return {
    confidence_score: score,
    confidence: level,
    confidence_breakdown: breakdown
  };
}

// ---------- FRESHNESS SCORING ----------
function calculateFreshness(record) {
  const now = Date.now();
  const lastVerified = record.last_verified_date 
    ? new Date(record.last_verified_date).getTime()
    : (record.discovery_date ? new Date(record.discovery_date).getTime() : now);
  
  const daysSince = Math.floor((now - lastVerified) / (1000 * 60 * 60 * 24));
  
  // Freshness drops 2 points per day, min 0
  const freshnessScore = Math.max(0, 100 - (daysSince * 2));
  
  let freshnessLabel = "STALE";
  if (freshnessScore >= 80) freshnessLabel = "FRESH";
  else if (freshnessScore >= 50) freshnessLabel = "RECENT";
  else if (freshnessScore >= 20) freshnessLabel = "OLD";
  
  return {
    freshness_score: freshnessScore,
    freshness_label: freshnessLabel,
    days_since_verified: daysSince
  };
}

// ---------- VALIDATE RECORD ----------
function validateRecord(record) {
  if (!record || typeof record !== "object") {
    return { valid: false, reason: "not an object" };
  }

  const cleaned = { ...record };

  // Clean strings
  cleaned.name = cleanString(record.name);
  cleaned.company_name = cleanString(record.company_name);
  cleaned.investor_type = cleanString(record.investor_type);
  cleaned.region = cleanString(record.region);
  cleaned.hq_city = record.hq_city ? cleanString(record.hq_city) : null;
  cleaned.thesis = cleanString(record.thesis);
  cleaned.description = cleanString(record.description);
  cleaned.website = cleanString(record.website);
  cleaned.source_url = cleanString(record.source_url);
  cleaned.entity_type = cleanString(record.entity_type) || "investor";

  // Clean arrays
  cleaned.sectors = cleanArray(record.sectors);
  cleaned.tags = cleanArray(record.tags);
  cleaned.portfolio = cleanArray(record.portfolio);
  cleaned.linkedin = cleanArray(record.linkedin);
  cleaned.phones = cleanArray(record.phones);

  // 🎯 Evidence URLs — deduplicate and clean
  cleaned.source_urls = cleanArray(record.source_urls || [record.source_url]);

  // Clean emails
  let emails = [];
  if (Array.isArray(record.emails)) {
    emails = record.emails.filter(isValidEmail).map(e => e.toLowerCase());
  } else if (typeof record.emails === "string") {
    emails = record.emails.split(/[,\s;]+/).filter(isValidEmail).map(e => e.toLowerCase());
  }
  cleaned.emails = [...new Set(emails)];

  // Email details
  if (Array.isArray(record.email_details)) {
    cleaned.email_details = record.email_details.filter(e => e && isValidEmail(e.email));
  } else {
    cleaned.email_details = cleaned.emails.map(e => ({
      email: e, source: "unknown", weight: 3, score: 3
    }));
  }
  cleaned.email_score = cleaned.email_details.reduce((sum, e) => sum + (e.score || 0), 0);

  // LinkedIn details
  if (Array.isArray(record.linkedin_details)) {
    cleaned.linkedin_details = record.linkedin_details.filter(l => l && l.url);
  } else {
    cleaned.linkedin_details = cleaned.linkedin.map(u => ({ url: u, score: 3 }));
  }
  cleaned.linkedin_score = cleaned.linkedin_details.reduce((sum, l) => sum + (l.score || 0), 0);

  // Numbers
  cleaned.investor_score = Number(record.investor_score) || 0;
  cleaned.status_code = Number(record.status_code) || null;
  cleaned.latest_year = Number(record.latest_year) || null;

  // Booleans
  cleaned.is_fresh = Boolean(record.is_fresh);

  // Dates
  cleaned.discovery_date = record.discovery_date || new Date().toISOString();
  cleaned.last_verified_date = record.last_verified_date || new Date().toISOString();

  // 🎯 Calculate scores
  const confidenceData = calculateConfidence(cleaned);
  cleaned.confidence_score = confidenceData.confidence_score;
  cleaned.confidence = confidenceData.confidence;
  cleaned.confidence_breakdown = confidenceData.confidence_breakdown;

  const freshnessData = calculateFreshness(cleaned);
  cleaned.freshness_score = freshnessData.freshness_score;
  cleaned.freshness_label = freshnessData.freshness_label;
  cleaned.days_since_verified = freshnessData.days_since_verified;

  // 🎯 Minimum requirement
  const hasIdentifier = 
    (cleaned.name && cleaned.name.length > 2) ||
    (cleaned.company_name && cleaned.company_name.length > 2) ||
    (cleaned.emails && cleaned.emails.length > 0);

  if (!hasIdentifier) {
    return { valid: false, reason: "no name/company/email" };
  }

  return { valid: true, record: cleaned };
}

function validateMany(records) {
  if (!Array.isArray(records)) {
    return { valid: [], invalidCount: 0 };
  }

  const valid = [];
  let invalidCount = 0;

  for (const record of records) {
    const result = validateRecord(record);
    if (result.valid) {
      valid.push(result.record);
    } else {
      invalidCount++;
    }
  }

  return { valid, invalidCount };
}

module.exports = { validateRecord, validateMany, isValidEmail, getSourceReliability };