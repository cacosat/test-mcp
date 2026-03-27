import { z } from 'zod';

export function registerTagTools(server, client, options) {
  // ── list_tags (read) ──
  server.tool(
    'list_tags',
    'List all available Gorgias tags',
    {
      limit: z.number().min(1).max(100).default(30).describe('Number of tags to return'),
      page: z.number().min(1).default(1).describe('Page number for pagination'),
    },
    async (params) => {
      try {
        const data = await client.get('/tags', { limit: params.limit, page: params.page });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  if (options.readOnly) return;

  // ── manage_tags (write) ──
  server.tool(
    'manage_tags',
    'Add or remove a tag on a Gorgias ticket',
    {
      ticket_id: z.number().describe('The ticket ID'),
      action: z.enum(['add', 'remove']).describe('Whether to add or remove the tag'),
      tag_name: z.string().describe('The tag name to add or remove'),
    },
    async (params) => {
      try {
        // Fetch current ticket to get existing tags
        const ticket = await client.get(`/tickets/${params.ticket_id}`);
        const currentTags = (ticket.tags || []).map((t) =>
          typeof t === 'string' ? { name: t } : t
        );

        let updatedTags;
        if (params.action === 'add') {
          const exists = currentTags.some(
            (t) => t.name.toLowerCase() === params.tag_name.toLowerCase()
          );
          updatedTags = exists ? currentTags : [...currentTags, { name: params.tag_name }];
        } else {
          updatedTags = currentTags.filter(
            (t) => t.name.toLowerCase() !== params.tag_name.toLowerCase()
          );
        }

        const data = await client.put(`/tickets/${params.ticket_id}`, { tags: updatedTags });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
