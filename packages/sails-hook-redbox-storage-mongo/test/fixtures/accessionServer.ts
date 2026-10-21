import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { publicationDigest } from '@researchdatabox/redbox-core';

type Decision = 'pending' | 'accepted' | 'conflict';
interface Accession {
  accession: string;
  repository: string;
  decision: Decision;
  dossierDigest: string;
  title: string;
  idempotencyKey: string;
}
/** A remote HTTP contract fixture, separate from all ReDBox processing state. */
export async function accessionServer() {
  const accessions = new Map<string, Accession>();
  const keys = new Map<string, Accession>();
  let operationLookups = 0;
  let lookupFault: 'missing' | 'wrong-key' | 'wrong-digest' | undefined;
  let posts = 0;
  let submissions = 0;
  let reads = 0;
  let loseResponse = false;
  let forceIdentity: string | undefined;
  let token = 'fixture-secret';
  let responseGate: { committed(): void; released: Promise<void>; release(): void } | undefined;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      const route = request.url?.match(/^\/repositories\/([^/]+)\/accessions(?:\/(ACC-[0-9]+))?$/);
      const lookup = request.url?.match(/^\/repositories\/([^/]+)\/operations\/(rbpub-v1-[a-f0-9]{64})$/);
      if (request.method === 'GET' && lookup) {
        reads++;
        operationLookups++;
        const value = lookupFault === 'missing' ? undefined : keys.get(`${lookup[1]}/${lookup[2]}`);
        if (!value) {
          response.writeHead(404).end();
          return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            ...value,
            ...(lookupFault === 'wrong-key' ? { idempotencyKey: `rbpub-v1-${'0'.repeat(64)}` } : {}),
            ...(lookupFault === 'wrong-digest' ? { dossierDigest: 'wrong-digest' } : {}),
          })
        );
        return;
      }
      const repository = route?.[1];
      const accessionId = route?.[2];
      if (request.method === 'POST' && repository && !accessionId) {
        let body = '';
        for await (const chunk of request) body += chunk.toString();
        const dossier: unknown = JSON.parse(body);
        assert.ok(dossier && typeof dossier === 'object' && 'title' in dossier && typeof dossier.title === 'string');
        posts++;
        const key = request.headers['idempotency-key'];
        assert.ok(typeof key === 'string' && /^rbpub-v1-[a-f0-9]{64}$/.test(key));
        const previous = keys.get(`${repository}/${key}`);
        if (previous) {
          assert.equal(previous.dossierDigest, publicationDigest(dossier));
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(previous));
          return;
        }
        submissions++;
        const accession = forceIdentity ?? `ACC-${submissions}`;
        const value: Accession = {
          repository,
          accession,
          decision: 'pending',
          dossierDigest: publicationDigest(dossier),
          title: dossier.title,
          idempotencyKey: key,
        };
        accessions.set(`${repository}/${accession}`, value);
        keys.set(`${repository}/${key}`, value);
        const gate = responseGate;
        responseGate = undefined;
        if (gate) {
          gate.committed();
          await gate.released;
        }
        if (loseResponse) {
          loseResponse = false;
          response.destroy();
          return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(value));
        return;
      }
      const accession = repository && accessionId ? `${repository}/${accessionId}` : undefined;
      if (request.method === 'GET' && accession && accessions.has(accession)) {
        reads++;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(accessions.get(accession)));
        return;
      }
      response.writeHead(404).end();
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    endpoint: `http://127.0.0.1:${address.port}/`,
    get operationLookups() {
      return operationLookups;
    },
    lookupFault(value: typeof lookupFault) {
      lookupFault = value;
    },
    get posts() {
      return posts;
    },
    get submissions() {
      return submissions;
    },
    get reads() {
      return reads;
    },
    get accessions() {
      return [...accessions.values()];
    },
    decision(accession: string, decision: Decision, repository = 'research') {
      const value = accessions.get(`${repository}/${accession}`);
      assert.ok(value);
      value.decision = decision;
    },
    authorize(value: string) {
      token = value;
    },
    holdNextResponse() {
      assert.equal(responseGate, undefined);
      let committed!: () => void;
      let release!: () => void;
      const committedPromise = new Promise<void>(resolve => {
        committed = resolve;
      });
      const released = new Promise<void>(resolve => {
        release = resolve;
      });
      responseGate = { committed, released, release };
      return { committed: committedPromise, release };
    },
    loseNextResponse() {
      loseResponse = true;
    },
    reuseIdentity(accession: string) {
      forceIdentity = accession;
    },
    reset() {
      submissions = 0;
      posts = 0;
      operationLookups = 0;
      lookupFault = undefined;
      keys.clear();
      reads = 0;
      loseResponse = false;
      forceIdentity = undefined;
      token = 'fixture-secret';
      responseGate?.release();
      responseGate = undefined;
      accessions.clear();
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    },
  };
}
export type AccessionServer = Awaited<ReturnType<typeof accessionServer>>;
