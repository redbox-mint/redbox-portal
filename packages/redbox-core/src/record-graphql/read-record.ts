import { GraphQLError } from 'graphql';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordModel } from '../model/storage/RecordModel';

export interface ReadCaller {
  readonly brand: BrandingModel;
  readonly portal: string;
  readonly user: Record<string, unknown>;
  readonly roles: object[];
}

export interface ReadPorts {
  readonly getRecord: (oid: string) => Promise<RecordModel>;
  readonly hasViewAccess: (caller: ReadCaller, record: RecordModel) => boolean | Promise<boolean>;
}

/** Preserve the REST service override, brand check and viewer/editor authorization. */
export async function readAuthorizedRecord(ports: ReadPorts, caller: ReadCaller, oid: string): Promise<RecordModel> {
  let record: RecordModel;
  try {
    record = await ports.getRecord(oid);
  } catch {
    throw new GraphQLError('Record was not found.', { extensions: { code: 'NOT_FOUND' } });
  }
  if (
    !record ||
    !caller.brand.id ||
    String(record.metaMetadata?.brandId ?? '').trim() !== String(caller.brand.id).trim()
  ) {
    throw new GraphQLError('Record was not found.', { extensions: { code: 'NOT_FOUND' } });
  }
  if (!(await ports.hasViewAccess(caller, record))) {
    throw new GraphQLError('Record read is denied.', { extensions: { code: 'FORBIDDEN' } });
  }
  return record;
}
