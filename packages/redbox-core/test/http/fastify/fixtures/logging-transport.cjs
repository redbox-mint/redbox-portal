const { Writable } = require('node:stream');

// Loaded by the real pino.transport/thread-stream worker, not a fake Worker.
module.exports = async ({ failure }) =>
  new Writable({
    write(_chunk, _encoding, callback) {
      if (failure === 'worker-stream') callback(new Error('transport-secret credential-secret'));
      else if (failure === 'worker-exit') process.exit(23);
      else if (failure === 'worker-exit-zero') process.exit(0);
      else callback();
    },
  });
