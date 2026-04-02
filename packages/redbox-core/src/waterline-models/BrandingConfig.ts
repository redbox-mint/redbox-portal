/// <reference path="../sails.ts" />
import { Entity, Attr, HasMany, BeforeCreate, BeforeUpdate, toWaterlineModelDef } from '../decorators';

declare const sails: Sails.Application;

const handleBeforeCreate = (values: Record<string, unknown>, proceed: (err?: Error) => void) => {
  if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
    const vars = values.variables as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    Object.keys(vars).forEach(key => {
      const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
      normalized[normalizedKey] = vars[key];
    });
    values.variables = normalized;
  }
  if (!values.variables) {
    return proceed();
  }
  if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  const allowList = sails?.config?.branding?.variableAllowList ?? [];
  const isValid = Object.keys(values.variables as Record<string, unknown>).every(key => {
    const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
    return allowList.includes(normalizedKey);
  });
  if (!isValid) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  return proceed();
};

const handleBeforeUpdate = (values: Record<string, unknown>, proceed: (err?: Error) => void) => {
  if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
    const vars = values.variables as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    Object.keys(vars).forEach(key => {
      const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
      normalized[normalizedKey] = vars[key];
    });
    values.variables = normalized;
  }
  if (!values.variables) {
    return proceed();
  }
  if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
    return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
  }
  const allowList = sails?.config?.branding?.variableAllowList ?? [];
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
export class BrandingConfigClass {
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
      const allowList = sails?.config?.branding?.variableAllowList ?? [];
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

// Export the Waterline model definition for runtime use
export const BrandingConfigWLDef = toWaterlineModelDef(BrandingConfigClass);

// Type interface for backwards compatibility
export interface BrandingConfigAttributes extends Sails.WaterlineAttributes {
  css?: string;
  hash?: string;
  logo?: Record<string, unknown>;
  name?: string;
  roles?: unknown[];
  supportAgreementInformation?: Record<string, unknown>;
  variables?: Record<string, string>;
  version?: number;
}

export interface BrandingConfigWaterlineModel extends Sails.Model<BrandingConfigAttributes> {
  attributes: BrandingConfigAttributes;
}

declare global {
  const BrandingConfig: BrandingConfigWaterlineModel;
}
