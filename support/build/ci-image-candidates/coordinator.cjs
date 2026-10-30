'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { identity, sha256, json } = require('./candidates.cjs');

// A concrete alternative to a service-backed coordinator. ALL publishers must use the
// SAME shared POSIX filesystem. Independent CircleCI workspace copies do NOT qualify.
// No TTL or lock stealing: a crashed owner requires deliberate operational recovery.
class FilesystemCoordinator {
  constructor({ root, scope }) {
    if (!path.isAbsolute(root || '') || scope !== 'shared-posix') {
      throw new Error('coordinator requires an absolute root and explicit scope: shared-posix');
    }
    this.root = root;
  }
  async withExclusive(repository, callback) {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = sha256(repository).slice(7);
    const lock = path.join(this.root, `${key}.lock`);
    const stateFile = path.join(this.root, `${key}.json`);
    try { await fs.mkdir(lock, { mode: 0o700 }); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('promotion lock is held (or crashed); do not steal it or use executor-local copies');
      throw error;
    }
    const owner = crypto.randomUUID();
    await fs.writeFile(path.join(lock, 'owner'), owner, { flag: 'wx', mode: 0o600 });
    const assertHeld = async () => {
      if ((await fs.readFile(path.join(lock, 'owner'), 'utf8')) !== owner) throw new Error('promotion lock ownership lost');
    };
    let state;
    try {
      try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        state = { schemaVersion: 1, repository, destinations: {} };
      }
      if (state.schemaVersion !== 1 || state.repository !== repository ||
          !state.destinations || Object.getPrototypeOf(state.destinations) !== Object.prototype) {
        throw new Error('invalid durable promotion state');
      }
      for (const [tag, record] of Object.entries(state.destinations)) {
        if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag) ||
            !record || Object.getPrototypeOf(record) !== Object.prototype ||
            typeof record.fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(record.fingerprint) ||
            !['reserved', 'complete'].includes(record.status)) {
          throw new Error('invalid durable promotion state');
        }
        identity(record.identity);
      }
      const persist = async () => {
        await assertHeld();
        const temporary = path.join(this.root, `${key}.${owner}.tmp`);
        const handle = await fs.open(temporary, 'wx', 0o600);
        try { await handle.writeFile(json(state)); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temporary, stateFile);
        // Persist the rename before allowing the first registry write.
        const directory = await fs.open(this.root, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      };
      let reserved;
      return await callback({
        assertHeld,
        reserve: async reservation => {
          await assertHeld();
          const next = identity(reservation.identity);
          if (typeof reservation.fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(reservation.fingerprint) ||
            !Array.isArray(reservation.destinations) || !reservation.destinations.length ||
            !reservation.destinations.every(tag => typeof tag === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag))) throw new Error('invalid promotion reservation');
          for (const tag of reservation.destinations) {
            const previous = Object.hasOwn(state.destinations, tag) ? state.destinations[tag] : undefined;
            if (!previous) continue;
            const old = identity(previous.identity);
            if (next.pipeline < old.pipeline || next.pipeline === old.pipeline && next.attempt < old.attempt) throw new Error(`stale promotion for ${tag}`);
            if (next.pipeline === old.pipeline && next.attempt === old.attempt &&
              previous.fingerprint !== reservation.fingerprint) throw new Error(`attempt fingerprint changed for ${tag}`);
          }
          for (const tag of reservation.destinations) {
            Object.defineProperty(state.destinations, tag, { enumerable: true, writable: true, configurable: true,
              value: { identity: next, fingerprint: reservation.fingerprint, status: 'reserved' } });
          }
          await persist();
          reserved = reservation;
        },
        complete: async receipt => {
          if (!reserved || reserved.fingerprint !== receipt.fingerprint) throw new Error('completion lacks matching durable reservation');
          for (const tag of reserved.destinations) state.destinations[tag].status = 'complete';
          state.lastReceipt = receipt;
          await persist();
        },
      });
    } finally {
      await assertHeld();
      await fs.rm(lock, { recursive: true });
    }
  }
}

module.exports = { FilesystemCoordinator };
