import { z } from 'zod';

export function registerTicketTools(server, client, options) {
  // ── list_tickets (read) ──
  server.tool(
    'list_tickets',
    'List and filter Gorgias tickets by date range, channel, tags, assignee, and status',
    {
      limit: z.number().min(1).max(100).default(30).describe('Number of tickets to return'),
      cursor: z.string().optional().describe('Cursor for pagination (from previous response meta.next_cursor)'),
      created_datetime__gte: z
        .string()
        .optional()
        .describe('Filter tickets created on or after this ISO datetime'),
      created_datetime__lte: z
        .string()
        .optional()
        .describe('Filter tickets created on or before this ISO datetime'),
      channel: z
        .string()
        .optional()
        .describe('Filter by channel (email, chat, phone, facebook, instagram, etc.)'),
      tags: z.string().optional().describe('Filter by tag name'),
      assignee_user__id: z.number().optional().describe('Filter by assignee user ID'),
      status: z
        .enum(['open', 'closed'])
        .optional()
        .describe('Filter by ticket status'),
    },
    async (params) => {
      try {
        const query = { limit: params.limit };
        if (params.cursor) query.cursor = params.cursor;
        if (params.created_datetime__gte) query.created_datetime__gte = params.created_datetime__gte;
        if (params.created_datetime__lte) query.created_datetime__lte = params.created_datetime__lte;
        if (params.channel) query.channel = params.channel;
        if (params.tags) query.tags = params.tags;
        if (params.assignee_user__id) query.assignee_user__id = params.assignee_user__id;
        if (params.status) query.status = params.status;

        const data = await client.get('/tickets', query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── get_ticket (read) ──
  server.tool(
    'get_ticket',
    'Get a single Gorgias ticket with all details including messages and ticket fields',
    {
      ticket_id: z.number().describe('The ticket ID to retrieve'),
    },
    async (params) => {
      try {
        const data = await client.get(`/tickets/${params.ticket_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── Write tools (only if not read-only) ──
  if (options.readOnly) return;

  // ── create_ticket (write) ──
  server.tool(
    'create_ticket',
    'Create a new Gorgias ticket',
    {
      subject: z.string().describe('Ticket subject line'),
      channel: z
        .enum(['email', 'chat', 'phone'])
        .default('email')
        .describe('Communication channel'),
      customer_email: z.string().email().describe('Customer email address'),
      message_body: z.string().describe('Initial message body (HTML supported)'),
    },
    async (params) => {
      try {
        const data = await client.post('/tickets', {
          channel: params.channel,
          subject: params.subject,
          messages: [
            {
              channel: params.channel,
              via: params.channel,
              from_agent: false,
              subject: params.subject,
              body_html: params.message_body,
              sender: { email: params.customer_email },
            },
          ],
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── update_ticket (write) ──
  server.tool(
    'update_ticket',
    'Update a Gorgias ticket — assign agents, change status, set custom fields (Incidencias), or update tags',
    {
      ticket_id: z.number().describe('The ticket ID to update'),
      assignee_user__id: z.number().optional().describe('Assign to user by ID'),
      status: z.enum(['open', 'closed']).optional().describe('Set ticket status'),
      custom_fields: z
        .array(
          z.object({
            id: z.number().describe('Ticket field ID'),
            value: z.any().describe('Field value'),
          })
        )
        .optional()
        .describe('Set custom ticket field values (e.g. Incidencias L1/L2/L3)'),
      tags: z
        .array(z.object({ name: z.string() }))
        .optional()
        .describe('Replace ticket tags with this list'),
    },
    async (params) => {
      try {
        const body = {};
        if (params.assignee_user__id !== undefined) body.assignee_user = { id: params.assignee_user__id };
        if (params.status) body.status = params.status;
        if (params.custom_fields) body.custom_fields = params.custom_fields;
        if (params.tags) body.tags = params.tags;

        const data = await client.put(`/tickets/${params.ticket_id}`, body);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── add_message_to_ticket (write) ──
  server.tool(
    'add_message_to_ticket',
    'Add a message or internal note to a Gorgias ticket',
    {
      ticket_id: z.number().describe('The ticket ID'),
      body: z.string().describe('Message body (HTML supported)'),
      via: z
        .enum(['email', 'chat', 'internal-note'])
        .default('internal-note')
        .describe('Message channel — use internal-note for agent-only notes'),
      from_agent: z.boolean().default(true).describe('Whether the message is from an agent'),
    },
    async (params) => {
      try {
        const data = await client.post(`/tickets/${params.ticket_id}/messages`, {
          channel: params.via === 'internal-note' ? 'internal-note' : params.via,
          via: params.via,
          from_agent: params.from_agent,
          body_html: params.body,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
