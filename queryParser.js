// queryParser.js
const REGION_ALIASES = {
  "usa":"USA","us":"USA","america":"USA","united states":"USA","american":"USA",
  "india":"India","indian":"India","bharat":"India",
  "uk":"UK","united kingdom":"UK","britain":"UK","england":"UK",
  "europe":"Europe","european":"Europe","germany":"Europe","france":"Europe",
  "netherlands":"Europe","spain":"Europe","italy":"Europe","sweden":"Europe","ireland":"Europe",
  "middle east":"Middle_East","uae":"Middle_East","saudi":"Middle_East","israel":"Middle_East",
  "southeast asia":"Southeast_Asia","singapore":"Southeast_Asia","indonesia":"Southeast_Asia",
  "malaysia":"Southeast_Asia","thailand":"Southeast_Asia","vietnam":"Southeast_Asia",
  "japan":"East_Asia","china":"East_Asia","korea":"East_Asia",
  "latin america":"Latin_America","latam":"Latin_America","brazil":"Latin_America","mexico":"Latin_America",
  "africa":"Africa","nigeria":"Africa","kenya":"Africa","south africa":"Africa","egypt":"Africa"
};

const SECTOR_ALIASES = {
  "ai":"AI","artificial intelligence":"AI","machine learning":"AI","generative ai":"AI","genai":"AI",
  "saas":"SaaS","software":"SaaS","software as a service":"SaaS",
  "fintech":"FinTech","financial technology":"FinTech","payments":"FinTech",
  "healthcare":"Healthcare","health tech":"Healthcare","healthtech":"Healthcare","biotech":"Healthcare",
  "edtech":"EdTech","education":"EdTech",
  "climate":"ClimateTech","climate tech":"ClimateTech","climatetech":"ClimateTech","cleantech":"ClimateTech",
  "cybersecurity":"Cybersecurity","cyber security":"Cybersecurity",
  "ecommerce":"ECommerce","e-commerce":"ECommerce","marketplace":"ECommerce",
  "consumer":"Consumer",
  "deep tech":"DeepTech","deeptech":"DeepTech",
  "agritech":"AgriTech","agriculture":"AgriTech",
  "mobility":"Mobility","ev":"Mobility",
  "space":"SpaceTech","spacetech":"SpaceTech",
  "msme":"MSME","small business":"MSME","sme":"MSME"
};

const STAGE_ALIASES = {
  "pre-seed":"Pre-Seed","preseed":"Pre-Seed","pre seed":"Pre-Seed",
  "seed":"Seed",
  "early stage":"Early Stage","early-stage":"Early Stage",
  "series a":"Series A","series-a":"Series A",
  "series b":"Series B","series-b":"Series B"
};

const TYPE_ALIASES = {
  "vc":"Venture Capital","venture capital":"Venture Capital",
  "angel":"Angel Investor","angel investor":"Angel Investor","angels":"Angel Investor",
  "family office":"Family Fund","family fund":"Family Fund",
  "private equity":"Private Equity","pe":"Private Equity",
  "hni":"HNI","high net worth":"HNI"
};

