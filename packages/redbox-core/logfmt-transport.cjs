const { once } = require('node:events');
const { DateTime } = require('luxon');
const pino = require('pino');
const build = require('pino-abstract-transport');

function flatten(record, formatKey, prefix = [], result = Object.create(null)) {
  for (const [key, value] of Object.entries(record)) {
    const path = [...prefix, formatKey(key)];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, formatKey, path, result);
    } else if (value !== null) {
      result[path.join('_')] = value;
    }
  }
  return result;
}

function encodeValue(value) {
  if (value == null) {
    return '';
  }
  const text = String(value);
  // JSON string escaping matches logfmt quoting, including newlines, quotes, and backslashes.
  return text === '' || /[\s="\\\x00-\x1f]/.test(text) ? JSON.stringify(text) : text;
}

/** A Pino worker transport that keeps each logfmt event on one line without changing string values. */
module.exports = async function createLogfmtTransport(options = {}) {
  const { snakeCase } = await import('case-anything');
  const destination = pino.destination({ dest: options.destination ?? 1, sync: options.sync ?? false });
  await once(destination, 'ready');

  return build(
    async function (source) {
      for await (let record of source) {
        if (options.formatTime) {
          record.time = DateTime.fromMillis(record.time).toFormat("yyyy-MM-dd'T'HH:mm:ssZZZ");
        }
        if (options.flattenNestedObjects) {
          record = flatten(record, options.convertToSnakeCase ? snakeCase : key => key);
        } else if (options.convertToSnakeCase) {
          record = Object.fromEntries(Object.entries(record).map(([key, value]) => [snakeCase(key), value]));
        }
        const line = Object.entries(record)
          .map(([key, value]) => `${key}=${encodeValue(value)}`)
          .join(' ');
        if (!destination.write(line + '\n')) {
          await once(destination, 'drain');
        }
      }
    },
    {
      async close() {
        destination.end();
        await once(destination, 'close');
      },
    }
  );
};
