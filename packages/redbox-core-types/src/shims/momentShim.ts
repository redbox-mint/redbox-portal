// A minimal Moment.js-compatible shim powered by Luxon for server-side templates and simple usage.
// Supports: moment(input).format(fmt), where fmt uses Moment tokens; input can be Date | number(ms) | ISO string.
// Note: Luxon tokens differ from Moment; we map common tokens here.

import { DateTime } from 'luxon';

export function mapMomentToLuxonFormat(fmt: string): string {
    if (!fmt) return fmt;
    return fmt
        // years
        .replace(/YYYY/g, 'yyyy').replace(/YY/g, 'yy')
        // months
        .replace(/MMMM/g, 'LLLL').replace(/MMM/g, 'LLL').replace(/\bMM\b/g, 'LL').replace(/\bM\b/g, 'L')
        // days
        .replace(/\bDD\b/g, 'dd').replace(/\bD\b/g, 'd')
        // weekday
        .replace(/dddd/g, 'cccc').replace(/ddd/g, 'ccc')
        // hours/minutes/seconds
        .replace(/\bHH\b/g, 'HH').replace(/\bH\b/g, 'H')
        .replace(/\bhh\b/g, 'hh').replace(/\bh\b/g, 'h')
        .replace(/\bmm\b/g, 'mm').replace(/\bm\b/g, 'm')
        .replace(/\bss\b/g, 'ss').replace(/\bs\b/g, 's')
        // AM/PM
        .replace(/A/g, 'a');
}

function toDateTime(input: Date | number | string): DateTime {
    if (input instanceof Date) return DateTime.fromJSDate(input);
    if (typeof input === 'number') return DateTime.fromMillis(input);
    if (typeof input === 'string') {
        const iso = DateTime.fromISO(input);
        if (iso.isValid) return iso;
        const http = DateTime.fromHTTP(input);
        if (http.isValid) return http;
        const rfc = DateTime.fromRFC2822(input);
        if (rfc.isValid) return rfc;
    }
    return DateTime.invalid('Unparsable date');
}

export function momentShim(input?: Date | number | string) {
    const dt = input ? toDateTime(input) : DateTime.local();
    const api: { format(fmt?: string): string | null } = {
        format(fmt?: string) {
            if (!dt.isValid) return '';
            if (!fmt) return dt.toISO();
            if (fmt === 'L') return dt.toLocaleString(DateTime.DATE_SHORT);
            const mapped = mapMomentToLuxonFormat(fmt);
            return dt.toFormat(mapped);
        }
    };
    return api;
}

export default momentShim;
