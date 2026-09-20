// discovery.js
const fs = require("fs");
const path = require("path");

const SEED_PATH = path.join(__dirname, "data", "seed-domains.json");

const HIGH_AUTHORITY = [
  "startupindia.gov.in","sebi.gov.in","startupsforall.in","ynos.in","data.gov.in","msme.gov.in",
  "nvca.org","vcdir.com","investorhunt.co","openvc.app","signal.nfx.com","northdata.com"
];

function loadSeedDomains() {
  try {
    const raw = fs.readFileSync(SEED_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  } catch (error) {
    console.error("Could not load seed-domains.json:", error.message);
    return [];
  }
}

function scoreSeed(seed, query) {
  let score = 0;
  const reasons = [];

  if (query.city) {
    const seedHq = (seed.hq_city || "").toLowerCase();
    const qCity = query.city.toLowerCase();
    if (seedHq !== qCity) return { score: -999, reasons: [`not in ${query.city}`] };
    score += 6;
    reasons.push(`hq=${query.city}`);
  }

  if (query.region) {
    if (seed.region === query.region) { score += 5; reasons.push(`region=${seed.region}`); }
    else if (seed.region === "Global") { score += 2; reasons.push("region=Global"); }
    else { score -= 3; }
  }

  if (query.sectors && query.sectors.length) {
    const overlap = (seed.sectors || []).filter(s => query.sectors.includes(s));
    if (overlap.length) { score += 3 * overlap.length; reasons.push(`sectors=${overlap.join(",")}`); }
  }

  if (query.stages && query.stages.length) {
    const overlap = (seed.stages || []).filter(s => query.stages.includes(s));
    if (overlap.length) { score += 2 * overlap.length; reasons.push(`stages=${overlap.join(",")}`); }
  }

  if (query.investorTypes && query.investorTypes.length) {
    if (query.investorTypes.includes(seed.type)) { score += 2; reasons.push(`type=${seed.type}`); }
  }

  if (HIGH_AUTHORITY.includes(seed.domain)) { score += 4; reasons.push("high-authority source"); }

  return { score, reasons };
}

function discoverSources(query, options = {}) {
  const minScore = options.minScore ?? 1;
  const maxSources = options.maxSources ?? 100;

  const seeds = loadSeedDomains();
  if (seeds.length === 0) return { query, sources: [], message: "No seed domains loaded." };

  const scored = seeds.map(seed => {
    const { score, reasons } = scoreSeed(seed, query);
    return {
      domain: seed.domain,
      url: "https://" + seed.domain.replace(/^https?:\/\//, ""),
      type: seed.type,
      region: seed.region,
      hq_city: seed.hq_city || null,
      cities: seed.cities || [],
      sectors: seed.sectors || [],
      stages: seed.stages || [],
      score,
      reasons
    };
  });

  const filtered = scored
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSources);

  return {
    query,
    totalConsidered: seeds.length,
    totalMatched: filtered.length,
    sources: filtered
  };
}

module.exports = { discoverSources, loadSeedDomains };