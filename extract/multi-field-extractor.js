/**
 * Multi-field extractor
 * Extracts name, title, email, phone, LinkedIn, company from HTML/text
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const LINKEDIN_REGEX = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9\-_%]+\/?/gi;

const SENIORITY_KEYWORDS = {
  'C-Level': [
    'ceo', 'chief executive officer',
    'cto', 'chief technology officer',
    'cfo', 'chief financial officer',
    'coo', 'chief operating officer',
    'cmo', 'chief marketing officer',
    'cpo', 'chief product officer',
    'ciso', 'chief information security officer',
    'chief ', 'founder', 'co-founder', 'president',
  ],
  'VP': ['vp ', ' vp', 'vice president', 'vice-president'],
  'Director': ['director'],
  'Head': ['head of', 'head,', 'head '],
  'Manager': ['manager', 'lead '],
  'Senior': ['senior ', 'sr. ', 'sr '],
  'Entry': ['junior', 'jr.', 'associate', 'intern'],
};

const DEPARTMENT_KEYWORDS = {
  'Executive': ['ceo', 'chief executive', 'executive', 'president', 'founder'],
  'Engineering': ['engineering', 'engineer', 'developer', 'technical', 'chief technology', 'cto', 'vp of engineering'],
  'Sales': ['sales', 'account executive', 'business development', 'vp of sales'],
  'Marketing': ['marketing', 'growth', 'brand', 'cmo', 'chief marketing'],
  'Product': ['product', 'cpo', 'chief product'],
  'Design': ['design', 'designer', 'ux', 'ui', 'head of design'],
  'HR': ['hr', 'human resources', 'people', 'recruiting', 'talent', 'head of people'],
  'Finance': ['finance', 'cfo', 'chief financial', 'accounting', 'controller'],
  'Operations': ['operations', 'coo', 'chief operating'],
  'Customer Support': ['support', 'customer service', 'success', 'head of support'],
  'Legal': ['legal', 'counsel', 'compliance'],
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsKeyword(text, keyword) {
  // Word-boundary matching to avoid "cto" matching inside "director"
  const trimmed = keyword.trim();
  if (!trimmed) return false;
  const regex = new RegExp(`(^|[^a-z])${escapeRegex(trimmed)}([^a-z]|$)`, 'i');
  return regex.test(text);
}

function extractEmails(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

function extractPhones(text) {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX) || [];
  return [...new Set(matches.map(normalizePhone))].filter(Boolean);
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

function extractLinkedIn(text) {
  if (!text) return null;
  const matches = text.match(LINKEDIN_REGEX);
  if (!matches || matches.length === 0) return null;
  return matches[0].replace(/\/$/, '');
}

function detectSeniority(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  // Priority order — check C-Level first (most specific)
  const order = ['C-Level', 'VP', 'Director', 'Head', 'Manager', 'Senior', 'Entry'];
  for (const level of order) {
    const keywords = SENIORITY_KEYWORDS[level];
    if (keywords.some((k) => containsKeyword(lower, k))) return level;
  }
  return null;
}

function detectDepartment(title) {
  if (!title) return null;
  const lower = title.toLowerCase();
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    if (keywords.some((k) => containsKeyword(lower, k))) return dept;
  }
  return null;
}

function extractName(text) {
  if (!text) return null;

  // Pattern 1 (priority): "John Smith, CEO" or "John Smith - VP of Sales"
  const titleWordPattern = '(?:CEO|CTO|CFO|COO|CMO|CPO|CISO|VP|Vice President|Director|Manager|Head|President|Founder|Co-Founder|Chief)';
  const nameWithTitle = new RegExp(
    `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2})\\s*[,\\-–]\\s*${titleWordPattern}`,
    'i'
  );
  const match1 = text.match(nameWithTitle);
  if (match1 && match1[1]) return match1[1].trim();

  // Pattern 2: "Name: John Smith" or "Contact: John Smith"
  const nameLabel = /(?:name|contact person|contact)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i;
  const match2 = text.match(nameLabel);
  if (match2 && match2[1]) {
    const name = match2[1].trim();
    // Reject common false positives
    const lower = name.toLowerCase();
    const blacklist = ['our team', 'the team', 'your team', 'contact us', 'our company'];
    if (!blacklist.includes(lower)) return name;
  }

  // Pattern 3: "Mr. John Smith" or "Dr. Jane Doe"
  const titleName = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/;
  const match3 = text.match(titleName);
  if (match3 && match3[1]) return match3[1].trim();

  return null;
}

function extractTitle(text) {
  if (!text) return null;
  const patterns = [
    /(?:title|position|role)[:\s]+([A-Z][A-Za-z\s&\-]{3,60})/i,
    /\b((?:Chief\s+[A-Z][a-z]+\s+Officer|CEO|CTO|CFO|COO|CMO|CPO|CISO|VP\s+of\s+[A-Za-z]+|Vice\s+President\s+of\s+[A-Za-z]+|Director\s+of\s+[A-Za-z]+|Head\s+of\s+[A-Za-z]+|Manager\s+of\s+[A-Za-z]+|President|Founder|Co-Founder|Director|Manager))\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractFromText(text) {
  if (!text) {
    return {
      emails: [], phones: [], linkedin: null,
      name: null, title: null, seniority: null, department: null,
    };
  }

  const title = extractTitle(text);
  const name = extractName(text);

  return {
    emails: extractEmails(text),
    phones: extractPhones(text),
    linkedin: extractLinkedIn(text),
    name,
    title,
    seniority: detectSeniority(title),
    department: detectDepartment(title),
  };
}

function enrichContact(contact) {
  if (!contact) return contact;
  const title = contact.title || extractTitle(contact.rawText || '');
  return {
    ...contact,
    seniority: contact.seniority || detectSeniority(title),
    department: contact.department || detectDepartment(title),
    phone: contact.phone || (extractPhones(contact.rawText || '')[0] || null),
    linkedin: contact.linkedin || extractLinkedIn(contact.rawText || ''),
  };
}

module.exports = {
  extractEmails,
  extractPhones,
  extractLinkedIn,
  extractName,
  extractTitle,
  detectSeniority,
  detectDepartment,
  normalizePhone,
  extractFromText,
  enrichContact,
};