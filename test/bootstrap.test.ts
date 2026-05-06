import sails from "sails";
import _ from "lodash";
import { DateTime } from "luxon";

import { brandingConfigurationDefaults as defaultBrandingConfigurationDefaults, datacite as defaultDataciteConfig, generateAllShims } from "@researchdatabox/redbox-core";

// Expose Luxon DateTime for tests needing date utilities
(global as any).DateTime = DateTime;

before(function (this: Mocha.Context, done) {
	import("chai").then((chai) => {
		(global as any).chai = chai;
		(global as any).should = (chai as any).should();
		(global as any).expect = (chai as any).expect;
		const defaultDoiPublishing = _.cloneDeep(defaultBrandingConfigurationDefaults.doiPublishing);

		// Increase the Mocha timeout so that Sails has enough time to lift.
		this.timeout(5 * 60 * 1000);

		// Generate shims before lifting Sails
		generateAllShims(process.cwd(), {
			forceRegenerate: process.env.REGENERATE_SHIMS === 'true',
			verbose: process.env.SHIM_VERBOSE === 'true'
		})
			.then(() => {
				(sails as any).lift(
					{
						log: {
							level: 'verbose'
						},
						hooks: {
							grunt: false
						},
						models: {
							datastore: 'mongodb',
							migrate: 'drop'
						},
						security: {
							csrf: false
						},
						brandingConfigurationDefaults: {
							..._.cloneDeep(defaultBrandingConfigurationDefaults),
							doiPublishing: {
								...defaultDoiPublishing,
								enabled: true,
								connection: {
									..._.cloneDeep(defaultDoiPublishing?.connection),
									...(process.env.datacite_baseUrl?.trim() ? { baseUrl: process.env.datacite_baseUrl.trim() } : {}),
									username: process.env.datacite_username ?? '',
									password: process.env.datacite_password ?? ''
								},
								profiles: {
									..._.cloneDeep(defaultDoiPublishing?.profiles),
									dataPublication: {
										..._.cloneDeep(defaultDoiPublishing?.profiles?.dataPublication),
										enabled: true,
										metadata: {
											..._.cloneDeep(defaultDoiPublishing?.profiles?.dataPublication?.metadata),
											prefix: {
												..._.cloneDeep(defaultDoiPublishing?.profiles?.dataPublication?.metadata?.prefix),
												defaultValue: process.env.datacite_doiPrefix ?? ''
											}
										}
									}
								}
							}
						},
						datacite: {
							...defaultDataciteConfig,
							...(process.env.datacite_baseUrl?.trim() ? { baseUrl: process.env.datacite_baseUrl.trim() } : {}),
							username: process.env.datacite_username,
							password: process.env.datacite_password,
							doiPrefix: process.env.datacite_doiPrefix
						},
						auth: {
							default: {
								local: {
									default: {
										token: 'jA8mF8CBpwHGkJqlgg6dT3hEDoZTQIif5t1V9ElIcN8='
									}
								}
							}
						}
					},
					(err: Error | undefined, _server: unknown) => {
						if (err) return done(err);
						done(err, sails as any);
					}
				);
			})
				.catch((err: Error) => {
					// eslint-disable-next-line no-console
					console.error("Failed to generate shims before lift:", err);
					done(err);
				});
	});
});

after(function (done) {
	// here you can clear fixtures, etc.
	if (sails && _.isFunction((sails as any).lower)) {
		(sails as any).lower(done);
	}
});
