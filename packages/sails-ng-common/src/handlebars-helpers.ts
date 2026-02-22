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
} from 'lodash';

/**
 * Marked is an ESM module so cannot be imported synchronously in a CommonJS context. 
 * We use dynamic import to load it when needed, and cache the parser function for future use. If the module cannot be loaded, the markdownToHtml helper will simply return the input string unmodified.
 */
let cachedMarkedParser: ((value: string) => string) | null | undefined;

void import('marked')
    .then((markedModule) => {
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
     * Format an ISO date string using a custom format string.
     * Replaces lodash template usage like: ${ DateTime.fromISO(data.date).toFormat('dd/MM/yyyy hh:mm a') }
     * 
     * @example {{formatDate lastSaveDate "dd/MM/yyyy hh:mm a"}}
     */
    formatDate: function (dateString: string, format?: string): string {
        if (!dateString) {
            return '';
        }
        try {
            const dt = DateTime.fromISO(dateString);
            if (!dt.isValid) {
                return dateString;
            }
            return dt.toFormat(format || 'dd/MM/yyyy hh:mm a');
        } catch {
            return dateString;
        }
    },

    /**
     * Format an ISO date string using locale-aware presets.
     * 
     * @example {{formatDateLocale lastSaveDate "DATETIME_MED"}}
     */
    formatDateLocale: function (dateString: string, presetName?: string, locale?: string): string {
        if (!dateString) {
            return '';
        }
        try {
            let dt = DateTime.fromISO(dateString);
            if (!dt.isValid) {
                return dateString;
            }

            // Set locale - use provided locale or browser's language
            if (locale) {
                dt = dt.setLocale(locale);
            } else if (typeof navigator !== 'undefined' && navigator.language) {
                dt = dt.setLocale(navigator.language);
            }

            const preset = dateLocalePresetMap[presetName || 'DATETIME_MED'];
            return dt.toLocaleString(preset);
        } catch {
            return dateString;
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
