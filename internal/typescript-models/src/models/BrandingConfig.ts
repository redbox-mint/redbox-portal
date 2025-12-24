import { Attr, BeforeCreate, BeforeUpdate, Entity, HasMany } from '../../../sails-ts/lib/decorators';

declare const sails: any;

const handleBeforeCreate = (values: Record<string, any>, proceed: (err?: Error) => void) => {
  if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
    const normalized: Record<string, unknown> = {};
    Object.keys(values.variables).forEach(key => {
      const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
      normalized[normalizedKey] = values.variables[key];
    });
    values.variables = normalized;
  }
  if (!values.variables) {
    return proceed();
  }
  if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  const allowList =
    (typeof sails !== 'undefined' &&
      sails.config &&
      sails.config.branding &&
      sails.config.branding.variableAllowList) ||
    [];
  const isValid = Object.keys(values.variables as Record<string, unknown>).every(key => {
    const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
    return allowList.includes(normalizedKey);
  });
  if (!isValid) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  return proceed();
};

const handleBeforeUpdate = (values: Record<string, any>, proceed: (err?: Error) => void) => {
  if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
    const normalized: Record<string, unknown> = {};
    Object.keys(values.variables).forEach(key => {
      const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
      normalized[normalizedKey] = values.variables[key];
    });
    values.variables = normalized;
  }
  if (!values.variables) {
    return proceed();
  }
  if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  const allowList =
    (typeof sails !== 'undefined' &&
      sails.config &&
      sails.config.branding &&
      sails.config.branding.variableAllowList) ||
    [];
  const isValid = Object.keys(values.variables as Record<string, unknown>).every(key => {
    const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
    return allowList.includes(normalizedKey);
  });
  if (!isValid) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  return proceed();
};

@BeforeUpdate(handleBeforeUpdate)
@BeforeCreate(handleBeforeCreate)
@Entity('brandingconfig')
export class BrandingConfig {
  @Attr({ type: 'string' })
  public name?: string;

  @Attr({ type: 'string' })
  public css?: string;

  @Attr({
    type: 'json',
    custom: (value: unknown) => {
      if (value == null) {
        return true;
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return false;
      }
      const allowList =
        (typeof sails !== 'undefined' &&
          sails.config &&
          sails.config.branding &&
          sails.config.branding.variableAllowList) ||
        [];
      return Object.keys(value as Record<string, unknown>).every(key => {
        const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
        return allowList.includes(normalizedKey);
      });
    },
  })
  public variables?: Record<string, string>;

  @Attr({ type: 'number', defaultsTo: 0 })
  public version?: number;

  @Attr({ type: 'string', defaultsTo: '' })
  public hash?: string;

  @Attr({ type: 'json' })
  public logo?: Record<string, unknown>;

  @HasMany('role', 'branding')
  public roles?: unknown[];

  @Attr({ type: 'json', defaultsTo: {} })
  public supportAgreementInformation?: Record<string, unknown>;
}
