# ReDBox MCP reporting

An installable ReDBox hook exposing ReportingService through the official MCP TypeScript SDK v2 and stateless Streamable HTTP. ReportingService lives in redbox-core and works directly or through the REST API. The adapter contains no database query generation.

The package is included in this repository's production dependency graph. Reporting and MCP default to off. Enable fields explicitly in each record type and configure institution OAuth, then set **`REDBOX_MCP_ENABLED=true`** on the portal process/container and restart it. Each brand must also set its own `mcp.enabled: true`. Unset, false or invalid environment values keep all MCP endpoints and connection pages disabled. Reporting REST access remains independently controlled by `reporting.enabled`.

Each enabled brand exposes `/:branding/mcp` and `/.well-known/oauth-protected-resource/:branding/mcp`. Its `mcp` and public `mcpSetup` settings come from `sails.config.brandingAware(brandName)`, normally supplied by the hook's `branded-config/<brand>/override/mcp.js` and `mcpSetup.js`. The configured `brand`, resource URL path and token audience must all match that brand. Global OAuth settings and the unbranded `/mcp` endpoint are not used. Multiple brands can have distinct issuers, clients and origins on one deployment.

Users with the Admin or Librarians role can open **Connect your AI assistant** from Admin → Integrations (`/:branding/:portal/admin/mcp`). The page shows the current brand, generates a distinct connection name per brand, and provides readiness checks, public connection settings, instructions for Claude Code, Codex CLI, ChatGPT desktop and web, Claude (web and desktop) and generic clients, and a schema-only verification prompt. The session-only status endpoint is `GET /:branding/:portal/admin/mcp/status`. Both browser endpoints refresh persisted brand roles and require Admin or Librarians; other signed-in users receive 403 and anonymous users follow the standard login redirect. No legacy user routes or redirects are registered. It uses institutional OAuth and never generates ReDBox API keys or stores assistant credentials.

See [the reporting guide](../../support/wiki/AI-Reporting-and-MCP.md) for configuration, authorization, query examples, limitations and deployment steps, and [architecture findings](../../support/specs/mcp-reporting/design.md) for the design rationale.

Tools: `get_reporting_schema`, `count_records`, `group_records`, `time_series`, `search_records`, `list_records`, `get_record`. Every operation requires a server-resolved ReDBox principal. No identity, brand, database path, raw query or pipeline arguments are accepted.

The remote endpoint accepts OAuth JWT **access tokens** intended for the exact configured resource URL. The institution authorization server supplies PKCE, client registration, discovery and consent; ReDBox supplies protected-resource metadata and validates tokens using configured JWKS. Existing ReDBox API tokens and browser cookies do not authenticate this external endpoint. Existing authenticated REST calls support embedded clients.

Development (after compiling core):

```bash
npm run compile:mcp
npm run test:reporting                    # Docker test image + isolated Mongo
REDBOX_REPORTING_MONGO_URL=mongodb://127.0.0.1:27017 npm run test:reporting:local
```

The native tests create and delete UUID-named databases only. Mongo-dependent tests explicitly skip without the environment variable; the Docker target requires Mongo and exercises them. HTTP tests use the standard MCP client, signed test JWTs, and local HTTP confined to the test server.

A runnable client example is available with development dependencies installed:

```bash
export REDBOX_MCP_URL=https://redbox.customer.edu.au/default/mcp
# Supply REDBOX_MCP_ACCESS_TOKEN securely through your environment.
npm --prefix packages/redbox-mcp run example:client
```

[Example configuration](examples/reporting-config.ts) must be adapted to the customer's existing forms, paths and workflow. It does not automatically change records or enable reporting.
