// @ts-nocheck
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensureAuth } from '../auth.js';
import z from 'zod';

export function registerCalendarTools(server: any) {
  server.tool(
    'list_events',
    'List upcoming Google Calendar events. Example: "List my upcoming events"',
    {
      limit: z.number().default(5).describe('Number of events to list (default 5)'),
      days: z.number().default(7).describe('Number of days in the future to fetch events (default 7)')
    },
    async ({ limit, days }) => {
      try {
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const calendar = google.google.calendar({ version: 'v3', auth });

        const now = new Date().toISOString();
        const future = new Date();
        future.setDate(future.getDate() + (days || 7));

        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: now,
          timeMax: future.toISOString(),
          maxResults: limit || 5,
          singleEvents: true,
          orderBy: 'startTime'
        });

        const events = response.data.items || [];
        const eventList = events.map(e => {
          // Handle all-day events vs timed events
          const start = e.start?.dateTime || e.start?.date || 'No date';
          const end = e.end?.dateTime || e.end?.date || 'No date';

          return {
            title: e.summary || '(no title)',
            start: start,
            end: end,
            location: e.location || 'Location not specified',
            description: e.description ? e.description.substring(0, 100) + '...' : 'No description'
          };
        });

        if (eventList.length === 0) {
          return {
            content: [{ type: 'text', text: 'No events found in the next few days.' }]
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(eventList, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro ao listar eventos: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}
