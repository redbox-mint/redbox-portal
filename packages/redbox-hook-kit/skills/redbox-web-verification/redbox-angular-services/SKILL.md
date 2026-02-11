# Skill: Redbox Angular Services

## Context

Angular services in ReDBox typically extend `HttpClientService` to handle base URLs, configuration, and CSRF protection.

## Location

- Within an Angular project: `angular/projects/researchdatabox/<app-name>/src/app/`

## Patterns

- Extend `HttpClientService` from `@researchdatabox/portal-ng-common`.
- Inject `HttpClient`, `APP_BASE_HREF`, `UtilityService`, and `ConfigService`.
- Override `waitForInit()` and call `this.enableCsrfHeader()`.
- Use `this.brandingAndPortalUrl` for building API URLs.
- Use `this.httpContext` in request options to include the CSRF token.

## Generating Angular Services

Use the `redbox-hook-kit` CLI generator `generate_angular_service`:

- `name`: Service name as an argument.
- `--app <app>`: Target Angular app name.
- `--methods <methods>`: Comma-separated list of methods to generate (e.g. `get,save`).

## CSRF Handling

- `this.enableCsrfHeader()` sets the `RB_HTTP_INTERCEPTOR_AUTH_CSRF` context variable.
- For `FormData` uploads (file/image uploads or any `multipart/form-data` request), set `RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE` to `true` so the interceptor does not force `application/json` and the browser can set the correct boundary. This is not needed for JSON payloads or requests that explicitly set `Content-Type: application/json`.
