/**
 * Advanced Enrichment — Technographic + Firmographic + Intent Signals
 */

const TECH_SIGNATURES = {
  'Shopify': [/cdn\.shopify\.com/i, /shopify\.com\/s\//i, /Shopify\.theme/i],
  'WordPress': [/wp-content/i, /wp-includes/i, /wordpress/i],
  'HubSpot': [/hs-scripts\.com/i, /hubspot\.com\/forms/i, /hs-analytics/i],
  'Salesforce': [/salesforce\.com/i, /force\.com/i],
  'Google Analytics': [/googletagmanager\.com/i, /google-analytics\.com/i, /gtag\(/i],
  'Stripe': [/js\.stripe\.com/i, /stripe\.com\/v3/i],
  'Intercom': [/widget\.intercom\.io/i, /intercom\.com/i],
  'Segment': [/cdn\.segment\.com/i, /segment\.io/i],
  'Mixpanel': [/cdn\.mxpanel\.com/i, /mixpanel\.com/i],
  'Amplitude': [/cdn\.amplitude\.com/i, /amplitude\.com/i],
  'Cloudflare': [/cloudflare\.com/i, /cdnjs\.cloudflare\.com/i],
  'AWS': [/amazonaws\.com/i, /cloudfront\.net/i],
  'Vercel': [/vercel\.com/i, /vercel\.app/i, /_next\/static/i],
  'Next.js': [/__NEXT_DATA__/i, /_next\/static/i, /next\.js/i],
  'React': [/react\.production\.min\.js/i, /react-dom/i, /__REACT/i],
  'Vue.js': [/vue\.runtime/i, /vue\.min\.js/i, /__VUE__/i],
  'Tailwind CSS': [/tailwindcss/i, /tailwind\.min\.css/i],
  'Google Fonts': [/fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i],
  'Sentry': [/sentry-cdn\.com/i, /browser\.sentry-cdn/i],
  'Datadog': [/datadoghq-browser-agent/i, /datadog/i],
  'Cloudinary': [/cloudinary\.com/i, /res\.cloudinary\.com/i],
};

const INDUSTRY_KEYWORDS = {
  'Software': ['software', 'saas', 'platform', 'cloud', 'developer tools', 'devops', 'api', 'infrastructure', 'deploy', 'developer platform'],
  'E-commerce': ['ecommerce', 'e-commerce', 'online store', 'shopping cart', 'checkout', 'merchant', 'sell online', 'online business', 'retailers'],
  'Fintech': ['fintech', 'payment processing', 'banking', 'financial services', 'trading', 'crypto', 'lending', 'payments'],
  'Healthcare': ['healthcare', 'medical', 'hospital', 'patient', 'pharma', 'clinic', 'telehealth'],
  'Education': ['education', 'e-learning', 'online course', 'school', 'student', 'university', 'edtech'],
  'Marketing': ['marketing automation', 'advertising', 'digital marketing', 'seo', 'crm', 'customer platform'],
  'Media': ['media company', 'news', 'publishing', 'content platform', 'streaming'],
  'Real Estate': ['real estate', 'property listing', 'rent', 'lease', 'housing'],
  'Travel': ['travel', 'booking', 'hotel', 'flight', 'vacation', 'tourism'],
  'Food & Beverage': ['restaurant', 'food delivery', 'beverage', 'recipe'],
  'Manufacturing': ['manufacturing', 'factory', 'industrial', 'supply chain'],
  'Consulting': ['consulting', 'advisory', 'professional services'],
};

function detectTechnologies(html) {
  if (!html) return [];
  const detected = [];
  for (const [tech, patterns] of Object.entries(TECH_SIGNATURES)) {
    if (patterns.some((p) => p.test(html))) {
      detected.push(tech);
    }
  }
  return detected;
}

function detectIndustry(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Extract from title/meta first (highest signal)
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  const metaMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const priorityText = [(titleMatch && titleMatch[1]) || '', (metaMatch && metaMatch[1]) || ''].join(' ').toLowerCase();

  const scores = {};
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    let score = 0;
    for (const k of keywords) {
      if (priorityText.includes(k)) score += 10;
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}`, 'gi');
      const matches = (lower.match(regex) || []).length;
      score += Math.min(matches, 3);
    }
    scores[industry] = score;
  }

  let bestIndustry = null;
  let bestScore = 0;
  for (const [industry, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIndustry = industry;
    }
  }

  // Lowered threshold from 5 → 2
  return bestScore >= 2 ? bestIndustry : null;
}

function detectCompanySize(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const patterns = [
    /(\d{1,3}(?:,\d{3})*)\s*(?:\+)?\s*(?:employees|people|team members|staff)/i,
    /team of\s+(\d{1,3}(?:,\d{3})*)/i,
    /(\d{1,3}(?:,\d{3})*)\s*\+\s*(?:employees|people)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1].replace(/,/g, ''), 10);
      if (num > 0 && num < 1000000) return num;
    }
  }

  if (/\b(we are a fortune 500|fortune 500 company)\b/i.test(lower)) return 50000;
  if (/\b(global leader with over|more than [\d,]+ employees)\b/i.test(lower)) return 10000;

  if (/\b(we are a startup|early.stage startup|small startup)\b/i.test(lower)) return 20;
  if (/\b(seed.stage|pre.seed)\b/i.test(lower)) return 10;
  if (/\b(series [a-b] startup|series [a-b] company)\b/i.test(lower)) return 50;
  if (/\b(scale.up|scaling startup)\b/i.test(lower)) return 200;

  const rangeMatch = text.match(/(\d{2,5})\s*[-–]\s*(\d{2,5})\s*(?:employees|people)/i);
  if (rangeMatch) {
    return Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2);
  }

  return null;
}

function detectIntentSignals(text) {
  if (!text) return [];
  const signals = [];
  const lower = text.toLowerCase();

  if (/\b(raised|series [a-e]|seed round|funding round)\b/i.test(lower)) {
    signals.push('recent-funding');
  }
  if (/\b(series [a-e])\b/i.test(lower)) {
    const match = lower.match(/series ([a-e])/);
    if (match) signals.push(`series-${match[1].toUpperCase()}`);
  }
  if (/\b(ipo|went public|public offering)\b/i.test(lower)) {
    signals.push('ipo');
  }
  if (/\b(hiring|we're hiring|join our team|open roles|openings)\b/i.test(lower)) {
    signals.push('actively-hiring');
  }
  if (/\b(remote.first|work from anywhere|distributed team)\b/i.test(lower)) {
    signals.push('remote-first');
  }
  if (/\b(expanding|launching|new office|new market)\b/i.test(lower)) {
    signals.push('expanding');
  }
  if (/\b(acquired|acquisition|merger)\b/i.test(lower)) {
    signals.push('m&a-activity');
  }

  return [...new Set(signals)];
}

function enrichCompany(html, text, baseCompany = {}) {
  const technologies = detectTechnologies(html);
  const industry = detectIndustry(text);
  const size = detectCompanySize(text);
  const signals = detectIntentSignals(text);

  return {
    ...baseCompany,
    industry: baseCompany.industry || industry,
    size: baseCompany.size || size,
    techStack: technologies,
    intentSignals: signals,
  };
}

function enrichContact(contact, html, text) {
  if (!contact) return contact;
  const enriched = { ...contact };
  if (html && text) {
    enriched.company = enrichCompany(html, text, contact.company || {});
  }
  return enriched;
}

module.exports = {
  detectTechnologies,
  detectIndustry,
  detectCompanySize,
  detectIntentSignals,
  enrichCompany,
  enrichContact,
  TECH_SIGNATURES,
  INDUSTRY_KEYWORDS,
};