Welcome to our Development Guide! This resource aims to help developers effectively understand, contribute to, and navigate our project. Below are key sections:

## Getting Started

- **[Development Environment Setup](https://github.com/redbox-mint/redbox-portal/wiki/Development-Environment-Setup)**: Begin with setting up your development environment.
- **[Compiling and Running the Development Environment](https://github.com/redbox-mint/redbox-portal/wiki/Compiling-and-running-the-development-environment)**: Learn how to compile and run the development setup.
- **[ReDBox Automated Tests](https://github.com/redbox-mint/redbox-portal/wiki/ReDBox-Automated-Tests)**: Understand our automated testing framework.

## Architecture and Conventions

- **[Architecture Overview](https://github.com/redbox-mint/redbox-portal/wiki/Architecture-Overview)**: Review the system structure and major components.
- **[Coding Standards and Conventions](https://github.com/redbox-mint/redbox-portal/wiki/Coding-Standards-and-Conventions)**: Follow shared language and style conventions.

## Core Packages

- **[Redbox Core Types](https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Core-Types)**: Core type definitions, business logic services, models, policies, and config defaults.
- **[Redbox Loader](https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Loader)**: Async v6 declarations and retired shim cleanup.
- **[Redbox Dev Tools](https://github.com/redbox-mint/redbox-portal/wiki/redbox-dev-tools)**: Shared tooling for developing ReDBox hooks.
- **[Generated Reference Documentation](https://github.com/redbox-mint/redbox-portal/wiki/Generated-Reference-Documentation)**: Generate and audit hook extension and form contracts, compose the independent REST reference, and preview the complete site locally.
- **[Services Architecture](https://github.com/redbox-mint/redbox-portal/wiki/Services-Architecture)**: Deep dive into the service layer and how to extend services.

## Customisation

- **[Customising ReDBox with a v6 extension](https://github.com/redbox-mint/redbox-portal/wiki/Using-a-Sails-Hook-to-customise-ReDBox)**: Historical v5 guidance; use [v6 hook migration](../specs/sails-retirement/hook-migration-v6.md) for current extensions.

Dive into each section for detailed instructions and best practices.

## Cache persistence

Read [cache architecture and build guidance](Cache-Persistence.md) before rebuilding core, and [existing-volume index preparation](Persistence-Index-Preparation.md) before restarting a pre-existing development database with Prisma persistence. Mongo init scripts run only on empty volumes. Review [institution migration](Persistence-Migration.md) for retired model callbacks and mapping overrides.

## v6 toolchain and startup

Use Node **26.11.1**, npm **11.20.0** and exact package pins. `npm run dev:prepare`
installs/builds the selected packages; `npm run dev:run` mounts the compiled tree
and `npm run dev:run:build` exercises image mode. Core must finish its clean build
before compiling dependents. `npm start` runs `app.express.cjs`.

Startup reads explicit configuration modules and v6 declarations. It never
creates service/controller/config shims. Run `redbox-dev-tools init NAME --template v6`
for a new extension. Consult [Services Architecture](Services-Architecture.md),
[Configuration](Configuration-Guide.md) and [client changes](V6-Client-Compatibility.md).
