import _ from 'lodash';
import {handlebarsCompile, jsonataCompileAndEvaluate} from '@researchdatabox/sails-ng-common';
import { CrosswalkBinding, ValueBinding } from '../../configmodels/FigsharePublishing';
import { AnyRecord } from './types';
import { BindingContext } from './context';
import { toSourceCodeCandidates } from './categories';

export interface CrosswalkBindingResult {
  values: Array<number | string>;
  /** Raw candidates taken from the inner source, before normalisation. */
  sourceCodes: string[];
  normalizedCodes: string[];
  unresolvedCodes: string[];
  historicalTargets: Array<{ code: string; categoryId: number; sourceId: string }>;
}

interface CrosswalkResolver {
  resolveCrosswalkValues?: (input: {
    brandId: string;
    crosswalkId: string;
    sourceVocabularyId: string;
    codes: string[];
    outputs: string;
  }) => Promise<{
    values: Array<number | string>;
    normalizedCodes: string[];
    unresolvedCodes: string[];
    historicalTargets: Array<{ code: string; categoryId: number; sourceId: string }>;
  }>;
}


export function validateHandlebarsTemplate(template: string): void {
  const allowedHelpers = new Set(['default', 'join', 'lower', 'upper', 'trim', 'formatDate']);
  const tagPattern = /{{{?\s*([#/!>]?)\s*([A-Za-z_][A-Za-z0-9_]*)?/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(template)) != null) {
    const sigil = match[1];
    const token = match[2];
    if (sigil === '!' || sigil === '>' || !token) {
      continue;
    }
    if (sigil === '#') {
      throw new Error(`Unsupported Handlebars block helper '${token}' in Figshare binding`);
    }
    const afterToken = template.slice(tagPattern.lastIndex).trimStart();
    const isSimpleLookup = afterToken.startsWith('}}') || afterToken.startsWith('}}}') || afterToken.startsWith('.');
    if (isSimpleLookup || allowedHelpers.has(token)) {
      continue;
    }
    throw new Error(`Unsupported Handlebars helper '${token}' in Figshare binding`);
  }
}

/**
 * Resolve a crosswalk binding: evaluate its inner source for codes, then push those
 * through the approved revision of the configured crosswalk.
 *
 * Returns the full resolution rather than just the values, because the categories
 * payload has to enforce `allowUnmapped` against the historical targets.
 */
export async function resolveCrosswalkBinding(
  binding: CrosswalkBinding,
  target: AnyRecord,
  context?: BindingContext
): Promise<CrosswalkBindingResult> {
  // Config arrives as JSON, so the type-level ban on nesting needs a runtime guard.
  if (String((binding.source as { kind?: unknown } | undefined)?.kind ?? '') === 'crosswalk') {
    throw new Error('Figshare crosswalk bindings cannot nest another crosswalk binding');
  }

  const rawValue = await evaluateBinding(binding.source, target, context);
  const sourceCodes = toSourceCodeCandidates(rawValue);
  if (sourceCodes.length === 0) {
    return { values: [], sourceCodes: [], normalizedCodes: [], unresolvedCodes: [], historicalTargets: [] };
  }

  const brandId = String(context?.brandId ?? '').trim();
  if (brandId === '') {
    throw new Error('Unable to resolve the brand for Figshare crosswalk binding resolution');
  }

  const crosswalkId = String(binding.crosswalkId ?? '').trim();
  const sourceVocabularyId = String(binding.sourceVocabularyId ?? '').trim();
  if (crosswalkId === '' || sourceVocabularyId === '') {
    throw new Error('Figshare crosswalk bindings require both a source vocabulary and an approved crosswalk');
  }

  // Reached through the sails global rather than an import, to avoid a module cycle
  // between this file and FigshareVocabularyService.
  const service = (typeof FigshareVocabularyService === 'undefined'
    ? undefined
    : FigshareVocabularyService) as CrosswalkResolver | undefined;
  if (typeof service?.resolveCrosswalkValues !== 'function') {
    throw new Error('FigshareVocabularyService.resolveCrosswalkValues is unavailable');
  }

  const resolution = await service.resolveCrosswalkValues({
    brandId,
    crosswalkId,
    sourceVocabularyId,
    codes: sourceCodes,
    // `||` not `??`: an unset select in the config editor arrives as an empty string.
    outputs: binding.outputs || 'categoryId'
  });

  return { ...resolution, sourceCodes };
}

/**
 * Evaluate a binding against `target`. `context` carries ambient information such
 * as the brand, which the crosswalk kind needs and which `target` may not hold —
 * author lookup rules evaluate against a contributor object, not the record.
 */
export async function evaluateBinding(
  binding: ValueBinding | undefined,
  target: AnyRecord,
  context?: BindingContext
): Promise<unknown> {
  if (binding == null) {
    return undefined;
  }

  if (binding.kind === 'path') {
    const value = _.get(target, binding.path, binding.defaultValue);
    return value ?? binding.defaultValue;
  }

  if (binding.kind === 'handlebars') {
    validateHandlebarsTemplate(binding.template);
    const compiled = handlebarsCompile(binding.template);
    const value = compiled(target);
    return value === '' ? binding.defaultValue : value;
  }

  if (binding.kind === 'jsonata') {
    const value = await jsonataCompileAndEvaluate(binding.expression, target);
    return value ?? binding.defaultValue;
  }

  if (binding.kind === 'crosswalk') {
    const resolution = await resolveCrosswalkBinding(binding, target, context);
    // Outside the categories payload there is nowhere to surface these, and they
    // must not silently vanish.
    if (resolution.historicalTargets.length > 0) {
      sails.log.warn(
        `Figshare crosswalk binding omitted historical targets: ${resolution.historicalTargets
          .map((historicalTarget) => `${historicalTarget.code} → ${historicalTarget.sourceId}`)
          .join(', ')}`
      );
    }
    if (resolution.unresolvedCodes.length > 0) {
      sails.log.warn(`Figshare crosswalk binding could not resolve: ${resolution.unresolvedCodes.join(', ')}`);
    }
    return resolution.values.length > 0 ? resolution.values : binding.defaultValue;
  }

  throw new Error(`Unsupported Figshare binding kind '${String((binding as { kind?: unknown }).kind)}'`);
}
