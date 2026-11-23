Welcome to our Development Guide! This resource aims to help developers effectively understand, contribute to, and navigate our project. Below are key sections:


## Getting Started

- **[Development Environment Setup](Development-Environment-Setup.md)**: Begin with setting up your development environment.
- **[Compiling and Running the Development Environment](Compiling-and-running-the-development-environment.md)**: Learn how to compile and run the development setup.
- **[ReDBox Automated Tests](ReDBox-Automated-Tests.md)**: Understand our automated testing framework.

## Architecture and Conventions

- **[Architecture Overview](Architecture-Overview.md)**: Review the system structure and major components.
- **[Coding Standards and Conventions](Coding-Standards-and-Conventions.md)**: Follow shared language and style conventions.

## Core Packages

- **[Redbox Core Types](Redbox-Core-Types.md)**: Core type definitions, business logic services, models, policies, and config defaults.
- [Extension loading](Redbox-Loader.md) covers async discovery and declaration resolution.
- **[Redbox Dev Tools](Redbox-Hook-Kit.md)**: Shared tooling for developing ReDBox hooks.
- **[Generated Reference Documentation](Generated-Reference-Documentation.md)**: Generate and audit hook extension and form contracts, compose the independent REST reference, and preview the complete site locally.
- **[Services Architecture](Services-Architecture.md)**: Deep dive into the service layer and how to extend services.

## Customisation

- [Customising ReDBox with a v6 extension](Using-a-Sails-Hook-to-customise-ReDBox.md) covers API2 registration, controller bindings and owned lifecycle. [API2 migration guide](../specs/fastify-migration/extension-api2.md)

Dive into each section for detailed instructions and best practices.

## Cache persistence

Read [cache architecture and build guidance](Cache-Persistence.md) before rebuilding core, and [existing-volume index preparation](Persistence-Index-Preparation.md) before restarting a pre-existing development database with Prisma persistence. Mongo init scripts run only on empty volumes. Review [institution migration](Persistence-Migration.md) for retired model callbacks and mapping overrides.

## v6 toolchain and startup

Use Node **26.12.1**, npm **11.20.0** and exact package pins. `npm run compile:all`
installs/builds all selected packages and browser assets; `npm run dev:run` mounts the compiled tree
and `npm run dev:run:build` exercises image mode. Export `REDBOX_SESSION_SECRET`
(at least 32 characters) before either command; the complete sequence is in
[the development workflow](../development/README.md). Core must finish its clean build
before compiling dependents. `npm start` runs the same Fastify executable
(`node app.js`) as the production image.

Startup reads explicit configuration modules and v6 declarations. It never
creates service/controller/config shims. Run `redbox-dev-tools init NAME --template v6`
for a new extension. Consult [Services Architecture](Services-Architecture.md),
[Configuration](Configuration-Guide.md) and [client changes](V6-Client-Compatibility.md).

Set the public URL to the actual browser-facing development origin, including
its protocol and port. Page and static responses use the configured public URL
to select the HTTPS-only opener-isolation header. In containers, `REDBOX_PORT`
also selects the port checked by the image. Use `GET /readyz` before sending
test traffic. [Startup and probes](Installation-Guide.md#startup-probes-and-shutdown)
