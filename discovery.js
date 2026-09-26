// discovery.js
const fs = require("fs");
const path = require("path");

let SEED_DOMAINS = [];

function loadSeedDomains() {
  try {
    const p = path.join(__dirname, "data", "seed-domains.json");
    if (!fs.existsSync(p)) {
      console.log(`⚠️  seed-domains.json not found at: ${p}`);
      return [];
    }
    SEED_DOMAINS = JSON.parse(fs.readFileSync(p, "utf8"));
    console.log(`✅ Loaded ${SEED_DOMAINS.length} seed domains`);
    return SEED_DOMAINS;
  } catch (err) {
    console.error("Failed to load seed domains:", err.message);
    return [];
  }
}

const ENTITY_DIRECTORIES = {
  investor: [
    { domain: "crunchbase.com", url: "https://www.crunchbase.com", region: "Global", hq_city: null, reasons: ["investor directory"] },
    { domain: "dealroom.co", url: "https://dealroom.co", region: "Global", hq_city: null, reasons: ["investor directory"] },
    { domain: "signal.nfx.com", url: "https://signal.nfx.com", region: "Global", hq_city: null, reasons: ["VC directory"] }
  ],
  wholesaler: [
    { domain: "indiamart.com", url: "https://www.indiamart.com", region: "India", hq_city: null, reasons: ["wholesale directory"] },
    { domain: "tradeindia.com", url: "https://www.tradeindia.com", region: "India", hq_city: null, reasons: ["wholesale directory"] }
  ],
  supplier: [
    { domain: "indiamart.com", url: "https://www.indiamart.com", region: "India", hq_city: null, reasons: ["supplier directory"] },
    { domain: "tradeindia.com", url: "https://www.tradeindia.com", region: "India", hq_city: null, reasons: ["supplier directory"] }
  ],
  manufacturer: [
    { domain: "indiamart.com", url: "https://www.indiamart.com", region: "India", hq_city: null, reasons: ["manufacturer directory"] },
    { domain: "thomasnet.com", url: "https://www.thomasnet.com", region: "USA", hq_city: null, reasons: ["US manufacturer directory"] }
  ],
  exporter: [
    { domain: "exportersindia.com", url: "https://www.exportersindia.com", region: "India", hq_city: null, reasons: ["exporter directory"] }
  ],
  importer: [
    { domain: "tradeindia.com", url: "https://www.tradeindia.com", region: "India", hq_city: null, reasons: ["importer directory"] }
  ],
  dealer: [
    { domain: "justdial.com", url: "https://www.justdial.com", region: "India", hq_city: null, reasons: ["business directory"] }
  ],
  service_provider: [
    { domain: "justdial.com", url: "https://www.justdial.com", region: "India", hq_city: null, reasons: ["services directory"] },
    { domain: "sulekha.com", url: "https://www.sulekha.com", region: "India", hq_city: null, reasons: ["services directory"] }
  ]
};

function matchRegion(seed, parsed) {
  if (!parsed.region) return true;
  if (!seed.region) return true;
  return seed.region.toLowerCase() === parsed.region.toLowerCase();
}

function matchCity(seed, parsed) {
  if (!parsed.city) return true;
  if (!seed.cities || seed.cities.length === 0) return true;
  return seed.cities.some(c => c.toLowerCase().includes(parsed.city.toLowerCase()));
}

function scoreSeed(seed, parsed) {
  let score = 0;
  const reasons = [];

  if (matchRegion(seed, parsed)) { score += 5; reasons.push(`region=${parsed.region}`); }
  if (matchCity(seed, parsed)) { score += 5; reasons.push(`city=${parsed.city}`); }

  return { score, reasons };
}

function discoverSources(parsed) {
  loadSeedDomains();

  const entityType = parsed.entityType || "investor";
  const sources = [];
  const seen = new Set();

  console.log(`🔍 Discovering sources for entity: ${entityType}`);

  const directories = ENTITY_DIRECTORIES[entityType] || ENTITY_DIRECTORIES.investor;
  for (const dir of directories) {
    if (!seen.has(dir.domain)) {
      seen.add(dir.domain);
      sources.push({
        domain: dir.domain,
        url: dir.url,
        type: entityType,
        region: dir.region || parsed.region || "",
        hq_city: dir.hq_city,
        sectors: [],
        stages: [],
        score: 8,
        reasons: dir.reasons || ["directory"]
      });
    }
  }

  if (entityType === "investor") {
    for (const seed of SEED_DOMAINS) {
      if (seen.has(seed.domain)) continue;
      if (!matchRegion(seed, parsed)) continue;
      if (!matchCity(seed, parsed)) continue;

      const { score, reasons } = scoreSeed(seed, parsed);
      if (score >= 5) {
        seen.add(seed.domain);
        sources.push({
          domain: seed.domain,
          url: `https://${seed.domain}`,
          type: "VC",
          region: seed.region || "",
          hq_city: seed.hq_city || null,
          cities: seed.cities || [],
          sectors: [],
          stages: [],
          score,
          reasons: reasons.length ? reasons : ["seed domain"]
        });
      }
    }
  }

  sources.sort((a, b) => b.score - a.score);

  console.log(`   → Found ${sources.length} sources`);

  return {
    sources,
    totalConsidered: SEED_DOMAINS.length,
    totalMatched: sources.length
  };
}

module.exports = { discoverSources, loadSeedDomains };