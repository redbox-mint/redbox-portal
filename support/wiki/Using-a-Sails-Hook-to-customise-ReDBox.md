## Using a Sails hook to customise ReDBox

To allow us to make customisations to a ReDBox instance, we take advantage of the [sails installable hook](https://sailsjs.com/documentation/concepts/extending-sails/hooks) feature.
This allows us to package our changes as an NPM package and using npm install, 
have them applied to the instance during the lifting process.

### Development

A code project is setup in Bitbucket that contains the hook code.
This should be of the format `redbox-hook-[project name]`, 
where `[project-name]` is replaced with the project, feature, or client name.

Each hook contains a `docker-compose.yml` intended for development.
It loads the customised container (i.e. with hook installed) and 
volume mounts the local code so that you can make changes.

For example:

```yaml
services:
  rbportal:
    image: qcifengineering/redbox-portal:develop
    volumes:
      - "../../:/opt/redbox-portal/node_modules/redbox-hook-[project-name]"
```

To run the app use the `runForDev.sh` script or `docker-compose -f support/development/docker-compose.yml up`.


### Form Configuration changes

Form configuration changes are kept in the `form-config` directory.
Files are loaded using require and merged using `lodash` merge to update the form configuration.

### Sails Configuration Changes

Sails configuration changes are kept in the `config` directory.
Files are loaded using require and merged using `lodash` merge to update the form configuration.

### Asset and View Changes

Assets and Views are kept in the `assets` and `views` directories.
These files are copied into `/opt/redbox-portal/assets` and `/opt/redbox-portal/views` respectively as part of the startup.
