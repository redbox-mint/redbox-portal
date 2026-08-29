# Legacy Unsafe Expression Inventory

This page is the governing A12 inventory for first-party direct `eval` and unsafe Lodash configuration-template execution that remains outside the managed record-type and workflow definition boundary. It records deferred legacy work; it does not claim that ReDBox Portal is remediated system-wide.

Managed record/workflow action parameters and transition conditions use the bounded runtime described in [Managed Record Expressions and Templates](Managed-Record-Expressions-and-Templates.md). The registered action, action-execution, managed expression, managed record/workflow administration, record-action coordinator, record-hook coordinator, and workflow-transition source directories have no allowlist entries. The removed `ActionController` and `action.config` paths also cannot be allowlisted. Legacy service methods shared by older configuration may still appear below, but managed bindings pass prepared values and do not persist or resolve these legacy function/template strings.

## Guard contract and boundary

Run `npm run lint:unsafe-expressions` to scan Git-tracked first-party JavaScript and TypeScript. The TypeScript-syntax scan resolves lexical scopes before following builtin `eval` provenance through global members, comma expressions, `call`/`apply`/`bind`, builtin `Reflect.apply`, assignments, computed destructuring, and array/object carrier aliases. It follows Lodash objects returned by `runInContext()` and namespace, default, named, destructured, bracket-property, CommonJS, and subpath aliases imported or required from `lodash`, `lodash-es`, and their `template` or `template.js` subpaths. A local binding that shadows `eval`, `Reflect`, a global object, or `_` is not treated as the corresponding builtin or Sails global.

Comments, strings such as JSONata `$eval`, JSONata evaluation, ordinary local functions named `template`, and Handlebars compilation/rendering have no builtin-eval or Lodash provenance and are not findings. The intentional A12 boundary remains builtin `eval` execution and Lodash template compilation: ECMAScript `Function` construction, non-Lodash engines, and dynamically resolved module names are outside this guard and are not represented as remediated.

The scan excludes test directories, documentation/support tooling, installed dependencies, compiled output, and coverage output. It does not exclude `assets/` as a tree: first-party asset scripts, including the API-docs bootstrap/init files and `assets/js/index.js`, are scanned. Only the exact generated or vendored files in [unsafe-expression-source-exclusions.json](../security/unsafe-expression-source-exclusions.json) are omitted. Angular spec files under a production `src` tree remain in scope, so a runtime site cannot evade the guard with a test-like filename. Symlinked source is rejected, repository paths must be normalized POSIX-relative paths, and every call site is matched by path plus a whitespace-normalized call-expression fingerprint rather than by filename alone.

The machine allowlist is [unsafe-expression-allowlist.json](../security/unsafe-expression-allowlist.json). A call-site edit or addition fails the guard. Removing a legacy call makes its entry stale and also fails until the allowlist and this inventory are reduced. Adding an entry requires all three explicit review signals: full metadata in the machine allowlist, the identical row below, and an update to the fixed expected-ID assertion in the adversarial guard test.

## Exact source exclusions

The source-exclusion manifest accepts normalized, exact asset-file paths only; it does not accept directory prefixes or glob patterns. Every entry is mirrored here so a generated or vendored classification is reviewable.

| Path | Kind | Source | Rationale |
| --- | --- | --- | --- |
| `assets/default/default/js/v0_3_1-leaflet-omnivore.min.js` | `vendored` | Leaflet Omnivore 0.3.1 browser distribution | Third-party minified browser distribution containing its bundled upstream dependencies. |
| `assets/default/default/js/vocab_widget_v2.js` | `vendored` | ANDS Vocabulary Widget service | Third-party browser plugin retained with its upstream copyright and Apache license notice. |
| `assets/js/dependencies/sails.io.js` | `generated` | sails.io.js and socket.io-client browser distribution | Generated third-party browser bundle retained under the explicit dependencies asset directory. |

## Allowlisted legacy call sites

`SEC-LEGACY-*` values are stable follow-up identifiers for the security backlog. Each groups only the legacy surface named by the entry; none authorizes another call site.

