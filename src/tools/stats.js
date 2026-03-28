import { z } from 'zod';

export function registerStatsTools(server, client) {
  // ── get_satisfaction_stats (read) ──
  // Uses the satisfaction surveys list endpoint since POST /api/stats/satisfaction doesn't exist
  server.tool(
    'get_satisfaction_stats',
    'Get Gorgias satisfaction survey responses. Returns individual CSAT survey results that can be aggregated for scores.',
    {
      limit: z.number().min(1).max(100).default(30).describe('Number of survey responses to return'),
      cursor: z.string().optional().describe('Cursor for pagination'),
    },
    async (params) => {
      try {
        const query = { limit: params.limit };
        if (params.cursor) query.cursor = params.cursor;
        const data = await client.get('/satisfaction-surveys', query);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── get_ticket_stats (read) ──
  server.tool(
    'get_ticket_stats',
    'Get a Gorgias ticket statistic for a date range. Available metrics: first-response-time, resolution-time, messages-sent, messages-received.',
    {
      metric: z
        .enum([
          'first-response-time',
          'resolution-time',
          'messages-sent',
          'messages-received',
        ])
        .describe('The statistic metric to retrieve'),
      datetime_from: z.string().describe('Start of date range (ISO datetime, required)'),
      datetime_to: z.string().describe('End of date range (ISO datetime, required)'),
    },
    async (params) => {
      try {
        const data = await client.post(`/stats/${params.metric}`, {
          filters: {
            datetime_from: params.datetime_from,
            datetime_to: params.datetime_to,
          },
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
