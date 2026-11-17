'use strict';
const http = require('node:http');
const publicHost = new URL(process.env.REDBOX_DEMO_URL).host;
http
  .createServer((request, response) => {
    if (request.headers.host !== publicHost) {
      response.writeHead(421).end();
      return;
    }
    const auth = request.url.startsWith('/auth/');
    const upstream = http.request(
      {
        hostname: auth ? 'keycloak' : 'portal',
        port: auth ? 8080 : 1500,
        path: request.url,
        method: request.method,
        headers: {
          ...request.headers,
          host: publicHost,
          'x-forwarded-host': publicHost,
          'x-forwarded-proto': 'https',
          'x-forwarded-port': new URL(process.env.REDBOX_DEMO_URL).port || '443',
        },
      },
      result => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      }
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end('Demo service starting');
    });
    request.pipe(upstream);
  })
  .listen(8080, '0.0.0.0');
