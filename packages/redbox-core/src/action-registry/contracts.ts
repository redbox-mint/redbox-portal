import { z } from 'zod';
import { boundedValidationPreflight, type BoundedValidationFailure } from '../boundedValidation';
import {
  createRuntimeValidator,
  type RuntimeValidationResult,
  type RuntimeValidator,
  type RuntimeValue,
} from '../runtimeValues';
import {
  ActionContractValidationError,
  type ActionContractValidationErrorCode,
  type ActionContractValidationIssue,
} from './errors';
import {
  ACTION_INVOCATION_CONTEXTS,
  actionBindingIdSchema as actionBindingIdValidator,
  actionDefinitionIdSchema as actionDefinitionIdValidator,
  deriveStableActionBindingId,
  parseActionBindingId,
  parseActionDefinitionId,
  sortActionBindings,
  type ActionBindingId,
  type ActionBindingScope,
  type ActionDefinitionId,
  type ActionExecutionMode,
  type ActionExecutionPhase,
} from './identifiers';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_LIMITS,
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
} from './limits';
import type { ManagedTemplateDestination } from '../expression-runtime/types';

export type {
  RuntimeValidationFailure,
  RuntimeValidationResult,
  RuntimeValidationSuccess,
  RuntimeValidator,
} from '../runtimeValues';

export interface ActionJsonObject {
  [key: string]: ActionJsonValue;
}

export type ActionJsonValue = string | number | boolean | null | ActionJsonValue[] | ActionJsonObject;

export type DeepReadonly<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type BaseActionJsonObject = ActionJsonObject;
type BaseActionJsonValue = ActionJsonValue;

const safeActionIdentifierSchema = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxIdentifierLength)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const actionParameterNameSchema = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxParameterNameLength)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const actionExecutionModeSchema = z.enum(['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow']);
const actionExecutionPhaseSchema = z.enum(['pre', 'postSync', 'post']);
const actionDefinitionIdSchema = z
  .string()
  .refine(value => actionDefinitionIdValidator.safeParse(value).success)
  .transform(value => parseActionDefinitionId(value));
const actionBindingIdSchema = z
  .string()
  .refine(value => actionBindingIdValidator.safeParse(value).success)
  .transform(value => parseActionBindingId(value));
const actionBindingScopeSchema: z.ZodType<ActionBindingScope, RuntimeValue> = z.discriminatedUnion('context', [
  z
    .object({
      context: z.literal('record-lifecycle'),
      mode: z.enum(['onCreate', 'onUpdate', 'onDelete']),
      phase: actionExecutionPhaseSchema,
    })
    .strict(),
  z
    .object({
      context: z.literal('workflow-transition'),
      mode: z.literal('onTransitionWorkflow'),
      phase: actionExecutionPhaseSchema,
      scopeId: safeActionIdentifierSchema,
    })
    .strict(),
  z
    .object({
      context: z.literal('queued-record-action'),
      mode: actionExecutionModeSchema,
      phase: actionExecutionPhaseSchema,
      scopeId: safeActionIdentifierSchema.optional(),
    })
    .strict(),
]);

const actionJsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
let baseActionJsonValueSchema: z.ZodType<BaseActionJsonValue, RuntimeValue> = actionJsonPrimitiveSchema;
for (let depth = 0; depth < ACTION_CONTRACT_LIMITS.maxJsonDepth; depth += 1) {
  const childSchema = baseActionJsonValueSchema;
  baseActionJsonValueSchema = z.union([
    actionJsonPrimitiveSchema,
    z.array(childSchema).max(ACTION_CONTRACT_LIMITS.maxArrayItems),
    z.record(z.string(), childSchema),
  ]);
}

function actionJsonDepth(value: BaseActionJsonValue): number {
  const pending: Array<{ value: BaseActionJsonValue; depth: number }> = [{ value, depth: 0 }];
  let maximumDepth = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current.value === null || typeof current.value !== 'object') {
      continue;
    }
    const depth = current.depth + 1;
    if (depth > ACTION_CONTRACT_LIMITS.maxJsonDepth) {
      return depth;
    }
    maximumDepth = Math.max(maximumDepth, depth);
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const child of children) {
      pending.push({ value: child, depth });
    }
  }
  return maximumDepth;
}

function addJsonLimitIssues(value: BaseActionJsonValue, context: z.RefinementCtx<BaseActionJsonValue>): void {
  if (actionJsonDepth(value) > ACTION_CONTRACT_LIMITS.maxJsonDepth) {
    context.addIssue({
      code: 'custom',
      message: `JSON values may be at most ${ACTION_CONTRACT_LIMITS.maxJsonDepth} levels deep.`,
    });
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > ACTION_CONTRACT_LIMITS.maxJsonBytes) {
    context.addIssue({
      code: 'custom',
      message: `JSON values may be at most ${ACTION_CONTRACT_LIMITS.maxJsonBytes} bytes.`,
    });
  }
}

const actionJsonValueZodSchema = baseActionJsonValueSchema.superRefine(addJsonLimitIssues);
const actionJsonObjectSchemaImplementation = z
  .record(z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxIdentifierLength), actionJsonValueZodSchema)
  .superRefine(addJsonLimitIssues);

const boundedTitleSchema = z.string().trim().min(1).max(ACTION_CONTRACT_LIMITS.maxTitleLength);
const boundedDescriptionSchema = z.string().trim().min(1).max(ACTION_CONTRACT_LIMITS.maxDescriptionLength);
const boundedStringValueSchema = z.string().max(ACTION_CONTRACT_LIMITS.maxStringValueLength);

function addStringValueLimitIssues(value: BaseActionJsonValue, context: z.RefinementCtx<BaseActionJsonValue>): void {
  const pending: BaseActionJsonValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      continue;
    }
    if (typeof current === 'string') {
      if (current.length > ACTION_CONTRACT_LIMITS.maxStringValueLength) {
        context.addIssue({
          code: 'custom',
          message: `Literal strings may be at most ${ACTION_CONTRACT_LIMITS.maxStringValueLength} characters.`,
        });
        return;
      }
      continue;
    }
    if (current !== null && typeof current === 'object') {
      const children = Array.isArray(current) ? current : Object.values(current);
      pending.push(...children);
    }
  }
}

const actionLiteralValueSchema = actionJsonValueZodSchema.superRefine(addStringValueLimitIssues);
const actionLiteralObjectSchema = z
  .record(z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxIdentifierLength), actionLiteralValueSchema)
  .superRefine(addJsonLimitIssues);
const actionLiteralArraySchema = z
  .array(actionLiteralValueSchema)
  .max(ACTION_CONTRACT_LIMITS.maxArrayItems)
  .superRefine(addJsonLimitIssues);

const actionParameterUiHintsSchemaImplementation = z
  .object({
    placeholder: z.string().max(ACTION_CONTRACT_LIMITS.maxTitleLength).optional(),
    helpText: z.string().max(ACTION_CONTRACT_LIMITS.maxDescriptionLength).optional(),
    rows: z.number().int().min(2).max(20).optional(),
  })
  .strict();

const actionParameterCommonShape = {
  name: actionParameterNameSchema,
  title: boundedTitleSchema,
  description: boundedDescriptionSchema.optional(),
  required: z.boolean().default(false),
  ui: actionParameterUiHintsSchemaImplementation.optional(),
};

const actionStringParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('string'),
    defaultValue: boundedStringValueSchema.optional(),
    minLength: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxStringValueLength).optional(),
    maxLength: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxStringValueLength).optional(),
  })
  .strict();

const actionNumberParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('number'),
    defaultValue: z.number().finite().optional(),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    integer: z.boolean().default(false),
  })
  .strict();

const actionBooleanParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('boolean'),
    defaultValue: z.boolean().optional(),
  })
  .strict();

const actionEnumOptionSchemaImplementation = z
  .object({
    value: boundedStringValueSchema,
    label: boundedTitleSchema,
  })
  .strict();

const actionEnumParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('enum'),
    options: z.array(actionEnumOptionSchemaImplementation).min(1).max(ACTION_CONTRACT_LIMITS.maxEnumOptions),
    defaultValue: boundedStringValueSchema.optional(),
  })
  .strict();

const actionObjectParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('object'),
    defaultValue: actionLiteralObjectSchema.optional(),
  })
  .strict();

