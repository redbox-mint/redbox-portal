# Agent Documentation Router

This file is a guide for AI agents and automation tools to locate relevant documentation in this repository.

All project documentation is maintained in the `support/wiki/` submodule. Agents should prefer these wiki pages over legacy `support/docs` content.

## Documentation Index

- **Wiki Home**: [support/wiki/Home.md](support/wiki/Home.md)
  - Consult for: Primary entry point to all wiki documentation.

- **Architecture & High-Level Overview**: [support/wiki/Architecture-Overview.md](support/wiki/Architecture-Overview.md)
  - Consult for: Understanding modules, data flow, packages, and tech stack.

- **Services Architecture**: [support/wiki/Services-Architecture.md](support/wiki/Services-Architecture.md)
  - Consult for: Business logic services, service patterns, and how to extend/override services in hooks.

- **Redbox Core Types**: [support/wiki/Redbox-Core-Types.md](support/wiki/Redbox-Core-Types.md)
  - Consult for: Core package documentation, services list, models, policies, and config defaults.

- **Redbox Loader**: [support/wiki/Redbox-Loader.md](support/wiki/Redbox-Loader.md)
  - Consult for: Pre-lift shim generation, service/model/policy shims, hook discovery.

- **Coding Standards**: [support/wiki/Coding-Standards-and-Conventions.md](support/wiki/Coding-Standards-and-Conventions.md)
  - Consult for: Linter rules, naming conventions, TypeScript configuration.

- **Testing**: [support/wiki/ReDBox-Automated-Tests.md](support/wiki/ReDBox-Automated-Tests.md)
  - Consult for: How to run tests (`npm run test:*`), where tests are located, and CI pipelines.

- **Configuration Guide**: [support/wiki/Configuration-Guide.md](support/wiki/Configuration-Guide.md)
  - Consult for: Sails config layout, environment overrides, and portal-specific config files.

- **Record Forms**: [support/wiki/Configuring-Record-Forms.md](support/wiki/Configuring-Record-Forms.md)
  - Consult for: Form configuration structure, workflow/form linkage, and dynamic form patterns.

- **API Guide**: [support/wiki/ReDBox-Portal-API.md](support/wiki/ReDBox-Portal-API.md)
  - Consult for: API access setup and REST API reference pointers.

- **Installation**: [support/wiki/Installation-Guide.md](support/wiki/Installation-Guide.md)
  - Consult for: Docker and manual installation steps.

- **Development**: [support/wiki/Development-Guide.md](support/wiki/Development-Guide.md)
  - Consult for: Dev environment setup, compilation, and running locally.

- **User Guide**: [support/wiki/User-Guide.md](support/wiki/User-Guide.md)
  - Consult for: High-level configuration topics and usage workflows.

- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)
  - Consult for: PR workflows, branching, and commit standards.

- **General Usage/Install**: [README.md](README.md)
  - Consult for: Getting started, installation, and project summary.

## Key Configuration Files
- `package.json`: Scripts and dependencies.
- `tsconfig.json`: TypeScript compiler options.
- `.circleci/config.yml`: CI/CD pipeline definitions.
- `support/integration-testing/docker-compose*.yml`: Test environment setups.
