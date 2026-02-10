# Skill: Redbox Angular Apps

## Context
ReDBox uses embedded Angular applications within EJS views instead of a single SPA. Each feature is often its own Angular project.

## Locations
- Angular projects: `angular/projects/researchdatabox/<app-name>/`
- Output assets: `assets/angular/<app-name>/browser/`
- EJS views: `views/default/default/admin/<app-name>.ejs`

## Generating Angular Apps
Use the `redbox-hook-kit` CLI generator `generate_angular_app`:
- `name`: App name as an argument (lowercase).
- `--ejs-view <view>`: EJS view name.
- `--auth <roles>`: Roles for page access.

## Patterns
- Apps are scaffolded using `@angular-devkit/build-angular:application`.
- EJS views include the Angular component tag and the hashed JS/CSS bundles.
- Use `CacheService.getNgAppFileHash(appName, type, prefix)` for hashed asset names.
- Apps are usually served via `RenderViewController.render` with the view specified in `locals`.

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
