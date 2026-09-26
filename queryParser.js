// queryParser.js
// 🌍 Multi-Entity Query Parser — investors, wholesalers, suppliers, etc.

const REGION_KEYWORDS = {
  "USA": ["usa", "us", "united states", "america", "silicon valley", "bay area"],
  "Canada": ["canada", "canadian", "toronto", "vancouver"],
  "UK": ["uk", "united kingdom", "britain", "england", "london"],
  "Europe": ["europe", "european", "eu"],
  "Germany": ["germany", "german", "berlin", "munich"],
  "France": ["france", "french", "paris"],
  "Netherlands": ["netherlands", "dutch", "amsterdam"],
  "India": ["india", "indian", "delhi", "mumbai", "bangalore", "bengaluru", "chennai", "hyderabad", "pune", "punjab", "gujarat", "kolkata", "chandigarh", "amritsar", "ludhiana", "jalandhar"],
  "China": ["china", "chinese", "beijing", "shanghai"],
  "Japan": ["japan", "japanese", "tokyo"],
  "Korea": ["korea", "korean", "seoul"],
  "Singapore": ["singapore"],
  "SE Asia": ["southeast asia", "asean", "indonesia", "jakarta", "vietnam", "thailand", "philippines"],
  "Middle East": ["middle east", "mena", "uae", "dubai", "saudi", "israel", "tel aviv"],
  "Australia": ["australia", "sydney", "melbourne"],
  "Brazil": ["brazil", "são paulo", "sao paulo"],
  "Mexico": ["mexico", "mexico city"],
  "Africa": ["africa", "african", "nigeria", "kenya", "lagos", "nairobi"],
  "Global": ["global", "worldwide", "international"]
};

const CITY_KEYWORDS = [
  "delhi", "new delhi", "mumbai", "bangalore", "bengaluru", "chennai", "hyderabad", "pune", "kolkata", "punjab", "chandigarh", "amritsar", "ludhiana", "jalandhar",
  "san francisco", "new york", "boston", "seattle", "austin",
  "london", "manchester", "berlin", "munich", "paris", "amsterdam",
  "tokyo", "seoul", "beijing", "shanghai", "singapore", "jakarta",
  "dubai", "tel aviv", "sydney", "melbourne",
  "são paulo", "sao paulo", "mexico city", "lagos", "nairobi"
];

const SECTOR_KEYWORDS = {
  "AI": ["ai", "artificial intelligence", "machine learning", "ml"],
  "Fintech": ["fintech", "payments", "banking", "lending"],
  "HealthTech": ["healthtech", "medtech", "healthcare", "biotech"],
  "SaaS": ["saas", "software"],
  "E-commerce": ["ecommerce", "e-commerce", "retail", "marketplace"],
  "EdTech": ["edtech", "education"],
  "Climate": ["climate", "cleantech", "sustainability", "energy"],
  "Crypto": ["crypto", "blockchain", "web3"],
  "Gaming": ["gaming", "games"],
  "Space": ["space", "spacetech", "aerospace"],
  "Mobility": ["mobility", "transport", "logistics", "ev"],
  "AgriTech": ["agritech", "agriculture", "foodtech", "farming"],
  "DeepTech": ["deeptech", "robotics", "hardware", "semiconductor"],
  "Cybersecurity": ["cybersecurity", "security", "infosec"]
};

const STAGE_KEYWORDS = {
  "Pre-seed": ["pre-seed", "preseed", "pre seed"],
  "Seed": ["seed", "seed stage", "early stage", "early-stage"],
  "Series A": ["series a", "series-a"],
  "Series B": ["series b", "series-b"],
  "Growth": ["growth", "growth equity"]
};

const INVESTOR_TYPE_KEYWORDS = {
  "VC": ["vc", "vcs", "venture capital", "venture fund"],
  "Angel": ["angel", "angel investor", "angel investors"],
  "Family Office": ["family office", "family offices"],
  "Private Equity": ["private equity", "pe firm"],
  "Corporate VC": ["corporate venture", "cvc"],
  "Accelerator": ["accelerator", "incubator"]
};

