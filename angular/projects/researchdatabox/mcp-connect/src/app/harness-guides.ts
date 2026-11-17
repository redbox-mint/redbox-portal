import type { McpConnection } from './mcp-connect-api.service';

export const harnesses = [
  {
    id: 'claude-code',
    nameKey: 'mcp-harness-claude-code',
    subtitleKey: 'mcp-subtitle-command',
    group: 'local',
    icon: 'fa-terminal',
  },
  { id: 'codex', nameKey: 'mcp-harness-codex', subtitleKey: 'mcp-subtitle-config', group: 'local', icon: 'fa-code' },
  {
    id: 'chatgpt-desktop',
    nameKey: 'mcp-harness-chatgpt-desktop',
    subtitleKey: 'mcp-subtitle-desktop',
    group: 'local',
    icon: 'fa-desktop',
  },
  {
    id: 'claude',
    nameKey: 'mcp-harness-claude',
    subtitleKey: 'mcp-subtitle-connector',
    group: 'cloud',
    icon: 'fa-comment',
  },
  {
    id: 'chatgpt-web',
    nameKey: 'mcp-harness-chatgpt',
    subtitleKey: 'mcp-subtitle-plugin',
    group: 'cloud',
    icon: 'fa-comments',
  },
  { id: 'generic', nameKey: 'mcp-harness-other', subtitleKey: 'mcp-subtitle-generic', group: 'other', icon: 'fa-plug' },
] as const;
export type HarnessId = (typeof harnesses)[number]['id'];
export type HarnessArtefact =
  | { kind: 'code'; labelKey: string; text: string }
  | { kind: 'fields'; rows: { labelKey: string; value: string }[] }
  | { kind: 'plugin'; url?: string };
export interface HarnessStep {
  key: string;
  artefact?: HarnessArtefact;
}
export interface HarnessGuide {
  steps: HarnessStep[];
  documentationUrl: string;
}

// Institution-supplied client IDs must remain literal shell arguments.
const shellArgument = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
export const mcpServerName = (brand: string): string => `redbox_reporting_${brand}`;

export function harnessGuide(id: HarnessId, connection: McpConnection): HarnessGuide {
  const serverName = mcpServerName(connection.brand);
  if (id === 'claude-code') {
    const client = connection.clients.claudeCode;
    const options = [
      ...(client?.clientId ? ['--client-id', shellArgument(client.clientId)] : []),
      ...(client?.callbackPort ? ['--callback-port', String(client.callbackPort)] : []),
    ];
    return {
      documentationUrl: 'https://code.claude.com/docs/en/mcp',
      steps: [
        {
          key: 'mcp-step-claude-code-add',
          artefact: {
            kind: 'code',
            labelKey: 'mcp-command',
            text: [
              'claude mcp add --transport http --scope user',
              ...options,
              shellArgument(serverName),
              shellArgument(connection.endpoint),
            ].join(' '),
          },
        },
        {
          key: 'mcp-step-claude-code-auth',
          artefact: { kind: 'code', labelKey: 'mcp-inside-claude-code', text: '/mcp' },
        },
      ],
    };
  }
  if (id === 'codex' || id === 'chatgpt-desktop') {
    const client = connection.clients.codex;
    const serverKey = `mcp_servers.${JSON.stringify(serverName)}`;
    const lines = [`[${serverKey}]`, `url = ${JSON.stringify(connection.endpoint)}`];
    if (client && Object.values(client).some(value => value !== undefined)) {
      lines.push('', `[${serverKey}.oauth]`);
      if (client.clientId) lines.push(`client_id = ${JSON.stringify(client.clientId)}`);
      if (client.callbackUrl) lines.push(`callback_url = ${JSON.stringify(client.callbackUrl)}`);
      if (client.callbackPort) lines.push(`callback_port = ${client.callbackPort}`);
    }
    return {
      documentationUrl: 'https://learn.chatgpt.com/docs/extend/mcp',
      steps: [
        {
          key: `mcp-step-${id}-config`,
          artefact: { kind: 'code', labelKey: 'mcp-config-file', text: lines.join('\n') },
        },
        {
          key: `mcp-step-${id}-auth`,
          ...(id === 'codex'
            ? {
                artefact: {
                  kind: 'code' as const,
                  labelKey: 'mcp-command',
                  text: `codex mcp login ${shellArgument(serverName)}`,
                },
              }
            : {}),
        },
        {
          key: `mcp-step-${id}-conversation`,
          ...(id === 'codex'
            ? {
                artefact: {
                  kind: 'code' as const,
                  labelKey: 'mcp-inside-codex',
                  text: '/mcp',
                },
              }
            : {}),
        },
      ],
    };
  }
  if (id === 'chatgpt-web')
    return {
      documentationUrl: 'https://learn.chatgpt.com/docs/extend/mcp',
      steps: [
        { key: 'mcp-step-chatgpt-web-plugin', artefact: { kind: 'plugin', url: connection.chatgptPluginUrl } },
        { key: 'mcp-step-chatgpt-web-auth' },
      ],
    };
  if (id === 'claude')
    return {
      documentationUrl:
        'https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp',
      steps: [
        { key: 'mcp-step-claude-connector' },
        {
          key: 'mcp-step-claude-form',
          artefact: {
            kind: 'fields',
            rows: [
              { labelKey: 'mcp-field-name', value: 'ReDBox Reporting' },
              { labelKey: 'mcp-remote-url', value: connection.endpoint },
              ...(connection.clients.claude?.clientId
                ? [{ labelKey: 'mcp-client-id', value: connection.clients.claude.clientId }]
                : []),
            ],
          },
        },
        { key: 'mcp-step-claude-auth' },
      ],
    };
  return {
    documentationUrl: 'https://modelcontextprotocol.io/specification/latest/basic/authorization',
    steps: [
      {
        key: 'mcp-step-generic-add',
        artefact: {
          kind: 'fields',
          rows: [
            { labelKey: 'mcp-field-name', value: serverName },
            { labelKey: 'mcp-server-url', value: connection.endpoint },
            { labelKey: 'mcp-transport', value: 'Streamable HTTP' },
            { labelKey: 'mcp-scope', value: connection.scope },
          ],
        },
      },
      { key: 'mcp-step-generic-auth' },
    ],
  };
}
