# redbox-hook-dev

A development-only ReDBox hook that supplies the **demo** record types, workflows,
dashboards, workspace types and forms that historically shipped inside
`@researchdatabox/redbox-core`.

## Why this exists

ReDBox core used to bundle opinionated demo configuration (`rdmp`, `dataRecord`,
`dataPublication`, `party`, `existing-locations`, the `consolidated` dashboard, the
`default-1.0-draft` / `dataRecord-1.0-draft` forms, etc.). Every client instance then
had to merge against / strip those entries to ship their own record types and forms.

Moving the demo configuration here keeps the core **pristine** (no record/form
opinions) while the core repo's own development and test environments still get a
working demo dataset — supplied the same way client hooks supply theirs, via the
[redbox-loader](../../support/wiki/Redbox-Loader.md).

## How it loads

The loader scans `dependencies` + `devDependencies` for the `sails.hasConfig` /
`sails.hasFormConfigs` flags in `package.json` and merges the return values of
`registerRedboxConfig()` and `registerRedboxFormConfigs()` into core config via
`_.merge({}, Config.<name>, ...hooks)`.

This package is wired into the portal as a **devDependency**
(`"redbox-hook-dev": "file:packages/redbox-hook-dev"`), so:

- **Development** (`npm run dev`): the repo + host `node_modules` are mounted into the
  container; `prepareLocalDev.sh` builds this hook (`npm run compile:dev-hook`), and the
  loader picks it up.
- **Published / client images**: `npm install --omit=dev` (and `npm prune --omit=dev`
  in the Dockerfile builder) excludes this hook, so those images stay pristine.

## Integration testing

Integration tests can run in two modes:

### CI mode (non-mount)

CircleCI builds the `test` target which bakes the hook symlink into the image:

```bash
docker build --target test -t redbox-portal:test .
```

The `ci` profile in docker-compose files uses this image directly.

### Local/mount mode

The `mount` profile mounts the full repository into the container. The test
entrypoint scripts run `npm install`, which installs this hook as a devDependency.

```bash
# Run mocha tests (mount profile)
npm run test:mocha

# Run bruno tests (mount profile)
npm run test:bruno:general
```

The `support/integration-testing/docker-compose.*.yml` files default `RBPORTAL_IMAGE`
to `qcifengineering/redbox-portal:develop` for mount mode, but CI overrides this
with the locally-built `redbox-portal:test` image.

## What lives here

- `src/config/recordtype.ts` — demo record types
- `src/config/workflow.ts` — demo workflow stages
- `src/config/dashboardtype.ts`, `src/config/dashboardview.ts` — demo dashboards
- `src/config/workspacetype.ts` — demo workspace types
- `src/config/brandingConfigurationDefaults.ts` — demo menu, home panels, DOI `dataPublication` profile
- `src/config/auth.ts` — demo default portal (`rdmp`) and post-logout redirect
- `src/config/record.ts` — demo MINT URL and `@referrer_rdmp` context variable
- `src/config/routes.ts` — demo root redirect to `/default/rdmp/home`
- `src/config/views.ts` — demo noCache paths
- `src/config/jsonld.ts` — demo JSON-LD context mappings
- `src/form-config/` — demo forms (`default-1.0-draft`, `dataRecord-1.0-draft`)

The framework-generated `generated-view-only` form remains in core.
