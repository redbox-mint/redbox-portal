# Welcome to the RedBox Portal Project Wiki!

Welcome to the official wiki for the RedBox Portal project! This collaborative space is designed to provide comprehensive documentation, guides, and insights into our project's development and usage. Our goal is to empower users and contributors alike with the knowledge they need to effectively engage with and contribute to the RedBox Portal.

## Getting Started

If you're new to RedBox Portal, here's where you can get started:

- **[Installation Guide](Installation-Guide.md)**: Follow our step-by-step guide to get RedBox Portal up and running in your environment.
- **[User Guide](User-Guide.md)**: Learn how to navigate the platform, manage your data, and utilize advanced features.
- **[User Management](User-Management.md)**: Admin guide for linked accounts, disabled users, and user audit history.
- **[Development Guide](Development-Guide.md)**: Get started with development on the platform.

## Developer Reference

- **[Architecture Overview](Architecture-Overview.md)**: High-level system structure and key components.
- **[Coding Standards and Conventions](Coding-Standards-and-Conventions.md)**: Shared language and style expectations.
- **[Configuration Guide](Configuration-Guide.md)**: Portal configuration and environment settings.
- **[Configuring Figshare Publishing](Configuring-Figshare-Publishing.md)**: Admin guide for the Figshare publishing AppConfig screen.
- **[Migrating from the Legacy Mint Harvest Endpoint](Migrating-from-the-Legacy-Mint-Harvest-Endpoint.md)**: Migration guide for moving harvest integrations to the new records and harvest-runs endpoints.
- **[Configuring Solr](Configuring-Solr.md)**: Solr connection, schema initialisation, and metadata-to-index mapping.
- **[TUS and Uppy Companion Setup](TUS-and-Uppy-Companion-Setup.md)**: Configure resumable uploads and cloud-provider imports, including security behavior.
- **[Uppy and TUS Architecture](Uppy-and-TUS-Architecture.md)**: End-to-end architecture and orchestration flows for local and provider-backed uploads.
- **[Form Configuration Internals](Form-Configuration-Internals.md)**: Form config types, conventions, visitors, and validation details.
- **[Configuring Form Expressions](Configuring-Form-Expressions.md)**: Event-driven expressions for dynamic form behavior using JSONata.
- **[Form Configuration Recipes](Form-Configuration-Recipes.md)**: Reusable copy-and-adapt patterns for form config (e.g. populating fields from a related record).
- **[Form Event Bus Architecture](Form-Event-Bus-Architecture.md)**: Technical documentation of the event bus system for developers.
- **[Authoritative Server-Side Form Validation](Server-Side-Form-Validation-Operations.md)**: Rollout configuration, privacy-safe telemetry, historical repair, bypass, signoff, and rollback runbook.
- **[Record Schema Contract Operations](Record-Schema-Contract-Operations.md)**: Feature configuration, storage capability, shadow auditing, limits, retention pins and dry runs, startup diagnostics, telemetry, and troubleshooting.
- **[Record Schema Contract API](Record-Schema-Contract-API.md)**: Client guide to schema resolution, discovery, private caching, partial diagnostics, structural validation, and conditional updates.
- [Record Schema Contract Contributors](Record-Schema-Contract-Contributors.md)
  covers component and namespaced-extension registration, deterministic output,
  diagnostics, limits and startup failures.
