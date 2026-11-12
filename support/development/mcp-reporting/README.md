# Tailscale reporting demo for local ChatGPT Work

This development environment runs the reporting service from this checkout in an isolated ReDBox stack with its own MongoDB, Solr, Keycloak, and attachments. Its development hook is installed only in this Compose project. MCP calls use OAuth authorization code with S256 PKCE, the `redbox.reporting` scope, and an audience restricted to the MCP resource URL. ReDBox resolves the persisted OIDC account and its current ReDBox permissions for every request.

The running environment on `nam-oci-agent-2` uses:

| Setting              | Value                                                             |
| -------------------- | ----------------------------------------------------------------- |
| MCP endpoint         | `https://nam-oci-agent-2.tail4a7c3.ts.net:8443/mcp`               |
| Browser portal       | `https://nam-oci-agent-2.tail4a7c3.ts.net:8443/default/rdmp/home` |
| OAuth client ID      | `redbox-reporting-work`                                           |
| OAuth scope          | `redbox.reporting`                                                |
| Local OAuth callback | `http://127.0.0.1:52344/callback`                                 |
| Demo username        | `reporting-researcher`                                            |
| Password             | `researcher` value in `.dev/credentials.json`                     |

Connect your desktop to the same Tailscale network. The endpoint is private to that network. Port 443 continues serving T3 Code; port 8443 serves this demo. MongoDB, Solr, and Keycloak's internal ports are not published on the host.

## Connect local ChatGPT Work

The ChatGPT desktop app and Codex share MCP configuration for the same local host. Add this entry to `~/.codex/config.toml` (merge it into the existing file):

```toml
[mcp_servers.redbox_reporting]
url = "https://nam-oci-agent-2.tail4a7c3.ts.net:8443/mcp"
startup_timeout_sec = 30
tool_timeout_sec = 30

[mcp_servers.redbox_reporting.oauth]
client_id = "redbox-reporting-work"
callback_url = "http://127.0.0.1:52344/callback"
callback_port = 52344
```

In the ChatGPT desktop app, open **Settings → MCP servers**, select **Restart**, and select **Authenticate** for `redbox_reporting`. Sign in to **ReDBox Reporting Demo** as `reporting-researcher` using the generated password, then approve the reporting consent. This client is pre-registered; it has no client secret. The callback opens on your desktop, so port 52344 must be available there.

Alternatively, after adding the TOML entry, run:

```bash
codex mcp login redbox_reporting
```

Start a new **local Work** conversation. Use `/mcp` to confirm that the server is connected and exposes seven tools. Ask Work to use `redbox_reporting` and discover the reporting schema for record type `rdmp` first.

These steps follow the current [ChatGPT desktop MCP documentation](https://learn.chatgpt.com/docs/extend/mcp), including its pre-registered OAuth client and callback settings. Hosted ChatGPT Work has a separate plugin connection flow and cannot directly access this private Tailscale endpoint; it needs a public HTTPS endpoint or [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Queries and expected answers

All records are fictional. The dataset deliberately covers full calendar years, including all twelve months of 2026, so use explicit calendar years for deterministic comparisons.

| Ask Work                                              | Expected researcher result                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| How many RDMPs can I view?                            | 324                                                                                  |
| How many RDMPs were created in 2024, 2025, and 2026?  | 72, 108, 144                                                                         |
| Break down RDMPs created in 2026 by faculty.          | Arts and Humanities 36; Engineering 36; Medicine 36; Science 36                      |
| Show RDMP creation by month in 2026.                  | 12 each month                                                                        |
| Show monthly RDMP creation over 2024–2026.            | 6/month, 9/month, 12/month; 36 occupied buckets                                      |
| How many RDMPs are at each workflow stage?            | Draft 81; review 81; approved 81; archived 81                                        |
| How many RDMPs involve sensitive data?                | 108                                                                                  |
| Compare creation in 2026 with 2025.                   | 144 versus 108; increase of 36 (33.3%)                                               |
| Find RDMPs containing the phrase machine learning.    | 65 visible matches across bounded pages; search does not expose an exact index total |
| Show five records behind the Science result for 2026. | Five authorised records with projected reporting fields                              |

The database also holds 24 records visible only to Admin and 12 records in another brand. They must never increase these researcher counts or appear in the researcher's search or retrieval results. Visibility among the 324 records exercises user view, user edit, role view, and role edit permissions. Reporting returns six semantic fields: creation date, faculty, workflow stage, sensitive data, title, and description. Internal fixture notes remain outside the reporting schema and record projection.

Time ranges include their start and exclude their end: a full 2026 range is `2026-01-01` to `2027-01-01`. Reports return at most 100 groups or records, and full-text pages at most 50 records. Ask Work to paginate when needed; results explicitly report truncation. Search counts remain unknown when completeness cannot be established safely.

## Start and verify

Use a built ReDBox development/test image with Node and the normal runtime dependencies. The current host has `redbox-portal:playwright-node24` available (its runtime is Node 26). Set `RBPORTAL_IMAGE` to another compatible built image if necessary. The Compose bind mounts use the compiled core, MCP, Mongo storage, common types, and RVA packages from this checkout; build these packages before changing server code. The mounted source packages need their local dependencies installed.

The demo uses MongoDB 7.0.43 because the host's current Linux kernel prevents the original MongoDB 8 image from starting. Its `mongo7-data` volume contains a freshly seeded demo database. The original `redbox-reporting-demo_mongo-data` volume is retained separately; it has not been downgraded or deleted.

From the repository root on this Linux host:

```bash
bash support/development/mcp-reporting/run.sh
docker compose --env-file support/development/mcp-reporting/.dev/demo.env \
  -f support/development/mcp-reporting/docker-compose.yml logs -f portal
```

Wait for `reporting_demo_ready`, then run:

```bash
node support/development/mcp-reporting/verify.js
```

Verification uses the official MCP client and OAuth implementation to exercise discovery, authorization code/PKCE, refresh tokens, issuer binding, audience, scope, seven tools, schema discovery, yearly counts, faculty/stage grouping, monthly histograms, sensitivity filters, bounded search/list output, record projection, hidden/other-brand rejection, and hostile field rejection. Tokens, codes, and PKCE verifiers remain in memory. The dummy password is read from the private local credentials file.

`prepare.js` creates random development credentials and a Keycloak realm import under the ignored `.dev/` directory. Credentials persist across repeated preparation. Keycloak imports the realm on its first run; editing the realm import alone does not reconfigure a previously imported realm. Keep the same origin when restarting this environment. The seed is idempotent and reindexes its known OIDs on startup. The startup script preserves the existing T3 Tailscale listener and permits only this demo's Docker bridge to fetch OIDC/JWKS over its own Tailscale TLS port.

Use the **Openid Connect Credentials** option on the portal's login page to browse as the same researcher. Normal REST reporting routes also invoke the same service: `GET /default/rdmp/api/reporting/schema/rdmp` and `POST /default/rdmp/api/reporting/query`, with an authenticated ReDBox identity and normal CSRF/version handling.

To stop this demo while retaining data:

```bash
bash support/development/mcp-reporting/stop.sh
```

This removes only the demo's Tailscale listener, scoped firewall rule, and Compose services. Named volumes and generated credentials remain for restart. The Keycloak development server and dummy accounts are intended for this isolated demonstration.
