# Plan: Extract Demo Configuration from Core to redbox-hook-dev

## Context

The previous implementation run moved demo record types, workflows, dashboards, workspace types and forms to `redbox-hook-dev`, but left several demo-specific values in core configs. The README flags these as a follow-up:

> demo-specific entries in `brandingConfigurationDefaults` (menu / homePanels / DOI `dataPublication` profile), `auth` (default portal) and `record` (`@referrer_rdmp` query) still live in core.

This plan extracts those demo values to `redbox-hook-dev` while leaving safe framework defaults in core.

## The Loader Merge Mechanism

The `redbox-loader` merges configs via:
```js
_.merge({}, Config.<name>, hook['<name>'] || {})
```

Arrays merge by index (not replace), so core must provide empty arrays `[]` for hooks to fully supply array content.

---

## Changes to Core Config Files

### 1. `auth.config.ts` (lines 105, 109)

| Current | New Framework Default |
|---------|----------------------|
| `defaultPortal: 'rdmp'` | `defaultPortal: 'default'` |
| `postLogoutRedir: '/default/rdmp/home'` | `postLogoutRedir: '/default/default/home'` |

### 2. `routes.config.ts` (line 34)

| Current | New Framework Default |
|---------|----------------------|
| `'/': '/default/rdmp/home'` | `'/': '/default/default/home'` |

Keep `'localFormName': 'default-1.0-draft'` (line 233) — this is a form lookup key, not demo-specific.

### 3. `views.config.ts` (lines 29-33)

| Current | New Framework Default |
|---------|----------------------|
| `noCache: ['/default/rdmp/researcher/home', '/default/rdmp/home', '/']` | `noCache: ['/']` |

### 4. `record.config.ts`

| Line | Current | New Framework Default |
|------|---------|----------------------|
| 91 | `mint: "https://demo.redboxresearchdata.com.au/mint"` | `mint: ""` |
| 148-154 | `'@referrer_rdmp': {...}` | Remove entirely |

### 5. `jsonld.config.ts` (lines 24-43)

| Current | New Framework Default |
|---------|----------------------|
| `contexts: { 'default-1.0-draft': {...}, ... }` | `contexts: {}` |

### 6. `brandingConfigurationDefaults.config.ts`

| Section | Current | New Framework Default |
|---------|---------|----------------------|
| `defaultMenuConfig.items` (lines 222-296) | Full menu array | `items: []` |
| `defaultHomePanelsConfig.panels` (lines 302-354) | Full panels array | `panels: []` |
| `defaultDoiPublishingConfig.defaultProfile` (line 434) | `'dataPublication'` | `''` |
| `defaultDoiPublishingConfig.profiles` (lines 454-568) | `{ dataPublication: {...} }` | `{}` |

Keep DOI `connection` settings (baseUrl, timeoutMs, retry) as framework defaults.

---

## New Files in redbox-hook-dev

Create in `/packages/redbox-hook-dev/src/config/`:

### `brandingConfigurationDefaults.ts`
- Move current menu items, home panels, DOI `dataPublication` profile
- Export as partial config

### `auth.ts`
- `defaultPortal: 'rdmp'`
- `postLogoutRedir: '/default/rdmp/home'`

### `record.ts`
- `baseUrl.mint: "https://demo.redboxresearchdata.com.au/mint"`
- `contextVariables['@referrer_rdmp']: {...}`

### `routes.ts`
- `'/': '/default/rdmp/home'`

### `views.ts`
- `noCache: ['/default/rdmp/researcher/home', '/default/rdmp/home', '/']`

### `jsonld.ts`
- `contexts: { 'default-1.0-draft': {...}, 'default-1.0-active': {...}, 'default-1.0-retired': {...} }`

### Update `index.ts`
Add new configs to `registerRedboxConfig()`:
```ts
return {
  recordtype, workflow, dashboardtype, dashboardview, workspacetype,
  brandingConfigurationDefaults, auth, record, routes, views, jsonld,
};
```

---

## Verification

1. **Unit tests in redbox-core** — verify core defaults are framework-safe (empty arrays, neutral portal name)
2. **Integration tests with hook loaded** — verify demo functionality works (menu, DOI, login redirects)
3. **Manual check** — boot portal with hook, verify menu/home panels render

---

## Risk Assessment

| Area | Risk | Mitigation |
|------|------|------------|
| Auth defaults | Low | All deployments have hooks overriding; `'default'` portal is syntactically valid |
| DOI baseline | Low | Service already throws clear error when no profile configured |
| Root route | Medium | Need `/default/default/home` route or hook must be loaded |
| Array merge | Low | Core arrays are empty; documented pattern |

---

## Implementation Order

1. Create new hook config files (non-breaking)
2. Update hook `index.ts` to export them
3. Update core configs with framework defaults
4. Add unit tests verifying core defaults
5. Run integration tests
6. Update README to mark follow-up complete and expand CI documentation

---

## CI Pipeline Documentation

The README currently states (lines 45-47):
> **The CI image pipeline must build and push this `:develop-test` tag** (in addition to the pristine `:develop` image) for the integration suites to pass.

### What's Missing

The external CI pipeline (not in this repo) builds/pushes `qcifengineering/redbox-portal:develop` from `--target runtime`. It must now also:

1. Build `--target test` image: `docker build --target test -t qcifengineering/redbox-portal:develop-test .`
2. Push that image to Docker Hub

### Integration Test Requirements

The `support/integration-testing/docker-compose.*.yml` files default `RBPORTAL_IMAGE` to `qcifengineering/redbox-portal:develop-test`:
- `docker-compose.bruno.general.yml`
- `docker-compose.bruno.oidc.yml`
- `docker-compose.bruno.s3.yml`
- `docker-compose.mocha.yml`
- `docker-compose.playwright.yml`

Without the `develop-test` image in the registry, these integration tests fail to pull the image.

### README Update

Expand the "Test / demo image" section to include:
- Explicit build commands for both targets
- Push commands for both images
- Note that both images must be built/pushed for every CI run on develop branch
