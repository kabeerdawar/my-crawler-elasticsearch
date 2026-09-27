const OpenAI = require('openai');

let client = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing in .env');

  client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  return client;
}

const FALLBACK_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
];

const SYSTEM_PROMPT = `You are a B2B contact data extractor. Analyze web page text and extract contact information.

You MUST respond with ONLY a valid JSON object. No explanations, no reasoning, no markdown, no code fences.

Required JSON schema:
{
  "emails": [],
  "phones": [],
  "names": [],
  "titles": [],
  "linkedin": [],
  "companies": []
}

Rules:
- emails: real email addresses found in text (ignore image filenames like @2x.png, ignore example.com)
- phones: real phone numbers ONLY with country code or area code. Do NOT include random digit sequences.
- names: person names (first + last name)
- titles: job titles (CEO, VP of Sales, etc.)
- linkedin: LinkedIn profile or company URLs
- companies: company names
- If nothing found for a field, use empty array []
- Start your response directly with { and end with }`;

function extractJson(text) {
  if (!text) return null;

  let cleaned = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  try { return JSON.parse(cleaned); } catch (e) {}

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIndex = -1;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { endIndex = i; break; }
    }
  }

  if (endIndex === -1) return null;

  const jsonStr = cleaned.slice(firstBrace, endIndex + 1);

  try { return JSON.parse(jsonStr); } catch (e) {}

  const repaired = jsonStr
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  try { return JSON.parse(repaired); } catch (e) {}

  return null;
}

function isValidPhone(phone) {
  if (!phone) return false;
  const str = String(phone).trim();

  // Must start with + (international format)
  if (str.startsWith('+')) {
    const digits = str.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  // Or match US format: (xxx) xxx-xxxx or xxx-xxx-xxxx
  if (/^\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}$/.test(str)) return true;

  return false;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();

  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,6}$/.test(lower)) return false;
  if (/\.(mp|webm|mp4|mov|png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(lower)) return false;
  if (/@2x|@3x|\d+x\./i.test(lower)) return false;

  const badDomains = ['example.com', 'example.org', 'yourdomain.com', 'domain.com', 'email.com'];
  const domain = lower.split('@')[1];
  if (badDomains.includes(domain)) return false;

  if (lower.includes('u00') || lower.includes('&#')) return false;

  return true;
}

async function tryModel(llmClient, model, pageText) {
  const response = await llmClient.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Extract contact info. Respond with JSON only, no preamble.\n\n${pageText}\n\nJSON:` },
    ],
    temperature: 0,
    max_tokens: 800,
  });

  const content = response.choices[0].message.content;
  const parsed = extractJson(content);

  if (!parsed) {
    throw new Error(`Could not parse JSON: ${(content || '').slice(0, 200)}`);
  }

  return parsed;
}

async function llmExtract(pageText, options = {}) {
  const startTime = Date.now();
  const maxChars = options.maxChars || 4000;
  const trimmed = pageText.slice(0, maxChars);

  if (!trimmed || trimmed.length < 50) {
    return { emails: [], phones: [], names: [], titles: [], linkedin: [], companies: [], cost: 0 };
  }

  const models = options.model ? [options.model] : FALLBACK_MODELS;
  let lastError = null;

  for (const model of models) {
    try {
      const llmClient = getClient();
      const parsed = await tryModel(llmClient, model, trimmed);

      return {
        emails: (parsed.emails || []).map((e) => String(e).toLowerCase().trim()).filter(isValidEmail),
        phones: (parsed.phones || []).filter(isValidPhone),
        names: (parsed.names || []).filter((n) => typeof n === 'string' && n.length < 60),
        titles: (parsed.titles || []).filter((t) => typeof t === 'string' && t.length < 100),
        linkedin: (parsed.linkedin || []).filter((l) => typeof l === 'string' && l.includes('linkedin')),
        companies: (parsed.companies || []).filter((c) => typeof c === 'string' && c.length < 100),
        cost: 0,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;
      const msg = err.message || '';
      const isModelError = err.status === 404 || msg.includes('does not exist') || msg.includes('decommissioned');
      const isJsonError = msg.includes('Failed to generate') || msg.includes('Could not parse') || msg.includes('Failed to validate');

      if (isModelError || isJsonError) continue;
      break;
    }
  }

  return {
    emails: [], phones: [], names: [], titles: [], linkedin: [], companies: [],
    cost: 0,
    error: lastError ? lastError.message : 'All models failed',
    durationMs: Date.now() - startTime,
  };
}

function mergeExtractions(regexResult, llmResult) {
  const mergeArrays = (a, b) => [...new Set([...(a || []), ...(b || [])])];

  return {
    emails: mergeArrays(regexResult.emails, llmResult.emails).filter(isValidEmail),
    phones: mergeArrays(regexResult.phones, llmResult.phones).filter(isValidPhone),
    name: regexResult.name || (llmResult.names && llmResult.names[0]) || null,
    title: regexResult.title || (llmResult.titles && llmResult.titles[0]) || null,
    seniority: regexResult.seniority || null,
    department: regexResult.department || null,
    linkedin: regexResult.linkedin || (llmResult.linkedin && llmResult.linkedin[0]) || null,
    llmCost: llmResult.cost || 0,
    llmUsed: true,
    llmModel: llmResult.model || null,
  };
}

module.exports = { llmExtract, mergeExtractions, FALLBACK_MODELS, isValidPhone, isValidEmail };