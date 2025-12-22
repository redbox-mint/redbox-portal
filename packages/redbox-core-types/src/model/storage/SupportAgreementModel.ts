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
    usedSupportDays: number;
    /** Creation timestamp */
    createdAt?: string;
    /** Last update timestamp */
    updatedAt?: string;
}
