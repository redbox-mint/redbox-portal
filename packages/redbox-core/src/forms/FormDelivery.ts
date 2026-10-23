import _ from 'lodash';
import { firstValueFrom } from 'rxjs';
import type { Forms } from './Forms';
import type { Services as Prehydrate } from './FormPayloadPrehydrate';
import type { Services as Workflows } from '../workflows/WorkflowSteps';
import type { RecordTypes } from '../recordTypes';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordModel } from '../model/storage/RecordModel';
import type { UserModel } from '../model/storage/UserModel';
import type { FormAttributes } from '../persistence/rows';
import type { ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';
import { recordRepresentationConcurrency } from '../RecordHttpConcurrency';

type FingerprintRecord = Record<string, unknown>;
export interface FormDeliveryInput {
  readonly forms: Pick<
    Forms,
    'getFormByStartingWorkflowStep' | 'getForm' | 'buildClientFormConfig' | 'discoverValidationOperations'
  >;
  readonly recordTypes: Pick<RecordTypes, 'get'>;
  readonly workflowSteps: Pick<Workflows.WorkflowSteps, 'getFirst'>;
  readonly prehydrate: Pick<Prehydrate.FormPayloadPrehydrateService, 'build'>;
  readonly reusableFormDefinitions?: ReusableFormDefinitions;
  loadRecord(oid: string): Promise<RecordModel | null>;
  canView(brand: BrandingModel, user: UserModel | undefined, record: RecordModel): Promise<boolean>;
  canEdit(brand: BrandingModel, user: UserModel | undefined, record: RecordModel): Promise<boolean>;
  fingerprint(record: FingerprintRecord, type: FingerprintRecord, form: FormAttributes): Promise<string | undefined>;
}
export interface FormDeliveryRequest {
  readonly brand: BrandingModel;
  readonly user?: UserModel;
  readonly recordType?: string;
  readonly oid?: string | null;
  readonly edit: boolean;
  readonly formName?: string;
  readonly targetStep?: string;
  contextVariables(record: RecordModel | null): Record<string, string>;
}
export class FormDeliveryError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
  }
}

/** The shared browser form operation; transport envelopes remain in each host. */
export async function deliverForm(input: FormDeliveryInput, request: FormDeliveryRequest) {
  const { brand, user, recordType, edit, formName, targetStep } = request;
  const oid = request.oid || null;
  let form: FormAttributes | null;
  let record: RecordModel | null = null;
  if (!oid) {
    form = await firstValueFrom(input.forms.getFormByStartingWorkflowStep(brand, recordType ?? '', edit));
    if (_.isEmpty(form)) throw new FormDeliveryError(500, `Error, getting form for record type: ${recordType}`);
  } else {
    record = await input.loadRecord(oid);
    if (_.isEmpty(record)) throw new FormDeliveryError(404, 'missing-record', 'missing-record');
    // Brand isolation is independent of named-user/role access to the object.
    if (
      !(await (edit ? input.canEdit : input.canView)(brand, user, record)) ||
      String(record.metaMetadata?.brandId ?? '') !== String(brand.id)
    )
      throw new FormDeliveryError(500, 'view-error-no-permissions', 'view-error-no-permissions');
    const authoritative = String(record.metaMetadata?.form ?? '').trim();
    if (!authoritative) throw new FormDeliveryError(500, `The authoritative form is unavailable for OID: ${oid}`);
    if (formName?.trim() && formName.trim() !== authoritative)
      throw new FormDeliveryError(409, 'form-definition-changed', 'form-definition-changed');
    form = await input.forms.getForm(brand, authoritative, edit, '', record);
    if (_.isEmpty(form)) throw new FormDeliveryError(500, `Error, getting form ${formName} for OID: ${oid}`);
  }
  const configuration = form?.configuration;
  if (!form || !configuration)
    throw new FormDeliveryError(
      500,
      `Form configuration not found for form ${formName}, record type ${recordType}, oid ${oid}`
    );
  const contextVariables = request.contextVariables(record);
  const userRoles = (user?.roles ?? []).map(role => String(role.name ?? '')).filter(Boolean);
  const data = await input.forms.buildClientFormConfig(
    configuration,
    edit ? 'edit' : 'view',
    userRoles,
    record?.metadata ?? null,
    input.reusableFormDefinitions,
    String(brand.name ?? ''),
    contextVariables,
    user ? { user, brand } : undefined
  );
  const validationOperations = await input.forms.discoverValidationOperations({
    brand,
    form,
    recordType: String(record?.metaMetadata?.type ?? recordType ?? configuration.type ?? ''),
    record,
    user,
    editable: edit,
    targetStep,
  });
  const prehydrate = await input.prehydrate.build({ branding: brand, formConfig: data });
  const name = String(record?.metaMetadata?.type ?? recordType ?? configuration.type ?? '').trim();
  const type = await firstValueFrom(input.recordTypes.get(brand, name));
  let fingerprintRecord: FingerprintRecord;
  if (record) fingerprintRecord = record as unknown as FingerprintRecord;
  else {
    const step = await firstValueFrom(input.workflowSteps.getFirst(type));
    fingerprintRecord = {
      metaMetadata: {
        brandId: String(brand.id ?? ''),
        type: String(type ? (Reflect.get(type, 'name') ?? name) : name),
        form: String(_.get(step, 'config.form', '')),
      },
      workflow: { stage: String(step?.name ?? '') },
    };
  }
  const formFingerprint = await input.fingerprint(fingerprintRecord, type as unknown as FingerprintRecord, form);
  if (!formFingerprint) throw new Error('The current form concurrency fingerprint could not be generated.');
  if (_.isEmpty(data))
    throw new FormDeliveryError(
      500,
      `Failed to get form with name ${formName} and record type ${recordType} and oid ${oid}`
    );
  const representation = record ? recordRepresentationConcurrency(record) : undefined;
  return {
    data,
    meta: {
      formName: String(form.name ?? record?.metaMetadata?.form ?? formName ?? ''),
      recordType,
      oid,
      workflow: record?.workflow,
      contextVariables,
      validationOperations,
      formFingerprint,
      ...(representation?.metadata ?? {}),
    },
    prehydrate,
    headers: representation?.headers,
  };
}