const actionArrayStringItemSchema = z
  .object({
    kind: z.literal('string'),
    minLength: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxStringValueLength).optional(),
    maxLength: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxStringValueLength).optional(),
  })
  .strict();

const actionArrayNumberItemSchema = z
  .object({
    kind: z.literal('number'),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    integer: z.boolean().default(false),
  })
  .strict();

const actionArrayBooleanItemSchema = z.object({ kind: z.literal('boolean') }).strict();

const actionArrayEnumItemSchema = z
  .object({
    kind: z.literal('enum'),
    options: z.array(actionEnumOptionSchemaImplementation).min(1).max(ACTION_CONTRACT_LIMITS.maxEnumOptions),
  })
  .strict();

const actionArrayObjectItemSchema = z.object({ kind: z.literal('object') }).strict();

const actionArrayItemSchemaImplementation = z
  .discriminatedUnion('kind', [
    actionArrayStringItemSchema,
    actionArrayNumberItemSchema,
    actionArrayBooleanItemSchema,
    actionArrayEnumItemSchema,
    actionArrayObjectItemSchema,
  ])
  .superRefine((item, context) => {
    if (
      item.kind === 'string' &&
      item.minLength !== undefined &&
      item.maxLength !== undefined &&
      item.minLength > item.maxLength
    ) {
      context.addIssue({ code: 'custom', path: ['maxLength'], message: 'maxLength must be at least minLength.' });
    }
    if (
      item.kind === 'number' &&
      item.minimum !== undefined &&
      item.maximum !== undefined &&
      item.minimum > item.maximum
    ) {
      context.addIssue({ code: 'custom', path: ['maximum'], message: 'maximum must be at least minimum.' });
    }
    if (item.kind === 'enum') {
      const values = item.options.map(option => option.value);
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', path: ['options'], message: 'Enum option values must be unique.' });
      }
    }
  });

export type ActionArrayItem =
  | {
      readonly kind: 'string';
      readonly minLength?: number;
      readonly maxLength?: number;
    }
  | {
      readonly kind: 'number';
      readonly minimum?: number;
      readonly maximum?: number;
      readonly integer: boolean;
    }
  | {
      readonly kind: 'boolean';
    }
  | {
      readonly kind: 'enum';
      readonly options: readonly ActionEnumOption[];
    }
  | {
      readonly kind: 'object';
    };

function literalMatchesActionArrayItemConstraints(
  item: DeepReadonly<ActionArrayItem>,
  value: ActionJsonValue
): boolean {
  if (item.kind === 'string') {
    return (
      typeof value === 'string' &&
      value.length <= ACTION_CONTRACT_LIMITS.maxStringValueLength &&
      (item.minLength === undefined || value.length >= item.minLength) &&
      (item.maxLength === undefined || value.length <= item.maxLength)
    );
  }
  if (item.kind === 'number') {
    return (
      typeof value === 'number' &&
      (!item.integer || Number.isInteger(value)) &&
      (item.minimum === undefined || value >= item.minimum) &&
      (item.maximum === undefined || value <= item.maximum)
    );
  }
  if (item.kind === 'boolean') {
    return typeof value === 'boolean';
  }
  if (item.kind === 'enum') {
    return typeof value === 'string' && item.options.some(option => option.value === value);
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function literalMatchesActionArrayItem(item: DeepReadonly<ActionArrayItem>, value: ActionJsonValue): boolean {
  return actionJsonValueSchema.safeParse(value).success && literalMatchesActionArrayItemConstraints(item, value);
}

const actionArrayParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('array'),
    items: actionArrayItemSchemaImplementation,
    defaultValue: actionLiteralArraySchema.optional(),
    minItems: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxArrayItems).optional(),
    maxItems: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxArrayItems).optional(),
  })
  .strict()
  .superRefine((parameter, context) => {
    if (
      parameter.minItems !== undefined &&
      parameter.maxItems !== undefined &&
      parameter.minItems > parameter.maxItems
    ) {
      context.addIssue({ code: 'custom', path: ['maxItems'], message: 'maxItems must be at least minItems.' });
    }
    if (
      parameter.defaultValue !== undefined &&
      ((parameter.minItems !== undefined && parameter.defaultValue.length < parameter.minItems) ||
        (parameter.maxItems !== undefined && parameter.defaultValue.length > parameter.maxItems) ||
        parameter.defaultValue.some(value => !literalMatchesActionArrayItem(parameter.items, value)))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'The default must match the declared array item schema and size bounds.',
      });
    }
  });

const actionJsonataParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('jsonata'),
    defaultExpression: z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxExpressionLength).optional(),
  })
  .strict();

const actionHandlebarsParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('handlebars'),
    defaultTemplate: z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxTemplateLength).optional(),
    destination: z.enum(['plain-text', 'html-text', 'email-subject', 'url-component']).default('plain-text'),
  })
  .strict();

const actionSecretParameterSchemaImplementation = z
  .object({
    ...actionParameterCommonShape,
    kind: z.literal('secret'),
    writeOnly: z.literal(true),
  })
  .strict();

const actionParameterDefinitionSchemaImplementation = z
  .discriminatedUnion('kind', [
    actionStringParameterSchemaImplementation,
    actionNumberParameterSchemaImplementation,
    actionBooleanParameterSchemaImplementation,
    actionEnumParameterSchemaImplementation,
    actionObjectParameterSchemaImplementation,
    actionArrayParameterSchemaImplementation,
    actionJsonataParameterSchemaImplementation,
    actionHandlebarsParameterSchemaImplementation,
    actionSecretParameterSchemaImplementation,
  ])
  .superRefine((parameter, context) => {
    if (
      parameter.kind === 'string' &&
      parameter.minLength !== undefined &&
      parameter.maxLength !== undefined &&
      parameter.minLength > parameter.maxLength
    ) {
      context.addIssue({ code: 'custom', path: ['maxLength'], message: 'maxLength must be at least minLength.' });
    }
    if (
      parameter.kind === 'number' &&
      parameter.minimum !== undefined &&
      parameter.maximum !== undefined &&
      parameter.minimum > parameter.maximum
    ) {
      context.addIssue({ code: 'custom', path: ['maximum'], message: 'maximum must be at least minimum.' });
    }
    if (parameter.kind === 'enum') {
      const values = parameter.options.map(option => option.value);
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', path: ['options'], message: 'Enum option values must be unique.' });
      }
      if (parameter.defaultValue !== undefined && !values.includes(parameter.defaultValue)) {
        context.addIssue({ code: 'custom', path: ['defaultValue'], message: 'The default must be an enum option.' });
      }
    }
    if (
      parameter.kind === 'string' &&
      parameter.defaultValue !== undefined &&
      ((parameter.minLength !== undefined && parameter.defaultValue.length < parameter.minLength) ||
        (parameter.maxLength !== undefined && parameter.defaultValue.length > parameter.maxLength))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'The default must satisfy the declared string length bounds.',
      });
    }
    if (
      parameter.kind === 'number' &&
      parameter.defaultValue !== undefined &&
      ((parameter.integer && !Number.isInteger(parameter.defaultValue)) ||
        (parameter.minimum !== undefined && parameter.defaultValue < parameter.minimum) ||
        (parameter.maximum !== undefined && parameter.defaultValue > parameter.maximum))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'The default must satisfy the declared number constraints.',
      });
    }
  });

const actionParameterSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_CONTRACT_SCHEMA_VERSION),
    parameters: z.array(actionParameterDefinitionSchemaImplementation).max(ACTION_CONTRACT_LIMITS.maxParameters),
  })
  .strict()
  .superRefine((schema, context) => {
    const names = schema.parameters.map(parameter => parameter.name);
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: 'custom', path: ['parameters'], message: 'Parameter names must be unique.' });
    }
  });

export interface ActionParameterUiHints {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly rows?: number;
}

export interface ActionEnumOption {
  readonly value: string;
  readonly label: string;
}

interface ActionParameterCommon {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly required: boolean;
  readonly ui?: ActionParameterUiHints;
}

