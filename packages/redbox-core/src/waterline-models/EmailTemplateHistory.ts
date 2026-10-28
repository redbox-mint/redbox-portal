import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('emailtemplatehistory', { indexes: [{ attributes: { brandId: 1, templateId: 1, version: 1 }, unique: true }] })
export class EmailTemplateHistoryClass {
  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public templateId!: string;

  @Attr({ type: 'number', required: true, min: 1, isInteger: true })
  public version!: number;

  @Attr({ type: 'string', required: true, isIn: ['publish', 'reset', 'restore-published'] })
  public event!: string;

  @Attr({ type: 'string', allowNull: true })
  public subject!: string | null;

  @Attr({ type: 'string', allowNull: true })
  public body!: string | null;

  @Attr({ type: 'string', allowNull: true })
  public format!: string | null;

  @Attr({ type: 'number', allowNull: true })
  public restoredFromVersion!: number | null;

  @Attr({ type: 'string', required: true })
  public defaultHash!: string;

  @Attr({ type: 'string', allowNull: true })
  public liveId!: string | null;

  @Attr({ type: 'json' })
  public previousLiveToken!: unknown;

  @Attr({ type: 'number', allowNull: true })
  public draftRevision!: number | null;

  @Attr({ type: 'string' })
  public actorId!: string;

  @Attr({ type: 'string' })
  public actorDisplayName!: string;

  @Attr({ type: 'string', autoCreatedAt: true })
  public createdAt!: string;
}

export const EmailTemplateHistoryWLDef = toWaterlineModelDef(EmailTemplateHistoryClass);

declare global {
  const EmailTemplateHistory: Sails.Model<EmailTemplateHistoryClass & Sails.WaterlineAttributes>;
}
