import type { TemplateCompileInput } from '@researchdatabox/sails-ng-common';
import { buildKeyString } from '@researchdatabox/sails-ng-common';
import { referenceValue as singleHttpResult } from '../http/actions/reference';
import { PageArtifacts } from './Artifacts';
import { Services as Templates } from './Templates';
import { clientConfiguration, type ClientConfigurationInput } from './clientConfiguration';
import { BrandingModel } from '../model/storage/BrandingModel';
import { hasEditAccess, hasViewAccess } from '../records/access';
import type { Forms } from '../forms/Forms';
import type { Services as Dashboards } from '../dashboards/DashboardTypes';
import type { Services as Reports } from '../queries/Reports';
import type { BrowserPageInput } from './browser';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requestContext } from '../http/context';
import { sendAssetBytes, assetMediaType } from '../http/fastify/assets';
export interface DynamicPageAssetsInput extends Pick<BrowserPageInput, 'loadRecord' | 'canCreate'> {
  artifacts: PageArtifacts;
  config: ClientConfigurationInput & { reusableFormDefinitions?: Parameters<Forms['extractRawTemplates']>[4] };
  defaultBrand: string;
  defaultPortal: string;
  forms: Pick<Forms, 'getFormByStartingWorkflowStep' | 'getForm' | 'extractRawTemplates'>;
  dashboards: Pick<Dashboards.DashboardTypes, 'extractDashboardTemplates' | 'extractDashboardViewTemplates'>;
  reports: Pick<Reports.Reports, 'extractReportTemplates'>;
  templates: Templates.Template;
}
export async function deliverDynamicAsset(
  req: FastifyRequest,
  res: FastifyReply,
  input: DynamicPageAssetsInput,
  action: string
) {
  const context = requestContext(req),
    { brand, portal, actor } = context;
  const params = req.params as Record<string, unknown>;
  const query = req.query as Record<string, unknown>;
  req.session.branding = brand.name;
  req.session.portal = portal;
  if (action === 'get') {
    if (params.asset !== 'apiClientConfig' && params.asset !== 'apiClientConfig.json') {
      res.code(404).send();
      return;
    }
    sendAssetBytes(
      req,
      res.type('application/json'),
      JSON.stringify(
        clientConfiguration(input.config, brand.name!, portal, String(Reflect.get(req.session, 'langCode') ?? 'en'))
      )
    );
    return;
  }
  const modelBrand = Object.assign(new BrandingModel(), brand);
  if (Object.values(query).some(value => typeof value !== 'string')) {
    res.code(400).send();
    return;
  }
  const p = (name: string) => String(params[name] ?? query[name] ?? '');
  let entries: TemplateCompileInput[] = [];
  if (action === 'getFormCompiledItems') {
    const oid = p('oid'),
      edit = p('edit') === 'true';
    const record = oid ? await input.loadRecord(oid) : null;
    const roles = actor!.roles.map(role => ({ ...role, branding: { id: role.brandId } }));
    if (oid && (!record || record.metaMetadata.brandId !== brand.id)) {
      res.code(404).send();
      return;
    }
    if (
      record
        ? !(edit ? hasEditAccess : hasViewAccess)(modelBrand, { ...actor, roles }, roles, record)
        : !(await input.canCreate(context, p('recordType')))
    ) {
      res.code(403).send();
      return;
    }
    const form = record
      ? await input.forms.getForm(modelBrand, '', edit, '', record)
      : await singleHttpResult(input.forms.getFormByStartingWorkflowStep(modelBrand, p('recordType'), edit));
    if (!form?.configuration) {
      res.code(404).send();
      return;
    }
    entries = await input.forms.extractRawTemplates(
      form.configuration,
      edit ? 'edit' : 'view',
      roles.map(role => role.name).filter((name): name is string => !!name),
      record?.metadata ?? null,
      input.config.reusableFormDefinitions
    );
  } else if (action === 'getAdminReportTemplates') {
    entries = await input.reports.extractReportTemplates(modelBrand, p('reportName'));
  } else {
    try {
      entries =
        action === 'getRecordDashboardTemplates'
          ? await input.dashboards.extractDashboardTemplates(
              modelBrand,
              p('recordType'),
              p('workflowStage'),
              p('settingsFingerprint') || undefined
            )
          : await input.dashboards.extractDashboardViewTemplates(
              modelBrand,
              p('dashboardView'),
              p('stepName'),
              p('settingsFingerprint') || undefined
            );
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 409 || status === 503) {
        sendAssetBytes(req, res.code(status), (error as Error).message);
        return;
      }
      throw error;
    }
  }
  const file = input.artifacts.view('dynamicScriptAsset', brand.name!, portal);
  if (!file) throw new Error('Required script artifact missing.');
  sendAssetBytes(
    req,
    assetMediaType(res, 'text/javascript'),
    input.artifacts.render(file, {
      entries: input.templates
        .buildClientMapping(entries)
        .map(entry => ({ key: buildKeyString(entry.key), value: entry.value })),
    })
  );
}
