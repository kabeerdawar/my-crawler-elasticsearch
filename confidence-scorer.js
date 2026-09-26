// confidence-scorer.js
// 🎯 Field-level confidence scoring + freshness decay

const SOURCE_SCORES = {
  "schema.org": 100,
  "mailto": 95,
  "og:site_name": 90,
  "linkedin/in": 85,
  "linkedin/company": 80,
  "body": 70,
  "pattern": 40,
  "snippet": 30,
  "unknown": 20
};

function scoreEmail(email, details = {}) {
  let score = 0;
  const source = details.source || "unknown";
  score += (SOURCE_SCORES[source] || 20) * 0.5;

  if (details.verified === true) score += 30;
  else if (details.status === "catch_all") score += 10;
  else if (details.status === "unknown") score += 5;

  if (details.source === "mailto") score += 20;
  else if (details.source === "body") score += 15;
  else if (details.pattern) {
    if (details.pattern === "{first}.{last}") score += 12;
    else if (details.pattern === "{f}{last}") score += 10;
    else if (details.pattern === "{first}") score += 8;
    else score += 5;
  }

  return Math.min(100, Math.round(score));
}

function scorePhone(phone, details = {}) {
  let score = 50;

  if (phone.startsWith("+91")) score += 20;
  else if (phone.startsWith("+")) score += 15;
  else if (phone.startsWith("0")) score += 10;

  if (details.source === "body") score += 20;
  else if (details.source === "schema.org") score += 25;

  return Math.min(100, Math.round(score));
}

function scoreCompanyName(name, source) {
  const scores = {
    "schema.org": 95,
    "og:site_name": 90,
    "title": 75,
    "h1": 50,
    "domain": 40
  };
  return scores[source] || 30;
}

function calculateFreshness(lastVerifiedDate) {
  if (!lastVerifiedDate) return 0;

  const now = Date.now();
  const last = new Date(lastVerifiedDate).getTime();
  const daysSince = Math.floor((now - last) / (1000 * 60 * 60 * 24));

  return Math.max(0, 100 - (daysSince * 2));
}

function calculateRecordConfidence(record) {
  const factors = [];
  let totalWeight = 0;
  let weightedScore = 0;

  if (record.emails && record.emails.length > 0) {
    const emailScores = (record.email_details || []).map(e => scoreEmail(e.email, e));
    const avgEmail = emailScores.length > 0
      ? emailScores.reduce((a, b) => a + b, 0) / emailScores.length
      : 0;
    factors.push({ field: "email", score: avgEmail, weight: 40 });
    totalWeight += 40;
    weightedScore += avgEmail * 40;
  }

  if (record.company_name) {
    const nameScore = record.company_name_source
      ? scoreCompanyName(record.company_name, record.company_name_source)
      : 60;
    factors.push({ field: "company_name", score: nameScore, weight: 25 });
    totalWeight += 25;
    weightedScore += nameScore * 25;
  }

  if (record.linkedin && record.linkedin.length > 0) {
    const liScore = record.linkedin.some(u => u.includes("/in/")) ? 90 : 70;
    factors.push({ field: "linkedin", score: liScore, weight: 20 });
    totalWeight += 20;
    weightedScore += liScore * 20;
  }

  if (record.phones && record.phones.length > 0) {
    const phoneScore = scorePhone(record.phones[0]);
    factors.push({ field: "phone", score: phoneScore, weight: 15 });
    totalWeight += 15;
    weightedScore += phoneScore * 15;
  }

  const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  let level = "LOW";
  if (score >= 70) level = "HIGH";
  else if (score >= 45) level = "MEDIUM";

  return {
    score,
    level,
    factors,
    freshness: calculateFreshness(record.last_verified_date)
  };
}

module.exports = {
  scoreEmail,
  scorePhone,
  scoreCompanyName,
  calculateFreshness,
  calculateRecordConfidence,
  SOURCE_SCORES
};