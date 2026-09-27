require('dotenv').config();
const { client, CONTACTS_INDEX } = require('./search/es-client');
const { embedContact } = require('./search/embeddings');

async function main() {
  console.log('=== GENERATING EMBEDDINGS FOR ALL CONTACTS ===\n');

  // Get all contacts without embeddings
  const result = await client.search({
    index: CONTACTS_INDEX,
    size: 1000,
    body: {
      query: {
        bool: {
          must_not: { exists: { field: 'embedding' } },
        },
      },
    },
  });

  const contacts = result.hits.hits.map((h) => ({ _id: h._id, ...h._source }));
  console.log(`Found ${contacts.length} contacts without embeddings\n`);

  if (contacts.length === 0) {
    console.log('All contacts already have embeddings.');
    return;
  }

  let done = 0;
  let failed = 0;

  for (const contact of contacts) {
    try {
      const embedding = await embedContact(contact);
      if (embedding) {
        await client.update({
          index: CONTACTS_INDEX,
          id: contact._id,
          body: { doc: { embedding } },
        });
        done++;
        process.stdout.write(`\r[${done}/${contacts.length}] Generating...`);
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }
  }

  console.log(`\n\n=== DONE ===`);
  console.log(`Generated: ${done}`);
  console.log(`Failed:    ${failed}`);
  console.log(`\nRefresh dashboard and try semantic search again!`);
}

main().catch(console.error);