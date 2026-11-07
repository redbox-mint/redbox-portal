import { firstValueFrom } from 'rxjs';
import { createHash } from 'node:crypto';
import { Cookie } from 'express-session';
import type { FormConfigOutline, AllFormComponentDefinitionOutlines } from '@researchdatabox/sails-ng-common';
import type { RecordModel } from './model';
import type { WorkflowStepModel } from './model/storage/WorkflowStepModel';
import { ConstructFormConfigVisitor } from './visitor/construct.visitor';

/** Server-held permission issued only by an existing-record edit route. */
export interface RecordRouteForm {
  readonly oid: string;
  readonly brandId: string;
  readonly username: string;
  readonly recordType: string;
  readonly storedForm: string;
  readonly stage: string;
  readonly formName: string;
  readonly fingerprint?: string;
}

type GrantSelector = { formName: string } | { fingerprint: string };

const ROUTE_FORM_FINGERPRINT_PREFIX = 'route:';

/** An opaque routing hint only; a matching server-held grant is still required. */
export function routeFormFingerprint(fingerprint: string): string {
  return ROUTE_FORM_FINGERPRINT_PREFIX + fingerprint;
}

export function isRouteFormFingerprint(fingerprint: string | undefined): fingerprint is string {
  return fingerprint?.startsWith(ROUTE_FORM_FINGERPRINT_PREFIX) === true;
}

function grantKey(req: Sails.Req, oid: string, selector: GrantSelector): string {
  return (
    'redbox-route-form:' +
    createHash('sha256')
      .update(JSON.stringify([req.sessionID, oid, selector]))
      .digest('hex')
  );
}

/** Independent store entries avoid whole-session last-write-wins races between tabs. */
export async function storeRouteForm(req: Sails.Req, grant: RecordRouteForm): Promise<void> {
  if (!req.sessionID || !req.sessionStore || !req.session) return;
  const expires = Date.now() + Math.min(req.session.cookie?.maxAge ?? 86_400_000, 86_400_000);
  const cookie = new Cookie();
  cookie.expires = new Date(expires);
  const selector = grant.fingerprint ? { fingerprint: grant.fingerprint } : { formName: grant.formName };
  await new Promise<void>((resolve, reject) => {
    req.sessionStore.set(
      grantKey(req, grant.oid, selector),
      {
        cookie,
        branding: grant.brandId,
        portal: '',
        user: {},
        redirUrl: '',
        logoutUrl: '',
        lang: '',
        authenticated: false,
        data: null,
        recordRouteForm: grant,
        recordRouteFormExpires: expires,
      },
      error => (error ? reject(error) : resolve())
    );
  });
}

export async function readRouteForm(
  req: Sails.Req,
  oid: string,
  selector: GrantSelector
): Promise<RecordRouteForm | undefined> {
  if (!req.sessionID || !req.sessionStore || !req.session) return undefined;
  return new Promise((resolve, reject) => {
    req.sessionStore.get(grantKey(req, oid, selector), (error, entry) => {
      if (error) return reject(error);
      const grant = entry?.recordRouteForm;
      resolve(
        (entry?.recordRouteFormExpires ?? 0) > Date.now() && grant?.oid === oid && grant.username === req.user?.username
          ? grant
          : undefined
      );
    });
  });
}

/** Follow schema containment only; metadata/default values cannot declare save targets. */
function saveTargets(form: FormConfigOutline): Set<string> {
  const targets = new Set<string>();
  const visit = (definition: AllFormComponentDefinitionOutlines): void => {
    const component = definition.component;
    switch (component.class) {
      case 'SaveButtonComponent':
        if (component.config?.targetStep) targets.add(component.config.targetStep);
        break;
      case 'GroupComponent':
      case 'QuestionTreeComponent':
      case 'ReusableComponent':
      case 'TabContentComponent':
      case 'AccordionPanelComponent':
        component.config?.componentDefinitions?.forEach(visit);
        break;
      case 'TabComponent':
        component.config?.tabs?.forEach(visit);
        break;
      case 'AccordionComponent':
        component.config?.panels?.forEach(visit);
        break;
      case 'RepeatableComponent':
        if (component.config?.elementTemplate) visit(component.config.elementTemplate);
        break;
      case 'PublishDataLocationSelectorComponent':
        component.config?.headerActions?.forEach(visit);
        break;
    }
  };
  form.componentDefinitions.forEach(visit);
  return targets;
}

