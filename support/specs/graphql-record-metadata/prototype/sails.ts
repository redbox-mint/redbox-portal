import '../../../../packages/redbox-core/src/sails';
import type { BrandingModel } from '../../../../packages/redbox-core/src/model/storage/BrandingModel';
import { policies, type ControllerPolicies } from '../../../../packages/redbox-core/src/config/policies.config';
import type { RecordContract } from '../../../../packages/redbox-core/src/record-contract/types';
import { readAuthorizedRecord, ReadError, type ReadCaller, type ReadPorts } from './access';
import { createRecordYoga, QUERY_LIMITS } from './graphql';
import { isObject } from './renderer';
import { projectMetadata, ProjectionError } from './projection';

export interface SailsReadPorts extends ReadPorts {
  readonly getBrand: (name: string) => BrandingModel;
}

const recordPolicies = policies['webservice/RecordController'] as ControllerPolicies;
const chain = recordPolicies['*'];
if (!Array.isArray(chain)) throw new Error('Expected the existing REST record policy chain.');

/** Explicit opt-in wiring for a local hook. Importing this file installs nothing. */
export const prototypeConfig = {
  routes: {
    'post /:branding/:portal/api/graphql': {
      controller: 'webservice/RecordMetadataPrototypeController',
      action: 'graphql',
    },
    'get /:branding/:portal/api/record-metadata-projection/:oid': {
      controller: 'webservice/RecordMetadataPrototypeController',
      action: 'projection',
    },
  },
  policies: { 'webservice/RecordMetadataPrototypeController': { '*': chain } },
};

/** Call only from a Sails controller after its configured policies have run. */
export function createPrototypeActions(contracts: readonly RecordContract[], ports: SailsReadPorts) {
  const { yoga, schema } = createRecordYoga(contracts, ports);
  function callerFromRequest(req: Sails.Req, res: Sails.Res): ReadCaller | undefined {
    // Bearer policy can populate req.user even when req.isAuthenticated() is false.
    if (!isObject(req.user) || typeof req.user.username !== 'string' || !req.user.username) {
      res.status(401).json({ errors: [{ message: 'Authentication is required.' }] });
      return;
    }
    const branding = req.options?.locals?.branding;
    const portal = req.options?.locals?.portal;
    if (typeof branding !== 'string' || typeof portal !== 'string') {
      res.status(404).json({ errors: [{ message: 'No accessible request scope was found.' }] });
      return;
    }
    const brand = ports.getBrand(branding);
    if (!brand?.id) {
      res.status(404).json({ errors: [{ message: 'No accessible request scope was found.' }] });
      return;
    }
    return { brand, portal, user: req.user };
  }
  function sendBounded(res: Sails.Res, status: number, body: string): void {
    res.set({
      'Cache-Control': 'private, no-store',
      Vary: 'Authorization, Cookie',
      'Content-Type': 'application/json',
    });
    if (Buffer.byteLength(body) > QUERY_LIMITS.responseBytes) {
      res.status(413).json({
        errors: [{ message: 'Response exceeds the investigation limit.', extensions: { code: 'RESPONSE_LIMIT' } }],
      });
      return;
    }
    res.status(status).send(body);
  }
  return {
    schema,
    graphql: async (req: Sails.Req, res: Sails.Res): Promise<void> => {
      const caller = callerFromRequest(req, res);
      if (!caller) return;
      if (
        req.method !== 'POST' ||
        !isObject(req.body) ||
        Buffer.byteLength(JSON.stringify(req.body)) > QUERY_LIMITS.bytes
      ) {
        res.status(400).json({ errors: [{ message: 'Expected a bounded JSON POST request.' }] });
        return;
      }
      // Sails has parsed the body already. Yoga consumes a reconstructed request
      // here rather than re-reading the drained IncomingMessage stream.
      const response = await yoga.fetch(
        'http://redbox.local/graphql',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
          body: JSON.stringify(req.body),
        },
        { caller }
      );
      sendBounded(res, response.status, await response.text());
    },
    projection: async (req: Sails.Req, res: Sails.Res): Promise<void> => {
      const caller = callerFromRequest(req, res);
      if (!caller) return;
      const oid = req.params.oid;
      const fields = req.query.fields;
      if (typeof oid !== 'string' || !oid || oid.length > 256 || (fields !== undefined && typeof fields !== 'string')) {
        res.status(400).json({ errors: [{ message: 'Invalid metadata projection request.' }] });
        return;
      }
      try {
        const record = await readAuthorizedRecord(ports, caller, oid);
        const data = projectMetadata(record.metadata, fields);
        sendBounded(res, 200, JSON.stringify({ data, meta: { oid: record.redboxOid } }));
      } catch (error) {
        if (error instanceof ReadError || error instanceof ProjectionError) {
          res.status(error instanceof ReadError ? error.status : 400).json({ errors: [{ message: error.message }] });
          return;
        }
        res.status(500).json({ errors: [{ message: 'Metadata read failed.' }] });
      }
    },
  };
}
