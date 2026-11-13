# Runtime configuration declaration regression (#5031)

Run `npm run test:config-types` from the repository root **after building**
`sails-ng-common`, Raido, RVA, Agenda SQS, and `redbox-core` (the usual core build
prerequisites). The fixtures import emitted public package entry points, so
rebuild after editing a declaration. CircleCI runs this check after its core
asset build in `generate-api-docs`.

The literal tables cover optional/default shapes and negative cases use
`@ts-expect-error` to reject unsupported property names, scalar types, and
component shapes. No service startup or external services are required.

| Public contract                                                        | Runtime evidence                                                                                                                                                                                                                          | Accepted shape                                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `BrandAuthAafConfig.loginUrl`                                          | `views/default/default/user/aaf.ejs`, `aafConfig.loginUrl` used as the authentication URL; `config/env/development.js` supplies a URL string                                                                                              | Optional string                                                                                                    |
| `BrandAuthOidcConfig.claimMappingOptions`                              | `UsersService.openIdConnectAuthVerifyCallback`, reads `usernameToLowercase` before username lookup/creation; `config/env/integrationtest.js` supplies a boolean                                                                           | Optional object with optional `usernameToLowercase: boolean`                                                       |
| `SolrPreIndexConfig.jsonString`                                        | `SolrSearchService.preIndex`, iterates transforms, reads original data at `source`, writes JSON at `dest` or `source`; existing private `PreIndexJsonStringConfig` has the same shape                                                     | Optional array of `{ source: string; dest?: string }`                                                              |
| `I18nNextInitConfig.defaultNS`                                         | `TranslationService.getI18nextForBranding` spreads `next.init` into the i18next initialization options                                                                                                                                    | `InitOptions['defaultNS']` from the installed i18next contract: optional string, readonly string array, or `false` |
| `ReusableFormDefinitions` and `AvailableFormComponentDefinitionFrames` | `isTypeReusableComponent` recognizes the `ReusableComponent` class plus a known `overrides.reusableFormName`; `FormOverride.applyOverrideReusableExpand` recursively expands named definitions and merges matching `componentDefinitions` | Existing typed reusable frames, including placeholders without component config and nested/customised placeholders |

## Branch applicability

Compared fetched `origin/master` (`8c1633ef1`), `origin/develop` (`a036cdcc1`),
and `origin/next` (`b23373f20`). All four property omissions affect master and
remain in the later branches. The fix therefore starts on master; no newer
runtime functionality is backported.

The reusable placeholder is **already included** through `ReusableTypes` in
`AllTypes` and the derived frame union on all three branches (also on the issue's
referenced `d15982472`). `ReusableFormDefinitions` already uses that union.
The exported-type fixtures prove this existing support and preserve its
precision; no additional permissive form type or runtime change is necessary.
