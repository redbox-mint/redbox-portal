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