export interface ActionStringParameter extends ActionParameterCommon {
  readonly kind: 'string';
  readonly defaultValue?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface ActionNumberParameter extends ActionParameterCommon {
  readonly kind: 'number';
  readonly defaultValue?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly integer: boolean;
}

export interface ActionBooleanParameter extends ActionParameterCommon {
  readonly kind: 'boolean';
  readonly defaultValue?: boolean;
}

export interface ActionEnumParameter extends ActionParameterCommon {
  readonly kind: 'enum';
  readonly options: readonly ActionEnumOption[];
  readonly defaultValue?: string;
}

export interface ActionObjectParameter extends ActionParameterCommon {
  readonly kind: 'object';
  readonly defaultValue?: ActionJsonObject;
}

export interface ActionArrayParameter extends ActionParameterCommon {
  readonly kind: 'array';
  readonly items: ActionArrayItem;
  readonly defaultValue?: ActionJsonValue[];
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface ActionSecretParameter extends ActionParameterCommon {
  readonly kind: 'secret';
  readonly writeOnly: true;
}

export interface ActionJsonataParameter extends ActionParameterCommon {
  readonly kind: 'jsonata';
  readonly defaultExpression?: string;
}

export interface ActionHandlebarsParameter extends ActionParameterCommon {
  readonly kind: 'handlebars';
  readonly defaultTemplate?: string;
  readonly destination: ManagedTemplateDestination;
}

export type ActionParameterDefinition =
  | ActionStringParameter
  | ActionNumberParameter
  | ActionBooleanParameter
  | ActionEnumParameter
  | ActionObjectParameter
  | ActionArrayParameter
  | ActionJsonataParameter
  | ActionHandlebarsParameter
  | ActionSecretParameter;

export interface ActionParameterSchema {
  readonly schemaVersion: typeof ACTION_CONTRACT_SCHEMA_VERSION;
  readonly parameters: readonly ActionParameterDefinition[];
}

/** Canonical A02/A04 validator for descriptor-constrained literal values. */
export function literalMatchesActionParameter(
  parameter: DeepReadonly<ActionParameterDefinition>,
  value: ActionJsonValue
): boolean {
  if (!actionJsonValueSchema.safeParse(value).success) {
    return false;
  }
  if (parameter.kind === 'string') {
    return (
      typeof value === 'string' &&
      value.length <= ACTION_CONTRACT_LIMITS.maxStringValueLength &&
      (parameter.minLength === undefined || value.length >= parameter.minLength) &&
      (parameter.maxLength === undefined || value.length <= parameter.maxLength)
    );
  }
  if (parameter.kind === 'number') {
    return (
      typeof value === 'number' &&
      (!parameter.integer || Number.isInteger(value)) &&
      (parameter.minimum === undefined || value >= parameter.minimum) &&
      (parameter.maximum === undefined || value <= parameter.maximum)
    );
  }
  if (parameter.kind === 'boolean') {
    return typeof value === 'boolean';
  }
  if (parameter.kind === 'enum') {
    return typeof value === 'string' && parameter.options.some(option => option.value === value);
  }
  if (parameter.kind === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (parameter.kind === 'array') {
    return (
      Array.isArray(value) &&
      value.length <= ACTION_CONTRACT_LIMITS.maxArrayItems &&
      (parameter.minItems === undefined || value.length >= parameter.minItems) &&
      (parameter.maxItems === undefined || value.length <= parameter.maxItems) &&
      value.every(item => literalMatchesActionArrayItemConstraints(parameter.items, item))
    );
  }
  return false;
}

const literalActionParameterValueSchema = z
  .object({ kind: z.literal('literal'), value: actionLiteralValueSchema })
  .strict();
const jsonataActionParameterValueSchema = z
  .object({
    kind: z.literal('jsonata'),
    expression: z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxExpressionLength),
  })
  .strict();
const handlebarsActionParameterValueSchema = z
  .object({
    kind: z.literal('handlebars'),
    template: z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxTemplateLength),
  })
  .strict();
const secretActionParameterValueSchema = z
  .object({
    kind: z.literal('secret'),
    configured: z.boolean(),
  })
  .strict();

const actionParameterValueSchemaImplementation = z.discriminatedUnion('kind', [
  literalActionParameterValueSchema,
  jsonataActionParameterValueSchema,
  handlebarsActionParameterValueSchema,
  secretActionParameterValueSchema,
]);
const actionParameterValuesSchemaImplementation = z
  .record(actionParameterNameSchema, actionParameterValueSchemaImplementation)
  .superRefine((parameters, context) => {
    if (Object.keys(parameters).length > ACTION_CONTRACT_LIMITS.maxParameters) {
      context.addIssue({
        code: 'custom',
        message: `Bindings may configure at most ${ACTION_CONTRACT_LIMITS.maxParameters} parameters.`,
      });
    }
  });

export type ActionParameterValue =
  | { readonly kind: 'literal'; readonly value: ActionJsonValue }
  | { readonly kind: 'jsonata'; readonly expression: string }
  | { readonly kind: 'handlebars'; readonly template: string }
  | { readonly kind: 'secret'; readonly configured: boolean };

export interface ActionParameterValues {
  [key: string]: ActionParameterValue;
}

/**
 * Handler-only view of one resolved secret. The raw value is available only
 * through an explicit reveal call; ordinary string conversion and JSON
 * serialization remain redacted.
 */
export interface ResolvedActionSecret {
  reveal(): string;
  toJSON(): '[REDACTED]';
  toString(): '[REDACTED]';
}

/** Secret parameter names are populated only by the provider boundary. */
export interface ActionHandlerSecrets {
  readonly [parameterName: string]: ResolvedActionSecret;
}

const actionOutputFieldSchemaImplementation = z
  .object({
    name: actionParameterNameSchema,
    title: boundedTitleSchema,
    description: boundedDescriptionSchema.optional(),
    kind: z.enum(['string', 'number', 'boolean', 'json']),
    required: z.boolean().default(false),
  })
  .strict();

const actionOutputSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_CONTRACT_SCHEMA_VERSION),
    fields: z.array(actionOutputFieldSchemaImplementation).max(ACTION_CONTRACT_LIMITS.maxOutputFields),
    safeFields: z.array(actionParameterNameSchema).max(ACTION_CONTRACT_LIMITS.maxOutputFields),
  })
  .strict()
  .superRefine((schema, context) => {
    const fieldNames = schema.fields.map(field => field.name);
    if (new Set(fieldNames).size !== fieldNames.length) {
      context.addIssue({ code: 'custom', path: ['fields'], message: 'Output field names must be unique.' });
    }
    if (new Set(schema.safeFields).size !== schema.safeFields.length) {
      context.addIssue({ code: 'custom', path: ['safeFields'], message: 'Safe output fields must be unique.' });
    }
    for (const safeField of schema.safeFields) {
      if (!fieldNames.includes(safeField)) {
        context.addIssue({
          code: 'custom',
          path: ['safeFields'],
          message: `Safe output field ${safeField} is not declared.`,
        });
      }
    }
  });

const actionOutputSchemaVersionedValueSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_RESULT_SCHEMA_VERSION),
    fields: z.record(actionParameterNameSchema, actionJsonValueZodSchema),
  })
  .strict();

export interface ActionOutputField {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly kind: 'string' | 'number' | 'boolean' | 'json';
  readonly required: boolean;
}

export interface ActionOutputSchema {
  readonly schemaVersion: typeof ACTION_CONTRACT_SCHEMA_VERSION;
  readonly fields: readonly ActionOutputField[];
  readonly safeFields: readonly string[];
}

export interface ActionOutput {
  readonly schemaVersion: typeof ACTION_RESULT_SCHEMA_VERSION;
  readonly fields: ActionJsonObject;
}

const actionPatchPathSchemaImplementation = z
  .string()
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxPatchPathLength)
  .regex(/^\/(?:[^~/]|~0|~1)*(?:\/(?:[^~/]|~0|~1)*)*$/)
  .refine(
    path =>
      path
        .slice(1)
        .split('/')
        .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
        .every(segment => segment !== '__proto__' && segment !== 'prototype' && segment !== 'constructor'),
    { message: 'Patch paths may not address prototype-related properties.' }
  );

const actionPatchAddOperationSchema = z
  .object({ op: z.literal('add'), path: actionPatchPathSchemaImplementation, value: actionJsonValueZodSchema })
  .strict();
const actionPatchReplaceOperationSchema = z
  .object({ op: z.literal('replace'), path: actionPatchPathSchemaImplementation, value: actionJsonValueZodSchema })
  .strict();
const actionPatchRemoveOperationSchema = z
  .object({ op: z.literal('remove'), path: actionPatchPathSchemaImplementation })
  .strict();

