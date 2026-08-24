import 'reflect-metadata';

import { Attr, Entity, RECORD_CONTRACT_FORMAT_V1, toWaterlineModelDef } from '@researchdatabox/redbox-core';
import type {
  ContractJsonObject,
  RecordContractCompleteness,
  RecordContractFormat,
} from '@researchdatabox/redbox-core';

export const RECORD_SCHEMA_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

@Entity('recordschemaartifact', {
  datastore: 'redboxStorage',
  indexes: [{ attributes: { digest: 1 }, unique: true }],
})
export class RecordSchemaArtifactClass {
  @Attr({
    type: 'string',
    required: true,
    unique: true,
    validations: { is: RECORD_SCHEMA_DIGEST_PATTERN },
  })
  public digest!: string;

  @Attr({ type: 'json', required: true })
  public document!: ContractJsonObject;

  @Attr({
    type: 'string',
    required: true,
    isIn: [RECORD_CONTRACT_FORMAT_V1],
  })
  public contractFormat!: RecordContractFormat;

  @Attr({ type: 'string', required: true, isIn: ['complete', 'partial'] })
  public completeness!: RecordContractCompleteness;

  @Attr({ type: 'number', required: true, min: 1 })
  public byteLength!: number;

  @Attr({ type: 'string', columnType: 'datetime', autoCreatedAt: true })
  public createdAt!: string;

  @Attr({ type: 'string', columnType: 'datetime', autoUpdatedAt: true })
  public updatedAt!: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public lastAccessedAt?: string;
}

export const RecordSchemaArtifactWLDef = toWaterlineModelDef(RecordSchemaArtifactClass);
