/**
 * SupportAgreementModel.ts
 *
 * Type definitions for the SupportAgreement model.
 */

/**
 * A single release note entry.
 */
export interface ReleaseNoteItem {
    /** Title of the release note */
    title: string;
    /** Date of the release (ISO string or display format) */
    date: string;
    /** Optional URL linking to more details */
    url?: string;
    /** Optional summary/description of the release */
    summary?: string;
}

/**
 * A single timesheet summary entry.
 */
export interface TimesheetSummaryItem {
    /** Description of the work performed */
    summary: string;
    /** Number of days spent */
    days: number;
}

/**
 * The SupportAgreement model.
 * Represents a support agreement for a brand for a specific year.
 */
export interface SupportAgreementModel {
    /** Database ID */
    id?: string;
    /** Foreign key to BrandingConfig */
    branding: string;
    /** The calendar year this agreement covers */
    year: number;
    /** Total support days agreed for this year */
    agreedSupportDays: number;
    /** Array of release notes for this year */
    releaseNotes: ReleaseNoteItem[];
    /** Array of timesheet summary entries */
    timesheetSummary: TimesheetSummaryItem[];
    /** Computed field: sum of timesheetSummary[].days */
    usedSupportDays?: number;
    /** Creation timestamp */
    createdAt?: string;
    /** Last update timestamp */
    updatedAt?: string;
}

/**
 * Utility to calculate the total used support days from a timesheet summary.
 * @param timesheetSummary Array of timesheet summary items.
 * @returns The sum of days.
 */
export function calculateUsedSupportDays(timesheetSummary: TimesheetSummaryItem[] | undefined): number {
    if (!timesheetSummary || !Array.isArray(timesheetSummary)) {
        return 0;
    }
    return timesheetSummary.reduce((total, item) => {
        const days = typeof item.days === 'number' ? item.days : 0;
        return total + days;
    }, 0);
}

/**
 * Validates that the usedSupportDays field matches the computed sum of timesheetSummary.
 * @param agreement The support agreement model to validate.
 * @returns True if valid or if usedSupportDays is not present, false otherwise.
 */
export function validateUsedSupportDays(agreement: SupportAgreementModel): boolean {
    if (agreement.usedSupportDays === undefined || agreement.usedSupportDays === null) {
        return true;
    }
    const computed = calculateUsedSupportDays(agreement.timesheetSummary);
    return Math.abs(agreement.usedSupportDays - computed) < 0.001; // Handle potential float precision issues
}

/**
 * Sanitizes a URL by allowing only http and https schemes.
 * @param url The URL to sanitize.
 * @returns The sanitized URL or undefined if invalid.
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
    if (!url) {
        return undefined;
    }
    const trimmedUrl = url.trim();
    if (trimmedUrl === '') {
        return undefined;
    }
    try {
        // Check for common safe protocols
        const lowerUrl = trimmedUrl.toLowerCase();
        if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
            // Basic validation that it's a valid URL structure
            new URL(trimmedUrl);
            return trimmedUrl;
        }
    } catch (e) {
        // Invalid URL
    }
    return undefined;
}

/**
 * Sanitizes release notes by validating URLs.
 * @param releaseNotes Array of release note items.
 * @returns Sanitized array of release note items.
 */
export function sanitizeReleaseNotes(releaseNotes: ReleaseNoteItem[] | undefined): ReleaseNoteItem[] {
    if (!releaseNotes || !Array.isArray(releaseNotes)) {
        return [];
    }
    return releaseNotes.map(note => ({
        ...note,
        url: sanitizeUrl(note.url)
    }));
}
