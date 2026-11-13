import type { BrandingModel } from '../../../../packages/redbox-core/src/model/storage/BrandingModel';
import { isObject } from './renderer';

export interface ReadRecord extends Record<string, unknown> {
  readonly redboxOid: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly metaMetadata: { readonly brandId: string; readonly type: string; readonly form: string };
  readonly workflow: { readonly stage: string };
}

export interface ReadCaller {
  readonly brand: BrandingModel;
  readonly portal: string;
  readonly user: Record<string, unknown>;
}

export interface ReadPorts {
  readonly getMeta: (oid: string) => Promise<unknown>;
  readonly hasViewAccess: (
    brand: BrandingModel,
    user: Record<string, unknown>,
    roles: object[],
    record: Record<string, unknown>
  ) => boolean;
}

export class ReadError extends Error {
  public constructor(
    public readonly status: 403 | 404,
    public readonly code: string
  ) {
    super(status === 404 ? 'No accessible record was found.' : 'Record read permission is required.');
  }
}

function isReadRecord(value: unknown): value is ReadRecord {
  return (
    isObject(value) &&
    typeof value.redboxOid === 'string' &&
    isObject(value.metadata) &&
    isObject(value.metaMetadata) &&
    typeof value.metaMetadata.brandId === 'string' &&
    typeof value.metaMetadata.type === 'string' &&
    typeof value.metaMetadata.form === 'string' &&
    isObject(value.workflow) &&
    typeof value.workflow.stage === 'string'
  );
}

/** Same brand and RecordsService.hasViewAccess boundary as the REST metadata read. */
export async function readAuthorizedRecord(ports: ReadPorts, caller: ReadCaller, oid: string): Promise<ReadRecord> {
  const value = await ports.getMeta(oid);
  if (
    !isReadRecord(value) ||
    !caller.brand.id ||
    value.metaMetadata.brandId.trim() !== String(caller.brand.id).trim()
  ) {
    throw new ReadError(404, 'RECORD_NOT_FOUND');
  }
  const roles = Array.isArray(caller.user.roles) ? caller.user.roles.filter(isObject) : [];
  if (!ports.hasViewAccess(caller.brand, caller.user, roles, value)) throw new ReadError(403, 'RECORD_FORBIDDEN');
  return value;
}
