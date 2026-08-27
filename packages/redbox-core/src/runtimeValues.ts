export type RuntimePrimitive = string | number | boolean | bigint | symbol | null | undefined;
export type RuntimeValue = RuntimePrimitive | object;

export interface RuntimeRecord {
  [key: string]: RuntimeValue;
}

export interface RuntimeFunction {
  invoke(...argumentsList: RuntimeValue[]): RuntimeValue;
}

export interface RuntimeValidationSuccess<Value> {
  readonly success: true;
  readonly data: Value;
}

export interface RuntimeValidationFailure {
  readonly success: false;
}

export type RuntimeValidationResult<Value> = RuntimeValidationSuccess<Value> | RuntimeValidationFailure;

export interface RuntimeValidator<Value> {
  safeParse(value: RuntimeValue): RuntimeValidationResult<Value>;
}

export type RuntimeParser<Value> = (value: RuntimeValue) => RuntimeValidationResult<Value>;

export function createRuntimeValidator<Value>(parser: RuntimeParser<Value>): RuntimeValidator<Value> {
  return Object.freeze({ safeParse: parser });
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

interface RuntimePropertyContainer {
  [key: string]: RuntimeValue;
  [key: symbol]: RuntimeValue;
}

type RuntimeCallable = (...argumentsList: RuntimeValue[]) => RuntimeValue;

function isRuntimePropertyContainer(value: RuntimeValue): value is RuntimePropertyContainer {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function isRuntimeCallable(value: RuntimeValue): value is RuntimeCallable {
  return typeof value === 'function';
}

function requiredRuntimeFunction(value: RuntimeValue, label: string): RuntimeFunction {
  const callable = runtimeFunction(value);
  if (callable === undefined) {
    throw new TypeError(`${label} is not callable.`);
  }
  return callable;
}

const runtimeModuleLoader = requiredRuntimeFunction(require, 'The CommonJS module loader');
const jsonTextParser = requiredRuntimeFunction(readRuntimeProperty(JSON, 'parse'), 'JSON.parse');

export function loadRuntimeModule(modulePath: string): RuntimeValue {
  return runtimeModuleLoader.invoke(modulePath);
}

export function readRuntimeProperty(value: RuntimeValue, propertyKey: PropertyKey): RuntimeValue {
  if (!isRuntimePropertyContainer(value)) {
    return undefined;
  }
  return value[propertyKey];
}

export function hasOwnRuntimeProperty(value: RuntimeValue, propertyKey: PropertyKey): boolean {
  return (
    value !== null && (typeof value === 'object' || typeof value === 'function') && Object.hasOwn(value, propertyKey)
  );
}

export function writeRuntimeProperty(target: object, propertyKey: PropertyKey, value: RuntimeValue): boolean {
  if (!isRuntimePropertyContainer(target)) {
    return false;
  }
  target[propertyKey] = value;
  return true;
}

export function runtimeFunction(value: RuntimeValue): RuntimeFunction | undefined {
  if (!isRuntimeCallable(value)) {
    return undefined;
  }
  return {
    invoke: (...argumentsList: RuntimeValue[]): RuntimeValue => value(...argumentsList),
  };
}

export function isRuntimeRecord(value: RuntimeValue): value is RuntimeRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isRuntimeArray(value: RuntimeValue): value is RuntimeValue[] {
  return Array.isArray(value);
}

export function parseJsonText(text: string): JsonValue {
  const value = jsonTextParser.invoke(text);
  if (!isJsonValue(value)) {
    throw new SyntaxError('Parsed JSON did not produce a JSON value.');
  }
  return value;
}

function isJsonValue(value: RuntimeValue): value is JsonValue {
  const pending: RuntimeValue[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      return false;
    }
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean' ||
      (typeof current === 'number' && Number.isFinite(current))
    ) {
      continue;
    }
    if (isRuntimeArray(current)) {
      pending.push(...current);
      continue;
    }
    if (isRuntimeRecord(current)) {
      pending.push(...Object.values(current));
      continue;
    }
    return false;
  }
  return true;
}
