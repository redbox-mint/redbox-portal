import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Email } from '../../integrations/Email';
import type { Services as Solr } from '../../queries/Solr';
import type { RecordsService } from '../../RecordsService';
import { BrandingModel } from '../../model/storage/BrandingModel';
import type { ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest } from '../../api-routes/validation';
import {
  referenceData,
  referenceErrors,
  referenceValidationErrors,
  type ReferenceRequest,
  type ReferenceResult,
} from './reference';
import { integrationAdministratorPrelude } from './integrationGuard';
import type { AuthenticatedActor } from '../context';
type Contract = Pick<ApiRouteDefinition, 'request'>;
import { referenceValue } from './reference';
export interface IntegrationOperationsInput {
  readonly records: Pick<RecordsService, 'getRecords' | 'getMeta'>;
  readonly search: Pick<Solr.SolrSearchService, 'index' | 'removeBrand'>;
  readonly email: Pick<Email.Email, 'evaluateProperties' | 'sendMessage'>;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly log: ILogger;
}
export function integrationOperationFailure(
  input: Pick<IntegrationOperationsInput, 'log'>,
  req: ReferenceRequest
): ReferenceResult {
  req.recordFailure?.();
  input.log.error('Integration administration operation failed');
  return referenceErrors(req, 500, [
    { detail: 'An error has occurred. Some effects may have completed; review current state before retrying.' },
  ]);
}
type Ready = {
  input: IntegrationOperationsInput;
  req: ReferenceRequest;
  body: unknown;
  query: Record<string, unknown>;
  actor: AuthenticatedActor;
  brand: ReferenceRequest['context']['brand'];
};
async function administer(
  input: IntegrationOperationsInput,
  req: ReferenceRequest,
  contract: Contract,
  action: string,
  run: (ready: Ready) => Promise<ReferenceResult | { data: unknown }>
): Promise<ReferenceResult> {
  const refusal = integrationAdministratorPrelude(req);
  if (refusal) return refusal;
  const valid = validateApiRouteRequest(req, contract);
  if (!valid.valid) return referenceValidationErrors(req, valid.issues);
  const { actor, brand } = req.context;
  const result = await run({ input, req, body: valid.body, query: valid.query, actor: actor!, brand });
  if ('status' in result) return result;
  await input.audit(actor!, action, { brandId: brand.id });
  return referenceData(req, result.data);
}
export function index(
  input: IntegrationOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'index', async ({ input, req, query, brand }) => {
    const oid = String(query.oid),
      record = await input.records.getMeta(oid);
    if (!record || record.metaMetadata?.brandId !== brand.id) {
      return referenceErrors(req, 404, [{ detail: 'Record not found' }]);
    }
    if (!(await input.search.index(oid, { ...record }))) throw new Error('Index request not accepted');
    const data = { oid, message: 'Index record request added to message queue for processing', details: '' };
    return { data };
  });
}
export function indexAll(
  input: IntegrationOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'indexAll', async ({ input, actor, brand }) => {
    let read = 0;
    while (true) {
      const page = await input.records.getRecords(
        undefined,
        undefined,
        read,
        100,
        actor.username,
        actor.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } })),
        Object.assign(new BrandingModel(), brand),
        undefined,
        undefined,
        undefined
      );
      for (const record of page.items) {
        const copy = { ...record };
        delete copy._id;
        if (!(await input.search.index(String(copy.redboxOid ?? ''), copy)))
          throw new Error('Index request not accepted');
      }
      read += page.items.length;
      if (read >= page.totalItems) break;
      if (!page.items.length) throw new Error('Record listing did not advance');
    }
    const data = { oid: '', message: 'Index all records request added to message queue for processing', details: '' };
    return { data };
  });
}
export function removeAll(
  input: IntegrationOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'removeAll', async ({ input, brand }) => {
    await input.search.removeBrand(brand.id);
    const data = {
      oid: '',
      message: 'Remove all records request added to message queue for processing',
      details: '',
    };
    return { data };
  });
}
export function sendNotification(
  input: IntegrationOperationsInput,
  req: ReferenceRequest,
  contract: Contract
): Promise<ReferenceResult> {
  return administer(input, req, contract, 'sendNotification', async ({ input, req, body }) => {
    const payload = body as Record<string, unknown>;
    if (
      !payload.to ||
      typeof payload.template !== 'string' ||
      !payload.template ||
      /[\\/]|\.\./.test(payload.template)
    ) {
      return referenceErrors(req, 400, [
        { detail: 'An error has occurred: a recipient and valid template name are required' },
      ]);
    }
    const options = input.email.evaluateProperties(
      {
        format: payload.format,
        from: payload.from,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        template: payload.template,
      },
      {},
      payload.data as Record<string, unknown> | undefined
    );
    if (!options.templateRendered) throw new Error('Template unavailable');
    const built = await referenceValue(options.templateRendered);
    if (built.status !== 200) throw new Error('Template failed');
    const replyTo =
      payload.otherSendOptions && typeof payload.otherSendOptions === 'object'
        ? Reflect.get(payload.otherSendOptions, 'replyTo')
        : undefined;
    const result = await referenceValue(
      input.email.sendMessage(
        options.toRendered,
        String(built.body),
        options.subjectRendered,
        options.fromRendered,
        options.formatRendered,
        options.ccRendered,
        options.bccRendered,
        typeof replyTo === 'string' ? { replyTo } : undefined
      )
    );
    if (!result.success) {
      req.observe?.({ emailProcessStepFailed: 'send' });
      throw new Error('Mail delivery failed');
    }
    const data = { message: result.msg, details: '' };

    return { data };
  });
}
