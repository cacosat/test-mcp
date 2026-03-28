import { z } from 'zod';

export function registerCustomerTools(server, client) {
  // ── list_customers (read) ──
  server.tool(
    'list_customers',
    'List Gorgias customers with optional email filter',
    {
      limit: z.number().min(1).max(100).default(30).describe('Number of customers to return'),
      cursor: z.string().optional().describe('Cursor for pagination (from previous response meta.next_cursor)'),
      email: z.string().email().optional().describe('Filter by exact email address'),
    },
    async (params) => {
      try {
        const query = { limit: params.limit };
        if (params.cursor) query.cursor = params.cursor;
        if (params.email) query.email = params.email;

        const data = await client.get('/customers', query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── get_customer (read) ──
  server.tool(
    'get_customer',
    'Get a single Gorgias customer by ID with full details',
    {
      customer_id: z.number().describe('The customer ID to retrieve'),
    },
    async (params) => {
      try {
        const data = await client.get(`/customers/${params.customer_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
