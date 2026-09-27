require('dotenv').config();
const OpenAI = require('openai');

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY not found in .env');
    process.exit(1);
  }
  console.log('API Key loaded:', apiKey.slice(0, 10) + '...');

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  try {
    const response = await client.models.list();
    console.log('\n=== Available Models ===\n');
    response.data.forEach((m) => console.log(' -', m.id));
    console.log(`\nTotal: ${response.data.length} models`);
  } catch (err) {
    console.error('Error:', err.message);
    if (err.status) console.error('Status:', err.status);
  }
}

main();