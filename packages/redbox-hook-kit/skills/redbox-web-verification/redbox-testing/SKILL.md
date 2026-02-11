# Skill: Redbox Testing

## Context
ReDBox uses Mocha for integration testing and Bruno for API testing. All integration tests are run within Docker containers managed by docker-compose profiles.

## Mocha Tests
Mocha tests are located in `packages/*/test`. To run them, they are executed within a Docker environment.

### Commands
- **Run all Mocha tests (Development):**
  ```bash
  npm run test:mocha:mount
  ```
  This mounts your local code into the test containers, allowing for faster iteration.

- **Run all Mocha tests (CI):**
  ```bash
  npm run test:mocha
  ```
  This runs the tests using the `portal` profile without mounting local code.

- **Clean up Mocha test resources:**
  ```bash
  npm run test:mocha:clean
  ```

## Bruno Tests
Bruno is used for API testing. Tests are located in `test/bruno`.

### Commands
- **Run Bruno OIDC tests (Development):**
  ```bash
  npm run test:bruno:oidc:mount
  ```
  This runs tests specifically for OIDC authentication flows with mounted code.

- **Run Bruno General tests (Development):**
  ```bash
  npm run test:bruno:general:mount
  ```
  This runs a general suite of Bruno tests with mounted code.

- **Run Bruno tests (CI):**
  The non-mount variants (e.g. `npm run test:bruno:oidc`) are intended for CircleCI builds.

- **Cleanup:**
  Use the corresponding clean command for the test suite you ran:
  - `npm run test:bruno:clean`
  - `npm run test:bruno:oidc:clean`
  - `npm run test:bruno:general:clean`

## Docker Profiles
These commands utilize Docker Compose profiles to start the necessary services (e.g., `redboxportal`, `keycloak`, `mongo`, `solr`). The `package.json` scripts define which profiles and compose files are used for each test suite.
