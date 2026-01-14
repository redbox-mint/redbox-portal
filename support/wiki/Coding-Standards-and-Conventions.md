# Coding Standards and Conventions

## Language

- **TypeScript**: The primary language for both backend and frontend.
  - **Config**: Root `tsconfig.json` extends `@tsconfig/node24/tsconfig.json`.
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
- **Local Packages**: Shared code should be placed in `packages/` (e.g., `redbox-core-types`).

## Best Practices

- **Dependency Management**: Use `npm install --no-save --ignore-scripts --strict-peer-deps` for clean installs.
- **Async/Await**: Preferred over callbacks for asynchronous operations.
- **Error Handling**: Use standard `try/catch` blocks.
