# ReDBox MCP reporting

An installable ReDBox hook exposing ReportingService through the official MCP TypeScript SDK v2 and stateless Streamable HTTP. ReportingService lives in redbox-core and works directly or through the REST API. The adapter contains no database query generation.

The package is included in this repository's production dependency graph. Both `reporting.enabled` and `mcp.enabled` default to false. Enable fields explicitly in each record type and configure institution OAuth before enabling `/mcp`.

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
export REDBOX_MCP_URL=https://redbox.customer.edu.au/mcp
# Supply REDBOX_MCP_ACCESS_TOKEN securely through your environment.
npm --prefix packages/redbox-mcp run example:client
```

[Example configuration](examples/reporting-config.ts) must be adapted to the customer's existing forms, paths and workflow. It does not automatically change records or enable reporting.
