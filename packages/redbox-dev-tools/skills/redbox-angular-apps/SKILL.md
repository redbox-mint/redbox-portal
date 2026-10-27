---
name: "Redbox Angular Apps"
description: "ReDBox uses embedded Angular applications within EJS views instead of a single SPA. Each feature is often its own Angular project."
---

# Skill: Redbox Angular Apps

## Context
ReDBox uses embedded Angular applications within EJS views instead of a single SPA. Each feature is often its own Angular project.

## Locations
- Angular projects: `angular/projects/researchdatabox/<app-name>/`
- Output assets: `assets/angular/<app-name>/browser/`
- EJS views: `views/default/default/admin/<app-name>.ejs`

## Generating Angular Apps
Use the `redbox-dev-tools` CLI generator `generate_angular_app`:
- `name`: App name as an argument (lowercase).
- `--ejs-view <view>`: EJS view name.
- `--auth <roles>`: Roles for page access.

## Patterns
- Apps are scaffolded using `@angular-devkit/build-angular:application`.
- EJS views include the Angular component tag and the hashed JS/CSS bundles.
- Use the request-scoped `page` context supplied by the Express page composition.
  Declare package-relative view/asset roots in the extension and bind any custom
  page handler explicitly. Read `support/wiki/Controllers-Architecture.md` and
  `support/specs/sails-retirement/hook-migration-v6.md` for installed packaging.

```ejs
<script src="<%= page.root %>/angular/my-app/browser/main<%= page.bundleHash('my-app', 'main', '-') %>.js" type="module"></script>
```

## angular.json
New projects must be added to `angular.json` with appropriate `outputPath` and `baseHref`.
Example `outputPath`: `../assets/angular/<name>`

## Testing
To run tests for a specific Angular app:
- `ng test <app-name>`
- `npm test -- <app-name>`

### Root Execution
If running inside a container as root (e.g. Docker), you must use the `--browsers=ChromeHeadlessNoSandbox` flag:
`ng test --browsers=ChromeHeadlessNoSandbox <app-name>`

### Convenience Script
A convenience script is available at `support/unit-testing/angular/testDevAngular.sh` which handles the browser flags logic automatically.
