# Coding Standards and Conventions

## Language

- **TypeScript**: The primary language for both backend and frontend.
  - **Config**: Root `tsconfig.json` extends `packages/redbox-dev-tools/config/tsconfig.base.json`, which retains the conservative `@tsconfig/node24` base and ES2024 output with TypeScript `5.9.3`. This compiler target does not select the executing Node version; development/CI/runtime use Node `26.11.1` and npm `11.20.0`.
  - **Strictness**: `strict: false` is currently set, suggesting a gradual migration or legacy support.
  - **Decorators**: `experimentalDecorators: true` is enabled.

## Code Style

- **Formatting**: The project follows standard JavaScript/TypeScript idioms.
- **Naming**:
  - **Classes**: PascalCase (e.g., `AppConfigService`).
  - **Services**: Suffix with `Service` (e.g., `EmailService`).
  - **Controllers**: Suffix with `Controller` (e.g., `RecordController`).

## Directory Conventions

- **Frontend**: Located in `angular/`.
- **Backend Types Source**: Located in `typescript/`.
- **Local Packages**: Shared code should be placed in `packages/` (e.g., `redbox-core`).

## Best Practices

- **Dependency Management**: Use `npm install --no-save --ignore-scripts --strict-peer-deps` for clean installs.
- **Async/Await**: Preferred over callbacks for asynchronous operations.
- **Error Handling**: Use standard `try/catch` blocks.
