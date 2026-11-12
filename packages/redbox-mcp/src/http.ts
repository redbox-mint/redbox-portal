import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { reportingSchemaInput, type ReportingApi } from '@researchdatabox/redbox-core';
import { McpAuthenticator, McpAuthError } from './auth';
import { metadataUrl, protectedResourceMetadata, type McpConfig } from './config';
import { createReportingMcpServer } from './server';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage & { body?: unknown }, maximum: number): Promise<unknown> {
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > maximum) throw new Error('LIMIT');
    return req.body;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > maximum) throw new Error('LIMIT');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** One authenticated principal and MCP server per HTTP request; no identity-bearing session cache. */
export function reportingMcpHttpHandler(
  config: McpConfig,
  reporting: ReportingApi,
  auth = new McpAuthenticator(config),
  audit: (event: Record<string, unknown>) => void = () => {}
) {
  const resource = new URL(config.resourceUrl);
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? '/', config.resourceUrl).pathname;
    const metadataPath = new URL(metadataUrl(config)).pathname;
    if (
      req.headers.host !== resource.host ||
      (req.headers.origin && ![resource.origin, ...config.allowedOrigins].includes(req.headers.origin))
    ) {
      json(res, 403, { error: 'invalid_origin' });
      return;
    }
    if (path === metadataPath && req.method === 'GET') {
      json(res, 200, protectedResourceMetadata(config));
      return;
    }
    if (path !== resource.pathname) {
      json(res, 404, { error: 'not_found' });
      return;
    }
    const started = Date.now();
    try {
      const principal = await auth.authenticate(req.headers.authorization);
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        json(res, 405, { error: 'method_not_allowed' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = await body(req, config.maxRequestBytes);
      } catch (error) {
        audit({
          event: 'mcp-request',
          userId: principal.user.id,
          brandId: principal.brand.id,
          success: false,
          code: 'invalid_request',
          durationMs: Date.now() - started,
        });
        json(res, error instanceof Error && error.message === 'LIMIT' ? 413 : 400, { error: 'invalid_request' });
        return;
      }
      let dispatched = false;
      const server = createReportingMcpServer(
        {
          execute: (...args) => {
            dispatched = true;
            return reporting.execute(...args);
          },
          getReportingSchema: (...args) => {
            dispatched = true;
            return reporting.getReportingSchema(...args);
          },
        },
        async () => principal
      );
      // SDK input validation can reject a call before ReportingService runs. Audit those failures too.
      res.once('finish', () => {
        if (dispatched || !parsed || typeof parsed !== 'object' || Reflect.get(parsed, 'method') !== 'tools/call')
          return;
        const params = Reflect.get(parsed, 'params');
        const name = params && typeof params === 'object' ? Reflect.get(params, 'name') : undefined;
        const operations: Record<string, string> = {
          get_reporting_schema: 'schema',
          count_records: 'count',
          group_records: 'group',
          time_series: 'time_series',
          search_records: 'search',
          list_records: 'records',
          get_record: 'get_record',
        };
        const tool = typeof name === 'string' && Object.hasOwn(operations, name) ? name : undefined;
        const args = params && typeof params === 'object' ? Reflect.get(params, 'arguments') : undefined;
        const schema = reportingSchemaInput.safeParse({
          recordType: args && typeof args === 'object' ? Reflect.get(args, 'recordType') : undefined,
        });
        audit({
          event: 'reporting',
          channel: 'mcp',
          userId: principal.user.id,
          brandId: principal.brand.id,
          tool,
          recordType: schema.success ? schema.data.recordType : undefined,
          fields: [],
          operation: tool ? operations[tool] : 'invalid',
          durationMs: Date.now() - started,
          resultCount: 0,
          success: false,
          code: 'INVALID_QUERY',
        });
      });
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.once('close', () => {
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, parsed);
    } catch (error) {
      if (error instanceof McpAuthError) {
        res.setHeader(
          'WWW-Authenticate',
          `Bearer resource_metadata="${metadataUrl(config)}", scope="${config.scope}", error="${error.code}"`
        );
        json(res, error.code === 'insufficient_scope' ? 403 : 401, { error: error.code });
      } else if (!res.headersSent) json(res, 503, { error: 'unavailable' });
      audit({
        event: 'mcp-auth',
        success: false,
        code: error instanceof McpAuthError ? error.code : 'unavailable',
        durationMs: Date.now() - started,
      });
    }
  };
}
