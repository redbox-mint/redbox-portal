// Lift through the normal portal entry point, then expose the shutdown listener
// used by the integration runners to flush code coverage before exiting.
require('./app');

if (process.env.NODE_ENV === 'integrationtest') {
  const http = require('node:http');
  require('sails').once('lifted', () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Shutting down...\n');
      process.exit(0);
    });
    server.listen(1599, () => {
      console.log('Integration test shutdown listener on port 1599');
    });
  });
}
