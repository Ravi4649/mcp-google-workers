#!/usr/bin/env node
// @ts-nocheck
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerGmailTools } from './tools/gmail.js';
import { registerDriveTools } from './tools/drive.js';
import { registerCalendarTools } from './tools/calendar.js';

const server = new McpServer({
  name: 'mcp-google-workers',
  version: '1.0.0'
});

// Register all tools
registerGmailTools(server);
registerDriveTools(server);
registerCalendarTools(server);

console.error('🚀 Starting Google Workspace MCP server...');
console.error('📂 Waiting for MCP client connection...');

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ Google Workspace MCP server running!');
  console.error('   Available tools: list_emails, list_files, read_file_metadata, list_events');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
