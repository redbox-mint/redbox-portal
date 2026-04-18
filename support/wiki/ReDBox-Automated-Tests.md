# ReDBox Automated Tests

This repository uses a mix of testing strategies including unit, integration, and API tests, largely orchestrated via Docker Compose.

## Test Suites

| Command | Type | Description |
|---|---|---|
| `npm run test:mocha` | Backend Unit/Integration | Runs Mocha tests for the backend in a Docker container. |
| `npm run test:bruno` | API / Integration | Runs the core Bruno API collection against the `rbportal` container. |
| `npm run test:bruno:general` | API / Integration | Runs the general Bruno API collection against the `rbportal` container. |
| `npm run test:bruno:oidc` | API / Auth | Specialized Bruno tests for OIDC flows. |
| `npm run test:angular` | Frontend Unit | Runs Angular unit tests using `testDevAngular.sh`. |
| `npm run test:sails-ng-common` | Package Unit | Runs tests for the `sails-ng-common` package. |
| `cd packages/redbox-core && npm test` | Package Unit | Runs core-types unit tests (services and controllers). |

## Running Tests

Note on `:mount` variants: Commands with a `:mount` suffix (for example, `test:mocha:mount`) bind your local source into the container for fast development iterations. The non-mount commands are what CircleCI runs and use a locally built Docker image.

### 1. Preparation: Compile All Packages

Before running any tests, ensure all local packages and the TypeScript backend are compiled. This is critical as tests rely on the built artifacts of `redbox-core` and `sails-ng-common`.

```bash
# Installs dependencies and compiles all local packages + backend typescript
npm ci
npm run compile:all
```

If you only changed backend code in `packages/redbox-core`, `npm run compile:core` is the minimum rebuild step. This matters for mounted Bruno runs because the portal loads `@researchdatabox/redbox-core` from its built `dist` output.

### 2. Backend Unit/Integration Tests (`test:mocha`)

These tests run the Sails.js backend logic in a Docker container.

- **Command**: `npm run test:mocha`
- **Details**:
    - Spins up a `redboxportal` container defined in `support/integration-testing/docker-compose.mocha.yml`.
    - Always includes the bootstrap test (`test/bootstrap.test.ts` when present, otherwise `test/bootstrap.test.js`).
    - Runs Mocha tests directly from `test/integration` using `ts-node` (no separate test compilation step).
    - **Fast Mode**: Use `npm run test:mocha:mount` to mount your local source into the container for dev and avoid image rebuilds.
    - **CI Mode**: `npm run test:mocha` runs against the locally built image (the CircleCI path).
    - **Custom Paths**: Provide additional test globs via CLI args or the `RBPORTAL_MOCHA_TEST_PATHS` env var (space-delimited). Both are combined.
      - Example: `RBPORTAL_MOCHA_TEST_PATHS="test/integration/**/auth*.test.ts" npm run test:mocha`

Relevant current coverage includes `test/integration/services/AdminUserManagementAjax.test.ts`, which verifies the CSRF-backed admin user-management AJAX routes for link-candidate search, linking, linked-account retrieval, disable/enable, and user-audit retrieval.

### 3. API Integration Tests (`test:bruno`)

These tests use **Bruno** to make actual HTTP requests against a running instance of the portal.

- **Commands**: `npm run test:bruno`, `npm run test:bruno:general`, `npm run test:bruno:oidc`
- **Details**:
    - Starts the full application stack (Portal + MongoDB + dependencies).
    - `test:bruno` runs the core Bruno collection.
    - `test:bruno:general` runs the general Bruno collection.
    - `test:bruno:oidc` runs the OIDC authentication flows.
    - Dev mount variants: `test:bruno:general:mount`, `test:bruno:oidc:mount`.
    - Cleanup commands: `test:bruno:clean`, `test:bruno:general:clean`, `test:bruno:oidc:clean`.
    - The core Bruno collection includes user-management requests under `test/bruno/1 - REST API/2 - User Management/`, including create-secondary-user, search-link-candidates, get-user-links, and link-accounts flows for the legacy webservice `/api/users/*` routes.
    - The general/AJAX Bruno collection includes browser-admin user-management coverage under `test/bruno/2 - AJAX calls/1 - Admin User Tests/`, including:
      - create-secondary-user for account linking
      - search-link-candidates
      - link-accounts
      - get-linked-accounts
      - disable-user
      - enable-user
      - get-user-audit

### 4. Frontend Unit Tests (`test:angular`)

Runs standard Angular unit tests (Jasmine/Karma).

- **Command**: `npm run test:angular`
- **Details**:
    - Executes `support/unit-testing/angular/testDevAngular.sh`.
    - Uses ChromeHeadless for browser environment.
    - Generates code coverage reports.

### 5. Package-Specific Tests

Some packages have their own independent test suites.

- **Redbox Core Types**:
  ```bash
  cd packages/redbox-core
  npm test
  ```
  Runs unit tests for controllers and services in the core-types package, including the user-management controller and service coverage for linking, disable/enable logic, and user audit retrieval.

- **Sails-NG-Common**:
  ```bash
  npm run test:sails-ng-common
  ```
  Runs Mocha tests specifically for the shared models package.

## Continuous Integration
Tests are automatically run in CircleCI on every push, and the build job also runs `npm run doc:api` so the generated API docs stay in sync. See `.circleci/config.yml` for the full pipeline definition.
