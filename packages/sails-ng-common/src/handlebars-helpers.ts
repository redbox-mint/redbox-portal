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
import {
  get as _get,
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
  isNull as _isNull,
  isArray as _isArray,
  isPlainObject as _isPlainObject,
} from 'lodash';

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
function mapMomentToLuxonFormat(fmt: string): string {
  if (!fmt) {
    return fmt;
  }

  return fmt
    .replace(/YYYY/g, 'yyyy')
    .replace(/YY/g, 'yy')
    .replace(/MMMM/g, 'LLLL')
    .replace(/MMM/g, 'LLL')
    .replace(/\bMM\b/g, 'LL')
    .replace(/\bM\b/g, 'L')
    .replace(/\bDD\b/g, 'dd')
    .replace(/\bD\b/g, 'd')
    .replace(/dddd/g, 'cccc')
    .replace(/ddd/g, 'ccc')
    .replace(/\bHH\b/g, 'HH')
    .replace(/\bH\b/g, 'H')
    .replace(/\bhh\b/g, 'hh')
    .replace(/\bh\b/g, 'h')
    .replace(/\bmm\b/g, 'mm')
    .replace(/\bm\b/g, 'm')
    .replace(/\bss\b/g, 'ss')
    .replace(/\bs\b/g, 's')
    .replace(/A/g, 'a');
}

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

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  return escapeHtml(value);
}