const CITY_ALIASES = {
  "san francisco":"San Francisco","sf":"San Francisco","bay area":"San Francisco","silicon valley":"San Francisco",
  "new york":"New York","nyc":"New York","boston":"Boston","los angeles":"Los Angeles",
  "austin":"Austin","seattle":"Seattle","chicago":"Chicago","denver":"Denver","miami":"Miami",
  "washington dc":"Washington DC",
  "delhi":"Delhi","new delhi":"Delhi","ncr":"Delhi","noida":"Delhi","gurgaon":"Delhi","gurugram":"Delhi",
  "mumbai":"Mumbai","bombay":"Mumbai",
  "bangalore":"Bangalore","bengaluru":"Bangalore",
  "hyderabad":"Hyderabad","chennai":"Chennai","pune":"Pune",
  "ahmedabad":"Ahmedabad","kolkata":"Kolkata","jaipur":"Jaipur","chandigarh":"Chandigarh",
  "london":"London","manchester":"Manchester","edinburgh":"Edinburgh",
  "berlin":"Berlin","munich":"Munich","paris":"Paris","amsterdam":"Amsterdam",
  "stockholm":"Stockholm","dublin":"Dublin","madrid":"Madrid","barcelona":"Barcelona",
  "dubai":"Dubai","abu dhabi":"Abu Dhabi","riyadh":"Riyadh","tel aviv":"Tel Aviv",
  "singapore":"Singapore","jakarta":"Jakarta","kuala lumpur":"Kuala Lumpur","bangkok":"Bangkok",
  "tokyo":"Tokyo","hong kong":"Hong Kong","shanghai":"Shanghai","seoul":"Seoul",
  "sao paulo":"Sao Paulo","mexico city":"Mexico City","buenos aires":"Buenos Aires",
  "lagos":"Lagos","nairobi":"Nairobi","cape town":"Cape Town"
};

const CITY_TO_REGION = {
  "San Francisco":"USA","New York":"USA","Boston":"USA","Los Angeles":"USA","Austin":"USA",
  "Seattle":"USA","Chicago":"USA","Denver":"USA","Miami":"USA","Washington DC":"USA",
  "Delhi":"India","Mumbai":"India","Bangalore":"India","Hyderabad":"India","Chennai":"India",
  "Pune":"India","Ahmedabad":"India","Kolkata":"India","Jaipur":"India","Chandigarh":"India",
  "London":"UK","Manchester":"UK","Edinburgh":"UK",
  "Berlin":"Europe","Munich":"Europe","Paris":"Europe","Amsterdam":"Europe","Stockholm":"Europe",
  "Dublin":"Europe","Madrid":"Europe","Barcelona":"Europe",
  "Dubai":"Middle_East","Abu Dhabi":"Middle_East","Riyadh":"Middle_East","Tel Aviv":"Middle_East",
  "Singapore":"Southeast_Asia","Jakarta":"Southeast_Asia","Kuala Lumpur":"Southeast_Asia","Bangkok":"Southeast_Asia",
  "Tokyo":"East_Asia","Hong Kong":"East_Asia","Shanghai":"East_Asia","Seoul":"East_Asia",
  "Sao Paulo":"Latin_America","Mexico City":"Latin_America","Buenos Aires":"Latin_America",
  "Lagos":"Africa","Nairobi":"Africa","Cape Town":"Africa"
};

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^\w\s\-\.]/g, " ").replace(/\s+/g, " ").trim();
}

function findAliases(text, map) {
  const hits = new Set();
  for (const [alias, canonical] of Object.entries(map)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
    if (pattern.test(text)) hits.add(canonical);
  }
  return [...hits];
}

function findCity(text) {
  const aliases = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
    if (pattern.test(text)) return CITY_ALIASES[alias];
  }
  return null;
}

function parseQuery(raw) {
  const query = String(raw || "").trim();
  const n = normalize(query);

  const regions = findAliases(n, REGION_ALIASES);
  const sectors = findAliases(n, SECTOR_ALIASES);
  const stages = findAliases(n, STAGE_ALIASES);
  const types = findAliases(n, TYPE_ALIASES);
  const city = findCity(n);

  let cityRegion = null;
  if (city && CITY_TO_REGION[city]) {
    cityRegion = CITY_TO_REGION[city];
    if (!regions.includes(cityRegion)) regions.unshift(cityRegion);
  }

  const hasInvestorWord = /\binvestor|\bvc\b|\bangel\b|\bfund\b/i.test(query);
  const understood = regions.length + sectors.length + stages.length + types.length > 0;

  if (!understood && hasInvestorWord) {
    types.push("Venture Capital");
    types.push("Angel Investor");
  }

  return {
    raw: query,
    region: regions[0] || null,
    city: city,
    cityRegion: cityRegion,
    allRegions: regions,
    sectors,
    stages,
    investorTypes: types,
    understood: understood || hasInvestorWord
  };
}

module.exports = { parseQuery };