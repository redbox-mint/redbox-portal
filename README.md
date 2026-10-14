# ReDBox Portal

[![Build Status](https://circleci.com/gh/redbox-mint/redbox-portal.svg?style=svg)](https://circleci.com/gh/redbox-mint/redbox-portal)
[![codecov](https://codecov.io/gh/redbox-mint/redbox-portal/branch/master/graph/badge.svg)](https://codecov.io/gh/redbox-mint/redbox-portal)

ReDBox (Research Data Box) is an open-source Research Data Management platform that assists researchers and institutions in planning, creating, and publishing research data assets.

ReDBox is one of the most popular research data management tools in Australia. It is currently in use across 11 universities in Australia and New Zealand. ReDBox supports the Australian research community to describe and share information about research data collections. It assists data custodians in meeting institutional data management policies, applying the requirements of the [Australian Code for the Responsible Conduct of Research](https://www.nhmrc.gov.au/guidelines-publications/r39), and publishing to [Research Data Australia](http://researchdata.ands.org.au/) (RDA), the national research data discovery system maintained by the [Australian Research Data Commons](http://ardc.org.au/) (ARDC).

The [Queensland Cyber Infrastructure Foundation](http://www.qcif.edu.au) (QCIF) leads the ReDBox development initiative and provides several services including a support subscription service to institutions.

## Documentation

- **[Architecture](support/wiki/Architecture-Overview.md)**: High-level structure and design.
- **[Coding Standards](support/wiki/Coding-Standards-and-Conventions.md)**: Conventions and style guides.
- **[Testing](support/wiki/ReDBox-Automated-Tests.md)**: Strategies and commands for running tests.
- **Generated Reference**: Run `npm run docs:generate` for the hook extension and form-contract reference, machine-readable catalogue, FormConfig JSON Schema, and advisory health report. Run `npm run doc:api` first to include the independent REST reference, then preview the composed site with `npm run docs:serve`.
- **[Contributing](CONTRIBUTING.md)**: Guidelines for submitting changes.

## Quick Start

### Prerequisites

- Node.js (v24.x recommended)
- Docker & Docker Compose

### Development using Docker

1.  **Install Dependencies**:
    ```bash
    npm ci
    npm run compile:all
    ```
2.  **Start Dev Environment**:
    ```bash
    npm run dev:run
    ```
    This spins up the application and dependencies (MongoDB, etc.) using Docker Compose.

### Running Tests

- **Backend Mocha Tests**: `npm run test:mocha`
- **Bruno API Tests**: `npm run test:bruno`
- **Angular Tests**: `npm run test:angular`

For detailed testing instructions, see [support/wiki/ReDBox-Automated-Tests.md](support/wiki/ReDBox-Automated-Tests.md).

## Support

For more information, visit the [Redbox Portal Wiki](https://github.com/redbox-mint/redbox-portal/wiki).

## Queued Figshare synchronisation

See the [configuration and operator runbook](support/wiki/Figshare-Queued-Synchronisation.md) and [verification record](support/figshare/VERIFICATION.md). New processing is disabled until migration and institutional staging checks are complete.

## SIEM forwarding

SIEM is disabled by default. Administrators configure it separately for each brand at `/:branding/:portal/admin/siem`, or through the Admin-only `/:branding/:portal/api/siem/*` endpoints. Enable the required event categories and destinations, then test each configured receiver. Authentication success/failure, session/path authorization denials, user management, record lifecycle, integration audits and attachment audits use background capture and delivery; original audit storage continues independently. Events whose brand cannot be resolved are skipped, including the global synthetic batch-validation audit that has no brand ownership.

All destinations use HTTP or HTTPS. Splunk uses the HEC JSON collector endpoint; OTLP uses an HTTP JSON logs endpoint, normally `/v1/logs`. RFC5424 JSON, CEF and LEEF are text bodies sent to an HTTP receiver configured for that format. These text adapters do not open UDP/TCP syslog connections, and OTLP does not use gRPC or protobuf.

Delivery saves progress and attempt budgets separately for every destination. An acknowledged success is retained while other destinations retry. The default retry delay is 60 seconds, multiplied by 2 after each failed attempt; destination overrides are supported. The background poll runs once per minute, so delivery may occur after its earliest eligible time. `batchSize` limits events considered per poll, and `maxAttempts` includes reserved attempts interrupted by a worker crash. Once all active destinations are terminal, an event is delivered or dead-lettered. Expired dead letters and their attempt history are removed after `deadLetterRetentionDays` (default 30). Successful event history is not removed by this setting.

Delivery is at-least-once: a receiver may accept an event before its acknowledgement is saved. Receivers should deduplicate the stable `eventId`. MongoDB conditional claims and expiring ownership tokens prevent simultaneous valid workers from claiming the same event and reject stale worker writes.

Email addresses, IP address fields and user-agent fields are excluded by default; their privacy flags explicitly enable capture. Credential fields are always redacted, and custom denylisted paths add exclusions. The serialized event has a UTF8 byte limit (minimum 1024 bytes, default 65536); oversized content receives an explicit truncation marker while canonical event metadata is preserved. Changing privacy settings affects future capture and subsequent forwarding, but cannot restore information already excluded at capture.

Tokens, passwords and custom credential headers are masked in configuration responses. Only `Accept`, `Content-Type`, `User-Agent` and `X-Test` headers are treated as public. Masks preserve credentials for the same destination ID and target; when changing an endpoint or adapter, replace or explicitly clear masked credentials. HTTP response diagnostics retain status and bounded safe collector information without storing raw response bodies. Configuration saves validate destinations, headers and numeric limits before persistence. Delivery always runs in the background; legacy `nonBlocking:false` normalizes to true, and unsupported `formatOptions` are discarded.
