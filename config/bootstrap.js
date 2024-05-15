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
 const schedule = require('node-schedule');
 
 const actualBootstrap = async function() {
   await sails.services.translationservice.bootstrap();
   sails.log.verbose("Translation service, bootstrapped.");
   let defaultBrand = await sails.services.brandingservice.bootstrap().toPromise()
   sails.log.verbose("Branding service, bootstrapped.");
   let rolesBootstrapResult = await sails.services.rolesservice.bootstrap(defaultBrand).toPromise();
   sails.log.verbose("Roles service, bootstrapped.");
   let reportsBootstrapResult = await sails.services.reportsservice.bootstrap(sails.services.brandingservice.getDefault()).toPromise();
   sails.log.verbose("Reports service, bootstrapped.");
   let namedQueriesBootstrapResult = await sails.services.namedqueryservice.bootstrap(sails.services.brandingservice.getDefault()).toPromise();
   sails.log.verbose("Named Query service, bootstrapped.");
   // sails doesn't support 'populating' of nested associations
   // intentionally queried again because of nested 'users' population, couldn't be bothered with looping thru the results
   let defRoles = await sails.services.rolesservice.getRolesWithBrand(sails.services.brandingservice.getDefault()).toPromise();
   sails.log.verbose("Roles service, bootstrapped.");
   sails.log.verbose(defRoles);
   let defUserAndDefRoles = await sails.services.usersservice.bootstrap(defRoles).toPromise();
   sails.log.verbose("Pathrules service, bootstrapped.");
   let pathRulesBootstrapResult = await sails.services.pathrulesservice.bootstrap(defUserAndDefRoles.defUser, defUserAndDefRoles.defRoles).toPromise();
   sails.log.verbose("Record types service, bootstrapped.");
   let recordsTypes = await sails.services.recordtypesservice.bootstrap(sails.services.brandingservice.getDefault());
   sails.log.verbose("Workflowsteps service, bootstrapped.");
   let dashboardTypes = await sails.services.dashboardtypesservice.bootstrap(sails.services.brandingservice.getDefault());
   sails.log.verbose("DashboardTypes service, bootstrapped.");
   let workflowSteps = await sails.services.workflowstepsservice.bootstrap(recordsTypes);
   sails.log.verbose("Workflowsteps service, bootstrapped.");
   if (_.isArray(workflowSteps)) {
 
     for (let workflowStep of workflowSteps) {
       await sails.services.formsservice.bootstrap(workflowStep);
     }
   } else {
     await sails.services.formsservice.bootstrap(workflowSteps);
   }
 
 
   sails.log.verbose("Forms service, bootstrapped.");
   await sails.services.vocabservice.bootstrap().toPromise();
   sails.log.verbose("Vocab service, bootstrapped.");
   // Schedule cronjobs
   if (sails.config.crontab.enabled) {
     sails.config.crontab.crons().forEach(item => {
       schedule.scheduleJob(item.interval, () => {
         //At the moment no arguments are needed.
         sails.services[item.service][item.method]();
       });
     });
     sails.log.debug('cronjobs scheduled...');
   }
 
  // Initialise the applicationConfig for all the brands
  await sails.services.appconfigservice.bootstrap().toPromise()
  // bind convenience function to sails.config so that configuration access syntax is consistent
  sails.config.brandingAware = AppConfigService.getAppConfigurationForBrand
    
  sails.log.verbose("Cron service, bootstrapped.");
  // After last, because it was being triggered twice
  await sails.services.workspacetypesservice.bootstrap(sails.services.brandingservice.getDefault()).toPromise();

 
   sails.log.verbose("WorkspaceTypes service, bootstrapped.");

   await sails.services.cacheservice.bootstrap();
   sails.log.verbose("Cache service, bootstrapped.");

   sails.log.ship = function () {
     sails.log.info(".----------------. .----------------. .----------------. ");
     sails.log.info("| .--------------. | .--------------. | .--------------. |");
     sails.log.info("| |  _______     | | |  _________   | | |  ________    | |");
     sails.log.info("| | |_   __ \\    | | | |_   ___  |  | | | |_   ___ `.  | |");
     sails.log.info("| |   | |__) |   | | |   | |_  \\_|  | | |   | |   `. \\ | |");
     sails.log.info("| |   |  __ /    | | |   |  _|  _   | | |   | |    | | | |");
     sails.log.info("| |  _| |  \\ \\_  | | |  _| |___/ |  | | |  _| |___.' / | |");
     sails.log.info("| | |____| |___| | | | |_________|  | | | |________.'  | |");
     sails.log.info("| |              | | |              | | |              | |");
     sails.log.info("| '--------------' | '--------------' | '--------------' |");
     sails.log.info("'----------------' '----------------' '----------------' ");
     sails.log.info(".----------------. .----------------. .----------------. ");
     sails.log.info("| .--------------. | .--------------. | .--------------. |");
     sails.log.info("| |   ______     | | |     ____     | | |  ____  ____  | |");
     sails.log.info("| |  |_   _ \\    | | |   .'    `.   | | | |_  _||_  _| | |");
     sails.log.info("| |    | |_) |   | | |  /  .--.  \\  | | |   \\ \\  / /   | |");
     sails.log.info("| |    |  __'.   | | |  | |    | |  | | |    > `' <    | |");
     sails.log.info("| |   _| |__) |  | | |  \\  `--'  /  | | |  _/ /'`\\ \\_  | |");
     sails.log.info("| |  |_______/   | | |   `.____.'   | | | |____||____| | |");
     sails.log.info("| |              | | |              | | |              | |");
     sails.log.info("| '--------------' | '--------------' | '--------------' |");
     sails.log.info("'----------------' '----------------' '----------------' ");
   }
 
   sails.log.verbose("Waiting for ReDBox Storage to start...");
 
   let response = await sails.services.recordsservice.checkRedboxRunning()
   if (response == true) {
     sails.log.verbose("Bootstrap complete!");
 
   } else {
     throw new Error('ReDBox Storage failed to start');
   }

 }
 
 
 module.exports.bootstrap = function (cb) {
   if (sails.config.security.csrf === "false") {
     sails.config.security.csrf = false;
   }
   // sails.config.peopleSearch.orcid = sails.services.orcidservice.searchOrcid;
   sails.config.startupMinute = Math.floor(Date.now() / 60000);
   
   if (sails.config.environment == "production" || sails.config.ng2.force_bundle) {
     sails.config.ng2.use_bundled = true;
     console.log("Using NG2 Bundled files.......");
   }
 
   
   // actual bootstrap...
   sails.log.debug("Starting boostrap process with boostrapAlways set to: " + sails.config.appmode.bootstrapAlways);
   actualBootstrap().then(response => {
     // It's very important to trigger this callback method when you are finished
     // with the bootstrap!  (otherwise your server will never lift, since it's waiting on the bootstrap)
     cb(); 
     return true;
   }).catch(error => {
     sails.log.verbose("Bootstrap failed!!!");
     sails.log.error(error);
     return false;
   })
  
 
 };
 