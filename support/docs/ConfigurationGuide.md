# Configuration and Customisation Guide


## Managing your customisations

Much like in ReDBox 1.8+, it is recommended that you keep your configuration changes in it's own repository and overlay them as part of the deployment process.

See the [sample customisation repository]() for an example.

## Managing portal configuration

The ReDBox Portal is built on the [SailsJS framework](https://sailsjs.com/) and therefore takes advantage of the highly extensible configration framework provided.
Please see the [SailsJS documentation](https://sailsjs.com/documentation/reference/configuration) for more information on it's structure and configuration options.

There are several configuration items that are specific to the ReDBox Portal:
1. [record.js]() manages configuration around record management and the portal's interaction with the ReDBox and Mint services
2. [auth.js]() manages configuration around authorisation and authentication.
3. [emailnotification.js]() manages configuration of email notifications
4. [form.js](https://github.com/redbox-mint/redbox-portal/blob/master/support/docs/Configuring%20web%20forms.md) manages form configuration


## Environment variables

It is possible to use environment variables to modify configuration, this is particularly useful when running the portal in a containerised environment such as docker. Please see [Sails configuration document for more information](https://sailsjs.com/documentation/concepts/configuration#?setting-sailsconfig-values-directly-using-environment-variables)

### Environment specific files

You may override standard configuration item for a particular environment (e.g development, test and production) by creating or modifying the a environment specif config file in the location `config/env/<environment-name>.js`. You can specify the environment by setting the `NODE_ENV` environment variable.

Please see the [Sails configuration documentation](https://sailsjs.com/documentation/concepts/configuration#?environmentspecific-files-config-env) for more information.
