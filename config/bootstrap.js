/**
 * Bootstrap
 * (sails.config.bootstrap)
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 *
 * For more information on bootstrapping your app, check out:
 * http://sailsjs.org/#!/documentation/reference/sails.config/sails.config.bootstrap.html
 */
var Observable = require('rxjs/Observable').Observable;

module.exports.bootstrap = function(cb) {
    sails.config.startupMinute = Math.floor(Date.now() / 60000);
    sails.services.cacheservice.bootstrap();
    sails.services.translationservice.bootstrap();
    if (sails.config.environment == "production" || sails.config.ng2.force_bundle) {
      sails.config.ng2.use_bundled = true;
      console.log("Using NG2 Bundled files.......");
    }
    // actual bootstrap...
    sails.services.brandingservice.bootstrap()
    .flatMap(defaultBrand => {
      sails.log.verbose("Bootstrapping roles...");
      return sails.services.rolesservice.bootstrap(defaultBrand);
    })
    .flatMap(defaultBrand => {
      // sails doesn't support 'populating' of nested associations
      // intentionally queried again because of nested 'users' population, couldn't be bothered with looping thru the results
      return sails.services.rolesservice.getRolesWithBrand(sails.services.brandingservice.getDefault());
    })
    .flatMap(defRoles => {
      return sails.services.usersservice.bootstrap(defRoles);
    })
    .flatMap(defUserAndDefRoles => {
      return sails.services.pathrulesservice.bootstrap(defUserAndDefRoles.defUser, defUserAndDefRoles.defRoles);
    })
    .flatMap(whatever => {
      return sails.services.formsservice.bootstrap(sails.services.brandingservice.getDefault());
    })
    .flatMap(whatever => {
      return sails.services.vocabservice.bootstrap();
    })
    .flatMap(whatever => {
      return sails.services.workflowstepsservice.bootstrap(sails.services.brandingservice.getDefault());
    })
    .last()
    .subscribe(retval => {
      sails.log.verbose("Bootstrap complete!");
      // It's very important to trigger this callback method when you are finished
      // with the bootstrap!  (otherwise your server will never lift, since it's waiting on the bootstrap)
      cb();
    },
    error => {
      sails.log.verbose("Bootstrap failed!!!");
      sails.log.error(error);
    });

};
