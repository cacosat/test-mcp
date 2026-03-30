import { z } from 'zod';

export function registerFieldTools(server, client) {
  // ── get_ticket_fields (read, cached) ──
  server.tool(
    'get_ticket_fields',
    'Get Gorgias ticket field definitions including Incidencias L1/L2/L3 taxonomy dropdowns',
    {
      ticket_field_id: z
        .number()
        .optional()
        .describe('Optional: get a specific ticket field by ID. Omit to list all fields.'),
    },
    async (params) => {
      try {
        const path = params.ticket_field_id
          ? `/custom-fields/${params.ticket_field_id}`
          : '/custom-fields';
        const query = params.ticket_field_id ? undefined : { object_type: 'Ticket' };
        const data = await client.get(path, query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
