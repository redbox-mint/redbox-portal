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
import type { HttpRequestContext } from '../http/context';
import type { AssetResponse } from './brandingDelivery';
export interface DynamicAssetRequest {
  readonly context: HttpRequestContext;
  readonly params: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly session: Record<string, unknown>;
}
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
  req: DynamicAssetRequest,
  res: AssetResponse,
  input: DynamicPageAssetsInput,
  action: string
) {
  const context = req.context,
    { brand, portal, actor } = context;
  req.session.branding = brand.name;
  req.session.portal = portal;
  if (action === 'get') {
    if (req.params.asset !== 'apiClientConfig' && req.params.asset !== 'apiClientConfig.json') {
      res.status(404).end();
      return;
    }
    res.json(
      clientConfiguration(input.config, brand.name!, portal, String(Reflect.get(req.session, 'langCode') ?? 'en'))
    );
    return;
  }
  const modelBrand = Object.assign(new BrandingModel(), brand);
  if (Object.values(req.query).some(value => typeof value !== 'string')) {
    res.status(400).end();
    return;
  }
  const p = (name: string) => String(req.params[name] ?? req.query[name] ?? '');
  let entries: TemplateCompileInput[] = [];
  if (action === 'getFormCompiledItems') {
    const oid = p('oid'),
      edit = p('edit') === 'true';
    const record = oid ? await input.loadRecord(oid) : null;
    const roles = actor!.roles.map(role => ({ ...role, branding: { id: role.brandId } }));
    if (oid && (!record || record.metaMetadata.brandId !== brand.id)) {
      res.status(404).end();
      return;
    }
    if (
      record
        ? !(edit ? hasEditAccess : hasViewAccess)(modelBrand, { ...actor, roles }, roles, record)
        : !(await input.canCreate(context, p('recordType')))
    ) {
      res.status(403).end();
      return;
    }
    const form = record
      ? await input.forms.getForm(modelBrand, '', edit, '', record)
      : await singleHttpResult(input.forms.getFormByStartingWorkflowStep(modelBrand, p('recordType'), edit));
    if (!form?.configuration) {
      res.status(404).end();
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
        res.status(status).send((error as Error).message);
        return;
      }
      throw error;
    }
  }
  const file = input.artifacts.view('dynamicScriptAsset', brand.name!, portal);
  if (!file) throw new Error('Required script artifact missing.');
  res.type('text/javascript').send(
    input.artifacts.render(file, {
      entries: input.templates
        .buildClientMapping(entries)
        .map(entry => ({ key: buildKeyString(entry.key), value: entry.value })),
    })
  );
}
