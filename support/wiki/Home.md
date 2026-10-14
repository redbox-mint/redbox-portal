# Welcome to the RedBox Portal Project Wiki!

Welcome to the official wiki for the RedBox Portal project! This collaborative space is designed to provide comprehensive documentation, guides, and insights into our project's development and usage. Our goal is to empower users and contributors alike with the knowledge they need to effectively engage with and contribute to the RedBox Portal.

## Getting Started

If you're new to RedBox Portal, here's where you can get started:

- **[Installation Guide](https://github.com/redbox-mint/redbox-portal/wiki/Installation-Guide)**: Follow our step-by-step guide to get RedBox Portal up and running in your environment.
- **[User Guide](https://github.com/redbox-mint/redbox-portal/wiki/User-Guide)**: Learn how to navigate the platform, manage your data, and utilize advanced features.
- **[User Management](https://github.com/redbox-mint/redbox-portal/wiki/User-Management)**: Admin guide for linked accounts, disabled users, and user audit history.
- **[Development Guide](https://github.com/redbox-mint/redbox-portal/wiki/Development-Guide)**: Get started with development on the platform.

## Developer Reference

- **[Architecture Overview](https://github.com/redbox-mint/redbox-portal/wiki/Architecture-Overview)**: High-level system structure and key components.
- **[Coding Standards and Conventions](https://github.com/redbox-mint/redbox-portal/wiki/Coding-Standards-and-Conventions)**: Shared language and style expectations.
- **[Configuration Guide](https://github.com/redbox-mint/redbox-portal/wiki/Configuration-Guide)**: Portal configuration and environment settings.
- **[Configuring Figshare Publishing](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Figshare-Publishing)**: Admin guide for the Figshare publishing AppConfig screen.
- **[Migrating from the Legacy Mint Harvest Endpoint](https://github.com/redbox-mint/redbox-portal/wiki/Migrating-from-the-Legacy-Mint-Harvest-Endpoint)**: Migration guide for moving harvest integrations to the new records and harvest-runs endpoints.
- **[Configuring Solr](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Solr)**: Solr connection, schema initialisation, and metadata-to-index mapping.
- **[TUS and Uppy Companion Setup](https://github.com/redbox-mint/redbox-portal/wiki/TUS-and-Uppy-Companion-Setup)**: Configure resumable uploads and cloud-provider imports, including security behavior.
- **[Uppy and TUS Architecture](https://github.com/redbox-mint/redbox-portal/wiki/Uppy-and-TUS-Architecture)**: End-to-end architecture and orchestration flows for local and provider-backed uploads.
- **[Form Configuration Internals](https://github.com/redbox-mint/redbox-portal/wiki/Form-Configuration-Internals)**: Form config types, conventions, visitors, and validation details.
- **[Configuring Form Expressions](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Form-Expressions)**: Event-driven expressions for dynamic form behavior using JSONata.
- **[Form Configuration Recipes](https://github.com/redbox-mint/redbox-portal/wiki/Form-Configuration-Recipes)**: Reusable copy-and-adapt patterns for form config (e.g. populating fields from a related record).
- **[Form Event Bus Architecture](https://github.com/redbox-mint/redbox-portal/wiki/Form-Event-Bus-Architecture)**: Technical documentation of the event bus system for developers.
- **[Authoritative Server-Side Form Validation](https://github.com/redbox-mint/redbox-portal/wiki/Server-Side-Form-Validation-Operations)**: Rollout configuration, privacy-safe telemetry, historical repair, bypass, signoff, and rollback runbook.
- **[Record Schema Contract Operations](https://github.com/redbox-mint/redbox-portal/wiki/Record-Schema-Contract-Operations)**: Feature configuration, storage capability, shadow auditing, limits, retention pins and dry runs, startup diagnostics, telemetry, and troubleshooting.
- **[Record Schema Contract API](https://github.com/redbox-mint/redbox-portal/wiki/Record-Schema-Contract-API)**: Client guide to schema resolution, discovery, private caching, partial diagnostics, structural validation, and conditional updates.
- **[Record Schema Contract Contributors](https://github.com/redbox-mint/redbox-portal/wiki/Record-Schema-Contract-Contributors)**: Hook-author contract for component and namespaced-extension registration, dialect-neutral IR, ownership, nullability, deterministic output, diagnostics, limits, and lift failures.
- **[Concurrent Record Modifications](https://github.com/redbox-mint/redbox-portal/wiki/Concurrent-Record-Modifications)**: Entity-tag clients, record-type modes, adapter contracts, lifecycle recovery, telemetry, canary rollout, and rollback.
- **[Migrating Save Buttons to Validation Operations](https://github.com/redbox-mint/redbox-portal/wiki/Migrating-Save-Buttons-to-Validation-Operations)**: Add server-owned operation intent while retaining interactive validation groups.
- **[ReDBox Automated Tests](https://github.com/redbox-mint/redbox-portal/wiki/ReDBox-Automated-Tests)**: Test suites, commands, and CI notes.
- **[Translation Updates Runbook](https://github.com/redbox-mint/redbox-portal/wiki/Translation-Updates-Runbook)**: Translation key, metadata, plural, locale, and verification guidance.
- **[REST API Documentation](https://github.com/redbox-mint/redbox-portal/wiki/REST-API-Documentation)**: Link to the REST API reference.
- **[Generated Reference Documentation](https://github.com/redbox-mint/redbox-portal/wiki/Generated-Reference-Documentation)**: Current hook extension contracts, form contracts, schemas, machine artifacts, and local generation commands.
- **[User Management](https://github.com/redbox-mint/redbox-portal/wiki/User-Management)**: Feature-specific notes for the Manage Users UI, related models, and admin user-management endpoints.

## Core Packages

- **[Redbox Core Types](https://github.com/redbox-mint/redbox-portal/wiki/redbox-core)**: Core type definitions, **business logic services**, Waterline models, policies, config defaults, and bootstrap functions.
- **[Redbox Loader](https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Loader)**: Pre-lift shim generation system that bridges Sails.js to core types, including service shim generation.
- **[Redbox Dev Tools](https://github.com/redbox-mint/redbox-portal/wiki/redbox-dev-tools)**: Shared tooling for creating and maintaining ReDBox hooks.
- **[Services Architecture](https://github.com/redbox-mint/redbox-portal/wiki/Services-Architecture)**: Deep dive into the service layer architecture and how to extend or override services.
- **[Figshare Service Technical Guide](https://github.com/redbox-mint/redbox-portal/wiki/Figshare-Service-Technical-Guide)**: Public service surface, orchestration flows, and Figshare-specific config and type reference.
- **[Controllers Architecture](https://github.com/redbox-mint/redbox-portal/wiki/Controllers-Architecture)**: Controller locations, lifecycle (`init()`), shim generation, and hook overrides.

## Contributing

We welcome contributions from the community! Whether you're interested in fixing bugs, adding new features, or improving documentation, there's a place for you in the RedBox Portal project. Here's how you can get involved:

- **[Contribution Guidelines](https://github.com/redbox-mint/redbox-portal/blob/master/CONTRIBUTING.md)**: Read our guidelines to understand the best practices and requirements for contributing to the project.
- **[Issue Tracker](https://github.com/redbox-mint/redbox-portal/issues)**: Check out open issues that need attention or submit new ones.

## Community and Support

Join our vibrant community to discuss ideas, share knowledge, and get support:

- **[Discussion Forum](https://redbox-community.slack.com)**: Participate in discussions and connect with other RedBox Portal users and developers via our Slack community.
- **[ReDBox Portal API Documentation](https://redbox-mint.github.io/redbox-portal/additional-documentation/rest-api.html)**: Detailed information about the API endpoints and examples.

## Stay Updated

Stay connected with the latest updates, releases, and news:

- **Project Blog**: Read about the latest developments, feature highlights, and community stories.
- **Product Roadmap**: Explore our [Product Roadmap](https://github.com/orgs/redbox-mint/projects/3/views/2) to see upcoming features and updates planned for RedBox Portal.
- **Newsletter**: Subscribe to our newsletter for regular updates delivered to your inbox.

Thank you for visiting the RedBox Portal project wiki! We hope you find this resource helpful and encourage you to contribute to our growing community.