// 🎯 Multi-entity type detection
const ENTITY_KEYWORDS = {
  "investor": [
    "investor", "investors", "vc", "vcs", "venture capital", "angel",
    "angel investor", "fund", "funds", "private equity", "family office",
    "seed fund", "capital"
  ],
  "wholesaler": [
    "wholesaler", "wholesalers", "wholesale", "bulk supplier",
    "bulk suppliers", "distributor", "distributors"
  ],
  "supplier": [
    "supplier", "suppliers", "vendor", "vendors", "provider", "providers"
  ],
  "manufacturer": [
    "manufacturer", "manufacturers", "factory", "factories",
    "producer", "producers", "manufacturing"
  ],
  "exporter": [
    "exporter", "exporters", "export house", "export company"
  ],
  "importer": [
    "importer", "importers", "import house", "import company"
  ],
  "dealer": [
    "dealer", "dealers", "retailer", "retailers", "shop", "store", "outlet"
  ],
  "service_provider": [
    "doctor", "doctors", "lawyer", "lawyers", "advocate", "advocates",
    "consultant", "consultants", "engineer", "engineers", "architect",
    "accountant", "ca", "teacher", "tutor", "clinic", "hospital",
    "salon", "gym", "restaurant", "hotel", "photographer"
  ]
};

function extractNumber(query) {
  const match = query.match(/\b(\d{1,4})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function extractSectors(lower) {
  const found = new Set();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    for (const k of keywords) {
      if (lower.includes(k)) { found.add(sector); break; }
    }
  }
  return [...found];
}

function extractStages(lower) {
  const found = new Set();
  for (const [stage, keywords] of Object.entries(STAGE_KEYWORDS)) {
    for (const k of keywords) {
      if (lower.includes(k)) { found.add(stage); break; }
    }
  }
  return [...found];
}

function extractInvestorTypes(lower) {
  const found = new Set();
  for (const [type, keywords] of Object.entries(INVESTOR_TYPE_KEYWORDS)) {
    for (const k of keywords) {
      if (lower.includes(k)) { found.add(type); break; }
    }
  }
  return [...found];
}

function extractRegion(lower) {
  for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
    for (const k of keywords) {
      const regex = new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
      if (regex.test(lower)) return region;
    }
  }
  return null;
}

function extractCity(lower) {
  for (const city of CITY_KEYWORDS) {
    if (lower.includes(city)) {
      return city.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }
  return null;
}

// 🎯 Entity type detection
function detectEntityType(lower) {
  // Check all types, return first match with most specific keyword
  let bestMatch = null;
  let bestLength = 0;
  
  for (const [type, keywords] of Object.entries(ENTITY_KEYWORDS)) {
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
      if (regex.test(lower) && kw.length > bestLength) {
        bestMatch = { type, keyword: kw };
        bestLength = kw.length;
      }
    }
  }
  
  return bestMatch || { type: "investor", keyword: null };
}

function parseQuery(raw) {
  const query = String(raw || "").trim();
  const lower = query.toLowerCase();

  const region = extractRegion(lower);
  const city = extractCity(lower);
  const sectors = extractSectors(lower);
  const stages = extractStages(lower);
  const investorTypes = extractInvestorTypes(lower);
  const limit = extractNumber(query);
  const entityType = detectEntityType(lower);

  const understood = Boolean(
    region || city || sectors.length || stages.length || 
    investorTypes.length || entityType.keyword
  );

  return {
    raw: query,
    region: region || null,
    city: city || null,
    sectors,
    stages,
    investorTypes: investorTypes.length ? investorTypes : 
      (entityType.type === "investor" ? ["VC"] : []),
    limit: limit || 100,
    entityType: entityType.type,
    entityKeyword: entityType.keyword,
    understood
  };
}

module.exports = { parseQuery };