export function routeFormMatches(record: RecordModel | undefined, grant: RecordRouteForm): boolean {
  return (
    record?.redboxOid === grant.oid &&
    record.metaMetadata?.brandId === grant.brandId &&
    record.metaMetadata?.type === grant.recordType &&
    record.metaMetadata?.form === grant.storedForm &&
    record.workflow?.stage === grant.stage
  );
}

/** Select the authorised source contract without mutating the stored workflow. */
export function routeFormFingerprintRecord(record: RecordModel, formName: string): RecordModel {
  return { ...record, metaMetadata: { ...record.metaMetadata, form: formName } };
}

export async function routeFormAllowed(
  record: RecordModel,
  formName: string,
  canTransition: (step: unknown) => boolean,
  targetStep?: string
): Promise<boolean> {
  const meta = record.metaMetadata;
  if (!meta?.brandId || !meta.type || !record.workflow?.stage) return false;
  const brand = BrandingService.getBrandById(String(meta.brandId));
  const recordType = await firstValueFrom(RecordTypesService.get(brand, String(meta.type)));
  if (!recordType) return false;
  const steps = await firstValueFrom(WorkflowStepsService.getAllForRecordTypeIncludingHidden(recordType));
  // Records persist config.workflow.stage, which can differ from the step name.
  // Missing configured stages retain the legacy name default. Never select an
  // unrelated same-name step, or guess between indistinguishable definitions.
  const stageMatches = steps.filter(step => {
    const config = step.config as { workflow?: { stage?: string } };
    return String(config?.workflow?.stage ?? step.name).trim() === String(record.workflow.stage).trim();
  });
  const currentMatches =
    stageMatches.length > 1
      ? stageMatches.filter(step => (step.config as { form?: string })?.form === meta.form)
      : stageMatches;
  if (currentMatches.length !== 1) return false;
  const current = currentMatches[0];
  const form = await firstValueFrom(FormsService.getFormByName(formName, true, String(meta.brandId)));
  const configuredType = String(form?.configuration?.type ?? '').trim();
  if (
    form?.name !== formName ||
    !form.configuration ||
    (configuredType && configuredType !== meta.type) ||
    (form.branding && String(form.branding) !== String(meta.brandId))
  )
    return false;

  const currentConfig = current.config as { workflow?: { next?: unknown } };
  const next = currentConfig?.workflow?.next;
  // Legacy workflows can have no edge list: the existing save
  // policy permits configured stages subject to transitionRoles. An explicit
  // next list narrows that policy for route-selected forms.
  const reachable = next === undefined ? undefined : Array.isArray(next) ? next : [next];
  const isReachable = (step: WorkflowStepModel) =>
    (step.name === current.name || !reachable || reachable.includes(step.name)) && canTransition(step);
  if (targetStep && !steps.some(step => step.name === targetStep && isReachable(step))) return false;
  const owners = steps.filter(step => (step.config as { form?: string })?.form === formName && canTransition(step));
  // A reachable owner authorises the source form. Workflow edges and roles
  // constrain its save destination; UI buttons do not narrow that policy.
  if (owners.some(isReachable)) return true;
  // A hidden form can perform a direct transition without persisting its own
  // stage. Its server-configured save target must be reachable instead.
  if (!owners.some(step => step.hidden)) return false;
  const constructed = await new ConstructFormConfigVisitor(sails.log).start({
    data: { ...form.configuration, name: formName },
    reusableFormDefs: sails.config.reusableFormDefinitions,
    formMode: 'edit',
  });
  const targets = saveTargets(constructed);
  return steps.some(step => targets.has(step.name) && isReachable(step) && (!targetStep || step.name === targetStep));
}
