import _ from "lodash";
import { FormValidatorCreateConfig } from "./form.model";

/**
 * Extract the length property in case it's an array or a string.
 * Extract the size property in case it's a set.
 * Return null else.
 * @param value Either an array, set or undefined.
 */
export function formValidatorLengthOrSize(value: null | string | unknown[] | Set<unknown> | unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  } else if (Array.isArray(value) || typeof value === "string") {
    return value.length;
  } else if (value instanceof Set) {
    return value.size;
  }

  return null;
}

export function formValidatorGetDefinitionItem(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: unknown = undefined,
): unknown {
  const value = _.get(config ?? {}, key, defaultValue);
  if (value === undefined) {
    throw new Error(`Must define '${key}' in validator config.`);
  }
  return value;
}

export function formValidatorGetDefinitionString(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: string | undefined = undefined,
): string {
  const value = formValidatorGetDefinitionItem(config, key, defaultValue);
  return value?.toString() ?? "";
}

export function formValidatorGetDefinitionNumber(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: string | undefined = undefined,
): number {
  const value = formValidatorGetDefinitionItem(config, key, defaultValue);
  const valueString = value?.toString() ?? "";
  const valueNumber = parseFloat(valueString);
  if (isNaN(valueNumber)) {
    throw new Error(`Invalid numeric value '${value}' for key '${key}' in validator config.`);
  }
  return valueNumber;
}

export function formValidatorGetDefinitionBoolean(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: boolean | undefined = undefined,
) {
  const value = formValidatorGetDefinitionItem(config, key, defaultValue);
  if (typeof value === "boolean") {
    return value;
  }
  const valueString = value?.toString()?.toLowerCase() ?? "";
  return ["true", "t", "1", "yes", "y"].includes(valueString);
}

export function formValidatorGetDefinitionRegexp(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: RegExp | undefined = undefined,
): RegExp {
  const value = formValidatorGetDefinitionItem(config, key, defaultValue);
  if (value instanceof RegExp) {
    return value;
  }
  return new RegExp(value?.toString() ?? "");
}

export function formValidatorGetDefinitionArray(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: unknown[] | undefined = undefined,
): unknown[] {
  const value = formValidatorGetDefinitionItem(config, key, defaultValue);
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error(`Invalid array value '${value}' for key '${key}' in validator config.`);
}
