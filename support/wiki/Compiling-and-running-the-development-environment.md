### Node Version Manager (NVM) Usage ###

Use Node.js `26.12.1` and npm `11.20.0` for this development branch. From the repository root, run `nvm install` followed by `nvm use`, then check `node --version` and `npm --version`. The root and PDF hook `.nvmrc` files select the same runtime. Docker build/runtime stages, CI and test runners use that Node patch too. Released v5 comparison artifacts retain their own supported runtime.

### Backend Compilation:
1. **Install Packages**: Run `npm ci --ignore-scripts --strict-peer-deps` with the pinned runtime.
2. **Compile the application**: Execute `npm run compile:all` to build shared packages, core, selected extensions, host and browser assets in dependency order. `compile:host` alone does not build those dependencies.

### Frontend Compilation (Angular):

For compiling Angular TypeScript files, use the command `npm run compile:ng`. This process compiles all Angular applications, generating frontend bundles equipped with source maps to facilitate debugging.

### Running the Application:
1. **Set the session secret**: Run `export REDBOX_SESSION_SECRET="$(openssl rand -hex 32)"`. Keep that value in your local shell or private secret environment across restarts.
2. **Start Services**: Utilize `npm run dev:run` to launch the Docker Compose stack. This command sets up all required services in containers.
3. **Docker Commands**: For more control, use standard Docker Compose commands with `docker-compose -f support/development/docker-compose.yml` to manage individual services.

To access the development portal from another machine on the LAN, point a local DNS/hosts name at the VM's `192.168.20.x` address and pass the browser-facing URL at startup:

```bash
APP_URL=http://redbox-portal.local:1500 npm run dev:run
```

`APP_URL` defaults to `http://localhost:1500`. The development CSP automatically leaves out `upgrade-insecure-requests` for an HTTP `APP_URL`, so the LAN URL is not rewritten to HTTPS. Use an HTTPS `APP_URL` when the VM is behind TLS.

### Running All Steps:

For initial environment setup, you can use `npm run compile:all` followed by the session-secret export above and `npm run dev:run`. This command streamlines the process by compiling both the backend and frontend, and setting up the application stack for the first time.
