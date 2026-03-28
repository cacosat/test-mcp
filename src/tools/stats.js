import { z } from 'zod';

export function registerStatsTools(server, client) {
  // ── get_satisfaction_stats (read) ──
  server.tool(
    'get_satisfaction_stats',
    'Get Gorgias CSAT / satisfaction statistics for a date range',
    {
      datetime_from: z.string().describe('Start of date range (ISO datetime, required)'),
      datetime_to: z.string().describe('End of date range (ISO datetime, required)'),
    },
    async (params) => {
      try {
        const data = await client.post('/stats/satisfaction', {
          datetime_from: params.datetime_from,
          datetime_to: params.datetime_to,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  // ── get_ticket_stats (read) ──
  server.tool(
    'get_ticket_stats',
    'Get a Gorgias ticket statistic for a date range. Metrics: tickets-created, tickets-closed, first-response-time, resolution-time, messages-sent, messages-received.',
    {
      metric: z
        .enum([
          'tickets-created',
          'tickets-closed',
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
          datetime_from: params.datetime_from,
          datetime_to: params.datetime_to,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );
}
