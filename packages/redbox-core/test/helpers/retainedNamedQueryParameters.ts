/** Retained e0a41f5d9 NamedQueries parameter pipeline. Do not update with production changes.
 * Conversion, template and query helper bodies are copied verbatim from that revision. */
import _ from 'lodash';
import { DateTime } from 'luxon';
import { handlebarsCompile } from '@researchdatabox/sails-ng-common';
import { assertNamedQueryPath } from '../../src/persistence/reference/NamedQueryExecution';

const parseSerializedValue = <T>(input: unknown, fallback: T): T => {
  if (typeof input === 'string') {
    if (input.length === 0) {
      return fallback;
    }
    try {
      return JSON.parse(input) as T;
    } catch (_error) {
      return fallback;
    }
  }

  if (input === undefined || input === null) {
    return fallback;
  }

  return input as T;
};

const parseObjectParamValue = (queryParamKey: string, value: unknown): Record<string, unknown> => {
  if (_.isPlainObject(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (_.isPlainObject(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (_error) {
      throw Error(`${queryParamKey} must be a valid JSON object`);
    }
  }

  throw Error(`${queryParamKey} must be a valid JSON object`);
};

enum DataType {
  Date = 'date',
  Number = 'number',
  String = 'string',
  Boolean = 'boolean',
  Array = 'array',
  Object = 'object',
}

enum NamedQueryWhenUndefinedOptions {
  defaultValue = 'defaultValue',
  ignore = 'ignore',
}

enum NamedQueryFormatOptions {
  days = 'days',
  ISODate = 'ISODate',
}

type NamedQuerySortConfig = Record<string, 'ASC' | 'DESC'>[];

class QueryParameterDefinition {
  required: boolean = false;
  type: DataType = DataType.String;
  defaultValue: unknown = null;
  queryType: string = '';
  whenUndefined: NamedQueryWhenUndefinedOptions = NamedQueryWhenUndefinedOptions.ignore;
  format: NamedQueryFormatOptions = NamedQueryFormatOptions.days;
  path: string = '';
  template: string = '';
}

export class RetainedNamedQueryParameters {
    static parameter(values: Readonly<Record<string, unknown>>) {
      return Object.assign(new QueryParameterDefinition(), values);
    }
    private updateChronicle(_info: unknown, _errors: unknown[]) {}
    private getMongoQueryValue(mongoQuery: Record<string, unknown>, path: string): unknown {
      return Object.prototype.hasOwnProperty.call(mongoQuery, path) ? mongoQuery[path] : _.get(mongoQuery, path);
    }

    private setMongoQueryValue(mongoQuery: Record<string, unknown>, path: string, value: unknown): void {
      if (path.includes('.')) {
        mongoQuery[path] = value;
      } else {
        _.set(mongoQuery, path, value);
      }
    }

    private unsetMongoQueryValue(mongoQuery: Record<string, unknown>, path: string): void {
      if (Object.prototype.hasOwnProperty.call(mongoQuery, path)) {
        delete mongoQuery[path];
      } else {
        _.unset(mongoQuery, path);
      }
    }

    setParamsInQuery(
      mongoQuery: Record<string, unknown>,
      queryParams: Record<string, QueryParameterDefinition>,
      paramMap: Record<string, unknown>
    ) {
      for (const queryParamKey in queryParams) {
        let value = paramMap[queryParamKey];
        const queryParam: QueryParameterDefinition = queryParams[queryParamKey];
        assertNamedQueryPath(queryParam.path);

        if (_.isUndefined(value) && queryParam.required === true) {
          throw Error(`${queryParamKey} is a required parameter`);
        }

        if (_.isUndefined(value)) {
          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
            this.unsetMongoQueryValue(mongoQuery, queryParam.path);
            continue;
          }

          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.defaultValue) {
            value = queryParam.defaultValue;
          }
        }

        if (!_.isEmpty(queryParam.template)) {
          value = this.runTemplate(queryParam.template, { value: value, queryParams: queryParams, paramMap: paramMap });
        }

        if (queryParam.type == DataType.Number) {
          if (!_.isUndefined(value) && value !== null && value !== '') {
            value = _.toNumber(value);
          }
        }

        if (queryParam.type == DataType.Boolean) {
          if (!_.isUndefined(value)) {
            if (typeof value === 'string') {
              value = value.toLowerCase() === 'true';
            } else {
              value = Boolean(value);
            }
          }
        }

        if (queryParam.type == DataType.Array) {
          if (!_.isUndefined(value) && !Array.isArray(value)) {
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed === '') {
                value = [];
              } else if (trimmed.startsWith('[')) {
                const parsed = parseSerializedValue<unknown[]>(trimmed, [value]);
                value = Array.isArray(parsed) ? parsed : [value];
              } else {
                value = [value];
              }
            } else {
              value = value !== null && value !== '' ? [value] : [];
            }
          }
        }

        if (queryParam.type == DataType.Object && !_.isUndefined(value)) {
          value = parseObjectParamValue(queryParamKey, value);
        }

        if (queryParam.type != DataType.Date && !_.isEmpty(queryParam.queryType)) {
          const query: Record<string, unknown> = {};
          if (
            value != undefined ||
            (value == undefined && queryParam.whenUndefined != NamedQueryWhenUndefinedOptions.ignore)
          ) {
            query[queryParam.queryType] = value;
            value = query;
          }
        }

        if (queryParam.type == DataType.Date) {
          if (!_.isEmpty(queryParam.queryType)) {
            const query: Record<string, unknown> = {};
            if (queryParam.format == NamedQueryFormatOptions.days && !_.isUndefined(value)) {
              let days = _.toInteger(value);
              let nowDateAddOrSubtract = DateTime.local();
              if (days > 0) {
                //Going forward in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.plus({ days: days });
              } else if (days < 0) {
                //This "additional" step makes the code self explanatory
                days = days * -1;
                //Going backwards in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.minus({ days: days });
              }
              value = nowDateAddOrSubtract.toISO();
            }

            query[queryParam.queryType] = value;
            value = query;
          }
        }

        if (value == undefined && queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
          this.unsetMongoQueryValue(mongoQuery, queryParam.path);
        } else {
          const existingValue = this.getMongoQueryValue(mongoQuery, queryParam.path);
          if (_.isPlainObject(existingValue) && _.isPlainObject(value)) {
            _.merge(value, existingValue);
          }
          this.setMongoQueryValue(mongoQuery, queryParam.path, value);
        }
      }
      return mongoQuery;
    }

    runTemplate(templateOrPath: string, variables: Record<string, unknown>): unknown {
      const templateVars = { ...variables };

      if (templateOrPath && templateOrPath.indexOf('{{') != -1) {
        try {
          const compiledTemplate = handlebarsCompile(templateOrPath, { noEscape: true });
          return compiledTemplate(templateVars);
        } catch (err) {
          this.updateChronicle({ namedQueryTemplateOutcome: 'failed' }, [err]);
          throw err;
        }
      }
      return _.get(templateVars, templateOrPath);
    }

}
