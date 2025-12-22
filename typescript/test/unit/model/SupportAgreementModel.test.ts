import { expect } from 'chai';
import { calculateUsedSupportDays, validateUsedSupportDays, SupportAgreementModel, sanitizeUrl, sanitizeReleaseNotes } from '@researchdatabox/redbox-core-types';

describe('SupportAgreementModel Utilities', function () {
    describe('calculateUsedSupportDays()', function () {
        it('should return 0 for undefined or null input', function () {
            expect(calculateUsedSupportDays(undefined)).to.equal(0);
            expect(calculateUsedSupportDays(null as any)).to.equal(0);
        });

        it('should return 0 for an empty array', function () {
            expect(calculateUsedSupportDays([])).to.equal(0);
        });

        it('should sum days correctly', function () {
            const items = [
                { summary: 'Task 1', days: 2 },
                { summary: 'Task 2', days: 3.5 },
                { summary: 'Task 3', days: 1.25 }
            ];
            expect(calculateUsedSupportDays(items)).to.equal(6.75);
        });

        it('should handle missing or non-number days', function () {
            const items = [
                { summary: 'Task 1', days: 2 },
                { summary: 'Task 2' } as any,
                { summary: 'Task 3', days: 'invalid' } as any
            ];
            expect(calculateUsedSupportDays(items)).to.equal(2);
        });
    });

    describe('validateUsedSupportDays()', function () {
        it('should return true if usedSupportDays is undefined or null', function () {
            const agreement: any = {
                branding: 'test',
                year: 2024,
                agreedSupportDays: 10,
                releaseNotes: [],
                timesheetSummary: [{ summary: 'Task', days: 5 }]
            };
            expect(validateUsedSupportDays(agreement)).to.be.true;
            
            agreement.usedSupportDays = null as any;
            expect(validateUsedSupportDays(agreement)).to.be.true;
        });

        it('should return true if usedSupportDays matches the sum', function () {
            const agreement: SupportAgreementModel = {
                branding: 'test',
                year: 2024,
                agreedSupportDays: 10,
                releaseNotes: [],
                timesheetSummary: [
                    { summary: 'Task 1', days: 2 },
                    { summary: 'Task 2', days: 3 }
                ],
                usedSupportDays: 5
            };
            expect(validateUsedSupportDays(agreement)).to.be.true;
        });

        it('should return false if usedSupportDays does not match the sum', function () {
            const agreement: SupportAgreementModel = {
                branding: 'test',
                year: 2024,
                agreedSupportDays: 10,
                releaseNotes: [],
                timesheetSummary: [
                    { summary: 'Task 1', days: 2 },
                    { summary: 'Task 2', days: 3 }
                ],
                usedSupportDays: 10
            };
            expect(validateUsedSupportDays(agreement)).to.be.false;
        });

        it('should handle float precision', function () {
            const agreement: SupportAgreementModel = {
                branding: 'test',
                year: 2024,
                agreedSupportDays: 10,
                releaseNotes: [],
                timesheetSummary: [
                    { summary: 'Task 1', days: 0.1 },
                    { summary: 'Task 2', days: 0.2 }
                ],
                usedSupportDays: 0.3
            };
            expect(validateUsedSupportDays(agreement)).to.be.true;
        });
    });

    describe('sanitizeUrl()', function () {
        it('should allow http and https URLs', function () {
            expect(sanitizeUrl('http://example.com')).to.equal('http://example.com');
            expect(sanitizeUrl('https://example.com/path?q=1')).to.equal('https://example.com/path?q=1');
        });

        it('should reject javascript: URLs', function () {
            expect(sanitizeUrl('javascript:alert(1)')).to.be.undefined;
        });

        it('should reject data: URLs', function () {
            expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).to.be.undefined;
        });

        it('should reject relative URLs for safety', function () {
            expect(sanitizeUrl('/path/to/resource')).to.be.undefined;
            expect(sanitizeUrl('path/to/resource')).to.be.undefined;
        });

        it('should handle undefined or empty input', function () {
            expect(sanitizeUrl(undefined)).to.be.undefined;
            expect(sanitizeUrl('')).to.be.undefined;
            expect(sanitizeUrl('   ')).to.be.undefined;
        });
    });

    describe('sanitizeReleaseNotes()', function () {
        it('should sanitize URLs in release notes', function () {
            const notes = [
                { title: 'Safe', date: '2024-01-01', url: 'https://safe.com' },
                { title: 'Unsafe', date: '2024-01-02', url: 'javascript:evil()' },
                { title: 'No URL', date: '2024-01-03' }
            ];
            const result = sanitizeReleaseNotes(notes);
            expect(result[0].url).to.equal('https://safe.com');
            expect(result[1].url).to.be.undefined;
            expect(result[2].url).to.be.undefined;
        });
    });
});
