import type { FormRecordAccessRole, FormRecordAccessUser } from './FormsService';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFormRecordAccessRole(value: unknown): value is FormRecordAccessRole {
  return isObjectRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name);
}

export function isFormRecordAccessUser(value: unknown): value is FormRecordAccessUser {
  return (
    isObjectRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.username) &&
    isNonEmptyString(value.type) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.email) &&
    Array.isArray(value.roles) &&
    value.roles.every(isFormRecordAccessRole)
  );
}
