/**
 * MCP client-side helpers.
 *
 * Tool execution used to live here as a browser-side simulation. It now runs
 * on the server (src/server/mcpRoutes.ts), reached through `mcpApi` in
 * services/integrationsApi.ts — the same endpoint and auth Claude Desktop uses.
 * What remains here is the shape of a log entry and the config path.
 */

export interface MCPLogEvent {
  id: string;
  timestamp: string;
  toolName: string;
  brandName: string;
  arguments?: any;
  payload?: any;
  status: 'SUCCESS' | 'ERROR';
  result?: any;
  error?: string;
  durationMs?: number;
  generatedAssetUrl?: string;
}

/**
 * Absolute path to the stdio bridge that Claude Desktop launches.
 * Claude Desktop spawns the command without a shell, so this cannot be relative.
 */
export const MCP_SERVER_PATH = '/Users/leninprakash/Products/social/mcp-server/index.js';