const actionPatchOperationSchemaImplementation = z.discriminatedUnion('op', [
  actionPatchAddOperationSchema,
  actionPatchReplaceOperationSchema,
  actionPatchRemoveOperationSchema,
]);
const actionPatchSchemaImplementation = z
  .array(actionPatchOperationSchemaImplementation)
  .min(1)
  .max(ACTION_CONTRACT_LIMITS.maxPatchOperations);

export type ActionPatchOperation =
  | { readonly op: 'add'; readonly path: string; readonly value: ActionJsonValue }
  | { readonly op: 'replace'; readonly path: string; readonly value: ActionJsonValue }
  | { readonly op: 'remove'; readonly path: string };
export type ActionPatch = readonly ActionPatchOperation[];

const actionSuccessResultCommonShape = {
  schemaVersion: z.literal(ACTION_RESULT_SCHEMA_VERSION),
  output: actionOutputSchemaVersionedValueSchemaImplementation.optional(),
};

const noChangeActionResultSchemaImplementation = z
  .object({ ...actionSuccessResultCommonShape, kind: z.literal('no-change') })
  .strict();
const patchActionResultSchemaImplementation = z
  .object({ ...actionSuccessResultCommonShape, kind: z.literal('patch'), patch: actionPatchSchemaImplementation })
  .strict();
const replaceActionResultSchemaImplementation = z
  .object({
    ...actionSuccessResultCommonShape,
    kind: z.literal('replace'),
    candidate: actionJsonObjectSchemaImplementation,
  })
  .strict();
const rejectActionResultSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_RESULT_SCHEMA_VERSION),
    kind: z.literal('reject'),
    code: safeActionIdentifierSchema.max(ACTION_CONTRACT_LIMITS.maxRejectionCodeLength),
    message: z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxRejectionMessageLength),
  })
  .strict();

const actionSuccessResultSchemaImplementation = z.discriminatedUnion('kind', [
  noChangeActionResultSchemaImplementation,
  patchActionResultSchemaImplementation,
  replaceActionResultSchemaImplementation,
]);

const actionFailureResultSchemaImplementation = rejectActionResultSchemaImplementation;

const actionResultSchemaImplementation = z.discriminatedUnion('kind', [
  noChangeActionResultSchemaImplementation,
  patchActionResultSchemaImplementation,
  replaceActionResultSchemaImplementation,
  rejectActionResultSchemaImplementation,
]);

interface ActionSuccessResultCommon {
  readonly schemaVersion: typeof ACTION_RESULT_SCHEMA_VERSION;
  readonly output?: ActionOutput;
}

export interface NoChangeActionResult extends ActionSuccessResultCommon {
  readonly kind: 'no-change';
}

export interface PatchActionResult extends ActionSuccessResultCommon {
  readonly kind: 'patch';
  readonly patch: ActionPatch;
}

export interface ReplaceActionResult extends ActionSuccessResultCommon {
  readonly kind: 'replace';
  readonly candidate: ActionJsonObject;
}

export interface RejectActionResult {
  readonly schemaVersion: typeof ACTION_RESULT_SCHEMA_VERSION;
  readonly kind: 'reject';
  readonly code: string;
  readonly message: string;
}

export type ActionSuccessResult = NoChangeActionResult | PatchActionResult | ReplaceActionResult;
export type ActionFailureResult = RejectActionResult;
export type ActionResult = ActionSuccessResult | ActionFailureResult;

const actionResultContractSchemaImplementation = z
  .object({
    allowedKinds: z
      .array(z.enum(['no-change', 'patch', 'replace', 'reject']))
      .min(1)
      .max(4),
    patch: z
      .object({
        allowedPathPrefixes: z
          .array(actionPatchPathSchemaImplementation)
          .min(1)
          .max(ACTION_CONTRACT_LIMITS.maxOutputFields),
        maxOperations: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxPatchOperations),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((contract, context) => {
    if (new Set(contract.allowedKinds).size !== contract.allowedKinds.length) {
      context.addIssue({ code: 'custom', path: ['allowedKinds'], message: 'Allowed result kinds must be unique.' });
    }
    if (contract.allowedKinds.includes('patch') !== (contract.patch !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['patch'],
        message: 'Patch constraints are required exactly when patch results are allowed.',
      });
    }
  });

export interface ActionResultContract {
  readonly allowedKinds: readonly ActionResult['kind'][];
  readonly patch?: {
    readonly allowedPathPrefixes: readonly string[];
    readonly maxOperations: number;
  };
}

const actionRetryScheduleSchemaImplementation = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('fixed'),
      delayMs: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxRetryDelayMs),
      jitter: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('exponential'),
      delayMs: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxRetryDelayMs),
      maxDelayMs: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxRetryDelayMs),
      jitter: z.boolean().optional(),
    })
    .strict()
    .refine(schedule => schedule.maxDelayMs >= schedule.delayMs, {
      path: ['maxDelayMs'],
      message: 'maxDelayMs must be at least delayMs.',
    }),
]);

const actionFailureKindSchemaImplementation = z.enum([
  'configuration',
  'validation',
  'domain',
  'transient',
  'timeout',
  'interrupted',
  'unexpected',
]);

const actionExecutionPolicyOverrideSchemaImplementation = z
  .object({
    timeoutMs: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxTimeoutMs).optional(),
    retry: z
      .object({
        maxAttempts: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxRetryAttempts),
        retryOn: z.array(actionFailureKindSchemaImplementation).min(1).max(7).optional(),
        schedule: actionRetryScheduleSchemaImplementation.optional(),
        idempotent: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((override, context) => {
    const retryOn = override.retry?.retryOn;
    if (retryOn !== undefined && new Set(retryOn).size !== retryOn.length) {
      context.addIssue({ code: 'custom', path: ['retry', 'retryOn'], message: 'Retry failure kinds must be unique.' });
    }
  });

const timeoutPolicyBoundsSchema = z
  .object({
    defaultMs: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxTimeoutMs),
    minMs: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxTimeoutMs),
    maxMs: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxTimeoutMs),
  })
  .strict()
  .refine(bounds => bounds.minMs <= bounds.defaultMs && bounds.defaultMs <= bounds.maxMs, {
    message: 'The timeout default must fall within its minimum and maximum.',
  });

const retryPolicyBoundsSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(false) }).strict(),
  z
    .object({
      allowed: z.literal(true),
      defaultMaxAttempts: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxRetryAttempts),
      maxAttempts: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxRetryAttempts),
      maxDelayMs: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxRetryDelayMs),
    })
    .strict()
    .refine(bounds => bounds.defaultMaxAttempts <= bounds.maxAttempts, {
      path: ['defaultMaxAttempts'],
      message: 'The retry default may not exceed the retry maximum.',
    }),
]);

const actionExecutionPolicyBoundsSchemaImplementation = z
  .object({
    timeout: timeoutPolicyBoundsSchema,
    retry: retryPolicyBoundsSchema,
  })
  .strict();

export type ActionRetrySchedule =
  | { readonly type: 'fixed'; readonly delayMs: number; readonly jitter?: boolean }
  | {
      readonly type: 'exponential';
      readonly delayMs: number;
      readonly maxDelayMs: number;
      readonly jitter?: boolean;
    };
export type ActionFailureKind =
  | 'configuration'
  | 'validation'
  | 'domain'
  | 'transient'
  | 'timeout'
  | 'interrupted'
  | 'unexpected';
export interface ActionExecutionPolicyOverride {
  readonly timeoutMs?: number;
  readonly retry?: {
    readonly maxAttempts: number;
    readonly retryOn?: readonly ActionFailureKind[];
    readonly schedule?: ActionRetrySchedule;
    readonly idempotent: true;
  };
}
export interface ActionExecutionPolicyBounds {
  readonly timeout: {
    readonly defaultMs: number;
    readonly minMs: number;
    readonly maxMs: number;
  };
  readonly retry:
    | { readonly allowed: false }
    | {
        readonly allowed: true;
        readonly defaultMaxAttempts: number;
        readonly maxAttempts: number;
        readonly maxDelayMs: number;
      };
}

const actionProvenanceSchemaImplementation = z
  .object({
    packageName: z
      .string()
      .min(1)
      .max(ACTION_CONTRACT_LIMITS.maxPackageNameLength)
      .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/),
    moduleName: z
      .string()
      .min(1)
      .max(ACTION_CONTRACT_LIMITS.maxModuleNameLength)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
      .refine(moduleName => !moduleName.split('/').includes('..'), {
        message: 'Module paths may not traverse upward.',
      }),
    registrationName: safeActionIdentifierSchema.optional(),
  })
  .strict();