| ID | Kind | Path | Owner | Follow-up | Rationale |
| --- | --- | --- | --- | --- | --- |
| `legacy-template-workspace-allow-add` | `lodash-template` | `angular/projects/researchdatabox/form/src/app/component/workspace.component.ts` | `@researchdatabox/form` | `SEC-LEGACY-FORM-TEMPLATES` | Legacy workspace form configuration compiles allowAddTemplate in the browser. |
| `legacy-template-angular-lodash-utility` | `lodash-template` | `angular/projects/researchdatabox/portal-ng-common/src/lib/lodash-template-utility.service.ts` | `@researchdatabox/portal-ng-common` | `SEC-LEGACY-FORM-TEMPLATES` | Legacy Angular form configuration is compiled with broad utility imports for compatibility. |
| `legacy-template-angular-utility` | `lodash-template` | `angular/projects/researchdatabox/portal-ng-common/src/lib/utility.service.ts` | `@researchdatabox/portal-ng-common` | `SEC-LEGACY-FORM-TEMPLATES` | The older Angular utility service still compiles a configured template with service imports. |
| `legacy-template-core-trigger-condition` | `lodash-template` | `packages/redbox-core/src/CoreService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-SERVICE-CONDITIONS` | Legacy service entry points compile triggerCondition while managed bindings supply an already evaluated condition. |
| `legacy-eval-email-notify-success` | `direct-eval` | `packages/redbox-core/src/services/EmailService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-EMAIL-CALLBACKS` | The legacy notification API resolves configured onNotifySuccess callbacks after sending email. |
| `legacy-template-form-vocabulary` | `lodash-template` | `packages/redbox-core/src/services/FormVocabularyService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-VOCABULARY-TEMPLATES` | Legacy external-vocabulary result mapping accepts Lodash template syntax as well as property paths. |
| `legacy-template-rdmp-counter` | `lodash-template` | `packages/redbox-core/src/services/RDMPService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-RDMP-TEMPLATES` | Legacy counter configuration can compile a template to format the next counter value. |
| `legacy-template-rdmp-contributor-rule` | `lodash-template` | `packages/redbox-core/src/services/RDMPService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-RDMP-TEMPLATES` | Legacy contributor-permission rules compile configured Lodash expressions for each contributor. |
| `legacy-eval-rdmp-queued-trigger` | `direct-eval` | `packages/redbox-core/src/services/RDMPService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-RDMP-QUEUE` | The legacy queue consumer resolves function strings from old queued trigger payloads. |
| `legacy-template-rdmp-run-templates` | `lodash-template` | `packages/redbox-core/src/services/RDMPService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-RDMP-TEMPLATES` | The legacy runTemplates service method compiles configured record mutation templates. |
| `legacy-template-solr-pre-index` | `lodash-template` | `packages/redbox-core/src/services/SolrSearchService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-SOLR-TEMPLATES` | Legacy Solr preIndex configuration compiles templates used to derive indexed fields. |
| `legacy-template-trigger-field-validation` | `lodash-template` | `packages/redbox-core/src/services/TriggerService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-VALIDATION-TEMPLATES` | The legacy field-validation trigger compiles a configured template with service helpers. |
| `legacy-template-trigger-related-record` | `lodash-template` | `packages/redbox-core/src/services/TriggerService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-RELATED-RECORD-TEMPLATES` | The legacy related-record trigger compiles configured templates before mutating related records. |
| `legacy-eval-user-pre-save-hook` | `direct-eval` | `packages/redbox-core/src/services/UsersService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-USER-HOOKS` | Legacy user-account pre-save configuration resolves hook function strings outside record workflows. |
| `legacy-eval-user-post-save-sync-hook` | `direct-eval` | `packages/redbox-core/src/services/UsersService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-USER-HOOKS` | Legacy user-account synchronous post-save configuration resolves hook function strings outside record workflows. |
| `legacy-eval-user-post-save-hook` | `direct-eval` | `packages/redbox-core/src/services/UsersService.ts` | `@researchdatabox/redbox-core` | `SEC-LEGACY-USER-HOOKS` | Legacy user-account asynchronous post-save configuration resolves hook function strings outside record workflows. |

## Reconciliation and exclusions

At this baseline the guard finds 16 allowlisted calls: five `direct-eval` and eleven `lodash-template`. Scanning the first-party asset scripts adds no call site. Repository searches also find JSONata `$eval` rejection tests, test-only Handlebars precompilation evaluation, safe Handlebars compilation/rendering, and the three named generated/vendor files above; those are not A12 production call sites. Reports, named queries, RAiD mapping, and managed action templates now use safe Handlebars, property lookup, JSONata, or explicit rejection and therefore require no entry. Dashboard configuration documentation still discusses historical Lodash syntax, but the current dashboard service path is Handlebars-based and has no Lodash compilation call to allowlist.

Follow-up work should replace one bounded legacy surface at a time, add its migration guidance and compatibility evidence, then delete the corresponding entries. That remediation is deliberately outside A12 and must not be folded into managed record/workflow persistence work such as B01.