- **[Concurrent Record Modifications](Concurrent-Record-Modifications.md)**: Entity-tag clients, record-type modes, adapter contracts, lifecycle recovery, telemetry, canary rollout, and rollback.
- **[Migrating Save Buttons to Validation Operations](Migrating-Save-Buttons-to-Validation-Operations.md)**: Add server-owned operation intent while retaining interactive validation groups.
- [HTTP logging](Configuration-Guide.md#diagnostics-and-upgrade) covers Fastify
  diagnostics. [Historical Request Chronicle Logging](Request-Chronicle-Logging.md)
  describes the preceding host, including its event and retention model.
- **[ReDBox Automated Tests](ReDBox-Automated-Tests.md)**: Test suites, commands, and CI notes.
- **[Playwright regression coverage](Playwright-Regression-Coverage.md)**: Chromium baseline, scenario catalogue, application manifest, and qualification workflow.
- **[Translation Updates Runbook](Translation-Updates-Runbook.md)**: Translation key, metadata, plural, locale, and verification guidance.
- **[REST API Documentation](REST-API-Documentation.md)**: Link to the REST API reference.
- **[Generated Reference Documentation](Generated-Reference-Documentation.md)**: Current hook extension contracts, form contracts, schemas, machine artifacts, and local generation commands.
- **[User Management](User-Management.md)**: Feature-specific notes for the Manage Users UI, related models, and admin user-management endpoints.

- **[Cache persistence](Cache-Persistence.md)**: Architecture/builds, institution and hook migration, existing-volume index preparation, and recovery for the next transition and official v6.
- **[Persistence index preparation](Persistence-Index-Preparation.md)**: One inspect/ensure command for selected qualified groups and fresh-stack provisioning.
- **[Branding persistence](Branding-Persistence.md)**: Prisma publication/history, atomic conflicts and external assets.
- **[Staged storage persistence](Staged-Storage-Persistence.md)**: Prisma storage, native GridFS, index preparation and recovery.

## Core Packages

- **[Redbox Core Types](Redbox-Core-Types.md)**: Core type definitions, **business logic services**, Prisma contracts, policies, config defaults, and bootstrap functions.
- [Extension loading](Redbox-Loader.md) covers API2 discovery and registration.
  [V5 shim cleanup](Cache-Persistence-Hook-Migration.md)
- **[Redbox Dev Tools](Redbox-Hook-Kit.md)**: Shared tooling for creating and maintaining ReDBox hooks.
- **[Services Architecture](Services-Architecture.md)**: Deep dive into the service layer architecture and how to extend or override services.
- **[Figshare Service Technical Guide](Figshare-Service-Technical-Guide.md)**: Public service surface, orchestration flows, and Figshare-specific config and type reference.
- **[Controllers Architecture](Controllers-Architecture.md)**: Fastify controller actions, concrete inputs, policy binding and API2 extension routes.

## Contributing

We welcome contributions from the community! Whether you're interested in fixing bugs, adding new features, or improving documentation, there's a place for you in the RedBox Portal project. Here's how you can get involved:

- **[Contribution Guidelines](https://github.com/redbox-mint/redbox-portal/blob/master/CONTRIBUTING.md)**: Read our guidelines to understand the best practices and requirements for contributing to the project.
- **[Issue Tracker](https://github.com/redbox-mint/redbox-portal/issues)**: Check out open issues that need attention or submit new ones.

## Community and Support

Join our vibrant community to discuss ideas, share knowledge, and get support:

- **[Discussion Forum](https://redbox-community.slack.com)**: Participate in discussions and connect with other RedBox Portal users and developers via our Slack community.
- **[ReDBox Portal API Documentation](REST-API-Documentation.md)**: Detailed information about the API endpoints and examples.

## Stay Updated

Stay connected with the latest updates, releases, and news:

- **Project Blog**: Read about the latest developments, feature highlights, and community stories.
- **Product Roadmap**: Explore our [Product Roadmap](https://github.com/orgs/redbox-mint/projects/3/views/2) to see upcoming features and updates planned for RedBox Portal.
- **Newsletter**: Subscribe to our newsletter for regular updates delivered to your inbox.

Thank you for visiting the RedBox Portal project wiki! We hope you find this resource helpful and encourage you to contribute to our growing community.

- [Identity and membership persistence](Identity-Persistence.md): Prisma credentials, physical membership edges and recovery.

- [Persistence migration](Persistence-Migration.md): ORM retirement, institution hooks and stale configuration guidance.

## ReDBox v6 runtime migration

The backend starts with `node app.js` and uses the owned application runtime
and API2 Fastify composition. Start with
[Architecture](Architecture-Overview.md), [Configuration](Configuration-Guide.md),
[extension loading](Redbox-Loader.md), [operator/API-client changes](V6-Client-Compatibility.md),
and [installation and probes](Installation-Guide.md).

For API1 hook conversion, use the [API2 / Fastify migration guide](../specs/fastify-migration/extension-api2.md).
Revision 5 local qualification is recorded in [G7 evidence](../specs/fastify-migration/evidence/FM-048.md).
