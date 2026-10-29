import { handlebarsInstance, normaliseVisual } from '@researchdatabox/sails-ng-common';
import { scanEmailTemplateComplexity } from './EmailTemplateComplexity';
import { emailTemplateComplexityLimits, type EmailTemplateAsts } from '../services/EmailTemplateService';
import type {
  EmailAdminContent,
  EmailAdminDiagnostic,
  EmailContextSchema,
  EmailContextSchemaResponse,
} from '@researchdatabox/sails-ng-common';

/** Resolve local references only; ambiguous/recursive regions deliberately remain unknown. */
function dereference(
  node: EmailContextSchema | undefined,
  root: EmailContextSchema,
  spend: () => void
): EmailContextSchema | undefined {
  const seen = new Set<string>();
  while (node?.$ref) {
    spend();
    if (!node.$ref.startsWith('#/') || seen.has(node.$ref)) return undefined;
    seen.add(node.$ref);
    let value: unknown = root;
    for (const part of node.$ref.slice(2).split('/')) {
      spend();
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      value = value && typeof value === 'object' && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
    }
    node = value as EmailContextSchema | undefined;
  }
  if (node?.anyOf || node?.oneOf || node?.allOf) return undefined;
  return node;
}

/** Banded Levenshtein: bounded length, distance, and total cell work. */
function distance(a: string, b: string, limit: number, spend: () => void): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = Array(b.length + 1).fill(limit + 1);
    next[0] = i;
    let minimum = next[0];
    for (let j = Math.max(1, i - limit); j <= Math.min(b.length, i + limit); j++) {
      spend();
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      minimum = Math.min(minimum, next[j]);
    }
    if (minimum > limit) return limit + 1;
    row = next;
  }
  return row[b.length];
}

interface Scope {
  path: string[] | null;
  aliases: Map<string, string[] | null>;
  guards: Set<string>;
}
interface Ast {
  type: string;
  loc: hbs.AST.Node['loc'];
  original: string;
  parts: string[];
  data: boolean;
  depth: number;
  body: Ast[];
  path: Ast;
  params: Ast[];
  hash?: { pairs: Array<{ value: Ast }> };
  program?: Ast;
  inverse?: Ast;
  blockParams?: string[];
}

