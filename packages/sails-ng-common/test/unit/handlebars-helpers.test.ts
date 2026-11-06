import {
  handlebarsHelperDefinitions,
  escapeHtmlText,
  handlebarsInstance,
  handlebarsPrecompile,
  handlebarsCompile,
  handlebarsTemplate,
} from '../../src';
import { Settings, DateTime } from 'luxon';
import * as sinon from 'sinon';

describe('Shared Handlebars Helpers', async function () {
  let expect: Chai.ExpectStatic;

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
      const result = handlebarsHelperDefinitions.formatDate('2023-05-18T01:30:00.000Z', {
        hash: {},
        data: {},
        fn: () => '',
        inverse: () => '',
      } as unknown as string);
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

    describe('explicit timezone', function () {
      const template = '{{formatDate when "yyyy-MM-dd HH:mm" "Australia/Sydney"}}';
      const cases = [
        ['January AEDT', '2028-01-01T00:01:00.000Z', '2028-01-01 11:01'],
        ['July AEST', '2028-07-01T00:01:00.000Z', '2028-07-01 10:01'],
        ['equivalent offset instant', '2028-01-01T10:01:00+10:00', '2028-01-01 11:01'],
        ['Sydney next day', '2028-01-01T13:30:00.000Z', '2028-01-02 00:30'],
        ['before autumn DST transition', '2028-04-01T15:59:00.000Z', '2028-04-02 02:59'],
        ['after autumn DST transition', '2028-04-01T16:00:00.000Z', '2028-04-02 02:00'],
        ['before spring DST transition', '2028-09-30T15:59:00.000Z', '2028-10-01 01:59'],
        ['after spring DST transition', '2028-09-30T16:00:00.000Z', '2028-10-01 03:00'],
      ];

      for (const [name, input, expected] of cases) {
        it(`renders ${name} identically in different host zones`, function () {
          const priorZone = Settings.defaultZone;
          try {
            for (const hostZone of ['UTC', 'Australia/Adelaide', 'America/New_York']) {
              Settings.defaultZone = hostZone;
              const when = new Date(input);
              const instant = when.getTime();
              expect(handlebarsCompile(template)({ when: input })).to.equal(expected);
              expect(handlebarsCompile(template)({ when })).to.equal(expected);
              expect(when.getTime()).to.equal(instant);
            }
          } finally {
            Settings.defaultZone = priorZone;
          }
        });
      }

      it('keeps no-zone Handlebars calls in their existing host zone', function () {
        const priorZone = Settings.defaultZone;
        try {
          Settings.defaultZone = 'Australia/Adelaide';
          expect(
            handlebarsCompile('{{formatDate when "yyyy-MM-dd HH:mm"}}')({
              when: '2028-01-01T00:01:00.000Z',
            })
          ).to.equal('2028-01-01 10:31');
          Settings.defaultZone = 'UTC';
          expect(
            handlebarsCompile('{{formatDate when}}')({
              when: '2028-01-01T00:01:00.000Z',
            })
          ).to.equal('01/01/2028 12:01 AM');
        } finally {
          Settings.defaultZone = priorZone;
        }
      });

      it('returns the original input for an invalid explicit zone', function () {
        const when = '2028-01-01T00:01:00.000Z';
        expect(handlebarsCompile('{{formatDate when "yyyy-MM-dd HH:mm" "Not/AZone"}}')({ when })).to.equal(when);
      });

      it('preserves empty and invalid input handling with an explicit zone', function () {
        expect(handlebarsCompile(template)({ when: '' })).to.equal('');
        expect(handlebarsCompile(template)({ when: 'not-a-date' })).to.equal('not-a-date');
      });

      it('combines an explicit zone with legacy Moment format tokens', function () {
        expect(
          handlebarsCompile('{{formatDate when "DD/MM/YYYY HH:mm" "Australia/Sydney"}}')({
            when: '2028-01-01T13:30:00.000Z',
          })
        ).to.equal('02/01/2028 00:30');
      });
    });
  });

  describe('escapeHtmlText', function () {
    it('should escape all HTML text context characters', function () {
      const result = escapeHtmlText(`&<>"'`);

      expect(result).to.equal('&amp;&lt;&gt;&quot;&#39;');
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
      const result = handlebarsHelperDefinitions.formatDateLocale(
        new Date('2023-05-18T01:30:00.000Z'),
        'DATE_SHORT',
        'en'
      );
      expect(result).to.be.a('string');
      expect(result).to.not.equal('');
      expect(result).to.not.equal('Invalid Date');
    });

    it('should ignore the Handlebars options argument when preset and locale are omitted', function () {
      const result = handlebarsHelperDefinitions.formatDateLocale(new Date('2023-05-18T01:30:00.000Z'), {
        hash: {},
        data: {},
        fn: () => '',
        inverse: () => '',
      } as unknown as string);
      expect(result).to.be.a('string');
      expect(result).to.not.equal('');
      expect(result).to.not.equal('Invalid Date');
    });
  });

  describe('parseDateString', function () {
    it('should return a string', function () {
      expect(handlebarsHelperDefinitions.parseDateString(undefined as any)).to.equal('');
    });
  });

  describe('dateModify', function () {
    const when = '2023-05-18T01:30:00.000Z';
    const whenDt = DateTime.fromISO(when);
    it('should default to plus operation', function () {
      expect(handlebarsCompile(`{{dateModify when 'days' 3 'months' 1}}`)({ when })).to.equal(
        whenDt.plus({ months: 1, days: 3 }).toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'days' -3}}`)({ when })).to.equal(whenDt.plus({ days: -3 }).toISO());
      expect(handlebarsCompile(`{{dateModify when 'years' 1}}`)({ when })).to.equal(whenDt.plus({ years: 1 }).toISO());
    });
    it('should allow startOf and endOf operations', function () {
      expect(handlebarsCompile(`{{dateModify when 'startOf' 'day'}}`)({ when })).to.equal(
        whenDt.startOf('day').toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'endOf' 'month'}}`)({ when })).to.equal(
        whenDt.endOf('month').toISO()
      );
    });
    it('should return first input if called incorrectly', function () {
      expect(handlebarsCompile(`{{dateModify when}}`)({ when })).to.equal(when);
      expect(handlebarsCompile(`{{dateModify when 'something'}}`)({ when })).to.equal(when);
      expect(handlebarsCompile(`{{dateModify 'plus'}}`)({ when })).to.equal('plus');
      expect(handlebarsCompile(`{{dateModify when 'plus' 'notAUnit' 10}}`)({ when })).to.equal(when);
      expect(handlebarsCompile(`{{dateModify when 'startOf' 'days' 10}}`)({ when })).to.equal(when);
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

  describe('isDefined and isUndefined', function () {
    it('should return true for defined value', function () {
      expect(handlebarsHelperDefinitions.isDefined('hello')).to.be.true;
      expect(handlebarsHelperDefinitions.isUndefined('hello')).to.be.false;
    });

    it('should return true for zero', function () {
      expect(handlebarsHelperDefinitions.isDefined(0)).to.be.true;
      expect(handlebarsHelperDefinitions.isUndefined(0)).to.be.false;
    });

    it('should return false for undefined', function () {
      expect(handlebarsHelperDefinitions.isDefined(undefined)).to.be.false;
      expect(handlebarsHelperDefinitions.isUndefined(undefined)).to.be.true;
    });

    it('should return false for null', function () {
      expect(handlebarsHelperDefinitions.isDefined(null)).to.be.false;
      expect(handlebarsHelperDefinitions.isUndefined(null)).to.be.false;
    });
  });

  describe('isArray', function () {
    it('should return false for plain objects', function () {
      expect(handlebarsHelperDefinitions.isArray({ key: 'value' })).to.be.false;
    });

    it('should return true for arrays', function () {
      expect(handlebarsHelperDefinitions.isArray(['value'])).to.be.true;
    });

    it('should return false for null', function () {
      expect(handlebarsHelperDefinitions.isArray(null)).to.be.false;
    });
  });

  describe('isNull', function () {
    it('should return false for plain objects', function () {
      expect(handlebarsHelperDefinitions.isNull({ key: 'value' })).to.be.false;
    });

    it('should return false for arrays', function () {
      expect(handlebarsHelperDefinitions.isNull(['value'])).to.be.false;
    });

    it('should return true for null', function () {
      expect(handlebarsHelperDefinitions.isNull(null)).to.be.true;
    });

    it('should return false for undefined', function () {
      expect(handlebarsHelperDefinitions.isNull(undefined)).to.be.false;
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
      expect(handlebarsHelperDefinitions.or(false, false, null)).to.be.false;
    });
  });

  describe('not', function () {
    it('should return true if false', function () {
      expect(handlebarsHelperDefinitions.not(false)).to.be.true;
    });

    it('should return false if truthy', function () {
      expect(handlebarsHelperDefinitions.not(1)).to.be.false;
      expect(handlebarsHelperDefinitions.not('a')).to.be.false;
      expect(handlebarsHelperDefinitions.not([])).to.be.false;
    });

    it('should return true if falsy', function () {
      expect(handlebarsHelperDefinitions.not(null)).to.be.true;
      expect(handlebarsHelperDefinitions.not(undefined)).to.be.true;
      expect(handlebarsHelperDefinitions.not('')).to.be.true;
      expect(handlebarsHelperDefinitions.not(0)).to.be.true;
    });
  });

  describe('concat', function () {
    it('should concatenate strings', function () {
      const value = 'Hello World';
      const result = handlebarsHelperDefinitions.concat('Hello', ' ', 'World');
      expect(result).to.equal(value);

      expect(handlebarsCompile('{{concat "Hello" " " "World"}}')({})).to.equal(value);
    });
  });

  describe('string case helpers', function () {
    it('toLower should lowercase text values', function () {
      const result = handlebarsHelperDefinitions.toLower('Ada Lovelace');
      expect(result).to.equal('ada lovelace');
    });

    it('toUpper should uppercase text values', function () {
      const result = handlebarsHelperDefinitions.toUpper('Ada Lovelace');
      expect(result).to.equal('ADA LOVELACE');
    });

    it('should treat nullish values as empty strings', function () {
      expect(handlebarsHelperDefinitions.toLower(null)).to.equal('');
      expect(handlebarsHelperDefinitions.toUpper(undefined)).to.equal('');
    });
  });

  describe('translation helper', function () {
    it('should show translated string from code', function () {
      const result = handlebarsHelperDefinitions.t.call(
        { translationService: { t: (key: string) => `translated-${key}` } },
        'Ada Lovelace'
      );
      expect(result).to.equal(`translated-Ada Lovelace`);
    });
  });

  describe('trim string helpers', function () {
    it('trim should remove whitespace from start and end', function () {
      const result = handlebarsHelperDefinitions.trim('\n \t  \f example  \n  text\r');
      expect(result).to.equal('example  \n  text');
    });

    it('trimArray should remove whitespace from string items in array', function () {
      const result = handlebarsHelperDefinitions.trimArray(['\n \t  \f example  \n  text\r', 0, {}, null]);
      expect(result).to.deep.equal(['example  \n  text', 0, {}, null]);
    });

    it('trimArray should return non-array without change', function () {
      expect(handlebarsHelperDefinitions.trimArray({ aProp: ['value'] })).to.deep.equal({ aProp: ['value'] });
      expect(handlebarsHelperDefinitions.trimArray(null)).to.deep.equal(null);
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

  describe('pluck', function () {
    it('should extract a property from each item using dot notation', function () {
      const creators = [{ email: 'a@x' }, { email: 'b@x' }, { email: 'c@x' }];
      const result = handlebarsHelperDefinitions.pluck(creators, 'email');
      expect(result).to.deep.equal(['a@x', 'b@x', 'c@x']);
    });

    it('should support nested paths and default missing values to empty string', function () {
      const items = [{ meta: { name: 'one' } }, { meta: {} }];
      const result = handlebarsHelperDefinitions.pluck(items, 'meta.name');
      expect(result).to.deep.equal(['one', '']);
    });

    it('should return empty array for non-array input', function () {
      const result = handlebarsHelperDefinitions.pluck('not an array' as any, 'email');
      expect(result).to.deep.equal([]);
    });

    it('should combine with join to build a delimited string', function () {
      const creators = [{ email: 'a@x' }, { email: 'b@x' }];
      const plucked = handlebarsHelperDefinitions.pluck(creators, 'email');
      const result = handlebarsHelperDefinitions.join(plucked, ',');
      expect(result).to.equal('a@x,b@x');
    });

    it('should extract multiple properties', function () {
      const creators = [
        { email: 'a@x', name: 'name1' },
        { email: 'b@x', name: 'name2' },
      ];
      const plucked = handlebarsHelperDefinitions.pluck(creators, 'email', 'name');
      expect(plucked).to.deep.equal([
        ['a@x', 'name1'],
        ['b@x', 'name2'],
      ]);
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
      const result = handlebarsHelperDefinitions.split(
        'https://linked.data.gov.au/def/anzsrc-for/2020/300101',
        '/',
        -1
      );
      expect(result).to.equal('300101');
    });

    it('should return all segments when index is omitted', function () {
      const result = handlebarsHelperDefinitions.split('a/b/c', '/');
      expect(result).to.deep.equal(['a', 'b', 'c']);
    });
  });

  describe('urlEncode', function () {
    it('should encode path segment values and preserve path separators', function () {
      const result = handlebarsHelperDefinitions.urlEncode('/mounted app/oid with spaces/#1/');

      expect(result).to.equal('/mounted%20app/oid%20with%20spaces/%231');
    });

    it('should return an empty string for empty input', function () {
      const result = handlebarsHelperDefinitions.urlEncode('');

      expect(result).to.equal('');
    });
  });

  describe('attachmentDownloadUrl', function () {
    it('should build a branded attachment download URL from fileId and oid', function () {
      const result = handlebarsHelperDefinitions.attachmentDownloadUrl(
        { fileId: 'content 1.txt', name: 'content1.txt' },
        'oid/1',
        'default',
        'rdmp'
      );

      expect(result).to.equal('/default/rdmp/record/oid%2F1/attach/content%201.txt');
    });

    it('should prefix record-relative attachment locations with branding and portal', function () {
      const result = handlebarsHelperDefinitions.attachmentDownloadUrl(
        { location: '/record/oid-1/attach/file-1' },
        'oid-1',
        'default',
        'rdmp'
      );

      expect(result).to.equal('/default/rdmp/record/oid-1/attach/file-1');
    });

    it('should normalize migrated attachment locations without a leading record segment', function () {
      const result = handlebarsHelperDefinitions.attachmentDownloadUrl(
        { location: 'oid-1/attach/file-1' },
        '',
        'default',
        'rdmp'
      );

      expect(result).to.equal('/default/rdmp/record/oid-1/attach/file-1');
    });

    it('should derive a branded attachment path from uploadUrl', function () {
      const result = handlebarsHelperDefinitions.attachmentDownloadUrl(
        { uploadUrl: 'https://researchdata.example/default/rdmp/record/oid-1/attach/file-1' },
        '',
        'default',
        'rdmp'
      );

      expect(result).to.equal('/default/rdmp/record/oid-1/attach/file-1');
    });

    it('should keep safe absolute URLs', function () {
      const result = handlebarsHelperDefinitions.attachmentDownloadUrl(
        { url: 'https://example.test/download/file-1' },
        'oid-1',
        'default',
        'rdmp'
      );

      expect(result).to.equal('https://example.test/download/file-1');
    });

    it('should reject unsafe attachment URLs', function () {
      const result = handlebarsHelperDefinitions.attachmentDownloadUrl(
        { url: 'javascript:alert(1)', location: 'javascript:alert(2)' },
        'oid-1',
        'default',
        'rdmp'
      );

      expect(result).to.equal('');
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

  describe('plaintextToHtml', function () {
    it('should escape text and preserve line breaks', function () {
      const result = handlebarsHelperDefinitions.plaintextToHtml('Line 1\n<script>alert("x")</script>\r\nLine 3');
      expect(result).to.equal('Line 1<br>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Line 3');
    });
  });

  describe('json', function () {
    it('should display string', function () {
      const result = handlebarsHelperDefinitions.json({ test: 'value' });
      expect(result).to.equal('{"test":"value"}');
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
        family: 'Scott',
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
        { name: 'Bob', role: 'DM' },
      ]);

      expect(result).to.contain('<table');
      expect(result).to.contain('<th>name</th>');
      expect(result).to.contain('<th>role</th>');
      expect(result).to.contain('<td>Alice</td>');
      expect(result).to.contain('<td>DM</td>');
    });

    it('should render mixed nested arrays recursively', function () {
      const result = handlebarsHelperDefinitions.renderMetadataValue(['one', { nested: ['two', 'three'] }]);

      expect(result).to.contain('<ul');
      expect(result).to.contain('<li>one</li>');
      expect(result).to.contain('nested');
      expect(result).to.contain('<li>two</li>');
    });
  });

  describe('wrapper functions', async function () {
    it('should return the same instance', function () {
      const one = handlebarsInstance();
      const two = handlebarsInstance();

      expect(one).to.eql(two);
    });
    it('should precompile a template and render it', function () {
      const precompiled = handlebarsPrecompile('{{renderMetadataValue content}}');
      const precompiledString = precompiled.toString();
      expect(precompiled).to.contain('\"renderMetadataValue\"');
      expect(precompiled).to.contain('\"content\"');
      expect(precompiled).to.contain('{"compiler":');

      let precompiledEval = {};
      eval(`precompiledEval = ${precompiledString}`);
      const compiled = handlebarsTemplate(precompiledEval);
      const result = compiled({ content: ['one', 'two'] });
      expect(result).to.eql(
        '&lt;ul class&#x3D;&quot;rb-view-metadata__list&quot;&gt;&lt;li&gt;one&lt;/li&gt;&lt;li&gt;two&lt;/li&gt;&lt;/ul&gt;'
      );
    });
    it('should compile a template to a function', function () {
      const compiled = handlebarsCompile('{{renderMetadataValue content}}');
      const result = compiled({ content: ['one', 'two'] }, { allowCallsToHelperMissing: false });
      expect(result).to.eql(
        '&lt;ul class&#x3D;&quot;rb-view-metadata__list&quot;&gt;&lt;li&gt;one&lt;/li&gt;&lt;li&gt;two&lt;/li&gt;&lt;/ul&gt;'
      );
    });
  });

  describe('asArray', async function () {
    it('convert values to array', function () {
      const input = ['value', '', 0];
      expect(handlebarsHelperDefinitions.asArray(input)).to.deep.equal(input);
      expect(handlebarsHelperDefinitions.asArray('value')).to.deep.equal(['value']);
      expect(handlebarsHelperDefinitions.asArray({ aProp: 'value' })).to.deep.equal([{ aProp: 'value' }]);
      expect(handlebarsCompile('{{asArray input}}')({ input })).to.deep.equal('value,,0');
    });
  });

  describe('flattenArray', async function () {
    it('convert values to array', function () {
      expect(handlebarsHelperDefinitions.flattenArray(['value'])).to.deep.equal(['value']);
      expect(handlebarsHelperDefinitions.flattenArray('value')).to.deep.equal(['value']);
      expect(handlebarsHelperDefinitions.flattenArray(...[{ aProp: 'value' }, null, 0, ['value']])).to.deep.equal([
        { aProp: 'value' },
        null,
        0,
        'value',
      ]);
      expect(handlebarsHelperDefinitions.flattenArray(...[{ aProp: 'value' }, null, 0, [['value']]])).to.deep.equal([
        { aProp: 'value' },
        null,
        0,
        ['value'],
      ]);
      expect(
        handlebarsCompile('{{asArray input}}')({ input: [{ aProp: 'value' }, null, 0, [['value']]] })
      ).to.deep.equal('[object Object],,0,value');
    });
  });

  describe('filterArray', async function () {
    it('should filter undefined, null, empty string', function () {
      const date = new Date();
      const input = ['one', '  ', undefined, null, {}, date, 0];
      const expected = ['one', {}, date, 0];
      expect(handlebarsHelperDefinitions.filterArray(input)).to.deep.equal(expected);

      expect(handlebarsHelperDefinitions.filterArray(undefined)).to.deep.equal(undefined);
    });
  });

  describe('displayName and displayNameArray', function () {
    it('should format the display name using text_full_name first', function () {
      const input1 = {
        text_full_name: 'Mr Given1 Family1',
        givenName: 'given',
        familyName: 'family',
        honorific: 'HON',
      };
      const expected1 = 'Mr Given1 Family1';
      expect(handlebarsHelperDefinitions.displayName(input1)).to.deep.equal(expected1);
      expect(handlebarsHelperDefinitions.displayNameArray([input1])).to.deep.equal([expected1]);
    });
    it('should format the display name using individual properties', function () {
      const input2 = { givenName: 'given', familyName: 'family', honorific: 'HON' };
      const expected2 = 'HON given family';
      expect(handlebarsHelperDefinitions.displayName(input2)).to.deep.equal(expected2);
      expect(handlebarsHelperDefinitions.displayNameArray([input2])).to.deep.equal([expected2]);
    });
    it('should format the display name as empty string when no properties are suitable', function () {
      const input2 = {
        text_full_name: null,
        givenName: ['given'],
        familyName: { value: 'family' },
        honorific: function () {
          return 'HON';
        },
      };
      const expected2 = '';
      expect(handlebarsHelperDefinitions.displayName(input2)).to.deep.equal(expected2);
      expect(handlebarsHelperDefinitions.displayNameArray([input2])).to.deep.equal([expected2]);
    });
    it('should format the display name as empty string when input is not an object', function () {
      const input3 = ['one'];
      const expected3 = '';
      expect(handlebarsHelperDefinitions.displayName(input3)).to.deep.equal(expected3);
      expect(handlebarsHelperDefinitions.displayNameArray([input3])).to.deep.equal([expected3]);

      expect(handlebarsHelperDefinitions.displayNameArray({})).to.deep.equal({});
    });
  });

  describe('sort', function () {
    it('should sort ignoring case and punctuation', function () {
      const input = ['réservé', 'Premier', 'Cli.ché', 'communiqué', 'c!afé', 'Adieu'];
      const expected = ['Adieu', 'c!afé', 'Cli.ché', 'communiqué', 'Premier', 'réservé'];
      expect(handlebarsHelperDefinitions.sort(input)).to.deep.equal(expected);
    });
    it('should return a non-array input unchanged', function () {
      const input = { text_full_name: 'My Name' };
      expect(handlebarsHelperDefinitions.sort(input)).to.deep.equal(input);
    });
  });

  describe('unique', function () {
    it('should remove duplicate strings', function () {
      const input = ['one', 'one', 'two', 'three', 'four', 'two', 0];
      const expected = ['one', 'two', 'three', 'four', 0];
      expect(handlebarsHelperDefinitions.unique(input)).to.deep.equal(expected);
    });
    it('should return non-array', function () {
      const input = { text_full_name: 'My Name' };
      expect(handlebarsHelperDefinitions.unique(input)).to.deep.equal(input);
    });
    it('should keep duplicate non-string entries', function () {
      const input = [{ text_full_name: 'My Name' }, 'one', 'one', null, undefined, 2, []];
      const expected = [{ text_full_name: 'My Name' }, 'one', null, undefined, 2, []];
      expect(handlebarsHelperDefinitions.unique(input)).to.deep.equal(expected);
    });
  });

  describe('render example record', function () {
    it('should render record', function () {
      const record = {
        metadata: {
          title: 'Record Title',
          description: 'description text',
          'dc:coverage_vivo:DateTimeInterval_vivo:start': '2024-09-05T12:34:56Z',
          'dc:coverage_vivo:DateTimeInterval_vivo:end': '2025-02-25T21:34:56Z',
          scu_calculated_retention_end_date: '2026-02-25T21:34:56Z',
          scu_entered_retention_end_date: '2026-02-25T21:34:56Z',
          scu_contributor_ci_faculty: 'faculty-business-law-arts',
          'scu-rdmp-data-classification-item-outcome': 'Official',
          'vivo:Dataset_dc_format': 'file format text',
          scu_software_needed: 'yes',
          scu_hpc_needed: 'yes',
          scu_website_needed: 'yes',
          'vivo:Dataset_dc:extent': '100GB - 2TB',
          scu_data_infra_special_access_rights: 'special access rights text',
          scu_data_special_requests: 'special requests text',
          'redbox:retentionPeriod_dc:date': '1year',
          'redbox:retentionPeriod_dc:date_skos:note': ['not-applicable', 'a2'],
          'dc:coverage_dc:identifier': [{ basic_name: 'coverage1' }],
          geolocations: [
            {
              basic_name: ['Lismore'],
              latitude: [45.70015],
              longitude: [-62.2653],
            },
            {
              basic_name: 'name2',
              latitude: 46,
              longitude: -60,
            },
          ],
          scu_ownership_decision_authority: 'manager',
          'dc:accessRights': 'office-research-decide',
          workspaces: [{ id: 'workspace-id2' }, { id: 'workspace-id1  ' }],
          'vivo:Dataset_redbox:DataCollectionMethodology': 'data collection answer',
          'vivo:Dataset_redbox:DataCollectionResources': 'Software/equipment used to create/collect the data answer',
          'vivo:Dataset_redbox:DataAnalysisResources': 'Software/equipment used to manipulate/analyse the data answer',
          data_size: 'upTo5GB',
          'additional-irma-ids': [
            {
              display_title: 'HEC: 123x4 Human addtional irma id 1',
              title: 'addtional irma id 1',
              type: 'Human',
              ID: 'HEC: 123x4',
              oid: 'oid-123',
            },
          ],
          contributor_author: {
            text_full_name: 'The Author Example',
            email: 'author-example@redboxresearchdata.com.au',
            orcid: '00author-example-orcid00',
          },
          contributor_ci: {
            email: 'ci-example@redboxresearchdata.com.au',
            orcid: '00ci-example-orcid00',
            given_name: 'CI',
            family_name: 'Example',
            honorific: 'The',
          },
          contributors: [
            {
              text_full_name: 'The Contributor Example',
              email: 'contributor-example@redboxresearchdata.com.au',
              orcid: '00contributor-example-orcid00',
            },
          ],
          contributors_supervisor: [
            {
              text_full_name: 'The Supervisor Example',
              email: 'supervisor-example@redboxresearchdata.com.au',
              orcid: '00supervisor-example-orcid00',
            },
          ],
          contributors_external: [
            {
              text_full_name: 'The External Example',
              email: 'external-example@redboxresearchdata.com.au',
              orcid: '00external-example-orcid00',
            },
            {
              text_full_name: 'The External Example',
              email: 'external-example@redboxresearchdata.com.au',
              orcid: '00external-example-orcid00',
            },
          ],
          contributors_data_manager: [
            {
              givenName: 'Data Manager',
              familyName: 'Example2',
              honorific: 'The',
            },
            {
              text_full_name: 'The Data Manager Example1',
            },
          ],
          'foaf:fundedBy_foaf:Agent': [
            {
              'provider-id': 'ABC456',
              'provider-name': 'The Organisation 1',
            },
            {
              'provider-id': 'FPRx6542',
              'provider-name': 'Australian Research Council',
              primary: 'Yes',
            },
            {
              'provider-name': 'ZZZZ',
            },
            {
              'provider-id': 'org-id-123',
            },
          ],
          'dc:subject_anzsrc:for': [
            {
              name: '370304 - Organic geochemistry',
              label: 'Organic geochemistry',
              notation: '370304',
              geneaology: ['37', '3703'],
            },
          ],
        },
        lastSaveDate: '2025-04-01T01:23:45.678Z',
      };
      const template = `<ul>
        <li>authorName: {{displayName (get record 'metadata.contributor_author')}}</li>
        <li>ciName: {{displayName (get record 'metadata.contributor_ci')}}</li>
        <li>managerNames: {{join (sort (displayNameArray (asArray (get record 'metadata.contributors_data_manager')))) ', '}}</li>
        <li>collaboratorNames: {{join (sort (unique (displayNameArray (flattenArray
        (get record 'metadata.contributors_supervisor')
        (get record 'metadata.contributors')
        (get record 'metadata.contributors_external')
        (get record 'metadata.contributors_data_manager')
        )))) '; '}}</li>
        <li>workspaceIds: {{join (sort (filterArray (trimArray (pluck (asArray (get record 'metadata.workspaces')) 'id')))) ', '}}</li>
        <li>projectStart: {{formatDate (get record "metadata['dc:coverage_vivo:DateTimeInterval_vivo:start']") "dd/MM/yyyy hh:mm a" "Australia/Sydney"}}</li>
        <li>lastSaveDate: {{formatDateLocale (get record "lastSaveDate") "DATE_SHORT" "UTC"}}</li>
        <li>reviewDate: {{formatDate (dateModify (get record 'lastSaveDate') 'days' 14)}}</li>
        <li>scu_entered_retention_end_date: {{formatDate (get record "metadata.scu_entered_retention_end_date") "dd/MM/yyyy" "Australia/Sydney"}}</li>
        <li>retentionReasons: {{join (sort (filterArray (trimArray (asArray (get record 'metadata.["redbox:retentionPeriod_dc:date_skos:note"]'))))) ', '}}</li>
        <li>countries: {{join (sort (pluck (flattenArray (get record "metadata['dc:coverage_dc:identifier']")) 'basic_name')) ', '}}</li>
        <li>geolocations: {{join (sort (flattenArray (pluck (flattenArray (get record 'metadata.geolocations')) 'basic_name'))) ', '}}</li>
        <li>additionalIrmaIds: {{join (sort (filterArray (trimArray (pluck (asArray (get record 'metadata.additional-irma-ids')) 'display_title')))) ', '}}</li>
        <li>researchFields: {{join (sort (filterArray (trimArray (pluck (asArray (get record "metadata['dc:subject_anzsrc:for']" '(blank)')) 'name')))) ', '}}</li>
        <li>funders: {{#each (sort (pluck (get record "metadata['foaf:fundedBy_foaf:Agent']") 'provider-name' 'provider-id'))~}}
        {{#if this.[0]}}{{this.[0]}}{{/if}}{{#if (and this.[0] this.[1])}} {{/if}}{{#if this.[1]}}({{this.[1]}}){{/if}}{{#if (not @last)}}, {{/if}}
        {{~/each~}}
        </li>
        <li>viewSupervisorNames: {{join (sort (filterArray (trimArray (asArray (get record 'metadata.view_only_contributors_supervisor' '(blank)') )))) ', '}}</li>
        <li>dataSize: {{default (t (get record 'metadata.data_size')) '(blank)'}}</li>
</ul>`;
      const expected = `<ul>
        <li>authorName: The Author Example</li>
        <li>ciName: The CI Example</li>
        <li>managerNames: The Data Manager Example1, The Data Manager Example2</li>
        <li>collaboratorNames: The Contributor Example; The Data Manager Example1; The Data Manager Example2; The External Example; The Supervisor Example</li>
        <li>workspaceIds: workspace-id1, workspace-id2</li>
        <li>projectStart: 05/09/2024 10:34 PM</li>
        <li>lastSaveDate: 4/1/2025</li>
        <li>reviewDate: 15/04/2025 01:23 AM</li>
        <li>scu_entered_retention_end_date: 26/02/2026</li>
        <li>retentionReasons: a2, not-applicable</li>
        <li>countries: coverage1</li>
        <li>geolocations: Lismore, name2</li>
        <li>additionalIrmaIds: HEC: 123x4 Human addtional irma id 1</li>
        <li>researchFields: 370304 - Organic geochemistry</li>
        <li>funders: Australian Research Council (FPRx6542), (org-id-123), The Organisation 1 (ABC456), ZZZZ</li>
        <li>viewSupervisorNames: (blank)</li>
        <li>dataSize: Up to 5GB</li>
</ul>`;
      const compiled = handlebarsCompile(template);
      expect(
        compiled({ record, translationService: { t: (key: string) => ({ upTo5GB: 'Up to 5GB' })[key] } })
      ).to.equal(expected);
    });
  });
});