export interface ActionProvenance {
  readonly packageName: string;
  readonly moduleName: string;
  readonly registrationName?: string;
}

/**
 * Retired definitions remain code-owned registry entries so persisted plans
 * receive an actionable result instead of being mistaken for unknown input.
 * Their handlers are retained only for descriptor integrity and are never
 * returned by runtime lookup.
 */
const actionAvailabilitySchemaImplementation = z.enum(['active', 'retired']).default('active');
export type ActionAvailability = 'active' | 'retired';

function actionScopeAllowsPatch(mode: ActionExecutionMode, phase: ActionExecutionPhase): boolean {
  return mode !== 'onDelete' && phase !== 'post';
}

function addDuplicateValueIssue<Value>(
  field: string,
  values: readonly string[],
  context: z.RefinementCtx<Value>
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', path: [field], message: `${field} must not contain duplicates.` });
  }
}

const actionActorSchema = z
  .object({
    id: safeActionIdentifierSchema,
    username: z.string().min(1).max(ACTION_CONTRACT_LIMITS.maxTitleLength).optional(),
    roles: z.array(safeActionIdentifierSchema).max(ACTION_CONTRACT_LIMITS.maxRoleCount),
  })
  .strict();

const dangerousJsonObjectKeys = new Set(['__proto__', 'constructor', 'prototype']);

function addDangerousJsonObjectKeyIssues(
  value: BaseActionJsonValue,
  context: z.RefinementCtx<BaseActionJsonValue>
): void {
  const pending: BaseActionJsonValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current === null || typeof current !== 'object') {
      continue;
    }
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (key.split('.').some(segment => dangerousJsonObjectKeys.has(segment))) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Prior output fields may not contain prototype-related properties.',
        });
        return;
      }
      pending.push(child);
    }
  }
}

const validatedSafePriorActionOutputFieldsSchema = z
  .record(actionParameterNameSchema, actionJsonValueZodSchema)
  .superRefine((fields, context) => {
    addJsonLimitIssues(fields, context);
    if (Object.keys(fields).length > ACTION_CONTRACT_LIMITS.maxOutputFields) {
      context.addIssue({
        code: 'custom',
        message: `Prior outputs may contain at most ${ACTION_CONTRACT_LIMITS.maxOutputFields} fields.`,
      });
    }
  });

const safePriorActionOutputFieldsSchema = z
  .custom<BaseActionJsonObject>()
  .superRefine(addDangerousJsonObjectKeyIssues)
  .transform((fields, context) => {
    const result = validatedSafePriorActionOutputFieldsSchema.safeParse(fields);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ ...issue });
      }
      return z.NEVER;
    }
    return result.data;
  });

const safePriorActionOutputSchema = z
  .object({
    schemaVersion: z.literal(ACTION_RESULT_SCHEMA_VERSION),
    fields: safePriorActionOutputFieldsSchema,
  })
  .strict();

const priorActionOutputSchema = z
  .object({
    bindingId: actionBindingIdSchema,
    output: safePriorActionOutputSchema,
  })
  .strict();

const actionContextSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_CONTEXT_SCHEMA_VERSION),
    executionId: safeActionIdentifierSchema,
    correlationId: safeActionIdentifierSchema,
    requestId: safeActionIdentifierSchema.optional(),
    timestamp: z.iso.datetime({ offset: true }),
    brandId: safeActionIdentifierSchema,
    recordTypeKey: safeActionIdentifierSchema,
    scope: actionBindingScopeSchema,
    actor: actionActorSchema.nullable(),
    record: z
      .object({
        oid: safeActionIdentifierSchema.optional(),
        current: actionJsonObjectSchemaImplementation.optional(),
        candidate: actionJsonObjectSchemaImplementation.optional(),
      })
      .strict(),
    transition: z
      .object({
        scopeId: safeActionIdentifierSchema,
        sourceStage: safeActionIdentifierSchema,
        targetStage: safeActionIdentifierSchema,
      })
      .strict()
      .optional(),
    priorOutputs: z.array(priorActionOutputSchema).max(ACTION_CONTRACT_LIMITS.maxPriorOutputs),
  })
  .strict()
  .superRefine((contextValue, context) => {
    if (contextValue.scope.context === 'workflow-transition') {
      if (contextValue.transition === undefined) {
        context.addIssue({ code: 'custom', path: ['transition'], message: 'Transition context is required.' });
      } else if (contextValue.transition.scopeId !== contextValue.scope.scopeId) {
        context.addIssue({ code: 'custom', path: ['transition', 'scopeId'], message: 'Transition scopes must match.' });
      }
    } else if (contextValue.transition !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['transition'],
        message: 'Transition data is valid only for workflow-transition actions.',
      });
    }
  })
  .readonly();

export interface ActionActor {
  readonly id: string;
  readonly username?: string;
  readonly roles: string[];
}

export interface PriorActionOutput {
  readonly bindingId: ActionBindingId;
  readonly output: ActionOutput;
}

export interface ActionContext {
  readonly schemaVersion: typeof ACTION_CONTEXT_SCHEMA_VERSION;
  readonly executionId: string;
  readonly correlationId: string;
  readonly requestId?: string;
  readonly timestamp: string;
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly scope: ActionBindingScope;
  readonly actor: ActionActor | null;
  readonly record: {
    readonly oid?: string;
    readonly current?: ActionJsonObject;
    readonly candidate?: ActionJsonObject;
  };
  readonly transition?: {
    readonly scopeId: string;
    readonly sourceStage: string;
    readonly targetStage: string;
  };
  readonly priorOutputs: readonly PriorActionOutput[];
}
export type ActionHandler = (
  context: Readonly<ActionContext>,
  parameters: Readonly<ActionParameterValues>,
  secrets?: Readonly<ActionHandlerSecrets>
) => ActionResult | Promise<ActionResult>;

function isActionHandler(handler: RuntimeValue): boolean {
  return typeof handler === 'function';
}

const actionHandlerSchema = z
  .custom<ActionHandler>()
  .refine(isActionHandler, { message: 'Action handler must be a direct function reference.' });

const actionDefinitionSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_CONTRACT_SCHEMA_VERSION),
    id: actionDefinitionIdSchema,
    contractVersion: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxContractVersion),
    title: boundedTitleSchema,
    description: boundedDescriptionSchema,
    category: z.string().trim().min(1).max(ACTION_CONTRACT_LIMITS.maxCategoryLength),
    provenance: actionProvenanceSchemaImplementation,
    handler: actionHandlerSchema,
    contexts: z.array(z.enum(ACTION_INVOCATION_CONTEXTS)).min(1).max(ACTION_INVOCATION_CONTEXTS.length),
    modes: z.array(actionExecutionModeSchema).min(1).max(actionExecutionModeSchema.options.length),
    phases: z.array(actionExecutionPhaseSchema).min(1).max(actionExecutionPhaseSchema.options.length),
    allowRepeatedBindings: z.boolean(),
    availability: actionAvailabilitySchemaImplementation,
    parameterSchema: actionParameterSchemaImplementation,
    outputSchema: actionOutputSchemaImplementation,
    resultContract: actionResultContractSchemaImplementation,
    executionPolicy: actionExecutionPolicyBoundsSchemaImplementation,
  })
  .strict()
  .superRefine((definition, context) => {
    addDuplicateValueIssue('contexts', definition.contexts, context);
    addDuplicateValueIssue('modes', definition.modes, context);
    addDuplicateValueIssue('phases', definition.phases, context);
    if (definition.contexts.includes('workflow-transition') !== definition.modes.includes('onTransitionWorkflow')) {
      context.addIssue({
        code: 'custom',
        path: ['contexts'],
        message: 'Workflow-transition context and onTransitionWorkflow mode must be declared together.',
      });
    }
    if (
      definition.resultContract.allowedKinds.includes('patch') &&
      !definition.modes.some(mode => definition.phases.some(phase => actionScopeAllowsPatch(mode, phase)))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['resultContract', 'allowedKinds'],
        message: 'Patch results require at least one mutating mode and phase.',
      });
    }
  });

