import dotenv from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GorgiasClient } from './gorgias-client.js';
import { createServer } from './server.js';

dotenv.config();

// Validate required env vars
const required = ['GORGIAS_DOMAIN', 'GORGIAS_USERNAME', 'GORGIAS_API_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your Gorgias credentials.');
  process.exit(1);
}

const client = new GorgiasClient({
  domain: process.env.GORGIAS_DOMAIN,
  username: process.env.GORGIAS_USERNAME,
  apiKey: process.env.GORGIAS_API_KEY,
});

const readOnly = process.env.READ_ONLY === 'true';
const server = createServer(client, { readOnly });

const transport = new StdioServerTransport();
await server.connect(transport);
