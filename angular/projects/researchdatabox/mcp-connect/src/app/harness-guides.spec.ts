import { harnessGuide, harnesses, HarnessGuide } from './harness-guides';
import type { McpConnection } from './mcp-connect-api.service';

describe('Harness configuration generation', () => {
  const code = (guide: HarnessGuide, index = 0): string => {
    const artefact = guide.steps[index].artefact;
    if (artefact?.kind !== 'code') throw new Error('Expected step-attached code');
    return artefact.text;
  };
  const connection: McpConnection = {
    brand: 'default',
    endpoint: 'https://customer.example/default/mcp',
    issuer: 'https://identity.example',
    scope: 'redbox.reporting',
    metadataUrl: 'https://customer.example/.well-known/oauth-protected-resource/default/mcp',
    clients: {},
  };

  it('emits a TOML entry with the deployment URL and pre-registered OAuth callback', () => {
    const result = harnessGuide('codex', {
      ...connection,
      clients: {
        codex: {
          clientId: 'institution "research"',
          callbackUrl: 'http://127.0.0.1:52344/callback',
          callbackPort: 52344,
        },
      },
    });
    const lines = code(result).split('\n');
    expect(JSON.parse(lines.find(line => line.startsWith('url = '))!.slice(6))).toBe(connection.endpoint);
    expect(JSON.parse(lines.find(line => line.startsWith('client_id = '))!.slice(12))).toBe('institution "research"');
    expect(code(result)).toContain('callback_port = 52344');
    expect(code(result)).toContain('callback_url = "http://127.0.0.1:52344/callback"');
  });

  it('quotes shell-sensitive institution client IDs and preserves a fixed callback port', () => {
    const result = harnessGuide('claude-code', {
      ...connection,
      clients: { claudeCode: { clientId: "researcher's client", callbackPort: 8080 } },
    });
    expect(code(result)).toContain("--client-id 'researcher'\\''s client'");
    expect(code(result)).toContain('--callback-port 8080');
    expect(code(result)).toContain("'https://customer.example/default/mcp'");
  });

  it('keeps automatic registration available without inventing a client ID', () => {
    const result = harnessGuide('codex', connection);
    expect(code(result)).not.toContain('client_id');
    expect(code(result)).not.toContain('YOUR_');
  });

  it('keeps two brand connections separate, including brand names containing dots', () => {
    const alpha = harnessGuide('codex', {
      ...connection,
      brand: 'alpha.research',
      endpoint: 'https://customer.example/alpha.research/mcp',
    });
    const beta = harnessGuide('codex', { ...connection, brand: 'beta', endpoint: 'https://customer.example/beta/mcp' });
    expect(code(alpha)).toContain('[mcp_servers."redbox_reporting_alpha.research"]');
    expect(code(beta)).toContain('[mcp_servers."redbox_reporting_beta"]');
    expect(code(alpha, 1)).toBe("codex mcp login 'redbox_reporting_alpha.research'");
    expect(code(beta, 1)).toBe("codex mcp login 'redbox_reporting_beta'");
    expect(code(alpha)).not.toContain('/beta/mcp');
  });

  it('merges Claude web and desktop into one cloud connector guide with an attached form', () => {
    expect(harnesses.length).toBe(6);
    expect(harnesses.filter(harness => harness.id === 'claude').length).toBe(1);
    const result = harnessGuide('claude', connection);
    expect(result.steps.map(step => step.key)).toEqual([
      'mcp-step-claude-connector',
      'mcp-step-claude-form',
      'mcp-step-claude-auth',
    ]);
    const form = result.steps[1].artefact;
    expect(form?.kind).toBe('fields');
    if (form?.kind === 'fields') {
      expect(form.rows).toEqual([
        { labelKey: 'mcp-field-name', value: 'ReDBox Reporting' },
        { labelKey: 'mcp-remote-url', value: connection.endpoint },
      ]);
    }
    const registered = harnessGuide('claude', { ...connection, clients: { claude: { clientId: 'public-id' } } })
      .steps[1].artefact;
    if (registered?.kind === 'fields') expect(registered.rows[2].value).toBe('public-id');
    else fail('Expected connector form');
  });

  it('attaches terminal commands to their own sign-in step and never repeats the test prompt', () => {
    expect(code(harnessGuide('claude-code', connection), 1)).toBe('/mcp');
    expect(code(harnessGuide('codex', connection), 1)).toBe("codex mcp login 'redbox_reporting_default'");
    expect(code(harnessGuide('codex', connection), 2)).toBe('/mcp');
    expect(code(harnessGuide('chatgpt-desktop', connection))).toBe(code(harnessGuide('codex', connection)));
    for (const harness of harnesses)
      expect(harnessGuide(harness.id, connection).steps.some(step => step.key === 'mcp-step-verify')).toBeFalse();
  });

  it('attaches plugin links and generic connection fields to the relevant step', () => {
    expect(harnessGuide('chatgpt-web', connection).steps[0].artefact).toEqual({ kind: 'plugin', url: undefined });
    expect(
      harnessGuide('chatgpt-web', { ...connection, chatgptPluginUrl: 'https://chatgpt.example/plugin' }).steps[0]
        .artefact
    ).toEqual({ kind: 'plugin', url: 'https://chatgpt.example/plugin' });
    const fields = harnessGuide('generic', connection).steps[0].artefact;
    if (fields?.kind !== 'fields') return fail('Expected generic form');
    expect(fields.rows.map(row => row.value)).toEqual([
      'redbox_reporting_default',
      connection.endpoint,
      'Streamable HTTP',
      connection.scope,
    ]);
  });
});