export interface ActionDefinition {
  readonly schemaVersion: typeof ACTION_CONTRACT_SCHEMA_VERSION;
  readonly id: ActionDefinitionId;
  readonly contractVersion: number;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly provenance: ActionProvenance;
  readonly handler: ActionHandler;
  readonly contexts: readonly (typeof ACTION_INVOCATION_CONTEXTS)[number][];
  readonly modes: readonly ActionExecutionMode[];
  readonly phases: readonly ActionExecutionPhase[];
  readonly allowRepeatedBindings: boolean;
  readonly availability: ActionAvailability;
  readonly parameterSchema: ActionParameterSchema;
  readonly outputSchema: ActionOutputSchema;
  readonly resultContract: ActionResultContract;
  readonly executionPolicy: ActionExecutionPolicyBounds;
}

const actionDependencySchema = z.discriminatedUnion('condition', [
  z
    .object({
      bindingId: actionBindingIdSchema,
      condition: z.literal('success'),
    })
    .strict(),
  z
    .object({
      bindingId: actionBindingIdSchema,
      condition: z.literal('output-equals'),
      field: actionParameterNameSchema,
      value: actionJsonValueZodSchema,
    })
    .strict(),
]);

const actionBindingSchemaImplementation = z
  .object({
    schemaVersion: z.literal(ACTION_CONTRACT_SCHEMA_VERSION),
    id: actionBindingIdSchema,
    stableKey: safeActionIdentifierSchema,
    actionId: actionDefinitionIdSchema,
    contractVersion: z.number().int().positive().max(ACTION_CONTRACT_LIMITS.maxContractVersion),
    scope: actionBindingScopeSchema,
    parameters: actionParameterValuesSchemaImplementation,
    order: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxOrder),
    dependencies: z.array(actionDependencySchema).max(ACTION_CONTRACT_LIMITS.maxDependencies).optional(),
    policyOverrides: actionExecutionPolicyOverrideSchemaImplementation.optional(),
  })
  .strict()
  .superRefine((binding, context) => {
    const dependencyIds = binding.dependencies?.map(dependency => dependency.bindingId) ?? [];
    if (new Set(dependencyIds).size !== dependencyIds.length) {
      context.addIssue({ code: 'custom', path: ['dependencies'], message: 'Dependencies must be unique.' });
    }
    if (dependencyIds.includes(binding.id)) {
      context.addIssue({ code: 'custom', path: ['dependencies'], message: 'A binding may not depend on itself.' });
    }
  });

export type ActionDependency =
  | { readonly bindingId: ActionBindingId; readonly condition: 'success' }
  | {
      readonly bindingId: ActionBindingId;
      readonly condition: 'output-equals';
      readonly field: string;
      readonly value: ActionJsonValue;
    };

export interface ActionBinding {
  readonly schemaVersion: typeof ACTION_CONTRACT_SCHEMA_VERSION;
  readonly id: ActionBindingId;
  readonly stableKey: string;
  readonly actionId: ActionDefinitionId;
  readonly contractVersion: number;
  readonly scope: ActionBindingScope;
  readonly parameters: ActionParameterValues;
  readonly order: number;
  readonly dependencies?: readonly ActionDependency[];
  readonly policyOverrides?: ActionExecutionPolicyOverride;
}

function actionArrayCardinalityLimit(path: string): number {
  if (path.endsWith('.parameters')) {
    return ACTION_CONTRACT_LIMITS.maxParameters;
  }
  if (path.endsWith('.dependencies')) {
    return ACTION_CONTRACT_LIMITS.maxDependencies;
  }
  if (path.endsWith('.retryOn')) {
    return 7;
  }
  return ACTION_CONTRACT_LIMITS.maxArrayItems;
}

function actionObjectCardinalityLimit(path: string): number {
  return path.endsWith('.parameters')
    ? ACTION_CONTRACT_LIMITS.maxParameters
    : ACTION_CONTRACT_LIMITS.maxObjectProperties;
}

function preflightActionContract(value: RuntimeValue): BoundedValidationFailure | undefined {
  const result = boundedValidationPreflight(value, {
    maxBytes: ACTION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
    maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: actionArrayCardinalityLimit,
    objectCardinalityLimit: actionObjectCardinalityLimit,
  });
  return result.ok ? undefined : result;
}

function runtimeValidator<Value>(schema: z.ZodType<Value, RuntimeValue>): RuntimeValidator<Value> {
  return createRuntimeValidator((value: RuntimeValue): RuntimeValidationResult<Value> => {
    if (preflightActionContract(value) !== undefined) {
      return Object.freeze({ success: false });
    }
    const result = schema.safeParse(value);
    return result.success ? Object.freeze({ success: true, data: result.data }) : Object.freeze({ success: false });
  });
}

export const actionJsonObjectSchema: RuntimeValidator<ActionJsonObject> = runtimeValidator(
  actionJsonObjectSchemaImplementation
);
export const actionJsonValueSchema: RuntimeValidator<ActionJsonValue> = runtimeValidator(actionJsonValueZodSchema);
export const actionParameterUiHintsSchema: RuntimeValidator<ActionParameterUiHints> = runtimeValidator(
  actionParameterUiHintsSchemaImplementation
);
export const actionStringParameterSchema: RuntimeValidator<ActionStringParameter> = runtimeValidator(
  actionStringParameterSchemaImplementation
);
export const actionNumberParameterSchema: RuntimeValidator<ActionNumberParameter> = runtimeValidator(
  actionNumberParameterSchemaImplementation
);
export const actionBooleanParameterSchema: RuntimeValidator<ActionBooleanParameter> = runtimeValidator(
  actionBooleanParameterSchemaImplementation
);
export const actionEnumOptionSchema: RuntimeValidator<ActionEnumOption> = runtimeValidator(
  actionEnumOptionSchemaImplementation
);
export const actionEnumParameterSchema: RuntimeValidator<ActionEnumParameter> = runtimeValidator(
  actionEnumParameterSchemaImplementation
);
export const actionObjectParameterSchema: RuntimeValidator<ActionObjectParameter> = runtimeValidator(
  actionObjectParameterSchemaImplementation
);
export const actionArrayItemSchema: RuntimeValidator<ActionArrayItem> = runtimeValidator(
  actionArrayItemSchemaImplementation
);
export const actionArrayParameterSchema: RuntimeValidator<ActionArrayParameter> = runtimeValidator(
  actionArrayParameterSchemaImplementation
);
export const actionJsonataParameterSchema: RuntimeValidator<ActionJsonataParameter> = runtimeValidator(
  actionJsonataParameterSchemaImplementation
);
export const actionHandlebarsParameterSchema: RuntimeValidator<ActionHandlebarsParameter> = runtimeValidator(
  actionHandlebarsParameterSchemaImplementation
);
export const actionSecretParameterSchema: RuntimeValidator<ActionSecretParameter> = runtimeValidator(
  actionSecretParameterSchemaImplementation
);
export const actionParameterDefinitionSchema: RuntimeValidator<ActionParameterDefinition> = runtimeValidator(
  actionParameterDefinitionSchemaImplementation
);
export const actionParameterSchema: RuntimeValidator<ActionParameterSchema> = runtimeValidator(
  actionParameterSchemaImplementation
);
export const actionParameterValueSchema: RuntimeValidator<ActionParameterValue> = runtimeValidator(
  actionParameterValueSchemaImplementation
);
export const actionParameterValuesSchema: RuntimeValidator<ActionParameterValues> = runtimeValidator(
  actionParameterValuesSchemaImplementation
);
export const actionOutputFieldSchema: RuntimeValidator<ActionOutputField> = runtimeValidator(
  actionOutputFieldSchemaImplementation
);
export const actionOutputSchema: RuntimeValidator<ActionOutputSchema> = runtimeValidator(
  actionOutputSchemaImplementation
);
export const actionOutputSchemaVersionedValueSchema: RuntimeValidator<ActionOutput> = runtimeValidator(
  actionOutputSchemaVersionedValueSchemaImplementation
);
export const actionPatchPathSchema: RuntimeValidator<string> = runtimeValidator(actionPatchPathSchemaImplementation);
export const actionPatchOperationSchema: RuntimeValidator<ActionPatchOperation> = runtimeValidator(
  actionPatchOperationSchemaImplementation
);
export const actionPatchSchema: RuntimeValidator<ActionPatch> = runtimeValidator(actionPatchSchemaImplementation);
export const noChangeActionResultSchema: RuntimeValidator<NoChangeActionResult> = runtimeValidator(
  noChangeActionResultSchemaImplementation
);
export const patchActionResultSchema: RuntimeValidator<PatchActionResult> = runtimeValidator(
  patchActionResultSchemaImplementation
);
export const replaceActionResultSchema: RuntimeValidator<ReplaceActionResult> = runtimeValidator(
  replaceActionResultSchemaImplementation
);
export const rejectActionResultSchema: RuntimeValidator<RejectActionResult> = runtimeValidator(
  rejectActionResultSchemaImplementation
);
export const actionSuccessResultSchema: RuntimeValidator<ActionSuccessResult> = runtimeValidator(
  actionSuccessResultSchemaImplementation
);
export const actionFailureResultSchema: RuntimeValidator<ActionFailureResult> = runtimeValidator(
  actionFailureResultSchemaImplementation
);
export const actionResultSchema: RuntimeValidator<ActionResult> = runtimeValidator(actionResultSchemaImplementation);
export const actionResultContractSchema: RuntimeValidator<ActionResultContract> = runtimeValidator(
  actionResultContractSchemaImplementation
);
export const actionRetryScheduleSchema: RuntimeValidator<ActionRetrySchedule> = runtimeValidator(
  actionRetryScheduleSchemaImplementation
);
export const actionFailureKindSchema: RuntimeValidator<ActionFailureKind> = runtimeValidator(
  actionFailureKindSchemaImplementation
);
export const actionExecutionPolicyOverrideSchema: RuntimeValidator<ActionExecutionPolicyOverride> = runtimeValidator(
  actionExecutionPolicyOverrideSchemaImplementation
);
export const actionExecutionPolicyBoundsSchema: RuntimeValidator<ActionExecutionPolicyBounds> = runtimeValidator(
  actionExecutionPolicyBoundsSchemaImplementation
);
export const actionProvenanceSchema: RuntimeValidator<ActionProvenance> = runtimeValidator(
  actionProvenanceSchemaImplementation
);
export const actionAvailabilitySchema: RuntimeValidator<ActionAvailability> = runtimeValidator(
  actionAvailabilitySchemaImplementation
);
export const actionContextSchema: RuntimeValidator<ActionContext> = runtimeValidator(actionContextSchemaImplementation);
export const actionDefinitionSchema: RuntimeValidator<ActionDefinition> = runtimeValidator(
  actionDefinitionSchemaImplementation
);
export const actionBindingSchema: RuntimeValidator<ActionBinding> = runtimeValidator(actionBindingSchemaImplementation);

