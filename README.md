<h1>
<a href="http://www.redboxresearchdata.com.au"><img alt="ReDBox Logo" src="https://github.com/redbox-mint/redbox-portal/raw/master/assets/images/logo.png"/></a>
</h1>

[![Build Status](https://circleci.com/gh/redbox-mint/redbox-portal.svg?style=svg)](https://circleci.com/gh/redbox-mint/redbox-portal)
[![codecov](https://codecov.io/gh/redbox-mint/redbox-portal/branch/master/graph/badge.svg)](https://codecov.io/gh/redbox-mint/redbox-portal)

ReDBox is an open source Research Data Management platform that assists researchers and institutions to plan, create and publish their research data assets.
ReDBox is one of the most popular research data management tools in Australia. It is currently in use across 12 Australian universities. ReDBox supports the Australian research community to describe and share information about research data collections. It assists data custodians in meeting institutional data management policies, applying the requirements of the [Australian Code for the Responsible Conduct of Research](https://www.nhmrc.gov.au/guidelines-publications/r39), and publishing to [Research Data Australia](http://researchdata.ands.org.au/) (RDA), the national research data discovery system maintained by the [Australian Research Data Commons](http://ardc.org.au/) (ARDC).

The [Queensland Cyber Infrastructure Foundation](http://www.qcif.edu.au) (QCIF) leads the ReDBox development initiative and provides several services including a support subscription service to institutions.


## Development
Requirements:

- Node 12.16.0
Development requires Docker. Run `./runForDev.sh install jit` at least once.

- Docker

Run `./runForDev.sh install jit`

It will 
   - Pull qcifengineering/redbox-portal from docker hub (If a local copy does not exist)
   - Compile backend
   - Compile frontend
   - Then start docker-compose
   
Open http://localhost:1500 to start browsing

### Build local docker image

Run `./dockerlocal_dev.sh`

It will
   - Build a local docker image of qcifengineering/redbox-portal:latest
