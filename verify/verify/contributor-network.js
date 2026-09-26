const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CORRECTIONS_FILE = path.join(DATA_DIR, 'corrections.json');
const AGREEMENT_THRESHOLD = 3;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData() {
  try {
    if (!fs.existsSync(CORRECTIONS_FILE)) {
      const empty = { corrections: [], users: {}, stats: { total: 0, applied: 0 } };
      fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(empty, null, 2));
      return empty;
    }
    return JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf-8'));
  } catch (err) {
    return { corrections: [], users: {}, stats: { total: 0, applied: 0 } };
  }
}

function saveData(data) {
  fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

async function submitCorrection({ email, field, oldValue, newValue, submittedBy }) {
  if (!email || !field || !newValue || !submittedBy) {
    throw new Error('Missing required fields: email, field, newValue, submittedBy');
  }

  const data = loadData();
  const emailLower = email.toLowerCase().trim();

  const existing = data.corrections.find(c =>
    c.email === emailLower &&
    c.field === field &&
    c.newValue === newValue &&
    !c.applied
  );

  if (existing) {
    return agreeWithCorrection(existing.id, submittedBy);
  }

  const correction = {
    id: generateId(),
    email: emailLower,
    field,
    oldValue: oldValue || null,
    newValue,
    submittedBy,
    submittedAt: new Date().toISOString(),
    agreements: [submittedBy],
    agreeCount: 1,
    applied: false,
    appliedAt: null,
  };

  data.corrections.push(correction);
  data.stats.total += 1;

  if (!data.users[submittedBy]) {
    data.users[submittedBy] = { submissions: 0, agreements: 0, score: 0 };
  }
  data.users[submittedBy].submissions += 1;
  data.users[submittedBy].score += 5;

  if (correction.agreeCount >= AGREEMENT_THRESHOLD) {
    correction.applied = true;
    correction.appliedAt = new Date().toISOString();
    data.stats.applied += 1;
  }

  saveData(data);
  return correction;
}

function agreeWithCorrection(correctionId, userId) {
  const data = loadData();
  const correction = data.corrections.find(c => c.id === correctionId);

  if (!correction) throw new Error(`Correction ${correctionId} not found`);
  if (correction.applied) return { ...correction, message: 'Already applied' };
  if (correction.agreements.includes(userId)) {
    return { ...correction, message: 'You already agreed' };
  }

  correction.agreements.push(userId);
  correction.agreeCount = correction.agreements.length;

  if (!data.users[userId]) {
    data.users[userId] = { submissions: 0, agreements: 0, score: 0 };
  }
  data.users[userId].agreements += 1;
  data.users[userId].score += 2;

  if (correction.agreeCount >= AGREEMENT_THRESHOLD && !correction.applied) {
    correction.applied = true;
    correction.appliedAt = new Date().toISOString();
    data.stats.applied += 1;
  }

  saveData(data);
  return correction;
}

function getCorrectionsFor(email) {
  const data = loadData();
  const emailLower = email.toLowerCase().trim();
  return data.corrections.filter(c => c.email === emailLower);
}

function getAppliedCorrection(email, field) {
  const data = loadData();
  const emailLower = email.toLowerCase().trim();
  return data.corrections.find(c =>
    c.email === emailLower && c.field === field && c.applied
  );
}

function getPendingCorrections() {
  const data = loadData();
  return data.corrections.filter(c => !c.applied);
}

function getAllCorrections() {
  return loadData().corrections;
}

function getStats() {
  const data = loadData();
  return {
    ...data.stats,
    pending: data.corrections.filter(c => !c.applied).length,
    contributors: Object.keys(data.users).length,
  };
}

function getLeaderboard(limit = 10) {
  const data = loadData();
  return Object.entries(data.users)
    .map(([userId, stats]) => ({ userId, ...stats }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function resetAll() {
  saveData({ corrections: [], users: {}, stats: { total: 0, applied: 0 } });
}

module.exports = {
  submitCorrection,
  agreeWithCorrection,
  getCorrectionsFor,
  getAppliedCorrection,
  getPendingCorrections,
  getAllCorrections,
  getStats,
  getLeaderboard,
  resetAll,
  AGREEMENT_THRESHOLD,
};