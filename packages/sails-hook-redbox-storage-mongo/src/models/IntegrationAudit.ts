import 'reflect-metadata';
import { Entity, Attr, toWaterlineModelDef } from '@researchdatabox/redbox-core';

@Entity('integrationaudit', { datastore: 'redboxStorage' })
export class IntegrationAuditClass {
  @Attr({ type: 'string' })
  public redboxOid?: string;

  @Attr({ type: 'string' })
  public brandId?: string;

  @Attr({ type: 'string' })
  public integrationName?: string;

  @Attr({ type: 'string' })
  public integrationAction?: string;

  @Attr({ type: 'string' })
  public triggeredBy?: string;

  @Attr({ type: 'string' })
  public status?: string;

  @Attr({ type: 'string' })
  public message?: string;

  @Attr({ type: 'string' })
  public errorDetail?: string;

  @Attr({ type: 'number' })
  public httpStatusCode?: number;

  @Attr({ type: 'string' })
  public traceId?: string;

  @Attr({ type: 'string' })
  public spanId?: string;

  @Attr({ type: 'string' })
  public parentSpanId?: string;

  @Attr({ type: 'string' })
  public startedAt?: string;

  @Attr({ type: 'string' })
  public completedAt?: string;

  @Attr({ type: 'number' })
  public durationMs?: number;

  @Attr({ type: 'json' })
  public requestSummary?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public responseSummary?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;
}

export const IntegrationAuditWLDef = toWaterlineModelDef(IntegrationAuditClass);
