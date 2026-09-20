#!/usr/bin/env node
/**
 * WotSocial MCP server (stdio transport).
 *
 * This process is a thin bridge: it speaks JSON-RPC to Claude over stdin/stdout
 * and forwards every tool call to the WotSocial API, which is where the real
 * work happens. Tool definitions are fetched from the API too, so there is one
 * source of truth and this file never drifts from the server.
 *
 * Configuration (set in claude_desktop_config.json):
 *   WOTSOCIAL_API_ENDPOINT   e.g. http://localhost:3050/api/mcp
 *   WOTSOCIAL_API_KEY        issued from the MCP Connector Studio
 */

import readline from 'readline';

const API_ENDPOINT = (process.env.WOTSOCIAL_API_ENDPOINT || 'http://localhost:3050/api/mcp').replace(/\/$/, '');
const API_KEY = process.env.WOTSOCIAL_API_KEY || '';
const REQUEST_TIMEOUT_MS = Number(process.env.WOTSOCIAL_TIMEOUT_MS || 300000);

const log = (...args) => console.error('[wotsocial-mcp]', ...args);

if (!API_KEY) {
  log('WARNING: WOTSOCIAL_API_KEY is not set. Every tool call will be rejected with 401.');
}

const send = (message) => {
  process.stdout.write(JSON.stringify(message) + '\n');
};

const respond = (id, result) => send({ jsonrpc: '2.0', id, result });

const respondError = (id, code, message, data) => {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
};

/** Single place where HTTP failures become readable text for Claude. */
const callApi = async (path, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_ENDPOINT}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; }
    catch { throw new Error(`WotSocial returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`); }

    if (!res.ok) {
      const detail = body?.error || body?.message || `HTTP ${res.status}`;
      const hint =
        res.status === 401
          ? ' — open the MCP Connector Studio in WotSocial and re-export your Claude Desktop config with a fresh API key.'
          : res.status === 409
            ? ' — connect the relevant platform account in WotSocial first.'
            : '';
      throw new Error(`${detail}${hint}`);
    }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`WotSocial did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.`);
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot reach WotSocial at ${API_ENDPOINT}. Start the app (npm run dev) and confirm WOTSOCIAL_API_ENDPOINT is correct.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Tools come from the server. If it is unreachable at list time we return an
 * empty list rather than inventing tools that would fail on call.
 */
let cachedTools = null;

const listTools = async () => {
  try {
    const body = await callApi('/tools', { method: 'GET' });
    cachedTools = body.tools || [];
    return cachedTools;
  } catch (err) {
    log('tools/list failed:', err.message);
    if (cachedTools) return cachedTools;
    return [];
  }
};

const callTool = async (name, args) => {
  const body = await callApi('', {
    method: 'POST',
    body: JSON.stringify({ tool: name, arguments: args || {} })
  });
  return body.result;
};

/* ------------------------------------------------------------------ */
/* JSON-RPC loop                                                       */
/* ------------------------------------------------------------------ */

const handleMessage = async (message) => {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'wotsocial-mcp-server', version: '2.0.0' }
      });
      return;

    case 'notifications/initialized':
    case 'initialized':
      return; // notification — no response

    case 'ping':
      respond(id, {});
      return;

    case 'tools/list':
      respond(id, { tools: await listTools() });
      return;

    case 'tools/call': {
      const toolName = params?.name;
      try {
        const result = await callTool(toolName, params?.arguments);
        respond(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        });
      } catch (err) {
        log(`tool ${toolName} failed:`, err.message);
        // Reported as tool output with isError so Claude can explain and retry,
        // rather than as a protocol error that aborts the turn.
        respond(id, {
          content: [{ type: 'text', text: `Tool "${toolName}" failed: ${err.message}` }],
          isError: true
        });
      }
      return;
    }

    default:
      if (id !== undefined) respondError(id, -32601, `Method not found: ${method}`);
  }
};

const rl = readline.createInterface({ input: process.stdin, terminal: false });

// Tool calls are async and can outlive the line that triggered them. Track them
// so closing stdin does not kill a publish or campaign launch mid-flight.
const inFlight = new Set();
let stdinClosed = false;

const drainAndExit = () => {
  if (stdinClosed && inFlight.size === 0) process.exit(0);
};

rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return; // not JSON-RPC; ignore
  }

  const task = handleMessage(message)
    .catch((err) => {
      log('Unhandled error:', err);
      if (message?.id !== undefined) respondError(message.id, -32603, `Internal error: ${err.message}`);
    })
    .finally(() => {
      inFlight.delete(task);
      drainAndExit();
    });

  inFlight.add(task);
});

rl.on('close', () => {
  stdinClosed = true;
  drainAndExit();
});

log(`started — bridging to ${API_ENDPOINT}`);
