import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

async function main() {
  const endpoint = process.env.REDBOX_MCP_URL;
  const token = process.env.REDBOX_MCP_ACCESS_TOKEN;
  if (!endpoint || !token)
    throw new Error('Set REDBOX_MCP_URL and REDBOX_MCP_ACCESS_TOKEN to an institution-issued access token.');
  const client = new Client({ name: 'redbox-reporting-demo', version: '1.0' });
  const recordType = process.env.REDBOX_REPORTING_RECORD_TYPE ?? 'rdmp';
  const filters = [{ field: 'created', operator: 'between', start: '2026-01-01', end: '2027-01-01' }];
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
  );
  try {
    console.log((await client.listTools()).tools.map(tool => tool.name));
    for (const [name, args] of [
      ['get_reporting_schema', { recordType }],
      ['count_records', { recordType, filters }],
      ['group_records', { recordType, filters, groupBy: ['faculty'] }],
      [
        'time_series',
        { recordType, dateHistogram: { field: 'created', interval: 'month', start: '2026-01-01', end: '2027-01-01' } },
      ],
      ['group_records', { recordType, groupBy: ['workflowStage'] }],
      ['search_records', { recordType, text: 'machine learning' }],
      ['list_records', { recordType, filters, pagination: { limit: 5 } }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      console.log(name, JSON.stringify(result.structuredContent ?? result.content));
    }
  } finally {
    await client.close();
  }
}
void main().catch(() => {
  console.error('Reporting demo failed. Check endpoint, access token and deployment configuration.');
  process.exitCode = 1;
});
