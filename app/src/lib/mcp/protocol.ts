/**
 * The slice of MCP this server speaks: JSON-RPC 2.0 over a single POST, stateless.
 *
 * Stateless on purpose. The app sits behind nginx and Cloudflare with 60 and 100
 * second read timeouts, so a long-lived SSE stream would be cut mid-conversation;
 * a self-contained request per call survives that. It also means no session table,
 * no sticky routing, and no cleanup when an agent disappears.
 *
 * Pure functions over a context object — no Prisma, no Request — so the envelope,
 * the error codes and the dispatch are unit-testable without a server.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
export const SERVER_NAME = 'garely';

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export type RpcResponse =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string } };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RpcContext {
  version: string;
  tools: ToolDefinition[];
  /** Run one tool. Throwing is fine: the error is reported to the model, not to the transport. */
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

const ok = (id: string | number | null, result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
const fail = (id: string | number | null, code: number, message: string): RpcResponse =>
  ({ jsonrpc: '2.0', id, error: { code, message } });

/** Negotiate: honour what the client asked for when we speak it, else offer our latest. */
export function negotiateVersion(requested: unknown): string {
  return typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

/**
 * Handle one JSON-RPC message. Returns null for notifications (no id), which the
 * transport answers with 202 and an empty body.
 */
export async function handleRpc(msg: RpcRequest, ctx: RpcContext): Promise<RpcResponse | null> {
  const id = msg?.id ?? null;
  const isNotification = msg?.id === undefined || msg?.id === null;

  if (!msg || typeof msg.method !== 'string') {
    return isNotification ? null : fail(id, RPC_ERRORS.invalidRequest, 'invalid request');
  }

  switch (msg.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: negotiateVersion((msg.params as { protocolVersion?: unknown })?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: ctx.version },
        instructions:
          'Garely holds this workspace\'s meetings: transcripts, AI reports, decisions and tasks. ' +
          'For a question about what was said or decided, start with search_meetings — it searches ' +
          'every meeting you can see at once. Use list_meetings to survey a period, then ' +
          'get_meeting_report for depth on the few that matter. Every result carries a link back ' +
          'into Garely, so quote the link when you cite something.',
      });

    // Notifications: acknowledged, nothing to return.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: ctx.tools });

    case 'tools/call': {
      const params = (msg.params || {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== 'string') {
        return fail(id, RPC_ERRORS.invalidParams, 'tools/call requires a tool name');
      }
      if (!ctx.tools.some((t) => t.name === params.name)) {
        return fail(id, RPC_ERRORS.invalidParams, `unknown tool: ${params.name}`);
      }
      const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
      try {
        const text = await ctx.callTool(params.name, args);
        return ok(id, { content: [{ type: 'text', text }], isError: false });
      } catch (e) {
        // A failing tool is a result the model should see and can react to, not a
        // protocol error that would abort the conversation.
        return ok(id, {
          content: [{ type: 'text', text: `Tool failed: ${(e as Error).message}` }],
          isError: true,
        });
      }
    }

    default:
      return isNotification ? null : fail(id, RPC_ERRORS.methodNotFound, `unknown method: ${msg.method}`);
  }
}
