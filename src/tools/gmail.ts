// @ts-nocheck
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensureAuth } from '../auth.js';
import z from 'zod';

export function registerGmailTools(server: any) {
  server.tool(
    'list_emails',
    'List recent emails from Gmail inbox. Example: "List my latest 5 emails"',
    { limit: z.number().default(5).describe('Number of emails to list (default 5)') },
    async ({ limit }: { limit?: number }) => {
      try {
        const auth = await ensureAuth();
        const google = await import('googleapis');
        const gmail = google.google.gmail({ version: 'v1', auth });

        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: limit || 5,
          labelIds: ['INBOX']
        });

        const messages = response.data.messages || [];
        const emails = [];

        for (const msg of messages) {
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']
          });

          const data = fullMessage.data;
          const headers = data.payload?.headers || [];
          const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
          const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
          const date = headers.find(h => h.name === 'Date')?.value || 'Unknown date';

          emails.push({ from, subject, date, id: msg.id });
        }

        if (emails.length === 0) {
          return {
            content: [{ type: 'text', text: 'No emails found in inbox.' }]
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(emails, null, 2) }]
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error listing emails: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}
