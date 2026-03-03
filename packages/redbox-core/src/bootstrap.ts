/**
 * Core Bootstrap Function
 * 
 * This is the main bootstrap logic for ReDBox Portal.
 * Called by the generated config/bootstrap.js shim.
 * 
 * Hooks can provide additional bootstrap functions via:
 * 1. Add "sails": { "hasBootstrap": true } to package.json
 * 2. Export registerRedboxBootstrap() returning an async function
 */

import { lastValueFrom, Observable } from 'rxjs';
import type { BrandingAwareFunction } from './config';
import type { LoDashStatic } from 'lodash';
import { BrandingModel } from './model';

declare const sails: Sails.Application;
declare const _: LoDashStatic;


/**
 * Interface for hook-provided bootstrap functions
 */
export interface BootstrapProvider {
    name: string;
    bootstrap: () => Promise<void>;
}

/**
 * Core bootstrap function - initializes all ReDBox services
 * 
 * This function is called during Sails lift and bootstraps all core services
 * in the correct order. Hook bootstraps run after this completes.
 */
export async function coreBootstrap(): Promise<void> {
    const schedule = require('node-schedule');

    const defaultBrand = await lastValueFrom(sails.services.brandingservice.bootstrap() as Observable<unknown>);
    sails.log.verbose("Branding service, bootstrapped.");

    const _rolesBootstrapResult = await lastValueFrom(sails.services.rolesservice.bootstrap(defaultBrand) as Observable<unknown>);
    sails.log.verbose("Roles service, bootstrapped.");

    const _reportsBootstrapResult = await lastValueFrom(sails.services.reportsservice.bootstrap(sails.services.brandingservice.getDefault()) as Observable<unknown>);
    sails.log.verbose("Reports service, bootstrapped.");

    const _namedQueriesBootstrapResult = await sails.services.namedqueryservice.bootstrap(sails.services.brandingservice.getDefault());
    sails.log.verbose("Named Query service, bootstrapped.");

    // sails doesn't support 'populating' of nested associations
    // intentionally queried again because of nested 'users' population
    const defRoles = await lastValueFrom(sails.services.rolesservice.getRolesWithBrand(sails.services.brandingservice.getDefault()) as Observable<unknown>);
    sails.log.verbose("Roles service, bootstrapped.");
    sails.log.verbose(defRoles);

    const defUserAndDefRoles: { defUser: unknown; defRoles: unknown } = await lastValueFrom(sails.services.usersservice.bootstrap(defRoles) as Observable<{ defUser: unknown; defRoles: unknown }>);
    sails.log.verbose("Users service, bootstrapped.");

    const _pathRulesBootstrapResult = await lastValueFrom(sails.services.pathrulesservice.bootstrap(defUserAndDefRoles.defUser, defUserAndDefRoles.defRoles) as Observable<unknown>);
    sails.log.verbose("Pathrules service, bootstrapped.");

    const recordsTypes = await sails.services.recordtypesservice.bootstrap(sails.services.brandingservice.getDefault());
    sails.log.verbose("Record types service, bootstrapped.");

    const _dashboardTypes = await sails.services.dashboardtypesservice.bootstrap(sails.services.brandingservice.getDefault());
    sails.log.verbose("DashboardTypes service, bootstrapped.");

    const workflowSteps = await sails.services.workflowstepsservice.bootstrap(recordsTypes);
    sails.log.verbose("Workflowsteps service, bootstrapped.");

    const defaultBranding = sails.services.brandingservice.getDefault() as BrandingModel;
    const defaultBrandingId = String(defaultBranding?.id ?? '');

    if (_.isArray(workflowSteps)) {
        for (const workflowStep of workflowSteps) {
            await sails.services.formsservice.bootstrap(workflowStep, defaultBrandingId);
        }
    } else {
        await sails.services.formsservice.bootstrap(workflowSteps, defaultBrandingId);
    }

    sails.log.verbose("Forms service, bootstrapped.");
    await lastValueFrom(sails.services.vocabservice.bootstrap() as Observable<unknown>);
    sails.log.verbose("Vocab service, bootstrapped.");
    await sails.services.vocabularyservice.bootstrapData();
    sails.log.verbose("Vocabulary bootstrap data, loaded.");
    await sails.services.recordsservice.bootstrapData();
    sails.log.verbose("Records bootstrap data, loaded.");

    // Schedule cronjobs
    if (sails.config.crontab.enabled) {
        sails.config.crontab.crons().forEach((item: { interval: string; service: string; method: string }) => {
            schedule.scheduleJob(item.interval, () => {
                sails.services[item.service][item.method]();
            });
        });
        sails.log.debug('cronjobs scheduled...');
    }

    // Seed default i18n data into DB if missing
    await sails.services.i18nentriesservice.bootstrap();
    sails.log.verbose("I18n entries service, seeded defaults.");
    await sails.services.translationservice.bootstrap();
    sails.log.verbose("Translation service, bootstrapped.");

    // Initialise the applicationConfig for all the brands
    await sails.services.appconfigservice.bootstrap();
    // bind convenience function to sails.config so that configuration access syntax is consistent
    sails.config.brandingAware = AppConfigService.getAppConfigurationForBrand as BrandingAwareFunction;

    sails.log.verbose("Cron service, bootstrapped.");

    await sails.services.agendaqueueservice.init();
    sails.log.verbose("Agenda Queue service, bootstrapped.");

    // After last, because it was being triggered twice
    await lastValueFrom(sails.services.workspacetypesservice.bootstrap(sails.services.brandingservice.getDefault()) as Observable<unknown>);
    sails.log.verbose("WorkspaceTypes service, bootstrapped.");

    await sails.services.cacheservice.bootstrap();
    sails.log.verbose("Cache service, bootstrapped.");

    // ReDBox ASCII art banner
    const logWithShip = sails.log as typeof sails.log & { ship?: () => void };
    logWithShip.ship = function () {
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
    };

    sails.log.verbose("Waiting for ReDBox Storage to start...");

    const response = await sails.services.recordsservice.checkRedboxRunning();
    if (response === true) {
        sails.log.verbose("Bootstrap complete!");
    } else {
        throw new Error('ReDBox Storage failed to start');
    }
}

