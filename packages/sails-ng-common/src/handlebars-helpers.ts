// Copyright (c) 2025 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { DateTime } from 'luxon';
import Handlebars from 'handlebars';
import {
  get as _get,
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
  isNull as _isNull,
  isArray as _isArray,
  isPlainObject as _isPlainObject,
} from 'lodash';
import { mapMomentToLuxonFormat } from './date-format-helpers';
import { escapeHtmlText } from './html-helpers';
import { normaliseVisual } from './config/names/naming-helpers';
import { guessType } from './config/helpers';

function isHandlebarsOptionsArg(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Object.prototype.hasOwnProperty.call(value, 'hash') ||
      Object.prototype.hasOwnProperty.call(value, 'data') ||
      Object.prototype.hasOwnProperty.call(value, 'fn') ||
      Object.prototype.hasOwnProperty.call(value, 'inverse'))
  );
}

// TODO: this is because the DateInputComponent needs Luxon style formatters. We have a moment shim on the server side but not on the client.
function resolveDateFormatArg(formatOrOptions?: string | Record<string, unknown>): string | undefined {
  if (typeof formatOrOptions === 'string') {
    return mapMomentToLuxonFormat(formatOrOptions);
  }
  if (isHandlebarsOptionsArg(formatOrOptions)) {
    return undefined;
  }
  return undefined;
}

/**
 * Marked is an ESM module so cannot be imported synchronously in a CommonJS context.
 * We use dynamic import to load it when needed, and cache the parser function for future use. If the module cannot be loaded, the markdownToHtml helper will simply return the input string unmodified.
 */
let cachedMarkedParser: ((value: string) => string) | null | undefined;

void import('marked')
  .then(markedModule => {
    const parseFn = markedModule?.marked?.parse ?? markedModule?.parse;
    if (typeof parseFn === 'function') {
      cachedMarkedParser = (value: string): string => {
        const result = parseFn(value);
        return typeof result === 'string' ? result : value;
      };
      return;
    }
    cachedMarkedParser = null;
  })
  .catch(() => {
    cachedMarkedParser = null;
  });

function resolveMarkedParser(): ((value: string) => string) | null {
  return cachedMarkedParser ?? null;
}

function isPrimitiveMetadataValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isFlatObject(value: unknown): value is Record<string, unknown> {
  if (!_isPlainObject(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(entry => isPrimitiveMetadataValue(entry));
}

function renderMetadataPrimitive(value: unknown): string {
  if (_isUndefined(value) || _isNull(value) || value === '') {
    return '<em class="text-muted">—</em>';
  }

  return escapeHtmlText(value);
}

function renderMetadataObjectEntries(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '<em class="text-muted">—</em>';
  }

  const rows = entries
    .map(([key, entryValue]) => {
      return `<div class="rb-view-metadata__nested-row"><div class="rb-view-metadata__nested-key">${escapeHtmlText(key)}</div><div class="rb-view-metadata__nested-value">${renderMetadataValue(entryValue)}</div></div>`;
    })
    .join('');

  return `<div class="rb-view-metadata__nested">${rows}</div>`;
}

function renderMetadataTable(value: Record<string, unknown>[]): string {
  if (value.length === 0) {
    return '<em class="text-muted">—</em>';
  }

  const columnsSet = new Set<string>();
  for (const row of value) {
    for (const key of Object.keys(row)) {
      columnsSet.add(key);
    }
  }

  const columns = Array.from(columnsSet);

  if (columns.length === 0) {
    return '<em class="text-muted">—</em>';
  }

  const headerHtml = columns.map(key => `<th>${escapeHtmlText(key)}</th>`).join('');
  const rowHtml = value
    .map(row => {
      const cells = columns.map(key => `<td>${renderMetadataPrimitive(row[key])}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<div class="rb-view-metadata__table-wrapper"><table class="table table-striped table-sm rb-view-metadata__table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table></div>`;
}

function renderMetadataArray(value: unknown[]): string {
  if (value.length === 0) {
    return '<em class="text-muted">—</em>';
  }

  if (value.every(entry => typeof entry === 'string')) {
    const items = value.map(entry => `<li>${escapeHtmlText(entry)}</li>`).join('');
    return `<ul class="rb-view-metadata__list">${items}</ul>`;
  }

  if (value.every(entry => isFlatObject(entry))) {
    return renderMetadataTable(value as Record<string, unknown>[]);
  }

  const items = value.map(entry => `<li>${renderMetadataValue(entry)}</li>`).join('');
  return `<ul class="rb-view-metadata__list">${items}</ul>`;
}

function renderMetadataValue(value: unknown): string {
  if (_isArray(value)) {
    return renderMetadataArray(value);
  }

  if (_isPlainObject(value)) {
    return renderMetadataObjectEntries(value as Record<string, unknown>);
  }

  return renderMetadataPrimitive(value);
}

function trimSlashes(value: unknown): string {
  const text = String(value ?? '');
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === '/') start++;
  while (end > start && text[end - 1] === '/') end--;
  return text.slice(start, end);
}

function isSafeDownloadUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}

function resolveAttachmentLocation(location: string, branding: unknown, portal: unknown): string {
  if (!location) {
    return '';
  }
  if (/^https?:\/\//i.test(location)) {
    return location;
  }
  const recordRelativeMatch = location.match(/^([^/]+)\/attach\/([^/?#]+)$/);
  if (recordRelativeMatch) {
    const prefix = [trimSlashes(branding), trimSlashes(portal)].filter(Boolean).join('/');
    const path = `record/${encodeURIComponent(recordRelativeMatch[1])}/attach/${encodeURIComponent(recordRelativeMatch[2])}`;
    return `/${[prefix, path].filter(Boolean).join('/')}`;
  }
  if (!isSafeDownloadUrl(location)) {
    return '';
  }
  if (location.startsWith('/record/')) {
    const prefix = [trimSlashes(branding), trimSlashes(portal)].filter(Boolean).join('/');
    return prefix ? `/${prefix}${location}` : location;
  }
  return location;
}

function buildAttachmentDownloadUrl(attachment: unknown, oid: unknown, branding: unknown, portal: unknown): string {
  if (!_isPlainObject(attachment)) {
    return '';
  }

  const item = attachment as Record<string, unknown>;
  const url = String(item.url ?? '').trim();
  if (url && isSafeDownloadUrl(url)) {
    return url;
  }

  const uploadUrl = String(item.uploadUrl ?? '').trim();
  if (uploadUrl) {
    try {
      const parsedUploadUrl = new URL(uploadUrl);
      const uploadPath = resolveAttachmentLocation(parsedUploadUrl.pathname, branding, portal);
      if (uploadPath) {
        return uploadPath;
      }
    } catch {
      const uploadPath = resolveAttachmentLocation(uploadUrl, branding, portal);
      if (uploadPath) {
        return uploadPath;
      }
    }
  }

  const location = resolveAttachmentLocation(String(item.location ?? '').trim(), branding, portal);
  if (location) {
    return location;
  }

  const fileId = String(item.fileId ?? '').trim();
  const recordOid = String(oid ?? '').trim();
  if (!fileId || !recordOid) {
    return '';
  }

  const prefix = [trimSlashes(branding), trimSlashes(portal)].filter(Boolean).join('/');
  const path = `record/${encodeURIComponent(recordOid)}/attach/${encodeURIComponent(fileId)}`;
  return `/${[prefix, path].filter(Boolean).join('/')}`;
}

function contributorDisplayName(
  value: unknown,
  fullOrOptions?: string | string[] | Record<string, unknown>,
  honorificOrOptions?: string | string[] | Record<string, unknown>,
  givenOrOptions?: string | string[] | Record<string, unknown>,
  familyOrOptions?: string | string[] | Record<string, unknown>
) {
  if (!_isPlainObject(value)) {
    return '';
  }
  const pathOptions = function (provided: unknown, defaultValue: string[]) {
    return Array.isArray(provided) ? provided : typeof provided === 'string' ? [provided] : defaultValue;
  };
  const getPath = function (value: unknown, paths: string[]) {
    for (const path of paths) {
      const raw = _get(value, path);
      const guessedType = guessType(raw);
      if (['array', 'object', 'function'].includes(guessedType)) {
        // Skip properties that are likely to show an unfriendly string representation.
        continue;
      }
      const result = String(raw ?? '').trim();
      if (result) {
        return result;
      }
    }
    return '';
  };

  const fullPath = pathOptions(fullOrOptions, ['full_name_honorific', 'text_full_name', 'full_name', 'fullName']);
  const honorificPath = pathOptions(honorificOrOptions, ['honorific']);
  const givenPath = pathOptions(givenOrOptions, ['given_name', 'givenName']);
  const familyPath = pathOptions(familyOrOptions, ['family_name', 'familyName']);

  return (
    getPath(value, fullPath) ||
    [getPath(value, honorificPath), getPath(value, givenPath), getPath(value, familyPath)].join(' ').trim()
  );
}

/**
 * Shared Handlebars helper definitions for use in both server and client contexts.
 * These helpers provide CSP-safe alternatives to lodash template expressions.
 *
 * Usage:
 * - Server: Import and register with Handlebars.registerHelper()
 * - Client: Import and register with Handlebars runtime
 */

/**
 * Preset mapping for locale-aware date formatting.
 * Maps preset names to Luxon's built-in format options.
 */
const dateLocalePresetMap: Record<string, Intl.DateTimeFormatOptions> = {
  DATE_SHORT: DateTime.DATE_SHORT,
  DATE_MED: DateTime.DATE_MED,
  DATE_MED_WITH_WEEKDAY: DateTime.DATE_MED_WITH_WEEKDAY,
  DATE_FULL: DateTime.DATE_FULL,
  DATE_HUGE: DateTime.DATE_HUGE,
  TIME_SIMPLE: DateTime.TIME_SIMPLE,
  TIME_WITH_SECONDS: DateTime.TIME_WITH_SECONDS,
  TIME_WITH_SHORT_OFFSET: DateTime.TIME_WITH_SHORT_OFFSET,
  TIME_WITH_LONG_OFFSET: DateTime.TIME_WITH_LONG_OFFSET,
  TIME_24_SIMPLE: DateTime.TIME_24_SIMPLE,
  TIME_24_WITH_SECONDS: DateTime.TIME_24_WITH_SECONDS,
  TIME_24_WITH_SHORT_OFFSET: DateTime.TIME_24_WITH_SHORT_OFFSET,
  TIME_24_WITH_LONG_OFFSET: DateTime.TIME_24_WITH_LONG_OFFSET,
  DATETIME_SHORT: DateTime.DATETIME_SHORT,
  DATETIME_MED: DateTime.DATETIME_MED,
  DATETIME_FULL: DateTime.DATETIME_FULL,
  DATETIME_HUGE: DateTime.DATETIME_HUGE,
  DATETIME_SHORT_WITH_SECONDS: DateTime.DATETIME_SHORT_WITH_SECONDS,
  DATETIME_MED_WITH_SECONDS: DateTime.DATETIME_MED_WITH_SECONDS,
  DATETIME_FULL_WITH_SECONDS: DateTime.DATETIME_FULL_WITH_SECONDS,
  DATETIME_HUGE_WITH_SECONDS: DateTime.DATETIME_HUGE_WITH_SECONDS,
};

export const dateModifyOperations = ['startOf', 'endOf', 'plus'] as const;
export const dateModifyShiftUnits = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
  'millisecond',
] as const;
export const dateModifyPlusUnits = [
  'years',
  'quarters',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
  'milliseconds',
] as const;

function isIn<T>(values: readonly T[], x: any): x is T {
  return values.includes(x);
}

/**
 * Helper function definitions that can be registered with Handlebars.
 * Each function is a pure, deterministic helper that does not execute arbitrary code.
 *
 * These functions return an appropriate empty value when given unexpected arguments, instead of throwing an error.
 * Templates can be edited by users, and we want to validate where the user is editing and be able to show the rendered content.
 */
export const handlebarsHelperDefinitions = {
  /**
   * Format a date value using a custom format string.
   * Supports ISO date strings and JavaScript Date instances.
   * Replaces lodash template usage like: ${ DateTime.fromISO(data.date).toFormat('dd/MM/yyyy hh:mm a') }
   *
   * An explicit zone changes the display zone while preserving the instant.
   * Without a zone, existing host-zone formatting is retained.
   * @example {{formatDate lastSaveDate "dd/MM/yyyy hh:mm a" "Australia/Sydney"}}
   */
  formatDate: function (
    dateValue: string | Date,
    formatOrOptions?: string | Record<string, unknown>,
    zoneOrOptions?: string | Record<string, unknown>
  ): string {
    if (!dateValue || isHandlebarsOptionsArg(dateValue)) {
      return '';
    }
    try {
      let dt = dateValue instanceof Date ? DateTime.fromJSDate(dateValue) : DateTime.fromISO(dateValue);
      if (typeof zoneOrOptions === 'string') {
        dt = dt.setZone(zoneOrOptions);
      }
      if (!dt.isValid) {
        return String(dateValue);
      }
      const format = resolveDateFormatArg(formatOrOptions);
      return dt.toFormat(format || 'dd/MM/yyyy hh:mm a');
    } catch {
      return String(dateValue);
    }
  },

  /**
   * Format a date value using locale-aware presets.
   * Supports ISO date strings and JavaScript Date instances.
   *
   * @example {{formatDateLocale lastSaveDate "DATETIME_MED"}}
   */
  formatDateLocale: function (
    dateValue: string | Date,
    presetNameOrOptions?: string | Record<string, unknown>,
    localeOrOptions?: string | Record<string, unknown>
  ): string {
    if (!dateValue || isHandlebarsOptionsArg(dateValue)) {
      return '';
    }
    try {
      let dt = dateValue instanceof Date ? DateTime.fromJSDate(dateValue) : DateTime.fromISO(dateValue);
      if (!dt.isValid) {
        return String(dateValue);
      }

      const presetName = typeof presetNameOrOptions === 'string' ? presetNameOrOptions : undefined;
      const locale = typeof localeOrOptions === 'string' ? localeOrOptions : undefined;

      // Set locale - use provided locale or browser's language
      if (locale) {
        dt = dt.setLocale(locale);
      } else if (typeof navigator !== 'undefined' && navigator.language) {
        dt = dt.setLocale(navigator.language);
      }

      const preset = dateLocalePresetMap[presetName || 'DATETIME_MED'];
      return dt.toLocaleString(preset);
    } catch {
      return String(dateValue);
    }
  },

  /**
   * Parse a date string (pass-through for chaining).
   *
   * @example {{parseDateString dateString}}
   */
  parseDateString: function (dateString: string): string {
    if (isHandlebarsOptionsArg(dateString)) {
      return '';
    }
    return dateString || '';
  },

  /**
   * Modify a date by adding the provided time units, or setting to the start or end of the given time unit.
   * Returns the date value unchanged or empty string if the call was not valid.
   * @param args The date value to modify.
   *    Then the 'plus' operation duration, or the operation name, or the handlebars options.
   *    Then the operation duration, or operation unit, or handlebars options.
   */
  dateModify: function (...args: unknown[]): string {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }

    const failResult = args.length > 0 && typeof args[0] === 'string' ? args[0] : '';
    try {
      const dt =
        args.length > 0 && typeof args[0] === 'string'
          ? DateTime.fromISO(args[0])
          : args[0] instanceof Date
            ? DateTime.fromJSDate(args[0])
            : DateTime.invalid('no date value provided');

      if (!dt.isValid) {
        return String(failResult);
      }

      const secondParamIsOperation =
        args.length > 1 && typeof args[1] === 'string' && isIn(dateModifyOperations, args[1]);
      const operation =
        args.length > 1 && typeof args[1] === 'string' && isIn(dateModifyOperations, args[1]) ? args[1] : 'plus';

      switch (operation) {
        case 'plus':
          const durationItems = secondParamIsOperation ? args.slice(2) : args.slice(1);
          const opts = Object.fromEntries(
            durationItems
              .map((val, index, arr) => {
                if (index % 2 !== 0) {
                  return null;
                }
                const key = typeof val === 'string' && isIn(dateModifyPlusUnits, val) ? val : null;
                if (!key) {
                  return null;
                }
                return [key, arr[index + 1]];
              })
              .filter(i => i !== null)
          );
          return Object.keys(opts).length > 0 ? dt.plus(opts).toISO() : failResult;

        case 'startOf':
          if (args.length >= 3 && isIn(dateModifyShiftUnits, args[2])) {
            return dt.startOf(args[2]).toISO();
          }
          return failResult;
        case 'endOf':
          if (args.length >= 3 && isIn(dateModifyShiftUnits, args[2])) {
            return dt.endOf(args[2]).toISO();
          }
          return failResult;
        default:
          const _: never = operation;
          return failResult;
      }
    } catch {
      return failResult;
    }
  },

  /**
   * Get a nested property from an object using dot notation.
   * Replaces lodash template usage like: ${ _.get(data, 'metadata.contributor_ci', '') }
   *
   * @example {{get this "metadata.contributor_ci.text_full_name"}}
   */
  get: function (obj: unknown, path: string, defaultValue?: unknown): unknown {
    if (isHandlebarsOptionsArg(obj) || isHandlebarsOptionsArg(path)) {
      return '';
    }
    if (isHandlebarsOptionsArg(defaultValue)) {
      defaultValue = null;
    }
    return _get(obj, path, defaultValue ?? '');
  },

  /**
   * Check if a value is empty (null, undefined, empty string, empty array, empty object).
   *
   * @example {{#if (isEmpty value)}}empty{{/if}}
   */
  isEmpty: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return true;
    }
    return _isEmpty(value);
  },

  /**
   * Check if a value is undefined.
   *
   * @example {{#if (isUndefined value)}}undefined{{/if}}
   */
  isUndefined: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return true;
    }
    return _isUndefined(value);
  },

  /**
   * Check if a value is null.
   *
   * @example {{#if (isNull value)}}null{{/if}}
   */
  isNull: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return false;
    }
    return _isNull(value);
  },

  /**
   * Check if a value is defined (not undefined and not null).
   *
   * @example {{#if (isDefined value)}}defined{{/if}}
   */
  isDefined: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return false;
    }
    return !_isUndefined(value) && !_isNull(value);
  },

  /**
   * Check if a value is an array.
   *
   * @example {{#if (isArray value)}}is array{{/if}}
   */
  isArray: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return false;
    }
    return _isArray(value);
  },

  /**
   * Check if a value is a plain object.
   *
   * @example {{#if (isObject value)}}is object{{/if}}
   */
  isObject: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return false;
    }
    return _isPlainObject(value);
  },

  /**
   * Strict equality comparison.
   *
   * @example {{#if (eq status "active")}}active{{/if}}
   */
  eq: function (a: unknown, b: unknown): boolean {
    if (isHandlebarsOptionsArg(a) || isHandlebarsOptionsArg(b)) {
      return false;
    }
    return a === b;
  },

  /**
   * Not equal comparison.
   *
   * @example {{#if (ne status "inactive")}}not inactive{{/if}}
   */
  ne: function (a: unknown, b: unknown): boolean {
    if (isHandlebarsOptionsArg(a) || isHandlebarsOptionsArg(b)) {
      return true;
    }
    return a !== b;
  },

  /**
   * Logical AND - returns true if all arguments are truthy.
   * Note: The last argument is the Handlebars options hash, which is removed.
   *
   * @example {{#if (and condition1 condition2)}}both true{{/if}}
   */
  and: function (...args: unknown[]): boolean {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }
    return args.length > 0 && args.every(Boolean);
  },

  /**
   * Logical OR - returns true if any argument is truthy.
   * Note: The last argument is the Handlebars options hash, which is removed.
   *
   * @example {{#if (or condition1 condition2)}}at least one true{{/if}}
   */
  or: function (...args: unknown[]): boolean {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }
    return args.length > 0 && args.some(Boolean);
  },

  /**
   * Logical NOT - returns true if value is falsy.
   *
   * @example {{#if (not condition)}}condition is false{{/if}}
   */
  not: function (value: unknown): boolean {
    if (isHandlebarsOptionsArg(value)) {
      return true;
    }
    return !value;
  },

  /**
   * Greater than comparison.
   * Returns false if the comparison cannot be performed.
   *
   * @example {{#if (gt count 0)}}has items{{/if}}
   */
  gt: function (a: unknown, b: unknown): boolean {
    if (isHandlebarsOptionsArg(a) || isHandlebarsOptionsArg(b)) {
      return false;
    }
    const aNum = Number(a);
    const bNum = Number(b);
    return !Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum > bNum;
  },

  /**
   * Greater than or equal comparison.
   * Returns false if the comparison cannot be performed.
   *
   * @example {{#if (gte count 1)}}at least one{{/if}}
   */
  gte: function (a: unknown, b: unknown): boolean {
    if (isHandlebarsOptionsArg(a) || isHandlebarsOptionsArg(b)) {
      return false;
    }
    const aNum = Number(a);
    const bNum = Number(b);
    return !Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum >= bNum;
  },

  /**
   * Less than comparison.
   * Returns false if the comparison cannot be performed.
   *
   * @example {{#if (lt count 10)}}less than ten{{/if}}
   */
  lt: function (a: unknown, b: unknown): boolean {
    if (isHandlebarsOptionsArg(a) || isHandlebarsOptionsArg(b)) {
      return false;
    }
    const aNum = Number(a);
    const bNum = Number(b);
    return !Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum < bNum;
  },

  /**
   * Less than or equal comparison.
   * Returns false if the comparison cannot be performed.
   *
   * @example {{#if (lte count 10)}}ten or less{{/if}}
   */
  lte: function (a: unknown, b: unknown): boolean {
    if (isHandlebarsOptionsArg(a) || isHandlebarsOptionsArg(b)) {
      return false;
    }
    const aNum = Number(a);
    const bNum = Number(b);
    return !Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum <= bNum;
  },

  /**
   * Trim leading/trailing whitespace from a string value.
   * Returns input value converted to a string for non-string input.
   *
   * @example {{trim title}}
   */
  trim: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    return String(value ?? '').trim();
  },

  /**
   * Trim leading and trailing whitespace from each string item in an array.
   * @example {{trimArray ['  value ', 0]}} -> ['value', 0]
   * @example {{trimArray {aProp: ['value']}}} -> {aProp: ['value']}
   * @param value
   */
  trimArray: function (value: unknown): string[] | unknown {
    if (isHandlebarsOptionsArg(value)) {
      return [];
    }
    return Array.isArray(value) ? value.map(item => (typeof item === 'string' ? item.trim() : item)) : value;
  },

  /**
   * Convert a value to lowercase text.
   * Returns input value converted to a string for non-string input.
   *
   * @example {{toLower value}}
   */
  toLower: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    return String(value ?? '').toLowerCase();
  },

  /**
   * Convert a value to uppercase text.
   * Returns input value converted to a string for non-string input.
   *
   * @example {{toUpper value}}
   */
  toUpper: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    return String(value ?? '').toUpperCase();
  },

  /**
   * Translation helper - looks up translation from context.translationService.
   * The translation service must be provided in the template context.
   *
   * @example {{t "label.title"}}
   */
  t: function (this: { translationService?: { t: (key: string) => string } }, key: string): string {
    if (isHandlebarsOptionsArg(key)) {
      return '';
    }
    const translationService = this?.translationService;
    if (translationService && typeof translationService.t === 'function') {
      return translationService.t(key);
    }
    return key;
  },

  /**
   * Join array elements with a separator.
   *
   * @example {{join items ", "}}
   */
  join: function (arr: unknown[], separator?: string): string {
    if (!_isArray(arr)) {
      return '';
    }

    if (isHandlebarsOptionsArg(separator) || separator === null) {
      separator = undefined;
    }
    return arr.join(separator);
  },

  /**
   * Extract one or more properties from each item in an array using dot notation.
   * Replaces lodash usage like: _.map(creators, c => c.email).
   * Returns an empty array for non-array input. Combine with {{join}} to
   * build a delimited string, e.g. {{join (pluck creators "email") ","}}.
   *
   * For one property, returns an array of the property values.
   * For more than one property, returns an array of arrays containing the specified property values in the same order.
   *
   * @example {{join (pluck record.metadata.creators "email") ","}}
   */
  pluck: function (...args: unknown[]): unknown[] {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }
    if (args.length === 0 || !_isArray(args[0])) {
      return [];
    }
    const arr = args[0];

    if (args.length === 1) {
      return [];
    }
    const paths = args.slice(1).map(String);

    if (paths.length === 1) {
      return arr.map(item => _get(item, paths[0], ''));
    }
    return arr.map(item => paths.map(path => _get(item, path, '')));
  },

  /**
   * Return part of a string using slice semantics.
   *
   * @example {{substring notation 0 6}}
   */
  substring: function (value: unknown, start: number, end?: number): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    const text = String(value ?? '');

    if (isHandlebarsOptionsArg(start)) {
      return text;
    }
    const from = Number(start);

    const to = end === undefined || end === null || isHandlebarsOptionsArg(start) ? undefined : Number(end);
    // Use slice semantics so negative offsets work (e.g. -1 for last char, -6 for trailing code).
    // String.prototype.substring() clamps negatives to 0 and cannot express this.
    return text.slice(Number.isNaN(from) ? 0 : from, Number.isNaN(to as number) ? undefined : to);
  },

  /**
   * Split a string into parts, or return one part if index is provided.
   * Supports negative index values, where -1 is the last part.
   *
   * @example {{split notation "/" -1}}
   */
  split: function (value: unknown, separator: string, index?: number): unknown {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    const text = String(value ?? '');

    if (isHandlebarsOptionsArg(separator)) {
      return text;
    }
    const parts = text.split(String(separator ?? ''));
    if (index === undefined || index === null || isHandlebarsOptionsArg(index)) {
      return parts;
    }
    const parsedIndex = Number(index);
    if (Number.isNaN(parsedIndex)) {
      return '';
    }
    const normalizedIndex = parsedIndex < 0 ? parts.length + parsedIndex : parsedIndex;
    if (normalizedIndex < 0 || normalizedIndex >= parts.length) {
      return '';
    }
    return parts[normalizedIndex];
  },

  /**
   * Encode user-controlled URL path values while preserving path separators.
   * Trailing slashes are trimmed so prefixed paths can be safely concatenated.
   *
   * @example {{urlEncode oid}}
   */
  urlEncode: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }

    const rawText = String(value ?? '');
    if (!rawText) {
      return '';
    }

    let endIndex = rawText.length;
    while (endIndex > 0 && rawText[endIndex - 1] === '/') {
      endIndex--;
    }

    const text = rawText.slice(0, endIndex);
    if (!text) {
      return '';
    }

    return text
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
  },

  /**
   * Concatenate strings.
   * Note: The last argument is the Handlebars options hash, which is removed.
   *
   * @example {{concat prefix value suffix}}
   */
  concat: function (...args: unknown[]): string {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }
    return args.map(String).join('');
  },

  /**
   * Default value if the primary value is empty/falsy.
   *
   * @example {{default title "Untitled"}}
   */
  default: function (value: unknown, defaultValue: unknown): unknown {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    if (isHandlebarsOptionsArg(defaultValue)) {
      defaultValue = '';
    }
    return value || defaultValue;
  },

  /**
   * Convert markdown to HTML when output format is markdown, otherwise pass HTML through.
   * Note: This helper does not sanitize HTML output, we are currently only using it on the client side with Angular's DomSanitizer to ensure safe usage.
   * Do not use this helper with untrusted content in a server-side context without proper sanitization (see DOMSanitizerService as a way to sanitize the HTML on the server side).
   *
   * @example {{{markdownToHtml content outputFormat}}}
   */
  markdownToHtml: function (value: unknown, outputFormat?: string): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }

    const input = String(value ?? '');
    if (!input) {
      return '';
    }
    if (outputFormat === 'markdown') {
      const parser = resolveMarkedParser();
      if (parser) {
        return parser(input);
      }
    }
    return input;
  },

  /**
   * Render plain text as escaped HTML while preserving line breaks.
   *
   * @example {{{plaintextToHtml content}}}
   */
  plaintextToHtml: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    return escapeHtmlText(value).replace(/\r\n|\r|\n/g, '<br>');
  },

  /**
   * JSON stringify a value (useful for debugging).
   *
   * @example {{json data}}
   */
  json: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  },

  /**
   * Render metadata values into nested HTML suitable for generated view-only display.
   *
   * @example {{{renderMetadataValue metadata.someField}}}
   */
  renderMetadataValue: function (value: unknown): string {
    if (isHandlebarsOptionsArg(value)) {
      return '';
    }
    return renderMetadataValue(value);
  },

  /**
   * Build a view-mode download URL for a file upload attachment value.
   *
   * @example {{attachmentDownloadUrl this oid branding portal}}
   */
  attachmentDownloadUrl: function (attachment: unknown, oid: unknown, branding: unknown, portal: unknown): string {
    if (isHandlebarsOptionsArg(attachment)) {
      return '';
    }
    oid = isHandlebarsOptionsArg(oid) ? '' : oid;
    branding = isHandlebarsOptionsArg(branding) ? '' : branding;
    portal = isHandlebarsOptionsArg(portal) ? '' : portal;
    return buildAttachmentDownloadUrl(attachment, oid, branding, portal);
  },

  /**
   * Convert a value with an unknown type to an array.
   * With one value, ensures it is an array.
   * With more than one value, returns all values in an array.
   * Does not flatten nested arrays.
   *
   * @example {{asArray ['value']}} -> ['value]
   * @example {{asArray 'value'}} -> ['value']
   * @example {{asArray {aProp: 'value'} null 0 ['value']}} -> [{aProp: 'value'}, null, 0, ['value']]
   * @param args The values to get as an array.
   */
  asArray: function (...args: unknown[]): unknown[] {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }
    if (args.length === 0) {
      return [];
    }
    if (args.length === 1) {
      return Array.isArray(args[0]) ? args[0] : [args[0]];
    }

    return args;
  },

  /**
   * Convert a value with an unknown type to an array.
   * With one value, ensures it is an array.
   * With more than one value, returns all values in an array.
   * Flattens nested arrays to depth 1. Use multiple times to flatten deeply nested arrays.
   *
   * @example {{flattenArray ['value']}} -> ['value]
   * @example {{flattenArray 'value'}} -> ['value']
   * @example {{flattenArray {aProp: 'value'} null 0 ['value']}} -> [{aProp: 'value'}, null, 0, 'value']
   * @example {{flattenArray {aProp: 'value'} null 0 [['value']]}} -> [{aProp: 'value'}, null, 0, ['value']]
   * @example {{flattenArray [{aProp: 'value'} null 0 ['value']]}} -> [{aProp: 'value'}, null, 0, 'value']
   * @param args
   */
  flattenArray: function (...args: unknown[]): unknown[] {
    if (args.length > 0 && isHandlebarsOptionsArg(args[args.length - 1])) {
      args.pop();
    }
    if (args.length === 0) {
      return [];
    }
    if (args.length === 1 && Array.isArray(args[0])) {
      return args[0].flat(1);
    }
    return args.flat(1);
  },

  /**
   * Remove undefined, null, and empty trimmed strings from an array.
   * When provided a non-array value, returns it unchanged.
   *
   * @example {{filterArray ['one', '  ', undefined, null, {}]}} -> ['one', {}]
   * @example {{filterArray undefined}} -> undefined
   * @param value The array to filter.
   */
  filterArray: function (value: unknown): unknown[] | unknown {
    if (isHandlebarsOptionsArg(value)) {
      value = [];
    }
    return Array.isArray(value)
      ? value.filter(item => {
          if (typeof item == 'string' && !item.trim()) {
            return false;
          }
          return !(item === undefined || item === null);
        })
      : value;
  },

  /**
   * Build a display name from a contributor object.
   * Returns empty string if the value is not a plain object.
   * The provided path options will be checked in order, and the first that has a truthy value will be used.
   * @example {{displayName {text_full_name: 'My Name'} }} -> 'My Name'
   * @example {{displayName {given_name: 'given', family_name: 'family'} }} -> 'given family'
   * @param value Contributor object.
   * @param fullOrOptions Paths to use as full name.
   * @param honorificOrOptions Paths to use as honorific.
   * @param givenOrOptions Paths to use as given name.
   * @param familyOrOptions Paths to use as family name.
   */
  displayName: function (
    value: unknown,
    fullOrOptions?: string[],
    honorificOrOptions?: string[],
    givenOrOptions?: string[],
    familyOrOptions?: string[]
  ): string {
    if (isHandlebarsOptionsArg(value)) {
      value = {};
    }
    return contributorDisplayName(value, fullOrOptions, honorificOrOptions, givenOrOptions, familyOrOptions);
  },

  /**
   * Build a display name from a contributor object for each item in an array.
   * Returns empty string if the value is not a plain object.
   * The provided path options will be checked in order, and the first that has a truthy value will be used.
   * @example {{displayNameArray [{text_full_name: 'My Name'}] }} -> ['My Name']
   * @example {{displayNameArray [{given_name: 'given', family_name: 'family'}] }} -> ['given family']
   * @param value Array of contributor objects.
   * @param fullOrOptions Paths to use as full name.
   * @param honorificOrOptions Paths to use as honorific.
   * @param givenOrOptions Paths to use as given name.
   * @param familyOrOptions Paths to use as family name.
   */
  displayNameArray: function (
    value: unknown,
    fullOrOptions?: string[],
    honorificOrOptions?: string[],
    givenOrOptions?: string[],
    familyOrOptions?: string[]
  ): string[] | unknown {
    if (isHandlebarsOptionsArg(value)) {
      value = [];
    }
    return Array.isArray(value)
      ? value.map(item =>
          contributorDisplayName(item, fullOrOptions, honorificOrOptions, givenOrOptions, familyOrOptions)
        )
      : value;
  },

  /**
   * Create a new array with items case-insensitive sorted order.
   * A non-array argument is returned without changes.
   * @example {{sort ['value2', 'value1']}} -> ['value1', 'value2']
   * @example {{sort {text_full_name: 'My Name'} }} -> {text_full_name: 'My Name'}
   * @param value
   */
  sort: function (value: unknown): any[] | unknown {
    if (isHandlebarsOptionsArg(value)) {
      value = [];
    }
    return Array.isArray(value)
      ? value.toSorted((a, b) => String(a).localeCompare(String(b), undefined, { ignorePunctuation: true }))
      : value;
  },

  /**
   * Remove duplicate strings from an array.
   * Non-string duplicate entries are kept.
   * A non-array is returned without changes.
   * @param value
   */
  unique: function (value: unknown): string[] | unknown {
    if (isHandlebarsOptionsArg(value)) {
      value = [];
    }
    return Array.isArray(value)
      ? value.filter((item, index, arr) => (typeof item === 'string' ? arr.indexOf(item) === index : true))
      : value;
  },
};

