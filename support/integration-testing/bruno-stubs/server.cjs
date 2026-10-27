'use strict';

const http = require('node:http');
const datacite = require('./datacite-dois.json');

// Bruno general owns this fixture. Unexpected requests fail instead of silently
// returning successful data when the DOI adapter's outgoing request changes.
function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://bruno-stubs');
    const expectedParams = {
      query: '10.5438/0014',
      'page[number]': '1',
      'page[size]': '10',
      'disable-facets': 'true',
      state: 'findable',
      sort: 'relevance',
      'fields[dois]': 'doi,titles,publisher,publicationYear,types,url',
    };
    let status = 404;
    let body = { error: 'Unexpected Bruno fixture request' };
    if (req.method === 'GET' && url.pathname === '/health') {
      status = 200;
      body = { ok: true };
    } else if (req.method === 'GET' && url.pathname === '/dois' &&
      req.headers.accept === 'application/vnd.api+json' &&
      url.searchParams.size === Object.keys(expectedParams).length &&
      Object.entries(expectedParams).every(([key, value]) => url.searchParams.get(key) === value)) {
      status = 200;
      body = datacite;
    }
    console.log(`${req.method} ${url.pathname}${url.search} -> ${status}`);
    res.writeHead(status, { 'content-type': 'application/vnd.api+json' });
    res.end(JSON.stringify(body));
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(8787, '0.0.0.0');
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { createServer };
