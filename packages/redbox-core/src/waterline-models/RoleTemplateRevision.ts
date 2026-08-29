/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeDestroy, BeforeUpdate, BelongsTo, Entity, toWaterlineModelDef } from '../decorators';
import { validateCanonicalScopeKeyArray, type ScopeKey } from '../authorization';
import type { RoleTemplateAttributes } from './RoleTemplate';

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    if (!Number.isInteger(record.revision) || Number(record.revision) < 1) {
      throw new Error('RoleTemplateRevision.revision must be a positive integer.');
    }
    record.scopeKeys = [...validateCanonicalScopeKeyArray(record.scopeKeys)];
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const rejectMutation = (_record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  proceed(new Error('RoleTemplateRevision records are immutable.'));
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(rejectMutation)
@BeforeDestroy(rejectMutation)
@Entity('roletemplaterevision', {
  indexes: [
    { attributes: { template: 1, revision: 1 }, unique: true },
    { attributes: { template: 1, publishedAt: -1 } },
  ],
})
export class RoleTemplateRevisionClass {
  @BelongsTo('roletemplate', { required: true })
  public template!: string | number;

  @Attr({ type: 'number', required: true })
  public revision!: number;

  @Attr({ type: 'json', required: true })
  public scopeKeys!: ScopeKey[];

  @Attr({ type: 'string' })
  public notes?: string;

  @Attr({ type: 'string', required: true })
  public publishedBy!: string;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public publishedAt!: string | Date;
}

export const RoleTemplateRevisionWLDef = toWaterlineModelDef(RoleTemplateRevisionClass);

export interface RoleTemplateRevisionAttributes extends Sails.WaterlineAttributes {
  notes?: string;
  publishedAt: string | Date;
  publishedBy: string;
  revision: number;
  scopeKeys: ScopeKey[];
  template: string | number | RoleTemplateAttributes;
}

export interface RoleTemplateRevisionWaterlineModel extends Sails.Model<RoleTemplateRevisionAttributes> {
  attributes: RoleTemplateRevisionAttributes;
}

declare global {
  const RoleTemplateRevision: RoleTemplateRevisionWaterlineModel;
}