function issuePath(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) {
    return '$';
  }
  return issue.path.reduce<string>((path, segment) => {
    if (typeof segment === 'number') {
      return `${path}[${segment}]`;
    }
    const key = String(segment);
    return path === '$' ? `$.${key}` : `${path}.${key}`;
  }, '$');
}

function contractValidationIssues(issues: readonly z.core.$ZodIssue[]): readonly ActionContractValidationIssue[] {
  return issues.slice(0, ACTION_CONTRACT_LIMITS.maxPlanValidationIssues).map(issue => ({
    path: issuePath(issue),
    code: issue.code,
    message: issue.message,
  }));
}

function parseContract<T>(
  schema: z.ZodType<T, RuntimeValue>,
  value: RuntimeValue,
  code: ActionContractValidationErrorCode,
  message: string
): T {
  const preflight = preflightActionContract(value);
  if (preflight !== undefined) {
    throw new ActionContractValidationError(code, message, [
      { path: preflight.path, code: `bounded-${preflight.reason}`, message: 'Input exceeds safe validation limits.' },
    ]);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ActionContractValidationError(code, message, contractValidationIssues(result.error.issues));
  }
  return result.data;
}

function deepFreeze<Value extends RuntimeValue>(value: Value): Readonly<Value> {
  const pending: RuntimeValue[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current === null || typeof current !== 'object' || seen.has(current)) {
      continue;
    }
    seen.add(current);
    pending.push(...(Array.isArray(current) ? current : Object.values(current)));
    Object.freeze(current);
  }
  return Object.freeze(value);
}

export function parseActionDefinition(value: RuntimeValue): ActionDefinition {
  return parseContract(
    actionDefinitionSchemaImplementation,
    value,
    'invalid-action-descriptor',
    'Action definition is invalid.'
  );
}

export function parseActionBinding(value: RuntimeValue): ActionBinding {
  return parseContract(
    actionBindingSchemaImplementation,
    value,
    'invalid-action-binding',
    'Action binding is invalid.'
  );
}

export function parseActionContext(value: RuntimeValue): ActionContext {
  return deepFreeze(
    parseContract(actionContextSchemaImplementation, value, 'invalid-action-context', 'Action context is invalid.')
  );
}

export function parseActionResult(value: RuntimeValue): ActionResult {
  return parseContract(actionResultSchemaImplementation, value, 'invalid-action-result', 'Action result is invalid.');
}

function contractError(code: ActionContractValidationErrorCode, path: string, message: string): never {
  throw new ActionContractValidationError(code, message, [{ path, code, message }]);
}

function bindingScopeId(scope: ActionBinding['scope']): string {
  return 'scopeId' in scope ? (scope.scopeId ?? '') : '';
}

function parameterHasDefault(parameter: ActionParameterDefinition): boolean {
  if ('defaultValue' in parameter) {
    return parameter.defaultValue !== undefined;
  }
  if (parameter.kind === 'jsonata') {
    return parameter.defaultExpression !== undefined;
  }
  if (parameter.kind === 'handlebars') {
    return parameter.defaultTemplate !== undefined;
  }
  return false;
}

function parameterDefaultIsValid(parameter: ActionParameterDefinition): boolean {
  if ('defaultValue' in parameter && parameter.defaultValue !== undefined) {
    return literalMatchesActionParameter(parameter, parameter.defaultValue);
  }
  if (parameter.kind === 'jsonata' && parameter.defaultExpression !== undefined) {
    return (
      parameter.defaultExpression.length > 0 &&
      parameter.defaultExpression.length <= ACTION_CONTRACT_LIMITS.maxExpressionLength
    );
  }
  if (parameter.kind === 'handlebars' && parameter.defaultTemplate !== undefined) {
    return (
      parameter.defaultTemplate.length > 0 &&
      parameter.defaultTemplate.length <= ACTION_CONTRACT_LIMITS.maxTemplateLength
    );
  }
  return true;
}

function outputFieldMatches(field: ActionOutputField, value: ActionJsonValue): boolean {
  if (field.kind === 'string') {
    return typeof value === 'string';
  }
  if (field.kind === 'number') {
    return typeof value === 'number';
  }
  if (field.kind === 'boolean') {
    return typeof value === 'boolean';
  }
  return actionJsonValueSchema.safeParse(value).success;
}

function validateActionOutput(output: ActionOutput | undefined, definition: ActionDefinition): void {
  const fields = new Map(definition.outputSchema.fields.map(field => [field.name, field]));
  if (output === undefined) {
    if (definition.outputSchema.fields.some(field => field.required)) {
      contractError('invalid-action-output', '$.output', 'Declared required output fields are missing.');
    }
    return;
  }
  if (!actionOutputSchemaVersionedValueSchema.safeParse(output).success) {
    contractError('invalid-action-output', '$.output', 'Action output does not match the public contract.');
  }
  for (const field of definition.outputSchema.fields) {
    if (field.required && output.fields[field.name] === undefined) {
      contractError('invalid-action-output', `$.output.fields.${field.name}`, 'A required output field is missing.');
    }
  }
  for (const [name, value] of Object.entries(output.fields)) {
    const field = fields.get(name);
    if (field === undefined || !outputFieldMatches(field, value)) {
      contractError(
        'invalid-action-output',
        `$.output.fields.${name}`,
        'Output must match a field declared by the action definition.'
      );
    }
  }
}

