import { handlebarsHelperDefinitions } from '../../src/handlebars-helpers';

describe('Shared Handlebars Helpers', function () {
    let expect: any;

    before(async function () {
        const chai = await import('chai');
        expect = chai.expect;
    });

    describe('formatDate', function () {
        it('should format ISO date with default format', function () {
            // Use a UTC timestamp to avoid timezone issues
            const result = handlebarsHelperDefinitions.formatDate('2023-05-18T01:30:00.000Z');
            // Just verify it returns a formatted date string (not empty or original)
            expect(result).to.match(/\d{2}\/\d{2}\/\d{4}/);
        });

        it('should format ISO date with custom format', function () {
            const result = handlebarsHelperDefinitions.formatDate('2023-05-18T00:00:00.000Z', 'yyyy-MM-dd');
            // Just verify it returns a formatted date string with our format
            expect(result).to.match(/\d{4}-\d{2}-\d{2}/);
        });

        it('should format ISO date with Moment-style custom format', function () {
            const result = handlebarsHelperDefinitions.formatDate('2023-05-18T00:00:00.000Z', 'DD/MM/YYYY');
            expect(result).to.equal('18/05/2023');
        });

        it('should preserve Moment-style time tokens that Luxon already supports', function () {
            const result = handlebarsHelperDefinitions.formatDate('2023-05-18T01:02:03.000Z', 'YYYY-MM-DD HH:mm:ss');
            expect(result).to.match(/^2023-05-18 \d{2}:\d{2}:03$/);
        });

        it('should format Date instances with custom format', function () {
            const result = handlebarsHelperDefinitions.formatDate(new Date('2023-05-18T00:00:00.000Z'), 'yyyy-MM-dd');
            expect(result).to.equal('2023-05-18');
        });

        it('should ignore the Handlebars options argument when no explicit format is provided', function () {
            const result = handlebarsHelperDefinitions.formatDate(
                '2023-05-18T01:30:00.000Z',
                { hash: {}, data: {}, fn: () => '', inverse: () => '' } as unknown as string
            );
            expect(result).to.match(/\d{2}\/\d{2}\/\d{4}/);
        });

        it('should return empty string for empty input', function () {
            const result = handlebarsHelperDefinitions.formatDate('');
            expect(result).to.equal('');
        });

        it('should return original string for invalid date', function () {
            const result = handlebarsHelperDefinitions.formatDate('not-a-date');
            expect(result).to.equal('not-a-date');
        });
    });

    describe('get', function () {
        it('should get nested property', function () {
            const obj = { metadata: { contributor: { name: 'John' } } };
            const result = handlebarsHelperDefinitions.get(obj, 'metadata.contributor.name');
            expect(result).to.equal('John');
        });

        it('should return default value for missing property', function () {
            const obj = { metadata: {} };
            const result = handlebarsHelperDefinitions.get(obj, 'metadata.contributor.name', 'Unknown');
            expect(result).to.equal('Unknown');
        });

        it('should return empty string by default for missing property', function () {
            const obj = { metadata: {} };
            const result = handlebarsHelperDefinitions.get(obj, 'metadata.contributor.name');
            expect(result).to.equal('');
        });
    });

    describe('formatDateLocale', function () {
        it('should format Date instances with locale presets', function () {
            const result = handlebarsHelperDefinitions.formatDateLocale(new Date('2023-05-18T01:30:00.000Z'), 'DATE_SHORT', 'en');
            expect(result).to.be.a('string');
            expect(result).to.not.equal('');
            expect(result).to.not.equal('Invalid Date');
        });

        it('should ignore the Handlebars options argument when preset and locale are omitted', function () {
            const result = handlebarsHelperDefinitions.formatDateLocale(
                new Date('2023-05-18T01:30:00.000Z'),
                { hash: {}, data: {}, fn: () => '', inverse: () => '' } as unknown as string
            );
            expect(result).to.be.a('string');
            expect(result).to.not.equal('');
            expect(result).to.not.equal('Invalid Date');
        });
    });

    describe('isEmpty', function () {
        it('should return true for empty string', function () {
            expect(handlebarsHelperDefinitions.isEmpty('')).to.be.true;
        });

        it('should return true for empty array', function () {
            expect(handlebarsHelperDefinitions.isEmpty([])).to.be.true;
        });

        it('should return true for empty object', function () {
            expect(handlebarsHelperDefinitions.isEmpty({})).to.be.true;
        });

        it('should return false for non-empty string', function () {
            expect(handlebarsHelperDefinitions.isEmpty('hello')).to.be.false;
        });

        it('should return false for non-empty array', function () {
            expect(handlebarsHelperDefinitions.isEmpty([1, 2, 3])).to.be.false;
        });
    });

    describe('isDefined', function () {
        it('should return true for defined value', function () {
            expect(handlebarsHelperDefinitions.isDefined('hello')).to.be.true;
        });

        it('should return true for zero', function () {
            expect(handlebarsHelperDefinitions.isDefined(0)).to.be.true;
        });

        it('should return false for undefined', function () {
            expect(handlebarsHelperDefinitions.isDefined(undefined)).to.be.false;
        });

        it('should return false for null', function () {
            expect(handlebarsHelperDefinitions.isDefined(null)).to.be.false;
        });
    });

    describe('isObject', function () {
        it('should return true for plain objects', function () {
            expect(handlebarsHelperDefinitions.isObject({ key: 'value' })).to.be.true;
        });

        it('should return false for arrays', function () {
            expect(handlebarsHelperDefinitions.isObject(['value'])).to.be.false;
        });

        it('should return false for null', function () {
            expect(handlebarsHelperDefinitions.isObject(null)).to.be.false;
        });
    });

    describe('eq and ne', function () {
        it('should return true for equal values', function () {
            expect(handlebarsHelperDefinitions.eq('a', 'a')).to.be.true;
        });

        it('should return false for unequal values', function () {
            expect(handlebarsHelperDefinitions.eq('a', 'b')).to.be.false;
        });

        it('should return true for unequal values with ne', function () {
            expect(handlebarsHelperDefinitions.ne('a', 'b')).to.be.true;
        });
    });

    describe('and and or', function () {
        it('and should return true if all args are truthy', function () {
            // The last arg is options hash, so we add a dummy
            expect(handlebarsHelperDefinitions.and(true, true, {})).to.be.true;
        });

        it('and should return false if any arg is falsy', function () {
            expect(handlebarsHelperDefinitions.and(true, false, {})).to.be.false;
        });

        it('or should return true if any arg is truthy', function () {
            expect(handlebarsHelperDefinitions.or(false, true, {})).to.be.true;
        });

        it('or should return false if all args are falsy', function () {
            expect(handlebarsHelperDefinitions.or(false, false, {})).to.be.false;
        });
    });

    describe('concat', function () {
        it('should concatenate strings', function () {
            // Last arg is options hash
            const result = handlebarsHelperDefinitions.concat('Hello', ' ', 'World', {});
            expect(result).to.equal('Hello World');
        });
    });

    describe('join', function () {
        it('should join array elements', function () {
            const result = handlebarsHelperDefinitions.join(['a', 'b', 'c'], ', ');
            expect(result).to.equal('a, b, c');
        });

        it('should return empty string for non-array', function () {
            const result = handlebarsHelperDefinitions.join('not an array' as any);
            expect(result).to.equal('');
        });
    });

    describe('substring', function () {
        it('should return sliced substring', function () {
            const result = handlebarsHelperDefinitions.substring('https://linked.data.gov.au/def/anzsrc-for/2020/300101', -6);
            expect(result).to.equal('300101');
        });
    });

    describe('split', function () {
        it('should return a selected segment by index', function () {
            const result = handlebarsHelperDefinitions.split('https://linked.data.gov.au/def/anzsrc-for/2020/300101', '/', -1);
            expect(result).to.equal('300101');
        });

        it('should return all segments when index is omitted', function () {
            const result = handlebarsHelperDefinitions.split('a/b/c', '/');
            expect(result).to.deep.equal(['a', 'b', 'c']);
        });
    });

    describe('default', function () {
        it('should return value if truthy', function () {
            const result = handlebarsHelperDefinitions.default('hello', 'default');
            expect(result).to.equal('hello');
        });

        it('should return default if value is falsy', function () {
            const result = handlebarsHelperDefinitions.default('', 'default');
            expect(result).to.equal('default');
        });
    });

    describe('markdownToHtml', function () {
        it('should convert markdown input when output format is markdown', function () {
            const result = handlebarsHelperDefinitions.markdownToHtml('**bold**', 'markdown');
            expect(result).to.contain('<strong>bold</strong>');
        });

        it('should pass html input through when output format is html', function () {
            const html = '<p><em>hello</em></p>';
            const result = handlebarsHelperDefinitions.markdownToHtml(html, 'html');
            expect(result).to.equal(html);
        });

        it('should return empty string when value is nullish', function () {
            const result = handlebarsHelperDefinitions.markdownToHtml(null, 'markdown');
            expect(result).to.equal('');
        });
    });

    describe('comparison helpers', function () {
        it('gt should return true if first > second', function () {
            expect(handlebarsHelperDefinitions.gt(5, 3)).to.be.true;
            expect(handlebarsHelperDefinitions.gt(3, 5)).to.be.false;
        });

        it('gte should return true if first >= second', function () {
            expect(handlebarsHelperDefinitions.gte(5, 5)).to.be.true;
            expect(handlebarsHelperDefinitions.gte(3, 5)).to.be.false;
        });

        it('lt should return true if first < second', function () {
            expect(handlebarsHelperDefinitions.lt(3, 5)).to.be.true;
            expect(handlebarsHelperDefinitions.lt(5, 3)).to.be.false;
        });

        it('lte should return true if first <= second', function () {
            expect(handlebarsHelperDefinitions.lte(5, 5)).to.be.true;
            expect(handlebarsHelperDefinitions.lte(6, 5)).to.be.false;
        });
    });

    describe('renderMetadataValue', function () {
        it('should render plain objects as nested key-value rows', function () {
            const result = handlebarsHelperDefinitions.renderMetadataValue({
                given: 'Alice',
                family: 'Scott'
            });

            expect(result).to.contain('rb-view-metadata__nested');
            expect(result).to.contain('given');
            expect(result).to.contain('Alice');
            expect(result).to.contain('family');
            expect(result).to.contain('Scott');
        });

        it('should render string arrays as unordered lists', function () {
            const result = handlebarsHelperDefinitions.renderMetadataValue(['one', 'two']);

            expect(result).to.contain('<ul');
            expect(result).to.contain('<li>one</li>');
            expect(result).to.contain('<li>two</li>');
        });

        it('should render arrays of flat objects as tables', function () {
            const result = handlebarsHelperDefinitions.renderMetadataValue([
                { name: 'Alice', role: 'CI' },
                { name: 'Bob', role: 'DM' }
            ]);

            expect(result).to.contain('<table');
            expect(result).to.contain('<th>name</th>');
            expect(result).to.contain('<th>role</th>');
            expect(result).to.contain('<td>Alice</td>');
            expect(result).to.contain('<td>DM</td>');
        });

        it('should render mixed nested arrays recursively', function () {
            const result = handlebarsHelperDefinitions.renderMetadataValue([
                'one',
                { nested: ['two', 'three'] }
            ]);

            expect(result).to.contain('<ul');
            expect(result).to.contain('<li>one</li>');
            expect(result).to.contain('nested');
            expect(result).to.contain('<li>two</li>');
        });
    });
});
