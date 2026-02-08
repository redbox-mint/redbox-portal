import { expect } from 'chai';
import { momentShim, mapMomentToLuxonFormat } from '../../src/shims';
import { DateTime } from 'luxon';

describe('momentShim', () => {
    describe('mapMomentToLuxonFormat', () => {
        it('should map year tokens correctly', () => {
            expect(mapMomentToLuxonFormat('YYYY')).to.equal('yyyy');
            expect(mapMomentToLuxonFormat('YY')).to.equal('yy');
        });

        it('should map month tokens correctly', () => {
            expect(mapMomentToLuxonFormat('MMMM')).to.equal('LLLL');
            expect(mapMomentToLuxonFormat('MMM')).to.equal('LLL');
            expect(mapMomentToLuxonFormat('MM')).to.equal('LL');
            expect(mapMomentToLuxonFormat('M')).to.equal('L');
        });

        it('should map day tokens correctly', () => {
            expect(mapMomentToLuxonFormat('DD')).to.equal('dd');
            expect(mapMomentToLuxonFormat('D')).to.equal('d');
        });

        it('should map weekday tokens correctly', () => {
            expect(mapMomentToLuxonFormat('dddd')).to.equal('cccc');
            expect(mapMomentToLuxonFormat('ddd')).to.equal('ccc');
        });

        it('should map AM/PM token correctly', () => {
            expect(mapMomentToLuxonFormat('A')).to.equal('a');
        });

        it('should map a full date format correctly', () => {
            expect(mapMomentToLuxonFormat('YYYY-MM-DD')).to.equal('yyyy-LL-dd');
            expect(mapMomentToLuxonFormat('MMMM D, YYYY')).to.equal('LLLL d, yyyy');
        });

        it('should return undefined for undefined input', () => {
            expect(mapMomentToLuxonFormat(undefined as any)).to.be.undefined;
        });

        it('should return empty string for empty input', () => {
            expect(mapMomentToLuxonFormat('')).to.equal('');
        });
    });

    describe('momentShim()', () => {
        it('should return current date when no input provided', () => {
            const result = momentShim();
            expect(result.format()).to.be.a('string');
            // Result should be valid ISO format
            const dt = DateTime.fromISO(result.format()!);
            expect(dt.isValid).to.be.true;
        });

        it('should accept Date object', () => {
            const date = new Date('2024-01-15T10:30:00Z');
            const result = momentShim(date);
            expect(result.format('YYYY-MM-DD')).to.equal('2024-01-15');
        });

        it('should accept milliseconds', () => {
            const ms = 1705315800000; // 2024-01-15T10:30:00Z
            const result = momentShim(ms);
            expect(result.format('YYYY-MM-DD')).to.equal('2024-01-15');
        });

        it('should accept ISO string', () => {
            const result = momentShim('2024-01-15T10:30:00Z');
            expect(result.format('YYYY-MM-DD')).to.equal('2024-01-15');
        });

        it('should return empty string for invalid date format()', () => {
            const result = momentShim('not-a-date');
            expect(result.format('YYYY-MM-DD')).to.equal('');
        });
    });

    describe('format()', () => {
        const testDate = new Date('2024-01-15T10:30:45Z');

        it('should return ISO format when no format specified', () => {
            const result = momentShim(testDate);
            const formatted = result.format();
            expect(formatted).to.include('2024-01-15');
        });

        it('should format with YYYY-MM-DD', () => {
            const result = momentShim(testDate);
            expect(result.format('YYYY-MM-DD')).to.equal('2024-01-15');
        });

        it('should format with HH:mm:ss', () => {
            const result = momentShim(testDate);
            const expected = DateTime.fromJSDate(testDate).toFormat('HH:mm:ss');
            expect(result.format('HH:mm:ss')).to.equal(expected);
        });

        it('should handle L format (locale date short)', () => {
            const result = momentShim(testDate);
            const formatted = result.format('L');
            expect(formatted).to.be.a('string');
            expect(formatted!.length).to.be.greaterThan(0);
        });
    });
});
