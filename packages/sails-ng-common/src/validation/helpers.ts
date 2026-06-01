import {get as _get} from "lodash";
import {FormValidatorCreateConfig, FormValidatorErrorParams, FormValidatorErrors} from "./form.model";
import {guessType, toBoolean} from "../config/helpers";


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
  const value = _get(config ?? {}, key, defaultValue);
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
  if (!Number.isFinite(valueNumber)) {
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
  return toBoolean(value);
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

export function formValidatorGetDefinitionObject(
  config: FormValidatorCreateConfig | null | undefined,
  key: string,
  defaultValue: Record<string, unknown> | undefined = undefined,
): Record<string, unknown> {
  const value = formValidatorGetDefinitionItem(config, key, defaultValue);
  if (guessType(value) === "object") {
    return value as Record<string, unknown>;
  }
  throw new Error(`Invalid object value '${value}' for key '${key}' in validator config.`);
}

export function formValidatorBuildError(
  config: FormValidatorCreateConfig | null | undefined,
  params?: FormValidatorErrorParams
): FormValidatorErrors {
  const optionNameKey = "class";
  const optionNameValue = formValidatorGetDefinitionString(config, optionNameKey);
  const optionMessageKey = "message";
  const optionMessageValue = formValidatorGetDefinitionString(config, optionMessageKey);
  const optionTargetFieldKey = "targetField";
  const optionTargetFieldValue = formValidatorGetDefinitionObject(config, optionTargetFieldKey, {});
  const result: FormValidatorErrors = {
    [optionNameValue]: {
      [optionMessageKey]: optionMessageValue,
      params: {...params},
    }
  };
  if (Object.keys(optionTargetFieldValue).length > 0) {
    result[optionNameValue][optionTargetFieldKey] = optionTargetFieldValue
  }
  return result;
}