/**
 * Pre-lift configuration setup
 * 
 * Called before coreBootstrap to configure Sails settings
 * that need to be in place before services bootstrap.
 */
export function preLiftSetup(): void {
    const csrfSetting = sails.config.security.csrf as boolean | string;
    if (csrfSetting === "false") {
        sails.config.security.csrf = false;
    }

    sails.config.startupMinute = Math.floor(Date.now() / 60000);

    const configuredBootstrapDataPath = _.get(sails.config, 'bootstrap.bootstrapDataPath');
    if (typeof configuredBootstrapDataPath !== 'string' || !configuredBootstrapDataPath.trim()) {
        _.set(sails.config, 'bootstrap.bootstrapDataPath', 'bootstrap-data');
    }

    if (sails.config.environment === "production" || sails.config.ng2.force_bundle) {
        sails.config.ng2.use_bundled = true;
        console.log("Using NG2 Bundled files.......");
    }

    // Update the pino log level to the sails.log.level
    sails.config.log.customLogger.level = sails.config.log.level;

    sails.log.debug("Starting bootstrap process with bootstrapAlways set to: " + sails.config.appmode.bootstrapAlways);

    // Initialize all services that have an init() method
    // This allows services registered via redbox-loader shims to perform
    // setup after Sails is fully available (e.g., registering hooks)
    for (const serviceName of Object.keys(sails.services)) {
        const service = sails.services[serviceName];
        if (service && typeof service.init === 'function') {
            service.init();
            sails.log.verbose(`${serviceName} service, initialized.`);
        }
    }

    // Initialize all controllers that have an init action
    // Controllers register their init as sails actions (e.g., 'webservice/search/init')
    const sailsWithActions = sails as Sails.Application & { _actions?: Record<string, () => void> };
    const actions = sailsWithActions._actions;
    if (!actions) {
        return;
    }

    for (const actionKey of Object.keys(actions)) {
        if (actionKey.endsWith('/init')) {
            actions[actionKey]();
            sails.log.verbose(`${actionKey} controller action, initialized.`);
        }
    }
}
