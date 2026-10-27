export interface IdentityField {
  type: 'string' | 'boolean' | 'json' | 'id';
  required?: boolean;
  nullable?: boolean;
  default?: unknown;
  extension?: boolean;
}
const string = { type: 'string' } as const;
const required = { type: 'string', required: true } as const;
const id = { type: 'id' } as const;
/** Stored fields from models, auth claim writers and loaded physical captures. Inverses are not fields. */
export const identityFields: Record<string, Record<string, IdentityField>> = {
  user: {
    username: required,
    password: string,
    lastLogin: string,
    type: required,
    name: required,
    email: required,
    token: { ...string, nullable: true, default: '' },
    additionalAttributes: { type: 'json' },
    linkedPrimaryUserId: string,
    accountLinkState: { ...string, default: 'active' },
    loginDisabled: { type: 'boolean', default: false },
    ...Object.fromEntries(
      [
        'displayname',
        'cn',
        'edupersonscopedaffiliation',
        'edupersontargetedid',
        'edupersonprincipalname',
        'givenname',
        'surname',
      ].map(key => [key, { ...string, extension: true }])
    ),
  },
  role: { name: required, branding: id },
  userlink: {
    primaryUserId: required,
    primaryUsername: required,
    secondaryUserId: required,
    secondaryUsername: required,
    brandId: required,
    status: required,
    createdBy: required,
    notes: string,
  },
  useraudit: { user: { type: 'json', required: true }, action: required, additionalContext: { type: 'json' } },
  pathrule: {
    path: required,
    role: { ...id, required: true },
    branding: { ...id, required: true },
    can_read: { type: 'boolean' },
    can_write: { type: 'boolean' },
    custom: string,
    // The rule evaluator and configured bootstrap grants use this real schemaless field.
    can_update: { type: 'boolean', extension: true },
  },
  workspaceapp: { app: required, user: { ...id, required: true }, info: { type: 'json' } },
};
