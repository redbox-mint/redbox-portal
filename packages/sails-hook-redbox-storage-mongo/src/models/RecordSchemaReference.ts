import 'reflect-metadata';

import { Attr, Entity, toWaterlineModelDef } from '@researchdatabox/redbox-core';
import type { RecordContractSchemaKind } from '@researchdatabox/redbox-core';
import { RECORD_SCHEMA_DIGEST_PATTERN } from './RecordSchemaArtifact';

export const RECORD_SCHEMA_REFERENCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;

@Entity('recordschemareference', {
  datastore: 'redboxStorage',
  indexes: [
    { attributes: { referenceKey: 1 }, unique: true },
    { attributes: { digest: 1, kind: 1 } },
    {
      attributes: {
        digest: 1,
        kind: 1,
        brand: 1,
        portal: 1,
        schemaKind: 1,
        recordType: 1,
        operation: 1,
        oid: 1,
      },
    },
    { attributes: { oid: 1, kind: 1 } },
    { attributes: { kind: 1, expiresAt: 1 } },
  ],
})
export class RecordSchemaReferenceClass {
  @Attr({
    type: 'string',
    required: true,
    unique: true,
    validations: { regex: RECORD_SCHEMA_REFERENCE_KEY_PATTERN },
  })
  public referenceKey!: string;

  @Attr({
    type: 'string',
    required: true,
    validations: { regex: RECORD_SCHEMA_DIGEST_PATTERN },
  })
  public digest!: string;

  @Attr({ type: 'string', required: true, isIn: ['grant', 'save', 'pin'] })
  public kind!: 'grant' | 'save' | 'pin';

  @Attr({ type: 'string', required: true, validations: { maxLength: 512 } })
  public brand!: string;

  @Attr({ type: 'string', required: true, validations: { maxLength: 512 } })
  public portal!: string;

  @Attr({ type: 'string', required: true, isIn: ['create', 'update'] })
  public schemaKind!: RecordContractSchemaKind;

  @Attr({ type: 'string', required: true, validations: { maxLength: 512 } })
  public recordType!: string;

  @Attr({ type: 'string', validations: { maxLength: 512 } })
  public oid?: string;

  @Attr({ type: 'string', required: true, validations: { maxLength: 512 } })
  public operation!: string;

  @Attr({ type: 'string', validations: { maxLength: 512 } })
  public owner?: string;

  @Attr({ type: 'string', validations: { maxLength: 2_048 } })
  public purpose?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public expiresAt?: string;

  @Attr({ type: 'string', columnType: 'datetime', autoCreatedAt: true })
  public createdAt!: string;

  @Attr({ type: 'string', columnType: 'datetime', autoUpdatedAt: true })
  public updatedAt!: string;
}

/**
 * Runtime persistence enforces the discriminated rules that Waterline cannot:
 * create grants have no OID, update grants and saves require one, and only pins
 * may carry owner, purpose, or expiry fields.
 */
export const RecordSchemaReferenceWLDef = toWaterlineModelDef(RecordSchemaReferenceClass);