/** Advisory only. #each accepts objects as Handlebars does. Optional hints default off. */
export function lintEmailTemplateSchema(
  content: EmailAdminContent,
  schema: EmailContextSchema,
  includeOptional = false,
  precision: EmailContextSchemaResponse['precision'] = 'record-schema',
  parsed?: EmailTemplateAsts
): EmailAdminDiagnostic[] {
  const diagnostics: EmailAdminDiagnostic[] = [];
  // Shared across both fields, traversal, references and suggestion work. The time
  // ceiling is a backstop; the deterministic budget also bounds fast machines.
  let remaining = 100_000;
  const deadline = performance.now() + 100;
  const exhausted = Symbol('lint budget');
  const spend = () => {
    if (--remaining < 0 || (remaining % 256 === 0 && performance.now() > deadline)) throw exhausted;
  };
  const suggestions = new WeakMap<object, Map<string, string | undefined>>();
  const suggest = (name: string, properties: Record<string, EmailContextSchema> = {}): string | undefined => {
    let memo = suggestions.get(properties);
    if (!memo) suggestions.set(properties, (memo = new Map()));
    if (memo.has(name)) return memo.get(name);
    let best: string | undefined;
    let score = Math.min(3, Math.max(1, Math.ceil(name.length / 3)));
    let tied = false;
    if (name.length <= 100) {
      for (const key of Object.keys(properties)) {
        spend();
        if (key.length > 100) continue;
        const candidate = distance(name, key, score, spend);
        if (candidate < score || (candidate === score && best === undefined)) {
          best = key;
          score = candidate;
          tied = false;
        } else if (candidate === score) tied = true;
      }
    }
    const result = tied ? undefined : best;
    memo.set(name, result);
    return result;
  };
  const handlebars = handlebarsInstance();
  const hookRoots = new Set(sails.config.emailnotification?.settings?.additionalContextRoots ?? []);
  for (const field of ['subject', 'body'] as const) {
    // AST positions refer to the normalised source. When normalisation changed the
    // text they may not map onto the editor buffer, so no one-click fix is offered.
    const exact = normaliseVisual(content[field]) === content[field];
    const emit = (code: string, node: Ast, suggestion?: string, segmentIndex?: number) => {
      if (diagnostics.length >= 99) throw exhausted;
      diagnostics.push({
        code,
        severity: 'warning',
        reason: code,
        field,
        line: node.loc.start.line,
        column: node.loc.start.column + 1,
        ...(suggestion && exact ? { suggestion } : {}),
        ...(segmentIndex !== undefined && exact ? { segmentIndex } : {}),
      });
    };
    const absolute = (node: Ast, frames: Scope[]): string[] | null => {
      if (node?.type !== 'PathExpression') return null;
      const parts: string[] = node.parts ?? [];
      const current = frames[frames.length - 1];
      if (node.data && current.aliases.has(parts[0])) return null;
      if (node.data) return parts[0] === 'root' ? parts.slice(1) : null;
      if (node.depth === 0 && !/^(?:\.|this\b)/.test(node.original) && current.aliases.has(parts[0])) {
        const alias = current.aliases.get(parts[0]);
        return alias ? [...alias, ...parts.slice(1)] : null;
      }
      const base = frames[frames.length - 1 - (node.depth ?? 0)]?.path;
      return base ? [...base, ...parts] : null;
    };
    const lookup = (
      path: string[] | null,
      node: Ast,
      warn = true
    ): { schema: EmailContextSchema; optional: boolean } | undefined => {
      if (!path || hookRoots.has(path[0])) return;
      let target: EmailContextSchema | undefined = schema;
      let optional = false;
      for (let index = 0; index < path.length; index++) {
        spend();
        const part = path[index];
        target = dereference(target, schema, spend);
        if (!target) return;
        if (part === '*') {
          target = target.type === 'array' ? target.items : undefined;
          continue;
        }
        if (!target.properties || !Object.hasOwn(target.properties, part)) {
          const metadataPath = path[0] === 'record' && path[1] === 'metadata' && index >= 2;
          const knownMetadata =
            metadataPath &&
            precision === 'record-schema' &&
            target.properties &&
            !target.patternProperties &&
            typeof target.additionalProperties !== 'object';
          if (warn && (target.additionalProperties === false || knownMetadata)) {
            if (diagnostics.length >= 99) throw exhausted;
            // Absolute resolution prepends scope parts (and expands aliases).
            // Only indices corresponding to an actual source segment may be fixed.
            const segmentIndex = index - (path.length - node.parts.length);
            emit('UNKNOWN_FIELD', node, suggest(part, target.properties), segmentIndex >= 0 ? segmentIndex : undefined);
          }
          return;
        }
        optional = !(target.required ?? []).includes(part);
        target = target.properties[part];
      }
      target = dereference(target, schema, spend);
      return target ? { schema: target, optional } : undefined;
    };
    const walk = (node: Ast, frames: Scope[]): void => {
      if (!node) return;
      spend();
      if (node.type === 'Program') {
        node.body.forEach((child: Ast) => walk(child, frames));
        return;
      }
      if (node.type === 'PathExpression') {
        lookup(absolute(node, frames), node);
        return;
      }
      if (!['MustacheStatement', 'BlockStatement', 'SubExpression'].includes(node.type)) return;
      const head = node.path as Ast;
      const helper =
        head.type === 'PathExpression' &&
        Object.hasOwn(handlebars.helpers, head.original) &&
        !frames[frames.length - 1].aliases.has(head.parts?.[0]);
      if (!helper && head.type === 'PathExpression') {
        const path = absolute(head, frames);
        const result = lookup(path, head);
        const types = result?.schema.type;
        const list = Array.isArray(types) ? types : [types];
        if (node.type === 'MustacheStatement' && !node.params?.length && result) {
          if (list.includes('object') || list.includes('array')) emit('PRINTS_OBJECT', head);
          if (includeOptional && result.optional && path && !frames[frames.length - 1].guards.has(path.join('.')))
            emit('OPTIONAL_UNGUARDED', head);
        }
      }
      node.params?.forEach((param: Ast) => walk(param, frames));
      node.hash?.pairs.forEach((pair: { value: Ast }) => walk(pair.value, frames));
      if (node.type !== 'BlockStatement') return;
      const current = frames[frames.length - 1];
      const argument = node.params?.[0] as Ast;
      const path = absolute(argument, frames);
      const resolved = lookup(path, argument, false)?.schema;
      const types = resolved ? (Array.isArray(resolved.type) ? resolved.type : [resolved.type]) : [];
      const name = helper ? head.original : '';
      if (name === 'each' && types.length && types.every(type => type && !['array', 'object'].includes(type)))
        emit('EACH_NOT_ARRAY', argument);
      const scope: Scope = { path: null, aliases: new Map(current.aliases), guards: new Set(current.guards) };
      let scoped = false;
      if (['if', 'unless'].includes(name)) scope.path = current.path;
      if (name === 'with') {
        scope.path = path;
        scoped = true;
      }
      if (name === 'each') {
        scope.path = path && types.includes('array') ? [...path, '*'] : null;
        scoped = true;
      }
      if (path && ['if', 'with'].includes(name)) scope.guards.add(path.join('.'));
      // Integration defaults guard optional numbers this way so zero remains visible.
      if (argument?.type === 'SubExpression' &&
        ((name === 'if' && argument.path?.original === 'isDefined') ||
          (name === 'unless' && argument.path?.original === 'isUndefined'))) {
        const defined = absolute(argument.params?.[0], frames);
        if (defined) scope.guards.add(defined.join('.'));
      }
      (node.program?.blockParams ?? []).forEach((alias: string, i: number) =>
        scope.aliases.set(alias, i === 0 && scoped ? scope.path : null)
      );
      if (node.program) walk(node.program, scoped ? [...frames, scope] : [...frames.slice(0, -1), scope]);
      // Inverse branches keep the original context and have no truthy guard.
      if (node.inverse) walk(node.inverse, frames);
    };
    try {
      if (content[field].length > 128 * 1024) throw exhausted;
      const source = normaliseVisual(content[field]);
      if (scanEmailTemplateComplexity(source, emailTemplateComplexityLimits()).exceeded) throw exhausted;
      const ast = parsed?.[field] ?? handlebars.parse(source);
      walk(ast as unknown as Ast, [{ path: [], aliases: new Map(), guards: new Set() }]);
    } catch (error) {
      if (error === exhausted || error instanceof RangeError) {
        diagnostics.push({
          code: 'SCHEMA_LINT_TRUNCATED',
          severity: 'warning',
          reason: 'SCHEMA_LINT_TRUNCATED',
          field,
          line: 1,
          column: 1,
        });
        break;
      }
      /* Syntax/policy errors are reported exclusively by stage 2b validation. */
    }
  }
  return diagnostics;
}
