/// <reference path="../sails.ts" />
import { Entity, Attr, HasMany, BeforeCreate, AfterCreate, AfterUpdate, toWaterlineModelDef } from '../decorators';

declare const sails: Sails.Application;
declare const UsersService: { findAndAssignAccessToRecords: (email: string, username: string) => Promise<number> };
declare const _: typeof import('lodash');

const customToJSON = function customToJSON(this: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  if (typeof _ !== 'undefined' && _ && typeof _.assign === 'function') {
    _.assign(obj, this);
    if (typeof _.unset === 'function') {
      _.unset(obj, 'password');
    } else {
      delete (obj as Record<string, unknown>).password;
    }
  } else {
    Object.assign(obj, this);
    delete (obj as Record<string, unknown>).password;
  }
  return obj;
};

const assignAccessToPendingRecords = async function assignAccessToPendingRecords(
  user: Record<string, unknown>
): Promise<number> {
  if (user.email == null || user.name === 'Local Admin') return 0;
  return await UsersService.findAndAssignAccessToRecords(user.email as string, user.username as string);
};

const hashPassword = (user: Record<string, unknown>, cb: (err?: Error) => void) => {
  if (!user.password) {
    return cb();
  }

  const bcryptLib = require('bcryptjs');
  bcryptLib.genSalt(10, (err: Error | null, salt: string) => {
    if (err) {
      sails.log.error(err);
      return cb(err);
    }
    bcryptLib.hash(user.password, salt, (hashErr: Error | null, hash: string) => {
      if (hashErr) {
        sails.log.error(hashErr);
        return cb(hashErr);
      }
      user.password = hash;
      return cb();
    });
  });
};

const handleAfterMutation = (user: Record<string, unknown>, cb: (err?: Error) => void) => {
  const userModel =
    typeof globalThis !== 'undefined'
      ? ((globalThis as Record<string, unknown>).User as Record<string, unknown> | undefined)
      : undefined;
  if (userModel && typeof userModel.assignAccessToPendingRecords === 'function') {
    Promise.resolve(userModel.assignAccessToPendingRecords(user)).then(
      () => cb(),
      error => cb(error instanceof Error ? error : new Error('Unable to assign access to pending records'))
    );
    return;
  }
  cb();
};

@AfterUpdate(handleAfterMutation)
@AfterCreate(handleAfterMutation)
@BeforeCreate(hashPassword)
@Entity('user', {
  customToJSON,
  assignAccessToPendingRecords,
})
export class UserClass {
  @Attr({ type: 'string', required: true, unique: true })
  public username!: string;

  @Attr({ type: 'string' })
  public password?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public lastLogin?: string | Date;

  @Attr({ type: 'string', required: true })
  public type!: string;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @Attr({ type: 'string', required: true, unique: true })
  public email!: string;

  @Attr({ type: 'string' })
  public token?: string;

  @Attr({ type: 'json' })
  public additionalAttributes?: Record<string, unknown>;

  @Attr({ type: 'string' })
  public linkedPrimaryUserId?: string;

  @Attr({ type: 'string', isIn: ['active', 'linked-alias'], defaultsTo: 'active' })
  public accountLinkState?: 'active' | 'linked-alias';

  @Attr({ type: 'boolean', defaultsTo: false })
  public loginDisabled!: boolean;

  @HasMany('workspaceApp', 'user')
  public workspaceApps?: unknown[];

  @HasMany('role', 'users', { dominant: true })
  public roles?: unknown[];
}

// Export the Waterline model definition for runtime use
export const UserWLDef = toWaterlineModelDef(UserClass);

// Type interface for backwards compatibility
export interface UserAttributes extends Sails.WaterlineAttributes {
  accountLinkState?: 'active' | 'linked-alias';
  additionalAttributes?: Record<string, unknown>;
  cn?: string;
  displayname?: string;
  edupersonprincipalname?: string;
  edupersonscopedaffiliation?: string;
  edupersontargetedid?: string;
  email: string;
  givenname?: string;
  lastLogin?: string | Date;
  linkedAccountCount?: number;
  linkedPrimaryUserId?: string;
  loginDisabled?: boolean;
  effectiveLoginDisabled?: boolean;
  disabledByPrimaryUserId?: string;
  disabledByPrimaryUsername?: string;
  name: string;
  password?: string;
  roles?: unknown[];
  surname?: string;
  token?: string;
  type: string;
  username: string;
  effectivePrimaryUsername?: string;
  workspaceApps?: unknown[];
}

export interface UserWaterlineModel extends Sails.Model<UserAttributes> {
  attributes: UserAttributes;
}

declare global {
  const User: UserWaterlineModel;
}
