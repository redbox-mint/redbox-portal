/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, Entity, toWaterlineModelDef } from '../decorators';

@BeforeCreate((values, proceed) => {
  // Collision-free identity, also protected by the compound index below.
  values.uid = JSON.stringify([values.brandId, values.templateId]);
  proceed();
})
@Entity('emailtemplate', {
  indexes: [{ attributes: { brandId: 1, templateId: 1 }, unique: true }],
})
export class EmailTemplateClass {
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
  public revision!: number;

  @Attr({ type: 'string' })
  public updatedBy?: string;

  @Attr({ type: 'string', autoCreatedAt: true })
  public createdAt!: string;

  @Attr({ type: 'string', autoUpdatedAt: true })
  public updatedAt!: string;
}

export const EmailTemplateWLDef = toWaterlineModelDef(EmailTemplateClass);

export interface EmailTemplateAttributes extends Sails.WaterlineAttributes {
  uid: string;
  brandId: string;
  templateId: string;
  subject: string;
  body: string;
  format: 'html' | 'text';
  revision: number;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateWaterlineModel extends Sails.Model<EmailTemplateAttributes> {
  attributes: EmailTemplateAttributes;
}

declare global {
  const EmailTemplate: EmailTemplateWaterlineModel;
}
