import { describe, it, expect, vi } from 'vitest';
import { handleRpc, negotiateVersion, LATEST_PROTOCOL_VERSION, RPC_ERRORS, type RpcContext } from './protocol';

const ctx = (over: Partial<RpcContext> = {}): RpcContext => ({
  version: '1.0',
  tools: [{ name: 'search_meetings', description: 'd', inputSchema: { type: 'object' } }],
  callTool: vi.fn(async () => 'result text'),
  ...over,
});

const req = (method: string, params?: Record<string, unknown>, id: string | number | null = 1) =>
  ({ jsonrpc: '2.0', id, method, params });

describe('MCP protocol', () => {
  it('initialize speaks the client\'s version when we support it, ours when we do not', async () => {
    // Anthropic's connector asks for 2025-11-25; offered an older revision it disconnects.
    const anthropic = await handleRpc(req('initialize', { protocolVersion: '2025-11-25' }), ctx());
    expect((anthropic as any).result.protocolVersion).toBe('2025-11-25');
    const older = await handleRpc(req('initialize', { protocolVersion: '2024-11-05' }), ctx());
    expect((older as any).result.protocolVersion).toBe('2024-11-05');
    const future = await handleRpc(req('initialize', { protocolVersion: '2099-01-01' }), ctx());
    expect((future as any).result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('initialize advertises tools and tells the model where to start', async () => {
    const r = (await handleRpc(req('initialize', {}), ctx())) as any;
    expect(r.result.capabilities.tools).toBeDefined();
    expect(r.result.serverInfo.name).toBe('garely');
    expect(r.result.instructions).toMatch(/search_meetings/);
  });

  it('answers notifications with nothing at all (they carry no id)', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())).toBeNull();
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/cancelled' }, ctx())).toBeNull();
  });

  it('lists tools and runs one, wrapping the text as MCP content', async () => {
    const list = (await handleRpc(req('tools/list'), ctx())) as any;
    expect(list.result.tools).toHaveLength(1);

    const call = vi.fn(async () => 'found 3 meetings');
    const r = (await handleRpc(req('tools/call', { name: 'search_meetings', arguments: { query: 'allegro' } }), ctx({ callTool: call }))) as any;
    expect(call).toHaveBeenCalledWith('search_meetings', { query: 'allegro' });
    expect(r.result).toEqual({ content: [{ type: 'text', text: 'found 3 meetings' }], isError: false });
  });

  it('reports a failing tool to the MODEL, not as a protocol error — the conversation continues', async () => {
    const call = vi.fn(async () => { throw new Error('meeting_id is required'); });
    const r = (await handleRpc(req('tools/call', { name: 'search_meetings' }), ctx({ callTool: call }))) as any;
    expect(r.error).toBeUndefined();
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/meeting_id is required/);
  });

  it('answers the other primitives with empty lists instead of an error — a -32601 there resets Claude\'s connector', async () => {
    expect(((await handleRpc(req('resources/list'), ctx())) as any).result).toEqual({ resources: [] });
    expect(((await handleRpc(req('resources/templates/list'), ctx())) as any).result).toEqual({ resourceTemplates: [] });
    expect(((await handleRpc(req('prompts/list'), ctx())) as any).result).toEqual({ prompts: [] });
    expect(((await handleRpc(req('logging/setLevel', { level: 'info' }), ctx())) as any).result).toEqual({});
  });

  it('answers Claude\'s non-standard server/discover with a result, since an error there ends the connection', async () => {
    const r = (await handleRpc(req('server/discover', {}), ctx())) as any;
    expect(r.error).toBeUndefined();
    expect(r.result.serverInfo.name).toBe('garely');
    expect(r.result.tools).toHaveLength(1);
  });

  it('refuses an unknown tool and an unknown method', async () => {
    const unknownTool = (await handleRpc(req('tools/call', { name: 'delete_everything' }), ctx())) as any;
    expect(unknownTool.error.code).toBe(RPC_ERRORS.invalidParams);
    const unknownMethod = (await handleRpc(req('resources/read'), ctx())) as any;
    expect(unknownMethod.error.code).toBe(RPC_ERRORS.methodNotFound);
  });

  it('rejects a malformed message without crashing', async () => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: 7 } as any, ctx())) as any;
    expect(r.error.code).toBe(RPC_ERRORS.invalidRequest);
    expect(r.id).toBe(7);
  });
});
