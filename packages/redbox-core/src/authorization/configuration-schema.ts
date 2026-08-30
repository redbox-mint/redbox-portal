import { z } from 'zod';
import {
  AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES,
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES,
  AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS,
} from './administration';
import { AUTHORIZATION_ROLE_STATUSES } from './persistence-validation';
import { AUTHORIZATION_MAX_SCOPE_SET_SIZE, PROTECTED_ROLE_KINDS } from './types';
import { NEW_ROLE_KEY_PATTERN, SCOPE_KEY_MAX_LENGTH, SCOPE_KEY_PATTERN, isRoleKey } from './validators';

const ISO_OFFSET_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function exactText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(value => value === value.trim(), { error: 'authorization.bulk-invalid' });
}

function isValidOffsetDateTime(value: string): boolean {
  const match = ISO_OFFSET_DATE_TIME_PATTERN.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return (
    daysInMonth !== undefined &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    !Number.isNaN(new Date(value).getTime())
  );
}

const isoDateTimeField = exactText(64)
  .refine(isValidOffsetDateTime, { error: 'authorization.bulk-invalid' })
  .transform(value => new Date(value).toISOString());
const positiveVersionField = z
  .number()
  .int()
  .min(1)
  .refine(Number.isSafeInteger, { error: 'authorization.bulk-invalid' });
const identifierField = exactText(256);
const configurationIdentifierField = exactText(128);
const templateKeyField = exactText(64).regex(NEW_ROLE_KEY_PATTERN);
const roleKeyField = exactText(256).refine(isRoleKey, { error: 'authorization.bulk-invalid' });
const scopeKeyField = exactText(SCOPE_KEY_MAX_LENGTH).regex(SCOPE_KEY_PATTERN, {
  error: 'authorization.bulk-invalid',
});
const canonicalScopeKeysField = z
  .array(scopeKeyField)
  .max(AUTHORIZATION_MAX_SCOPE_SET_SIZE)
  .refine(scopeKeys => scopeKeys.every((scopeKey, index) => index === 0 || (scopeKeys[index - 1] ?? '') < scopeKey), {
    error: 'authorization.bulk-invalid',
  });

const authorizationConfigurationRevisionSchema = z
  .object({
    revision: positiveVersionField,
    scopeKeys: canonicalScopeKeysField,
    notes: exactText(2_000).optional(),
  })
  .strict();

function authorizationConfigurationTemplateSchema(maxRows: number) {
  return z
    .object({
      key: templateKeyField,
      displayName: exactText(256),
      description: exactText(2_000),
      protectedKind: z.enum(PROTECTED_ROLE_KINDS),
      status: z.enum(AUTHORIZATION_ROLE_STATUSES),
      version: positiveVersionField,
      revisions: z.array(authorizationConfigurationRevisionSchema).min(1).max(maxRows),
    })
    .strict()
    .refine(template => template.revisions.every((revision, index) => revision.revision === index + 1), {
      error: 'authorization.bulk-invalid',
    });
}

const authorizationConfigurationRoleSchema = z
  .object({
    brandId: configurationIdentifierField.optional(),
    key: roleKeyField,
    displayName: exactText(256),
    description: exactText(2_000).optional(),
    protectedKind: z.enum(PROTECTED_ROLE_KINDS),
    status: z.enum(AUTHORIZATION_ROLE_STATUSES),
    templateKey: templateKeyField.optional(),
    templateRevision: positiveVersionField.optional(),
    effectiveScopeKeys: canonicalScopeKeysField,
    version: positiveVersionField,
  })
  .strict()
  .refine(role => (role.templateKey === undefined) === (role.templateRevision === undefined), {
    error: 'authorization.bulk-invalid',
  });

const authorizationConfigurationAssignmentSchema = z
  .object({
    principalId: configurationIdentifierField,
    brandId: configurationIdentifierField.optional(),
    roleKey: roleKeyField,
    source: z.enum(['manual', 'recovery']),
    sourceKey: identifierField,
    status: z.enum(['active', 'revoked']),
    sourcePresent: z.boolean(),
    expiresAt: isoDateTimeField.optional(),
    version: positiveVersionField,
  })
  .strict()
  .refine(assignment => assignment.source !== 'manual' || assignment.sourceKey === 'manual', {
    error: 'authorization.bulk-invalid',
  });

function roleContextKey(brandId: string | undefined, roleKey: string): string {
  return brandId === undefined ? `system\u0000${roleKey}` : `brand\u0000${brandId}\u0000${roleKey}`;
}

export function createAuthorizationConfigurationDocumentSchema(maxRows: number, maxBytes: number) {
  return z
    .object({
      schemaVersion: z.literal(1),
      generatedAt: isoDateTimeField.optional(),
      templates: z.array(authorizationConfigurationTemplateSchema(maxRows)).max(maxRows),
      roles: z.array(authorizationConfigurationRoleSchema).max(maxRows),
      assignments: z.array(authorizationConfigurationAssignmentSchema).max(maxRows).optional(),
    })
    .strict()
    .superRefine((document, context) => {
      const rowCount =
        document.templates.length +
        document.templates.reduce((count, template) => count + template.revisions.length, 0) +
        document.roles.length +
        (document.assignments?.length ?? 0);
      const templateKeys = document.templates.map(template => template.key);
      const roleKeys = document.roles.map(role => roleContextKey(role.brandId, role.key));
      if (
        rowCount < 1 ||
        rowCount > maxRows ||
        Buffer.byteLength(JSON.stringify(document), 'utf8') > maxBytes ||
        new Set(templateKeys).size !== templateKeys.length ||
        new Set(roleKeys).size !== roleKeys.length
      ) {
        context.addIssue({ code: 'custom', message: 'authorization.bulk-invalid' });
      }
    });
}

export const authorizationConfigurationExportDocumentSchema = createAuthorizationConfigurationDocumentSchema(
  AUTHORIZATION_ADMIN_MAX_EXPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_EXPORT_BYTES
);

export const authorizationConfigurationImportDocumentSchema = createAuthorizationConfigurationDocumentSchema(
  AUTHORIZATION_ADMIN_MAX_IMPORT_ROWS,
  AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES
);
