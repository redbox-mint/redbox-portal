# Playwright HTTP stubs

`server.cjs` uses Node's built-in HTTP server and exposes `/health`,
`/control/reset`, `/control/responses`, `/control/release`, and
`/control/requests`. Provider requests are recorded without credentials;
unconfigured paths return a diagnostic 404 rather than reaching the public
internet.
