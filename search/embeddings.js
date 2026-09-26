const { pipeline } = require('@xenova/transformers');

let embedder = null;

/**
 * Initialize the embedding model (all-MiniLM-L6-v2, 384 dims)
 * First call downloads the model (~80MB), subsequent calls are instant.
 */
async function getEmbedder() {
  if (embedder) return embedder;
  console.log('Loading embedding model (first time downloads ~80MB)...');
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('Embedding model ready\n');
  return embedder;
}

/**
 * Generate a 384-dim embedding for text
 */
async function embed(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('embed() requires non-empty text string');
  }
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Build a rich text representation of a contact for embedding
 */
function buildContactText(contact) {
  const parts = [];
  if (contact.name) parts.push(contact.name);
  if (contact.title) parts.push(contact.title);
  if (contact.seniority) parts.push(contact.seniority);
  if (contact.department) parts.push(contact.department);
  if (contact.company && contact.company.name) parts.push(contact.company.name);
  if (contact.company && contact.company.industry) parts.push(contact.company.industry);
  if (contact.company && contact.company.location) parts.push(contact.company.location);
  if (contact.company && contact.company.size) {
    const size = contact.company.size;
    if (size < 50) parts.push('small company');
    else if (size < 500) parts.push('mid-size company');
    else if (size < 5000) parts.push('large company');
    else parts.push('enterprise company');
  }
  return parts.filter(Boolean).join(' | ');
}

/**
 * Embed a contact (build text + generate embedding)
 */
async function embedContact(contact) {
  const text = buildContactText(contact);
  if (!text) return null;
  return embed(text);
}

async function embedBatch(texts, options = {}) {
  const results = [];
  for (const text of texts) {
    results.push(await embed(text));
  }
  return results;
}

module.exports = {
  embed,
  embedContact,
  embedBatch,
  buildContactText,
  getEmbedder,
};