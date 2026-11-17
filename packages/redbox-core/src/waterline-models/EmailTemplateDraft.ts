import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('emailtemplatedraft', { indexes: [{ attributes: { brandId: 1, templateId: 1 }, unique: true }] })
export class EmailTemplateDraftClass {
  @Attr({ type: 'string', required: true, unique: true })
  public uid!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public templateId!: string;

  @Attr({ type: 'string', required: true })
  public subject!: string;

  @Attr({ type: 'string', required: true })
  public body!: string;

  @Attr({ type: 'string', required: true, isIn: ['html', 'text'] })
  public format!: 'html' | 'text';

  @Attr({ type: 'number', required: true, min: 1, isInteger: true })
  public draftRevision!: number;

  @Attr({ type: 'json' })
  public baseVersion!: unknown;

  @Attr({ type: 'number', allowNull: true })
  public restoredFromVersion!: number | null;

  @Attr({ type: 'string' })
  public updatedBy!: string;

  @Attr({ type: 'string' })
  public updatedByName!: string;

  @Attr({ type: 'string', autoCreatedAt: true })
  public createdAt!: string;

  @Attr({ type: 'string', autoUpdatedAt: true })
  public updatedAt!: string;
}

export const EmailTemplateDraftWLDef = toWaterlineModelDef(EmailTemplateDraftClass);

declare global {
  const EmailTemplateDraft: Sails.Model<EmailTemplateDraftClass & Sails.WaterlineAttributes>;
}
