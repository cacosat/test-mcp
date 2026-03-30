import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTicketTools } from './tools/tickets.js';
import { registerCustomerTools } from './tools/customers.js';
import { registerFieldTools } from './tools/fields.js';
import { registerStatsTools } from './tools/stats.js';
import { registerTagTools } from './tools/tags.js';

export function createServer(gorgiasClient, options = {}) {
  const readOnly = options.readOnly ?? false;

  const server = new McpServer({
    name: 'gorgias',
    version: '1.0.0',
  });

  registerTicketTools(server, gorgiasClient, { readOnly });
  registerCustomerTools(server, gorgiasClient);
  registerFieldTools(server, gorgiasClient);
  registerStatsTools(server, gorgiasClient);
  registerTagTools(server, gorgiasClient, { readOnly });

  return server;
}
