/// <reference path="../sails.ts" />
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('userlink', {
  indexes: [
    // AUTH-LINK-RACE-001 enforceable uniqueness: exactly one active link per
    // secondary. The writer pre-checks inside its required transaction and
    // normalizes insert races to 409; this partial unique index makes the
    // constraint enforceable in production Mongo (see migration
    // 20260905T120000-account-link-uniqueness).
    { attributes: { secondaryUserId: 1, status: 1 }, unique: true },
    { attributes: { primaryUserId: 1, status: 1 } },
    { attributes: { brandId: 1, status: 1 } },
  ],
})
export class UserLinkClass {
  @Attr({ type: 'string', required: true })
  public primaryUserId!: string;

  @Attr({ type: 'string', required: true })
  public primaryUsername!: string;

  @Attr({ type: 'string', required: true })
  public secondaryUserId!: string;

  @Attr({ type: 'string', required: true })
  public secondaryUsername!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true, isIn: ['active'] })
  public status!: 'active';

  @Attr({ type: 'string', required: true })
  public createdBy!: string;

  @Attr({ type: 'string' })
  public notes?: string;
}

export const UserLinkWLDef = toWaterlineModelDef(UserLinkClass);

export interface UserLinkAttributes extends Sails.WaterlineAttributes {
  primaryUserId: string;
  primaryUsername: string;
  secondaryUserId: string;
  secondaryUsername: string;
  brandId: string;
  status: 'active';
  createdBy: string;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface UserLinkWaterlineModel extends Sails.Model<UserLinkAttributes> {
  attributes: UserLinkAttributes;
}

declare global {
  const UserLink: UserLinkWaterlineModel;
}
