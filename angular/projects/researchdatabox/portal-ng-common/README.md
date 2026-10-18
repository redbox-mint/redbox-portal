# ReDBox Portal Core Angular Library

This library contains the core models, services and components for [ReDBox Portal](http://redboxresearchdata.com.au)

## Choosing app imports

Embedded apps should import `RedboxPortalCoreServicesModule` for configuration,
HTTP/CSRF, logging, utilities, users, app configuration, the translation bootstrap
barrier and `I18NextPipe`. Root NgModule apps still import `BrowserModule` themselves;
standalone apps can use `importProvidersFrom(RedboxPortalCoreServicesModule)`.

Add only the features the app uses:

- `RedboxPortalRecordsModule`: `RecordService` providers.
- `RedboxPortalRecordTableModule`: record tables, sortable headers and pagination.
- `RedboxPortalReportsModule`: explicit `ReportService` providers, retained for compatibility.
- `PaginationModule` from `ngx-bootstrap/pagination`: pagination without record tables.

The feature modules use the core providers from the app's root injector. Existing
forms and custom hooks can keep importing `RedboxPortalCoreModule`: it retains the
original providers and exported translation, table, sorting and pagination UI.
As before, the compatibility module imports `BrowserModule` and `FormsModule`
internally without re-exporting their directives. Hooks using browser/common or
template-driven form directives must still import the relevant Angular modules.
The built-in form app uses core services and records without importing report or
record-table modules. `ReportService` also has a tree-shakeable root provider, so
custom form components can continue injecting it through the host form injector.
Unused report code can still be removed from production bundles.
Rebuild this library before building apps against new exports.


This library was generated with [Angular CLI](https://github.com/angular/angular-cli) version 15.0.0.

## Code scaffolding

Run `ng generate component component-name --project portal-ng-common` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module --project portal-ng-common`.
> Note: Don't forget to add `--project portal-ng-common` or else it will be added to the default project in your `angular.json` file. 

## Build

Run `ng build portal-ng-common` to build the project. The build artifacts will be stored in the `dist/` directory.

## Publishing

After building your library with `ng build portal-ng-common`, go to the dist folder `cd dist/portal-ng-common` and run `npm publish`.

## Running unit tests

Run `ng test portal-ng-common` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