/**
 * A class to encapsulate the Handlebars registerHelper calls
 * and ensure they happen exactly once.
 */
class HandlebarsRegisterHelper {
  static #isSetupDone: boolean = false;
  constructor() {
    if (HandlebarsRegisterHelper.#isSetupDone) {
      return;
    }

    for (const [name, fn] of Object.entries(handlebarsHelperDefinitions)) {
      Handlebars.registerHelper(name, fn);
    }

    HandlebarsRegisterHelper.#isSetupDone = true;
  }

  get instance() {
    return Handlebars;
  }
}

/**
 * Register Handlebars helpers for use in dashboard and report templates.
 * Uses shared helpers from sails-ng-common for consistency between server and client.
 */
export function handlebarsInstance() {
  return new HandlebarsRegisterHelper().instance;
}

/**
 * Pre-compile a handlebars template.
 * @param input The template to compile.
 * @param options The compile options.
 */
export function handlebarsPrecompile(input: unknown, options?: PrecompileOptions): TemplateSpecification {
  const instance = handlebarsInstance();
  const value = normaliseVisual(input);
  return instance.precompile(value, options);
}

/**
 * Get a compiled handlebars template.
 * @param input The template to compile.
 * @param options The compile options.
 */
export function handlebarsCompile(input: unknown, options?: CompileOptions): HandlebarsTemplateDelegate {
  const instance = handlebarsInstance();
  const value = normaliseVisual(input);
  return instance.compile(value, options);
}

/**
 * Render a pre-compiled handlebars template.
 * @param precompilation The pre-compiled template.
 */
export function handlebarsTemplate(precompilation: TemplateSpecification): HandlebarsTemplateDelegate {
  const instance = handlebarsInstance();
  return instance.template(precompilation);
}
