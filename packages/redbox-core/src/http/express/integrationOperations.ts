import { requireAdministrator } from './actors';
import { RequestChronicleHelper } from '../../utilities/RequestChronicle';
import type { Router, RequestHandler } from 'express';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Email } from '../../integrations/Email';
import type { Services as Solr } from '../../queries/Solr';
import type { RecordsService } from '../../RecordsService';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { indexRecordRoute, indexAllRecordsRoute, removeAllIndexedRoute } from '../../api-routes/groups/search';
import { sendNotificationRoute } from '../../api-routes/groups/notifications';
import { validateApiRouteRequest } from '../../api-routes/validation';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { bindHttpPolicies, resolveEffectivePolicies, requestContext } from './policies';
import { httpAction, singleHttpResult, recordHttpFailure } from './middleware';
import { sendApiData, sendApiErrors, sendApiValidationErrors } from './responses';
export const integrationOperationRoutes = [
  indexRecordRoute,
  indexAllRecordsRoute,
  removeAllIndexedRoute,
  sendNotificationRoute,
];
export interface IntegrationOperationsHttpInput {
  readonly records: Pick<RecordsService, 'getRecords' | 'getMeta'>;
  readonly search: Pick<Solr.SolrSearchService, 'index' | 'removeBrand'>;
  readonly email: Pick<Email.Email, 'evaluateProperties' | 'sendMessage'>;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
  readonly csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
  readonly policies: Readonly<Record<string, RequestHandler>>;
  readonly policyConfiguration: PoliciesConfig;
  readonly log: ILogger;
}
export function mountIntegrationOperationRoutes(router: Router, input: IntegrationOperationsHttpInput): void {
  const bindings = integrationOperationRoutes.map(route => ({
    route,
    policies: bindHttpPolicies(resolveEffectivePolicies(route, input.policyConfiguration), input.policies),
  }));
  for (const { route, policies } of bindings)
    router[route.method](
      route.path,
      ...policies,
      input.csrf.apiProtect,
      httpAction(async (req, res) => {
        const { actor, brand } = requestContext(req);
        if (!requireAdministrator(req, res, actor, brand.id)) return;
        const validated = validateApiRouteRequest(req, route);
        if (!validated.valid) {
          sendApiValidationErrors(req, res, validated.issues);
          return;
        }
        try {
          let data: unknown;
          if (route.action === 'index') {
            const oid = String(validated.query.oid),
              record = await input.records.getMeta(oid);
            if (!record || record.metaMetadata?.brandId !== brand.id) {
              sendApiErrors(req, res, 404, [{ detail: 'Record not found' }]);
              return;
            }
            if (!(await input.search.index(oid, { ...record }))) throw new Error('Index request not accepted');
            data = { oid, message: 'Index record request added to message queue for processing', details: '' };
          } else if (route.action === 'indexAll') {
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
            data = { oid: '', message: 'Index all records request added to message queue for processing', details: '' };
          } else if (route.action === 'removeAll') {
            await input.search.removeBrand(brand.id);
            data = {
              oid: '',
              message: 'Remove all records request added to message queue for processing',
              details: '',
            };
          } else {
            const body = validated.body as Record<string, unknown>;
            if (!body.to || typeof body.template !== 'string' || !body.template || /[\\/]|\.\./.test(body.template)) {
              sendApiErrors(req, res, 400, [
                { detail: 'An error has occurred: a recipient and valid template name are required' },
              ]);
              return;
            }
            const options = input.email.evaluateProperties(
              {
                format: body.format,
                from: body.from,
                to: body.to,
                cc: body.cc,
                bcc: body.bcc,
                subject: body.subject,
                template: body.template,
              },
              {},
              body.data as Record<string, unknown> | undefined
            );
            if (!options.templateRendered) throw new Error('Template unavailable');
            const built = await singleHttpResult(options.templateRendered);
            if (built.status !== 200) throw new Error('Template failed');
            const replyTo =
              body.otherSendOptions && typeof body.otherSendOptions === 'object'
                ? Reflect.get(body.otherSendOptions, 'replyTo')
                : undefined;
            const result = await singleHttpResult(
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
              RequestChronicleHelper.existing(req)?.addInfo({ emailProcessStepFailed: 'send' });
              throw new Error('Mail delivery failed');
            }
            data = { message: result.msg, details: '' };
          }
          await input.audit(actor, route.action, { brandId: brand.id });
          sendApiData(req, res, data);
        } catch (_error) {
          recordHttpFailure(req, input.log, 'Integration administration operation failed');
          sendApiErrors(req, res, 500, [
            { detail: 'An error has occurred. Some effects may have completed; review current state before retrying.' },
          ]);
        }
      })
    );
}
