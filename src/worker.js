import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GorgiasClient } from './gorgias-client.js';
import { registerTicketTools } from './tools/tickets.js';
import { registerCustomerTools } from './tools/customers.js';
import { registerFieldTools } from './tools/fields.js';
import { registerStatsTools } from './tools/stats.js';
import { registerTagTools } from './tools/tags.js';

export class GorgiasMCP extends McpAgent {
  server = new McpServer({ name: 'gorgias', version: '1.0.0' });

  async init() {
    const client = new GorgiasClient({
      domain: this.env.GORGIAS_DOMAIN,
      username: this.env.GORGIAS_USERNAME,
      apiKey: this.env.GORGIAS_API_KEY,
    });

    const readOnly = this.env.READ_ONLY === 'true';

    registerTicketTools(this.server, client, { readOnly });
    registerCustomerTools(this.server, client);
    registerFieldTools(this.server, client);
    registerStatsTools(this.server, client);
    registerTagTools(this.server, client, { readOnly });
  }
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/mcp') {
      return GorgiasMCP.serve('/mcp').fetch(request, env, ctx);
    }

    if (url.pathname === '/') {
      return new Response('Gorgias MCP Server is running. Connect via /mcp', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
