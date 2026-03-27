import { z } from 'zod';

export function registerStatsTools(server, client) {
  // ── get_satisfaction_stats (read, cached) ──
  server.tool(
    'get_satisfaction_stats',
    'Get Gorgias CSAT / satisfaction statistics for a date range',
    {
      datetime__gte: z.string().describe('Start of date range (ISO datetime, required)'),
      datetime__lte: z.string().describe('End of date range (ISO datetime, required)'),
    },
    async (params) => {
      try {
        const data = await client.get('/satisfaction', {
          datetime__gte: params.datetime__gte,
          datetime__lte: params.datetime__lte,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── get_ticket_stats (read, cached) ──
  server.tool(
    'get_ticket_stats',
    'Get Gorgias ticket statistics — first response time, resolution time, and volume — for a date range',
    {
      datetime__gte: z.string().describe('Start of date range (ISO datetime, required)'),
      datetime__lte: z.string().describe('End of date range (ISO datetime, required)'),
      group_by: z
        .enum(['agent', 'integration', 'channel'])
        .optional()
        .describe('Group results by agent, integration (country), or channel'),
    },
    async (params) => {
      try {
        const query = {
          datetime__gte: params.datetime__gte,
          datetime__lte: params.datetime__lte,
        };
        if (params.group_by) query.group_by = params.group_by;

        const data = await client.get('/stats', query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
