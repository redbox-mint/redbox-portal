import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import {
  ReportingError,
  assertReportingPrincipal,
  reportingSchemaInput,
  reportingCountInput,
  reportingGroupInput,
  reportingTimeSeriesInput,
  reportingSearchInput,
  reportingRecordInput,
  reportingRecordsInput,
  type ReportingApi,
  type ReportingPrincipal,
  type ReportingAuditContext,
} from '@researchdatabox/redbox-core';

/** ReportingService is the engine. This module contains only protocol adaptation. */
export function createReportingMcpServer(
  reporting: ReportingApi,
  resolvePrincipal: () => Promise<ReportingPrincipal>
): McpServer {
  const server = new McpServer(
    { name: 'redbox-reporting', version: '0.0.1' },
    {
      instructions:
        'Discover the reporting schema first. Use semantic field IDs only. Date ranges include start and exclude end in UTC. Each tool runs as the authenticated user. Search text is a literal phrase. Use list_records with the same filters to inspect records behind aggregates; get_record returns only visible registered fields.',
    }
  );
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  async function call(
    tool: NonNullable<ReportingAuditContext['tool']>,
    action: (principal: ReportingPrincipal, audit: ReportingAuditContext) => Promise<unknown>
  ): Promise<CallToolResult> {
    try {
      const principal = await resolvePrincipal();
      assertReportingPrincipal(principal);
      const result = await action(principal, { channel: 'mcp', tool });
      const structuredContent = result as Record<string, unknown>;
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent };
    } catch (error) {
      const code = error instanceof ReportingError ? error.code : 'UNAVAILABLE';
      return {
        isError: true,
        content: [{ type: 'text', text: `Reporting request failed: ${code}` }],
        structuredContent: { error: { code } },
      };
    }
  }
  server.registerTool(
    'get_reporting_schema',
    {
      description:
        'Discover authorized semantic fields, supported operations, UTC date semantics, form coverage and limits for a configured record type.',
      inputSchema: reportingSchemaInput,
      annotations,
    },
    input => call('get_reporting_schema', (principal, audit) => reporting.getReportingSchema(principal, input, audit))
  );
  server.registerTool(
    'count_records',
    {
      description:
        'Count currently visible records matching typed filters. For 2026 use created between 2026-01-01 and 2027-01-01.',
      inputSchema: reportingCountInput,
      annotations,
    },
    input =>
      call('count_records', (principal, audit) => reporting.execute(principal, { ...input, operation: 'count' }, audit))
  );
  server.registerTool(
    'group_records',
    {
      description:
        'Group visible records by registered dimensions such as faculty or workflowStage. Count by default; sum/average only where the schema permits. Returns bounded pages with explicit truncation.',
      inputSchema: reportingGroupInput,
      annotations,
    },
    input =>
      call('group_records', (principal, audit) => reporting.execute(principal, { ...input, operation: 'group' }, audit))
  );
  server.registerTool(
    'time_series',
    {
      description:
        'Count visible records in occupied UTC day/month/year buckets within an explicit start-inclusive, end-exclusive date range.',
      inputSchema: reportingTimeSeriesInput,
      annotations,
    },
    input =>
      call('time_series', (principal, audit) =>
        reporting.execute(principal, { ...input, operation: 'time_series' }, audit)
      )
  );
  server.registerTool(
    'search_records',
    {
      description:
        'Find visible records containing a literal full-text phrase using existing ReDBox search. Current permissions are rechecked; index totals are not authoritative.',
      inputSchema: reportingSearchInput,
      annotations,
    },
    input =>
      call('search_records', (principal, audit) =>
        reporting.execute(principal, { ...input, operation: 'search' }, audit)
      )
  );
  server.registerTool(
    'list_records',
    {
      description:
        'Show a bounded page of currently visible records behind a count or group result. Reuse its filters, adding equality filters for the chosen group dimensions.',
      inputSchema: reportingRecordsInput,
      annotations,
    },
    input =>
      call('list_records', (principal, audit) =>
        reporting.execute(principal, { ...input, operation: 'records' }, audit)
      )
  );
  server.registerTool(
    'get_record',
    {
      description:
        'Retrieve one authorized record as registered semantic fields after applying the user’s view-form projection. Permissions, hidden metadata and internal state are excluded.',
      inputSchema: reportingRecordInput,
      annotations,
    },
    input =>
      call('get_record', (principal, audit) =>
        reporting.execute(principal, { ...input, operation: 'get_record' }, audit)
      )
  );
  return server;
}
