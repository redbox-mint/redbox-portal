/* oxlint-disable typescript/no-explicit-any */
import { Effect, Layer } from 'effect';
import jsonata from 'jsonata';
import Handlebars from 'handlebars';
import moment from 'moment';
import numeral from 'numeral';
import type { RaidCreateRequest } from '@researchdatabox/raido-openapi-generated-node';
import type { RaidMappingField, RaidPublishingConfigData } from '../../configmodels/RaidPublishing';
import { RaidMappingError } from './errors';
import { RaidConfigTag, RaidMappingTag, RaidRunContextTag } from './tags';
import type { RaidOptions, RaidRecord } from './types';

type AnyRecord = Record<string, any>;

function getPath(value: unknown, path: string): unknown {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce<unknown>((cur, key) =>
    cur != null && typeof cur === 'object' ? (cur as AnyRecord)[key] : undefined, value);
}

function setPath(target: AnyRecord, path: string, value: unknown): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cursor: AnyRecord = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else {
      const nextIsArray = /^\d+$/.test(parts[index + 1] ?? '');
      if (cursor[part] == null) cursor[part] = nextIsArray ? [] : {};
      cursor = cursor[part] as AnyRecord;
    }
  });
}

function isEmpty(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function buildContributors(record: RaidRecord, fieldConfig: RaidMappingField, mappedData: AnyRecord, config: RaidPublishingConfigData): AnyRecord[] {
  const contributors: Record<string, AnyRecord> = {};
  const startDate = String(getPath(mappedData, 'date.startDate') ?? '');
  const endRaw = getPath(mappedData, 'date.endDate');
  for (const [fieldName, contributorConfig] of Object.entries(fieldConfig.contributorMap ?? {})) {
    const values = getPath(record, `metadata.${fieldName}`);
    for (const candidate of Array.isArray(values) ? values : [values]) {
      if (candidate == null || typeof candidate !== 'object') continue;
      const entry = candidate as AnyRecord;
      if (!entry.text_full_name) continue;
      const rawId = String(getPath(entry, contributorConfig.fieldMap.id) ?? '');
      const stripped = rawId.replace(config.orcidBaseUrl, '');
      if (!/^(\d{4}-){3}\d{3}(\d|X)$/.test(stripped)) {
        if (contributorConfig.requireOrcid) throw new Error(`Missing valid ORCID for ${entry.text_full_name}`);
        continue;
      }
      const id = rawId.startsWith(config.orcidBaseUrl) ? rawId : `${config.orcidBaseUrl}${rawId}`;
      const contributorTypes = config.types.contributor as AnyRecord;
      const positionConfig = contributorTypes.position[contributorConfig.position];
      const position = { schemaUri: positionConfig.schemaUri, id: positionConfig.id, startDate, ...(endRaw ? { endDate: String(endRaw) } : {}) };
      const role = { schemaUri: contributorTypes.roles.schemaUri, id: `${contributorTypes.roles.schemaUri}contributor-roles/${contributorTypes.roles.types[contributorConfig.role]}/` };
      const existing = contributors[id];
      if (!existing) {
        const created: AnyRecord = { id, schemaUri: config.orcidBaseUrl, position: [position], role: [role] };
        for (const [flag, positions] of Object.entries(contributorTypes.flags ?? {})) {
          if ((positions as string[]).includes(contributorConfig.position)) created[flag] = true;
        }
        contributors[id] = created;
      } else {
        if (!existing.role.some((item: AnyRecord) => item.id === role.id)) existing.role.push(role);
        const hierarchy = contributorTypes.hiearchy.position as string[];
        const existingLabel = Object.keys(contributorTypes.position).find(key => contributorTypes.position[key].id === existing.position[0]?.id);
        if (!existing.position.some((item: AnyRecord) => item.id === position.id) && hierarchy.indexOf(contributorConfig.position) < hierarchy.indexOf(existingLabel ?? '')) existing.position[0] = position;
        for (const [flag, positions] of Object.entries(contributorTypes.flags ?? {})) {
          if ((positions as string[]).includes(contributorConfig.position)) existing[flag] = true;
        }
      }
    }
  }
  return Object.values(contributors);
}

export function buildSubjects(subjects: unknown, subjectType: string, config: RaidPublishingConfigData): AnyRecord[] {
  if (!Array.isArray(subjects)) return [];
  const type = (config.types.subject as AnyRecord)[subjectType];
  return subjects.map(subject => ({ id: `${type.id}${String((subject as AnyRecord).notation ?? '')}`, schemaUri: type.schemaUri, keyword: [{ text: String((subject as AnyRecord).label ?? '') }] }));
}

function validateField(name: string, field: RaidMappingField): Effect.Effect<void, RaidMappingError> {
  return Effect.try({
    try: () => {
      if (!field.dest?.trim()) throw new Error('Destination is empty');
      if (field.engine !== 'jsonata' && field.engine !== 'handlebars') throw new Error(`Unknown engine '${String(field.engine)}'`);
      if (field.engine === 'jsonata' && (!field.expression || field.template)) throw new Error('JSONata requires only expression');
      if (field.engine === 'handlebars' && (!field.template || field.expression)) throw new Error('Handlebars requires only template');
      const source = field.expression ?? field.template ?? '';
      if (source.includes('<%')) throw new Error('Legacy lodash template syntax is not supported');
      if (field.engine === 'jsonata' && field.parseJson) throw new Error('parseJson is only valid for Handlebars');
    },
    catch: cause => new RaidMappingError({ message: `Invalid RAiD mapping field '${name}'`, field: name, engine: field.engine, cause })
  });
}

export function makeMappingLayer() {
  return Layer.effect(RaidMappingTag, Effect.gen(function* () {
    const config = yield* RaidConfigTag;
    const runContext = yield* RaidRunContextTag;
    return {
      map(record: RaidRecord, fields: Record<string, unknown>, options: RaidOptions) {
        return Effect.gen(function* () {
          const mappedData: AnyRecord = {};
          for (const [name, rawField] of Object.entries(fields)) {
            const field = rawField as RaidMappingField;
            yield* validateField(name, field);
            const context: AnyRecord = { record, options, mappedData, fieldConfig: field, types: config.types, runContext };
            let value: unknown;
            if (field.engine === 'jsonata') {
              value = yield* Effect.tryPromise({
                try: async () => {
                  const expression = jsonata(field.expression!);
                  expression.registerFunction('contributors', () => buildContributors(record, field, mappedData, config), '<:a>');
                  expression.registerFunction('subjects', (data: unknown, type: string) => buildSubjects(data, type, config), '<xs:a>');
                  return expression.evaluate(context);
                },
                catch: cause => new RaidMappingError({ message: `Failed to evaluate JSONata field '${name}'`, field: name, engine: field.engine, cause })
              });
            } else {
              value = yield* Effect.try({
                try: () => {
                  const handlebars = Handlebars.create();
                  handlebars.registerHelper('json', (item: unknown) => JSON.stringify(item));
                  handlebars.registerHelper('lookupPath', (item: unknown, path: string) => getPath(item, path));
                  handlebars.registerHelper('date', (item: unknown, format: string) => moment(item as any).format(format));
                  handlebars.registerHelper('number', (item: unknown, format: string) => numeral(item as any).format(format));
                  const rendered = handlebars.compile(field.template!, { strict: true })(context);
                  return field.parseJson ? JSON.parse(rendered) : rendered;
                },
                catch: cause => new RaidMappingError({ message: `Failed to render Handlebars field '${name}'`, field: name, engine: field.engine, cause })
              });
            }
            if (!(field.omitIfEmpty && isEmpty(value))) setPath(mappedData, field.dest, value);
          }
          return mappedData as RaidCreateRequest;
        });
      }
    };
  }));
}
