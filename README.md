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

- Node 18.x
- Docker
- Docker Compose

The QCIF team uses a VM provisioned using [Vagrant](https://www.vagrantup.com/) that has all the required tools and is the recommended way to develop ReDBox. It's available in the following repository
[https://github.com/qcif/vagrant-redbox-dev](https://github.com/qcif/vagrant-redbox-dev)

### Building and running the application

ReDBox uses typescript and requires compilation to javascript for both the backend Sails application and front end angular.

#### Building Backend (Sails)

Run 

```npm run compile:sails```

to install npm packages and compile the typescript

#### Building Frontend apps (Angular)

Run 

```npm run compile:ng```

to install npm packages and compile the typescript

#### Run the application

Run 

```npm run dev:run```

to bring up the docker-compose stack specified in support/development/docker-compose.yml

Alternatively, you can use all the standard docker-compose commands with the file in support/development/docker-compose.yml

e.g. 

```docker-compose -f support/development/docker-compose.yml up```

```docker-compose -f support/development/docker-compose.yml restart redboxportal```

```docker-compose -f support/development/docker-compose.yml logs -f redboxportal```

#### Run all (Initial setup)

If you'd like to run all the above steps in one command then you may run

```npm run dev:all```


### Running Tests

ReDBox has 2 sets of tests it runs:

- Integration tests for services written for Mocha
- Postman API tests run using Newman

#### Running Mocha Tests

To run the mocha tests

```npm run test:mocha```

Note: for the DOI tests to pass you will need to have Datacite Fabrica credentials and these need to be set to the following environment variables:

- `datacite_username`: Your datacite username
- `datacite_password`: Your datacite password
- `datacite_doiPrefix`: The DOI prefix

#### Running Postman Tests

To run the postman tests

```npm run test:postman```

Note: if you receive the error below, it's because you have previously run the application for development. To fix, simply delete the support/development/.dev directory and try again.

```EACCES: permission denied, scandir '/opt/redbox-portal/support/development/.dev/mongo/data/db/diagnostic.data'```