function renderMetadataObjectEntries(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '<em class="text-muted">—</em>';
  }

  const rows = entries
    .map(([key, entryValue]) => {
      return `<div class="rb-view-metadata__nested-row"><div class="rb-view-metadata__nested-key">${escapeHtml(key)}</div><div class="rb-view-metadata__nested-value">${renderMetadataValue(entryValue)}</div></div>`;
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

  const headerHtml = columns.map(key => `<th>${escapeHtml(key)}</th>`).join('');
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
    const items = value.map(entry => `<li>${escapeHtml(entry)}</li>`).join('');
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
export const dateLocalePresetMap: Record<string, Intl.DateTimeFormatOptions> = {
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

/**
 * Helper function definitions that can be registered with Handlebars.
 * Each function is a pure, deterministic helper that does not execute arbitrary code.
 */
export const handlebarsHelperDefinitions = {
  /**
   * Format a date value using a custom format string.
   * Supports ISO date strings and JavaScript Date instances.
   * Replaces lodash template usage like: ${ DateTime.fromISO(data.date).toFormat('dd/MM/yyyy hh:mm a') }
   *
   * @example {{formatDate lastSaveDate "dd/MM/yyyy hh:mm a"}}
   */
  formatDate: function (dateValue: string | Date, formatOrOptions?: string | Record<string, unknown>): string {
    if (!dateValue) {
      return '';
    }
    try {
      const dt = dateValue instanceof Date ? DateTime.fromJSDate(dateValue) : DateTime.fromISO(dateValue);
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
    if (!dateValue) {
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
    return dateString || '';
  },

  /**
   * Get a nested property from an object using dot notation.
   * Replaces lodash template usage like: ${ _.get(data, 'metadata.contributor_ci', '') }
   *
   * @example {{get this "metadata.contributor_ci.text_full_name"}}
   */
  get: function (obj: unknown, path: string, defaultValue?: unknown): unknown {
    return _get(obj, path, defaultValue ?? '');
  },

  /**
   * Check if a value is empty (null, undefined, empty string, empty array, empty object).
   *
   * @example {{#if (isEmpty value)}}empty{{/if}}
   */
  isEmpty: function (value: unknown): boolean {
    return _isEmpty(value);
  },

  /**
   * Check if a value is undefined.
   *
   * @example {{#if (isUndefined value)}}undefined{{/if}}
   */
  isUndefined: function (value: unknown): boolean {
    return _isUndefined(value);
  },

  /**
   * Check if a value is null.
   *
   * @example {{#if (isNull value)}}null{{/if}}
   */
  isNull: function (value: unknown): boolean {
    return _isNull(value);
  },

  /**
   * Check if a value is defined (not undefined and not null).
   *
   * @example {{#if (isDefined value)}}defined{{/if}}
   */
  isDefined: function (value: unknown): boolean {
    return !_isUndefined(value) && !_isNull(value);
  },

  /**
   * Check if a value is an array.
   *
   * @example {{#if (isArray value)}}is array{{/if}}
   */
  isArray: function (value: unknown): boolean {
    return _isArray(value);
  },

  /**
   * Check if a value is a plain object.
   *
   * @example {{#if (isObject value)}}is object{{/if}}
   */
  isObject: function (value: unknown): boolean {
    return _isPlainObject(value);
  },

  /**
   * Strict equality comparison.
   *
   * @example {{#if (eq status "active")}}active{{/if}}
   */
  eq: function (a: unknown, b: unknown): boolean {
    return a === b;
  },

  /**
   * Not equal comparison.
   *
   * @example {{#if (ne status "inactive")}}not inactive{{/if}}
   */
  ne: function (a: unknown, b: unknown): boolean {
    return a !== b;
  },

  /**
   * Logical AND - returns true if all arguments are truthy.
   * Note: The last argument is the Handlebars options hash, which is removed.
   *
   * @example {{#if (and condition1 condition2)}}both true{{/if}}
   */
  and: function (...args: unknown[]): boolean {
    // Remove the Handlebars options hash (last argument)
    args.pop();
    return args.every(Boolean);
  },

  /**
   * Logical OR - returns true if any argument is truthy.
   * Note: The last argument is the Handlebars options hash, which is removed.
   *
   * @example {{#if (or condition1 condition2)}}at least one true{{/if}}
   */
  or: function (...args: unknown[]): boolean {
    // Remove the Handlebars options hash (last argument)
    args.pop();
    return args.some(Boolean);
  },

  /**
   * Logical NOT - returns true if value is falsy.
   *
   * @example {{#if (not condition)}}condition is false{{/if}}
   */
  not: function (value: unknown): boolean {
    return !value;
  },

  /**
   * Greater than comparison.
   *
   * @example {{#if (gt count 0)}}has items{{/if}}
   */
  gt: function (a: unknown, b: unknown): boolean {
    return Number(a) > Number(b);
  },

  /**
   * Greater than or equal comparison.
   *
   * @example {{#if (gte count 1)}}at least one{{/if}}
   */
  gte: function (a: unknown, b: unknown): boolean {
    return Number(a) >= Number(b);
  },

  /**
   * Less than comparison.
   *
   * @example {{#if (lt count 10)}}less than ten{{/if}}
   */
  lt: function (a: unknown, b: unknown): boolean {
    return Number(a) < Number(b);
  },

  /**
   * Less than or equal comparison.
   *
   * @example {{#if (lte count 10)}}ten or less{{/if}}
   */
  lte: function (a: unknown, b: unknown): boolean {
    return Number(a) <= Number(b);
  },

  /**
   * Trim leading/trailing whitespace from a string value.
   *
   * @example {{trim title}}
   */
  trim: function (value: unknown): string {
    return String(value ?? '').trim();
  },

  /**
   * Translation helper - looks up translation from context.translationService.
   * The translation service must be provided in the template context.
   *
   * @example {{t "label.title"}}
   */
  t: function (this: { translationService?: { t: (key: string) => string } }, key: string): string {
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
    return arr.join(separator ?? ', ');
  },

  /**
   * Return part of a string using slice semantics.
   *
   * @example {{substring notation 0 6}}
   */
  substring: function (value: unknown, start: number, end?: number): string {
    const text = String(value ?? '');
    const from = Number(start);
    const to = end === undefined || end === null ? undefined : Number(end);
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
    const text = String(value ?? '');
    const parts = text.split(String(separator ?? ''));
    if (index === undefined || index === null) {
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
   * Concatenate strings.
   * Note: The last argument is the Handlebars options hash, which is removed.
   *
   * @example {{concat prefix value suffix}}
   */
  concat: function (...args: unknown[]): string {
    // Remove the Handlebars options hash (last argument)
    args.pop();
    return args.map(String).join('');
  },

  /**
   * Default value if the primary value is empty/falsy.
   *
   * @example {{default title "Untitled"}}
   */
  default: function (value: unknown, defaultValue: unknown): unknown {
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
   * JSON stringify a value (useful for debugging).
   *
   * @example {{json data}}
   */
  json: function (value: unknown): string {
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
    return renderMetadataValue(value);
  },
};

/**
 * Type definition for the Handlebars helper functions.
 */
export type HandlebarsHelperDefinitions = typeof handlebarsHelperDefinitions;

/**
 * Register all shared helpers with a Handlebars instance.
 *
 * @param Handlebars The Handlebars instance to register helpers on
 */
export function registerSharedHandlebarsHelpers(Handlebars: {
  registerHelper: (name: string, fn: (...args: any[]) => any) => void;
}): void {
  for (const [name, fn] of Object.entries(handlebarsHelperDefinitions)) {
    Handlebars.registerHelper(name, fn);
  }
}

/**
 * Get the names of all shared helpers.
 */
export function getSharedHandlebarsHelperNames(): string[] {
  return Object.keys(handlebarsHelperDefinitions);
}
