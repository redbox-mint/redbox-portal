### Node Version Manager (NVM) Usage ###

Use Node.js `26.12.1` and npm `11.20.0` for this development branch. From the repository root, run `nvm install` followed by `nvm use`, then check `node --version` and `npm --version`. The root and PDF hook `.nvmrc` files select the same runtime. Docker build/runtime stages, CI and test runners use that Node patch too. Released v5 comparison artifacts retain their own supported runtime.

### Backend Compilation:
1. **Install Packages**: Run `npm ci --ignore-scripts --strict-peer-deps` with the pinned runtime.
2. **Compile the application**: Execute `npm run compile:all` to build shared packages, core, selected extensions, host and browser assets in dependency order. `compile:host` alone does not build those dependencies.

### Frontend Compilation (Angular):

For compiling Angular TypeScript files, use the command `npm run compile:ng`. This process compiles all Angular applications, generating frontend bundles equipped with source maps to facilitate debugging.

### Running the Application:
1. **Set the session secret**: Run `export REDBOX_SESSION_SECRET="$(openssl rand -hex 32)"`. Keep that value in your local shell or private secret environment across restarts.
2. Start the mounted Fastify stack with `npm run dev:run`, or use
   `npm run dev:run:build` for image mode. Both start `node app.js`.
3. Use `docker compose -f support/development/docker-compose.yml` to manage
   individual services, and `npm run dev:run:clean` to stop the development stack.

Compose publishes the portal on the Docker host's loopback interface by default.
To reach it over Tailscale, bind the HTTP port to the host's Tailscale IPv4
address and set the browser-facing URL to the host's MagicDNS name.

```bash
export RBPORTAL_HTTP_BIND_ADDRESS="$(tailscale ip -4)"
export RBPORTAL_HTTP_PORT=1500
export REDBOX_ROOT_CONTEXT="${REDBOX_ROOT_CONTEXT:-}"
portal_origin="http://$(tailscale status --json | jq -er '.Self.DNSName | rtrimstr(".")'):$RBPORTAL_HTTP_PORT"
export APP_URL="${portal_origin}${REDBOX_ROOT_CONTEXT:-}"
npm run dev:run
```

For LAN access, use the Docker host's LAN interface address for the bind and
its reachable DNS name for `APP_URL`. A reverse proxy on the Docker host can
instead forward to the default loopback port. Set `APP_URL` to the proxy's
public URL, including the configured deployment root. MongoDB, Solr and the
debug port stay on loopback. Check `GET /readyz` at the public origin before
opening `APP_URL`. Readiness stays at the origin even when the landing page
is under a deployment root such as `/research`.
[Development Compose configuration](../development/docker-compose.yml)

### Running All Steps:

For initial environment setup, you can use `npm run compile:all` followed by the session-secret export above and `npm run dev:run`. This command streamlines the process by compiling both the backend and frontend, and setting up the application stack for the first time.
