/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, HasMany, BeforeCreate, AfterCreate, AfterUpdate, toWaterlineModelDef } from '../decorators';

declare const sails: any;
declare const UsersService: any;
declare const _: any;

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

const assignAccessToPendingRecords = function assignAccessToPendingRecords(user: Record<string, any>) {
  try {
    if (user.email != null && user.name !== 'Local Admin') {
      UsersService.findAndAssignAccessToRecords(user.email, user.username);
    }
  } catch (error) {
    if (typeof sails !== 'undefined' && sails.log && typeof sails.log.error === 'function') {
      sails.log.error('Unable to assign access to pending records');
      sails.log.error(error);
    }
  }
};

const hashPassword = (user: Record<string, any>, cb: (err?: Error) => void) => {
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

const handleAfterMutation = (user: Record<string, any>, cb: (err?: Error) => void) => {
  const userModel = typeof globalThis !== 'undefined' ? (globalThis as any).User : undefined;
  if (userModel && typeof userModel.assignAccessToPendingRecords === 'function') {
    userModel.assignAccessToPendingRecords(user);
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

  @HasMany('workspaceApp', 'user')
  public workspaceApps?: unknown[];

  @HasMany('role', 'users', { dominant: true })
  public roles?: unknown[];
}

// Export the Waterline model definition for runtime use
export const UserWLDef = toWaterlineModelDef(UserClass);

// Type interface for backwards compatibility
export interface UserAttributes extends Sails.WaterlineAttributes {
  additionalAttributes?: Record<string, unknown>;
  cn?: string;
  displayname?: string;
  edupersonprincipalname?: string;
  edupersonscopedaffiliation?: string;
  edupersontargetedid?: string;
  email: string;
  givenname?: string;
  lastLogin?: string | Date;
  name: string;
  password?: string;
  roles?: unknown[];
  surname?: string;
  token?: string;
  type: string;
  username: string;
  workspaceApps?: unknown[];
}

export interface UserWaterlineModel extends Sails.Model<UserAttributes> {
  attributes: UserAttributes;
}

declare global {
  var User: UserWaterlineModel;
}
