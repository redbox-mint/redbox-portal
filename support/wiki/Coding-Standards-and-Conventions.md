# Coding Standards and Conventions

## Language

- **TypeScript**: The primary language for both backend and frontend.
  - **Config**: Root `tsconfig.json` extends `@tsconfig/node26/tsconfig.json` and uses TypeScript 7 for backend builds.
  - **Compiler compatibility**: Backend and package `tsc` builds use TypeScript 7. Tools that require the compiler API use the pinned TypeScript 6 compatibility package. Angular 20 remains on TypeScript 5.9 until Angular supports the TypeScript 7 API.
  - **Strictness**: `strict: false` is currently set, suggesting a gradual migration or legacy support.
  - **Decorators**: `experimentalDecorators: true` is enabled.

- **Node.js**: Development, CI, generated hooks, and runtime containers require Node.js 26.7 or a later Node 26 release.

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