function patchPathAllowed(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function validateActionResultForDefinition(
  result: ActionResult,
  definition: ActionDefinition,
  scope: ActionBindingScope
): void {
  if (!actionResultSchema.safeParse(result).success) {
    contractError('invalid-action-result', '$', 'Action result does not match the public contract.');
  }
  if (
    !definition.contexts.includes(scope.context) ||
    !definition.modes.includes(scope.mode) ||
    !definition.phases.includes(scope.phase)
  ) {
    contractError(
      'unsupported-action-scope',
      '$.scope',
      'The definition does not support this context, mode, and phase.'
    );
  }
  if (!definition.resultContract.allowedKinds.includes(result.kind)) {
    contractError('unsupported-action-result', '$.kind', 'The result kind is not allowed by the action definition.');
  }
  if (result.kind === 'reject') {
    return;
  }
  validateActionOutput(result.output, definition);
  if (result.kind === 'patch') {
    if (!actionScopeAllowsPatch(scope.mode, scope.phase)) {
      contractError('unsupported-action-result', '$.kind', 'Patch results are not allowed in this mode and phase.');
    }
    const patchContract = definition.resultContract.patch;
    if (
      patchContract === undefined ||
      result.patch.length > patchContract.maxOperations ||
      result.patch.some(operation =>
        patchContract.allowedPathPrefixes.every(prefix => !patchPathAllowed(operation.path, prefix))
      )
    ) {
      contractError('invalid-action-patch', '$.patch', 'Patch operations exceed the definition safe-path contract.');
    }
  }
}

export function validateActionBindingForDefinition(binding: ActionBinding, definition: ActionDefinition): void {
  if (!actionBindingSchema.safeParse(binding).success) {
    contractError('invalid-action-binding', '$', 'Action binding does not match the public contract.');
  }
  if (!actionDefinitionSchema.safeParse(definition).success) {
    contractError('invalid-action-descriptor', '$', 'Action definition does not match the public contract.');
  }
  if (binding.actionId !== definition.id) {
    contractError('invalid-action-binding', '$.actionId', 'Binding action ID does not match the definition.');
  }
  if (binding.contractVersion !== definition.contractVersion) {
    contractError(
      'action-contract-version-mismatch',
      '$.contractVersion',
      'Binding and definition contract versions must match exactly.'
    );
  }
  if (
    !definition.contexts.includes(binding.scope.context) ||
    !definition.modes.includes(binding.scope.mode) ||
    !definition.phases.includes(binding.scope.phase)
  ) {
    contractError(
      'unsupported-action-scope',
      '$.scope',
      'The definition does not support this context, mode, and phase.'
    );
  }

  const parameters = new Map(definition.parameterSchema.parameters.map(parameter => [parameter.name, parameter]));
  for (const parameter of definition.parameterSchema.parameters) {
    if (!parameterDefaultIsValid(parameter)) {
      contractError(
        'invalid-action-parameters',
        `$.parameterSchema.parameters.${parameter.name}`,
        'The parameter default does not match its declared safe schema.'
      );
    }
    const value = binding.parameters[parameter.name];
    if (value === undefined) {
      if (parameter.required && !parameterHasDefault(parameter)) {
        contractError(
          'invalid-action-parameters',
          `$.parameters.${parameter.name}`,
          'A required parameter is missing.'
        );
      }
      continue;
    }
    const valid =
      (parameter.kind === 'jsonata' && value.kind === 'jsonata') ||
      (parameter.kind === 'handlebars' && value.kind === 'handlebars') ||
      (parameter.kind === 'secret' && value.kind === 'secret' && (!parameter.required || value.configured)) ||
      (value.kind === 'literal' && literalMatchesActionParameter(parameter, value.value));
    if (!valid) {
      contractError(
        'invalid-action-parameters',
        `$.parameters.${parameter.name}`,
        'Parameter value does not match its declared safe schema.'
      );
    }
  }
  for (const name of Object.keys(binding.parameters)) {
    if (!parameters.has(name)) {
      contractError(
        'invalid-action-parameters',
        `$.parameters.${name}`,
        'Parameter is not declared by the definition.'
      );
    }
  }

  const overrides = binding.policyOverrides;
  if (overrides?.timeoutMs !== undefined) {
    const timeout = definition.executionPolicy.timeout;
    if (overrides.timeoutMs < timeout.minMs || overrides.timeoutMs > timeout.maxMs) {
      contractError(
        'action-policy-exceeds-bounds',
        '$.policyOverrides.timeoutMs',
        'Timeout override exceeds the definition bounds.'
      );
    }
  }
  if (overrides?.retry !== undefined) {
    const retryBounds = definition.executionPolicy.retry;
    if (!retryBounds.allowed || overrides.retry.maxAttempts > retryBounds.maxAttempts) {
      contractError(
        'action-policy-exceeds-bounds',
        '$.policyOverrides.retry',
        'Retry override exceeds the definition bounds.'
      );
    }
    if (overrides.retry.schedule !== undefined) {
      const delay =
        overrides.retry.schedule.type === 'fixed'
          ? overrides.retry.schedule.delayMs
          : overrides.retry.schedule.maxDelayMs;
      if (delay > retryBounds.maxDelayMs) {
        contractError(
          'action-policy-exceeds-bounds',
          '$.policyOverrides.retry.schedule',
          'Retry delay exceeds the definition bounds.'
        );
      }
    }
  }
}

export function validateActionBindingCollection(
  recordTypeKey: string,
  definitions: readonly ActionDefinition[],
  bindings: readonly ActionBinding[]
): void {
  const sortedBindings = sortActionBindings(bindings);
  const definitionById = validateActionDefinitionCollection(definitions);
  const bindingById = new Map<ActionBindingId, ActionBinding>();
  const orders = new Set<string>();
  const repetitions = new Set<string>();

  for (const binding of sortedBindings) {
    const definition = definitionById.get(binding.actionId);
    if (definition === undefined) {
      contractError('invalid-action-binding', '$.actionId', 'Binding references an unavailable action definition.');
    }
    validateActionBindingForDefinition(binding, definition);
    const expectedId = deriveStableActionBindingId({
      recordTypeKey,
      scope: binding.scope,
      actionId: binding.actionId,
      contractVersion: binding.contractVersion,
      stableKey: binding.stableKey,
    });
    if (binding.id !== expectedId || bindingById.has(binding.id)) {
      contractError('duplicate-action-binding-id', '$.id', 'Binding IDs must be derived and collision-free.');
    }
    bindingById.set(binding.id, binding);

    const attachmentKey = JSON.stringify([
      binding.scope.context,
      binding.scope.mode,
      binding.scope.phase,
      bindingScopeId(binding.scope),
    ]);
    const orderKey = JSON.stringify([attachmentKey, binding.order]);
    if (orders.has(orderKey)) {
      contractError('duplicate-action-binding-order', '$.order', 'Binding order must be unique within an attachment.');
    }
    orders.add(orderKey);

    const repetitionKey = JSON.stringify([attachmentKey, binding.actionId]);
    if (!definition.allowRepeatedBindings && repetitions.has(repetitionKey)) {
      contractError('invalid-action-binding', '$.actionId', 'This action does not permit repeated bindings.');
    }
    repetitions.add(repetitionKey);
  }

  for (const binding of sortedBindings) {
    for (const dependency of binding.dependencies ?? []) {
      const requiredBinding = bindingById.get(dependency.bindingId);
      if (requiredBinding === undefined || requiredBinding.order >= binding.order) {
        contractError(
          'invalid-action-dependency',
          '$.dependencies',
          'Dependencies must reference an earlier binding in the same attachment.'
        );
      }
      if (
        requiredBinding.scope.context !== binding.scope.context ||
        requiredBinding.scope.mode !== binding.scope.mode ||
        requiredBinding.scope.phase !== binding.scope.phase ||
        bindingScopeId(requiredBinding.scope) !== bindingScopeId(binding.scope)
      ) {
        contractError('invalid-action-dependency', '$.dependencies', 'Dependencies may not cross attachments.');
      }
      if (dependency.condition === 'output-equals') {
        const requiredDefinition = definitionById.get(requiredBinding.actionId);
        if (
          requiredDefinition === undefined ||
          !requiredDefinition.outputSchema.safeFields.includes(dependency.field)
        ) {
          contractError(
            'invalid-action-dependency',
            '$.dependencies',
            'Dependencies may inspect only declared safe output fields.'
          );
        }
      }
    }
  }
}

export function validateActionDefinitionCollection(
  definitions: readonly ActionDefinition[]
): ReadonlyMap<ActionDefinition['id'], ActionDefinition> {
  const definitionById = new Map<ActionDefinition['id'], ActionDefinition>();
  for (const definition of definitions) {
    if (!actionDefinitionSchema.safeParse(definition).success) {
      contractError('invalid-action-descriptor', '$', 'Action definition does not match the public contract.');
    }
    if (definitionById.has(definition.id)) {
      contractError(
        'duplicate-action-definition-id',
        '$.id',
        'Action definition IDs must be globally unique; hook priority cannot resolve collisions.'
      );
    }
    definitionById.set(definition.id, definition);
  }
  return definitionById;
}
