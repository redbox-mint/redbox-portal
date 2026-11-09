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
      const result = handlebarsCompile('{{formatDate data}}')({ data: '2023-05-18T01:30:00.000Z' });
      // Just verify it returns a formatted date string (not empty or original)
      expect(result).to.match(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('should format ISO date with custom format', function () {
      const result = handlebarsCompile("{{formatDate data 'yyyy-MM-dd'}}")({ data: '2023-05-18T00:00:00.000Z' });
      // Just verify it returns a formatted date string with our format
      expect(result).to.match(/\d{4}-\d{2}-\d{2}/);
    });

    it('should format ISO date with Moment-style custom format', function () {
      const result = handlebarsCompile("{{formatDate data 'DD/MM/YYYY'}}")({ data: '2023-05-18T00:00:00.000Z' });
      expect(result).to.equal('18/05/2023');
    });

    it('should preserve Moment-style time tokens that Luxon already supports', function () {
      const result = handlebarsCompile("{{formatDate data 'YYYY-MM-DD HH:mm:ss'}}")({
        data: '2023-05-18T01:02:03.000Z',
      });
      expect(result).to.match(/^2023-05-18 \d{2}:\d{2}:03$/);
    });

    it('should format Date instances with custom format', function () {
      const result = handlebarsCompile("{{formatDate data 'yyyy-MM-dd'}}")({
        data: new Date('2023-05-18T00:00:00.000Z'),
      });
      expect(result).to.equal('2023-05-18');
    });

    it('should ignore the Handlebars options argument when no explicit format is provided', function () {
      const result = handlebarsCompile('{{formatDate data}}')({ data: '2023-05-18T01:30:00.000Z' });
      expect(result).to.match(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('should return empty string for empty input', function () {
      const result = handlebarsCompile('{{formatDate data}}')({ data: '' });
      expect(result).to.equal('');
    });

    it('should return original string for invalid date', function () {
      const result = handlebarsCompile('{{formatDate data}}')({ data: 'not-a-date' });
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
      const result = handlebarsCompile("{{get obj 'metadata.contributor.name'}}")({ obj });
      expect(result).to.equal('John');
    });

    it('should return default value for missing property', function () {
      const obj = { metadata: {} };
      const result = handlebarsCompile("{{get obj 'metadata.contributor.name' 'Unknown'}}")({ obj });
      expect(result).to.equal('Unknown');
    });

    it('should return empty string by default for missing property', function () {
      const obj = { metadata: {} };
      const result = handlebarsCompile("{{get obj 'metadata.contributor.name'}}")({ obj });
      expect(result).to.equal('');
    });
  });

  describe('formatDateLocale', function () {
    it('should format Date instances with locale presets', function () {
      const result = handlebarsCompile("{{formatDateLocale data 'DATE_SHORT' 'en'}}")({
        data: new Date('2023-05-18T01:30:00.000Z'),
      });
      expect(result).to.be.a('string');
      expect(result).to.not.equal('');
      expect(result).to.not.equal('Invalid Date');
    });

    it('should ignore the Handlebars options argument when preset and locale are omitted', function () {
      const result = handlebarsCompile('{{formatDateLocale data}}')({ data: new Date('2023-05-18T01:30:00.000Z') });
      expect(result).to.be.a('string');
      expect(result).to.not.equal('');
      expect(result).to.not.equal('Invalid Date');
    });
  });

  describe('parseDateString', function () {
    it('should return a string', function () {
      expect(handlebarsCompile('{{parseDateString data}}')({ data: undefined })).to.equal('');
    });
  });

  describe('dateModify', function () {
    const when = '2023-05-18T01:30:00.000Z';
    const whenDt = DateTime.fromISO(when);
    it('should accept plus operation', function () {
      expect(handlebarsCompile(`{{dateModify when 'plus' 'days' 3 'months' 1}}`)({ when })).to.equal(
        whenDt.plus({ months: 1, days: 3 }).toUTC().toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'plus' 'days' -3}}`)({ when })).to.equal(
        whenDt.plus({ days: -3 }).toUTC().toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'plus' 'years' 1}}`)({ when })).to.equal(
        whenDt.plus({ years: 1 }).toUTC().toISO()
      );
    });
    it('should default to plus operation', function () {
      expect(handlebarsCompile(`{{dateModify when 'days' 3 'months' 1}}`)({ when })).to.equal(
        whenDt.plus({ months: 1, days: 3 }).toUTC().toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'days' -3}}`)({ when })).to.equal(
        whenDt.plus({ days: -3 }).toUTC().toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'years' 1}}`)({ when })).to.equal(
        whenDt.plus({ years: 1 }).toUTC().toISO()
      );
    });
    it('should allow startOf and endOf operations', function () {
      expect(handlebarsCompile(`{{dateModify when 'startOf' 'day'}}`)({ when })).to.equal(
        whenDt.startOf('day').toUTC().toISO()
      );
      expect(handlebarsCompile(`{{dateModify when 'endOf' 'month'}}`)({ when })).to.equal(
        whenDt.endOf('month').toUTC().toISO()
      );
    });
    it('should return first input if called incorrectly', function () {
      expect(handlebarsCompile(`{{dateModify when}}`)({ when })).to.equal(when, 'only when');
      expect(handlebarsCompile(`{{dateModify when 'day' 3}}`)({ when })).to.equal(when, 'missing s');
      expect(handlebarsCompile(`{{dateModify when 'days' 3 'months'}}`)({ when })).to.equal(when, 'missing value');
      expect(handlebarsCompile(`{{dateModify when 'plus' 3}}`)({ when })).to.equal(when, 'missing unit');
      expect(handlebarsCompile(`{{dateModify when 'something'}}`)({ when })).to.equal(when, 'unknown unit');
      expect(handlebarsCompile(`{{dateModify 'plus'}}`)({ when })).to.equal('plus', 'missing datevalue');
      expect(handlebarsCompile(`{{dateModify when 'plus' 'notAUnit' 10}}`)({ when })).to.equal(
        when,
        'plus with unknown unit'
      );
      expect(handlebarsCompile(`{{dateModify when 'startOf' 'days' 10}}`)({ when })).to.equal(
        when,
        'startof with value'
      );
      expect(handlebarsCompile(`{{dateModify when 'endOf' 'years'}}`)({ when })).to.equal(
        when,
        'endof with unknown unit'
      );
      expect(handlebarsCompile(`{{dateModify}}`)({ when })).to.equal('', 'no args');
      expect(handlebarsCompile(`{{dateModify when 'plus' 'days' 'days'}}`)({ when })).to.equal(when, 'two units');
      expect(handlebarsCompile(`{{dateModify when 'plus' 3 5}}`)({ when })).to.equal(when, 'two values');
    });

    describe('modifies the date time according to the attached timezone or UTC otherwise', function () {
      const cases: [string, string, string, string | Date, string | Date][] = [
        [
          'adds 7 months with host across DST change date time in UTC',
          `'months' 7`,
          'Australia/Adelaide',
          '2027-01-01T00:01:00.000Z',
          '2027-08-01T00:01:00.000Z',
        ],
        [
          'adds 7 months with host across DST change using offset',
          `'months' 7`,
          'Australia/Adelaide',
          '2027-01-01T00:01:00.000+04:30',
          '2027-07-31T19:31:00.000Z',
        ],
        [
          'adds 7 months in same DST Date',
          `'months' 7`,
          'UTC',
          new Date(2027, 0, 1, 0, 1, 0),
          '2027-08-01T00:01:00.000Z',
        ],
        [
          'adds 7 months with host across DST change no offset',
          `'months' 7`,
          'Australia/Adelaide',
          '2027-01-01T00:01:00.000',
          '2027-08-01T00:01:00.000Z',
        ],
      ];
      for (const [name, args, hostTz, input, expected] of cases) {
        it(name, function () {
          const priorZone = Settings.defaultZone;
          try {
            Settings.defaultZone = hostTz;
            expect(handlebarsCompile(`{{dateModify input ${args}}}`)({ input })).to.equal(expected);
          } finally {
            Settings.defaultZone = priorZone;
          }
        });
      }
    });
  });

  describe('isEmpty', function () {
    it('should return true for empty string', function () {
      expect(handlebarsCompile(`{{isEmpty input}}`)({ input: '' })).to.equal('true');
    });

    it('should return true for empty array', function () {
      expect(handlebarsCompile(`{{isEmpty input}}`)({ input: [] })).to.equal('true');
    });

    it('should return true for empty object', function () {
      expect(handlebarsCompile(`{{isEmpty input}}`)({ input: {} })).to.equal('true');
    });

    it('should return false for non-empty string', function () {
      expect(handlebarsCompile(`{{isEmpty input}}`)({ input: 'hello' })).to.equal('false');
    });

    it('should return false for non-empty array', function () {
      expect(handlebarsCompile(`{{isEmpty input}}`)({ input: [1, 2, 3] })).to.equal('false');
    });
  });

  describe('isDefined and isUndefined', function () {
    it('should return true for defined value', function () {
      expect(handlebarsCompile(`{{isDefined input}}`)({ input: 'hello' })).to.equal('true');
      expect(handlebarsCompile(`{{isUndefined input}}`)({ input: 'hello' })).to.equal('false');
    });

    it('should return true for zero', function () {
      expect(handlebarsCompile(`{{isDefined input}}`)({ input: 0 })).to.equal('true');
      expect(handlebarsCompile(`{{isUndefined input}}`)({ input: 0 })).to.equal('false');
    });

    it('should return false for undefined', function () {
      expect(handlebarsCompile(`{{isDefined input}}`)({ input: undefined })).to.equal('false');
      expect(handlebarsCompile(`{{isUndefined input}}`)({ input: undefined })).to.equal('true');
    });

    it('should return false for null', function () {
      expect(handlebarsCompile(`{{isDefined input}}`)({ input: null })).to.equal('false');
      expect(handlebarsCompile(`{{isUndefined input}}`)({ input: null })).to.equal('false');
    });
  });

  describe('isArray', function () {
    it('should return false for plain objects', function () {
      expect(handlebarsCompile(`{{isArray input}}`)({ input: { key: 'value' } })).to.equal('false');
    });

    it('should return true for arrays', function () {
      expect(handlebarsCompile(`{{isArray input}}`)({ input: ['value'] })).to.equal('true');
    });

    it('should return false for null', function () {
      expect(handlebarsCompile(`{{isArray input}}`)({ input: null })).to.equal('false');
    });
  });

  describe('isNull', function () {
    it('should return false for plain objects', function () {
      expect(handlebarsCompile(`{{isNull input}}`)({ input: { key: 'value' } })).to.equal('false');
    });

    it('should return false for arrays', function () {
      expect(handlebarsCompile(`{{isNull input}}`)({ input: ['value'] })).to.equal('false');
    });

    it('should return true for null', function () {
      expect(handlebarsCompile(`{{isNull input}}`)({ input: null })).to.equal('true');
    });

    it('should return false for undefined', function () {
      expect(handlebarsCompile(`{{isNull input}}`)({ input: undefined })).to.equal('false');
    });
  });

  describe('isObject', function () {
    it('should return true for plain objects', function () {
      expect(handlebarsCompile(`{{isObject input}}`)({ input: { key: 'value' } })).to.equal('true');
    });

    it('should return false for arrays', function () {
      expect(handlebarsCompile(`{{isObject input}}`)({ input: ['value'] })).to.equal('false');
    });

    it('should return false for null', function () {
      expect(handlebarsCompile(`{{isObject input}}`)({ input: null })).to.equal('false');
    });
  });

  describe('eq and ne', function () {
    it('should return true for equal values', function () {
      expect(handlebarsCompile(`{{eq a b}}`)({ a: 'a', b: 'a' })).to.equal('true');
    });

    it('should return false for unequal values', function () {
      expect(handlebarsCompile(`{{eq a b}}`)({ a: 'a', b: 'b' })).to.equal('false');
    });

    it('should return true for unequal values with ne', function () {
      expect(handlebarsCompile(`{{ne a b}}`)({ a: 'a', b: 'b' })).to.equal('true');
    });
  });

  describe('and and or', function () {
    it('and should return true if all args are truthy', function () {
      expect(handlebarsCompile(`{{and a b}}`)({ a: true, b: true })).to.equal('true');
    });

    it('and should return false if any arg is falsy', function () {
      expect(handlebarsCompile(`{{and a b}}`)({ a: true, b: false })).to.equal('false');
    });

    it('or should return true if any arg is truthy', function () {
      expect(handlebarsCompile(`{{or a b}}`)({ a: false, b: true })).to.equal('true');
    });

    it('or should return false if all args are falsy', function () {
      expect(handlebarsCompile(`{{or a b}}`)({ a: false, b: false })).to.equal('false');
    });
  });

  describe('not', function () {
    it('should return true if false', function () {
      expect(handlebarsCompile(`{{not input}}`)({ input: false })).to.equal('true');
    });

    it('should return false if truthy', function () {
      expect(handlebarsCompile(`{{not input}}`)({ input: 1 })).to.equal('false');
      expect(handlebarsCompile(`{{not input}}`)({ input: 'a' })).to.equal('false');
      expect(handlebarsCompile(`{{not input}}`)({ input: [] })).to.equal('false');
    });

    it('should return true if falsy', function () {
      expect(handlebarsCompile(`{{not input}}`)({ input: null })).to.equal('true');
      expect(handlebarsCompile(`{{not input}}`)({ input: undefined })).to.equal('true');
      expect(handlebarsCompile(`{{not input}}`)({ input: '' })).to.equal('true');
      expect(handlebarsCompile(`{{not input}}`)({ input: 0 })).to.equal('true');
    });
  });

  describe('concat', function () {
    it('should concatenate strings', function () {
      expect(handlebarsCompile('{{concat "Hello" " " "World"}}')({})).to.equal('Hello World');
    });
  });

  describe('string case helpers', function () {
    it('toLower should lowercase text values', function () {
      expect(handlebarsCompile('{{toLower "Ada Lovelace"}}')({})).to.equal('ada lovelace');
    });

    it('toUpper should uppercase text values', function () {
      expect(handlebarsCompile('{{toUpper "Ada Lovelace"}}')({})).to.equal('ADA LOVELACE');
    });

    it('should treat nullish values as empty strings', function () {
      expect(handlebarsCompile('{{toLower input}}')({ input: null })).to.equal('');
      expect(handlebarsCompile('{{toUpper input}}')({ input: undefined })).to.equal('');
    });
  });

  describe('translation helper', function () {
    it('should show translated string from code', function () {
      const compiled = handlebarsCompile(`{{t input}}`);
      const context = { input: '@translation-code', translationService: { t: (key: string) => `translated-${key}` } };
      expect(compiled(context)).to.equal('translated-@translation-code');
    });
  });

  describe('trim string helpers', function () {
    it('trim should remove whitespace from start and end', function () {
      expect(handlebarsCompile('{{trim input}}')({ input: '\n \t  \f example  \n  text\r' })).to.equal(
        'example  \n  text'
      );
    });

    it('trimArray should remove whitespace from string items in array', function () {
      expect(
        handlebarsCompile(`{{{json (trimArray input)}}}`)({ input: ['\n \t  \f example  \n  text\r', 0, {}, null] })
      ).to.equal(JSON.stringify(['example  \n  text', 0, {}, null]));
    });

    it('trimArray should return non-array without change', function () {
      expect(handlebarsCompile('{{{json (trimArray input)}}}')({ input: { aProp: ['value'] } })).to.equal(
        JSON.stringify({ aProp: ['value'] })
      );
      expect(handlebarsCompile('{{json (trimArray input)}}')({ input: null })).to.equal(`null`);
    });
  });

  describe('join', function () {
    it('should join array elements', function () {
      expect(handlebarsCompile(`{{join input ', '}}`)({ input: ['a', 'b', 'c'] })).to.equal('a, b, c');
    });

    it('should return empty string for non-array', function () {
      expect(handlebarsCompile(`{{join input ', '}}`)({ input: 'not an array' })).to.equal('');
    });
  });

  describe('pluck', function () {
    it('should extract a property from each item using dot notation', function () {
      const creators = [{ email: 'a@x' }, { email: 'b@x' }, { email: 'c@x' }];
      expect(handlebarsCompile(`{{{json (pluck input 'email')}}}`)({ input: creators })).to.equal(
        JSON.stringify(['a@x', 'b@x', 'c@x'])
      );
    });

    it('should support nested paths and default missing values to empty string', function () {
      const items = [{ meta: { name: 'one' } }, { meta: {} }];
      expect(handlebarsCompile(`{{{json (pluck input 'meta.name')}}}`)({ input: items })).to.equal(
        JSON.stringify(['one', ''])
      );
    });

    it('should return empty array for non-array input', function () {
      expect(handlebarsCompile(`{{json (pluck input 'email')}}`)({ input: 'not an array' })).to.equal('[]');
    });

    it('should combine with join to build a delimited string', function () {
      const creators = [{ email: 'a@x' }, { email: 'b@x' }];
      expect(handlebarsCompile(`{{join (pluck input 'email') ','}}`)({ input: creators })).to.equal('a@x,b@x');
    });

    it('should extract multiple properties', function () {
      const creators = [
        { email: 'a@x', name: 'name1' },
        { email: 'b@x', name: 'name2' },
      ];
      expect(handlebarsCompile(`{{{json (pluck input 'email' 'name')}}}`)({ input: creators })).to.equal(
        JSON.stringify([
          ['a@x', 'name1'],
          ['b@x', 'name2'],
        ])
      );
    });
  });

  describe('substring', function () {
    it('should return sliced substring', function () {
      expect(
        handlebarsCompile(`{{substring input 8 14}}`)({
          input: 'https://linked.data.gov.au/def/anzsrc-for/2020/300101',
        })
      ).to.equal('linked');
    });
    it('should return sliced substring from end', function () {
      expect(
        handlebarsCompile(`{{substring input -6}}`)({ input: 'https://linked.data.gov.au/def/anzsrc-for/2020/300101' })
      ).to.equal('300101');
    });
  });

  describe('split', function () {
    it('should return a selected segment by index', function () {
      expect(
        handlebarsCompile(`{{split input '/' -1}}`)({ input: 'https://linked.data.gov.au/def/anzsrc-for/2020/300101' })
      ).to.equal('300101');
    });

    it('should return all segments when index is omitted', function () {
      expect(handlebarsCompile(`{{{json (split input '/')}}}`)({ input: 'a/b/c' })).to.equal(
        JSON.stringify(['a', 'b', 'c'])
      );
    });
  });

  describe('urlEncode', function () {
    it('should encode path segment values and preserve path separators', function () {
      expect(handlebarsCompile(`{{urlEncode '/mounted app/oid with spaces/#1/'}}`)({})).to.equal(
        `/mounted%20app/oid%20with%20spaces/%231`
      );
    });

    it('should return an empty string for empty input', function () {
      expect(handlebarsCompile(`{{urlEncode ''}}`)({})).to.equal('');
    });
  });

  describe('attachmentDownloadUrl', function () {
    it('should build a branded attachment download URL from fileId and oid', function () {
      expect(
        handlebarsCompile(`{{attachmentDownloadUrl attachment 'oid/1' 'default' 'rdmp'}}`)({
          attachment: { fileId: 'content 1.txt', name: 'content1.txt' },
        })
      ).to.equal('/default/rdmp/record/oid%2F1/attach/content%201.txt');
    });

    it('should prefix record-relative attachment locations with branding and portal', function () {
      expect(
        handlebarsCompile(`{{attachmentDownloadUrl attachment 'oid-1' 'default' 'rdmp'}}`)({
          attachment: { location: '/record/oid-1/attach/file-1' },
        })
      ).to.equal('/default/rdmp/record/oid-1/attach/file-1');
    });

    it('should normalize migrated attachment locations without a leading record segment', function () {
      expect(
        handlebarsCompile(`{{attachmentDownloadUrl attachment '' 'default' 'rdmp'}}`)({
          attachment: { location: 'oid-1/attach/file-1' },
        })
      ).to.equal('/default/rdmp/record/oid-1/attach/file-1');
    });

    it('should derive a branded attachment path from uploadUrl', function () {
      expect(
        handlebarsCompile(`{{attachmentDownloadUrl attachment '' 'default' 'rdmp'}}`)({
          attachment: { uploadUrl: 'https://researchdata.example/default/rdmp/record/oid-1/attach/file-1' },
        })
      ).to.equal('/default/rdmp/record/oid-1/attach/file-1');
    });

    it('should keep safe absolute URLs', function () {
      expect(
        handlebarsCompile(`{{attachmentDownloadUrl attachment 'oid-1' 'default' 'rdmp'}}`)({
          attachment: { url: 'https://example.test/download/file-1' },
        })
      ).to.equal('https://example.test/download/file-1');
    });

    it('should reject unsafe attachment URLs', function () {
      expect(
        handlebarsCompile(`{{attachmentDownloadUrl attachment 'oid-1' 'default' 'rdmp'}}`)({
          attachment: { url: 'javascript:alert(1)', location: 'javascript:alert(2)' },
        })
      ).to.equal('');
    });
  });

  describe('default', function () {
    it('should return value if truthy', function () {
      expect(handlebarsCompile(`{{default 'hello' 'default'}}`)({})).to.equal('hello');
    });

    it('should return default if value is falsy', function () {
      expect(handlebarsCompile(`{{default '' 'default'}}`)({})).to.equal('default');
    });
  });

  describe('markdownToHtml', function () {
    it('should convert markdown input when output format is markdown', function () {
      expect(handlebarsCompile(`{{{markdownToHtml '**bold**' 'markdown'}}}`)({})).to.contain('<strong>bold</strong>');
    });

    it('should pass html input through when output format is html', function () {
      const html = '<p><em>hello</em></p>';
      expect(handlebarsCompile(`{{{markdownToHtml input 'html'}}}`)({ input: html })).to.equal(html);
    });

    it('should return empty string when value is nullish', function () {
      expect(handlebarsCompile(`{{markdownToHtml input 'markdown'}}`)({ input: null })).to.equal('');
    });
  });

  describe('plaintextToHtml', function () {
    it('should escape text and preserve line breaks', function () {
      expect(
        handlebarsCompile(`{{{plaintextToHtml input}}}`)({ input: 'Line 1\n<script>alert("x")</script>\r\nLine 3' })
      ).to.equal('Line 1<br>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Line 3');
    });
  });

  describe('json', function () {
    it('should display string', function () {
      expect(handlebarsCompile(`{{{json input}}}`)({ input: { test: 'value' } })).to.equal('{"test":"value"}');
    });
  });

  describe('comparison helpers', function () {
    it('gt should return true if first > second', function () {
      expect(handlebarsCompile('{{gt 5 3}}')({})).to.equal('true');
      expect(handlebarsCompile('{{gt 3 5}}')({})).to.equal('false');
    });

    it('gte should return true if first >= second', function () {
      expect(handlebarsCompile('{{gte 5 5}}')({})).to.equal('true');
      expect(handlebarsCompile('{{gte 3 5}}')({})).to.equal('false');
    });

    it('lt should return true if first < second', function () {
      expect(handlebarsCompile('{{lt 3 5}}')({})).to.equal('true');
      expect(handlebarsCompile('{{lt 5 3}}')({})).to.equal('false');
    });

    it('lte should return true if first <= second', function () {
      expect(handlebarsCompile('{{lte 5 5}}')({})).to.equal('true');
      expect(handlebarsCompile('{{lte 6 5}}')({})).to.equal('false');
    });
  });

  describe('renderMetadataValue', function () {
    it('should render plain objects as nested key-value rows', function () {
      const result = handlebarsCompile('{{renderMetadataValue input}}')({
        input: {
          given: 'Alice',
          family: 'Scott',
        },
      });

      expect(result).to.contain('rb-view-metadata__nested');
      expect(result).to.contain('given');
      expect(result).to.contain('Alice');
      expect(result).to.contain('family');
      expect(result).to.contain('Scott');
    });

    it('should render string arrays as unordered lists', function () {
      const result = handlebarsCompile('{{{renderMetadataValue input}}}')({
        input: ['one', 'two'],
      });

      expect(result).to.contain('<ul');
      expect(result).to.contain('<li>one</li>');
      expect(result).to.contain('<li>two</li>');
      expect(result).to.contain('</ul>');
    });

    it('should render arrays of flat objects as tables', function () {
      const result = handlebarsCompile('{{{renderMetadataValue input}}}')({
        input: [
          { name: 'Alice', role: 'CI' },
          { name: 'Bob', role: 'DM' },
        ],
      });

      expect(result).to.contain('<table');
      expect(result).to.contain('<th>name</th>');
      expect(result).to.contain('<th>role</th>');
      expect(result).to.contain('<td>Alice</td>');
      expect(result).to.contain('<td>DM</td>');
      expect(result).to.contain('</table>');
    });

    it('should render mixed nested arrays recursively', function () {
      const result = handlebarsCompile('{{{renderMetadataValue input}}}')({
        input: ['one', { nested: ['two', 'three'] }],
      });

      expect(result).to.contain('<ul');
      expect(result).to.contain('<li>one</li>');
      expect(result).to.contain('nested');
      expect(result).to.contain('<li>two</li>');
      expect(result).to.contain('</ul>');
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

    describe('allows for handlebars options argument', function () {
      Object.keys(handlebarsHelperDefinitions).forEach(helperName => {
        it(`should render ${helperName} as expected with no arguments`, function () {
          let expected: any = '';
          switch (helperName) {
            case 'isEmpty':
            case 'isUndefined':
            case 'ne':
            case 'not':
              expected = 'true';
              break;
            case 'isNull':
            case 'isDefined':
            case 'isArray':
            case 'isObject':
            case 'eq':
            case 'and':
            case 'or':
            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte':
              expected = 'false';
              break;
          }
          expect(handlebarsCompile(`{{{${helperName}}}}`)({})).to.equal(expected);
        });
        it(`should render ${helperName} as expected with empty string argument`, function () {
          let expected: any = '';
          switch (helperName) {
            case 'isEmpty':
            case 'isDefined':
            case 'ne':
            case 'not':
              expected = 'true';
              break;
            case 'isNull':
            case 'isUndefined':
            case 'isArray':
            case 'isObject':
            case 'eq':
            case 'and':
            case 'or':
            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte':
              expected = 'false';
              break;
            case 'json':
              expected = '""';
              break;
            case 'renderMetadataValue':
              expected = '<em class="text-muted">—</em>';
              break;
          }
          expect(handlebarsCompile(`{{{${helperName} ''}}}`)({})).to.equal(expected);
        });

        it(`should call ${helperName} and not mistake data for the handlebars options`, function () {
          const input = { data: { id: 123 }, title: 'My title', hash: {} };
          let expected: any = 'My title';
          switch (helperName) {
            case 'isDefined':
            case 'ne':
            case 'isObject':
            case 'and':
            case 'or':
              expected = 'true';
              break;
            case 'isEmpty':
            case 'isNull':
            case 'isUndefined':
            case 'isArray':
            case 'eq':
            case 'not':
            case 'gt':
            case 'gte':
            case 'lt':
            case 'lte':
              expected = 'false';
              break;
            case 'formatDate':
            case 'formatDateLocale':
            case 'trim':
            case 'substring':
            case 'split':
            case 'concat':
            case 'markdownToHtml':
            case 'plaintextToHtml':
              expected = '[object Object]';
              break;
            case 'get':
            case 'join':
            case 'attachmentDownloadUrl':
            case 'displayName':
              expected = '""';
              break;
            case 'toLower':
              expected = '[object object]';
              break;
            case 'toUpper':
              expected = '[OBJECT OBJECT]';
              break;
            case 'pluck':
              expected = '[]';
              break;
            case 'urlEncode':
              expected = '%5Bobject%20Object%5D';
              break;
          }
          expect(handlebarsCompile(`{{{json (${helperName} input)}}}`)({ input })).to.contain(expected);
        });
      });
    });
  });

  describe('asArray', async function () {
    it('convert values to array', function () {
      expect(handlebarsCompile('{{{json (asArray data)}}}')({ data: ['value', '', 0] })).to.deep.equal(
        JSON.stringify(['value', '', 0])
      );
      expect(handlebarsCompile('{{json (asArray data)}}')({ data: 'value' })).to.deep.equal('[&quot;value&quot;]');
      expect(handlebarsCompile('{{{json (asArray data)}}}')({ data: { aProp: 'value' } })).to.deep.equal(
        JSON.stringify([{ aProp: 'value' }])
      );
    });
  });

  describe('flattenArray', async function () {
    it('convert values to flattened array', function () {
      expect(handlebarsCompile('{{json (flattenArray data)}}')({ data: ['value'] })).to.equal('[&quot;value&quot;]');
      expect(handlebarsCompile('{{json (flattenArray data)}}')({ data: 'value' })).to.equal('[&quot;value&quot;]');
      expect(
        handlebarsCompile('{{{json (flattenArray data1 data2 data3 data4)}}}')({
          data1: { aProp: 'value' },
          data2: null,
          data3: 30,
          data4: ['value'],
        })
      ).to.equal(JSON.stringify([{ aProp: 'value' }, null, 30, 'value']));
      expect(
        handlebarsCompile('{{{json (flattenArray data1 data2 data3 data4)}}}')({
          data1: { aProp: 'value' },
          data2: null,
          data3: 0,
          data4: [['value']],
        })
      ).to.equal(JSON.stringify([{ aProp: 'value' }, null, 0, ['value']]));
      expect(
        handlebarsCompile('{{{json (flattenArray data)}}}')({ data: [{ aProp: 'value' }, null, 0, ['value']] })
      ).to.equal(JSON.stringify([{ aProp: 'value' }, null, 0, 'value']));
    });
  });

  describe('filterArray', async function () {
    it('should filter undefined, null, empty string', function () {
      const date = new Date();
      const input = ['one', '  ', undefined, null, {}, date, 0];
      const expected = ['one', {}, date, 0];
      expect(handlebarsCompile('{{{json (filterArray input)}}}')({ input })).to.equal(JSON.stringify(expected));

      expect(handlebarsCompile('{{{json (filterArray input)}}}')({ input: undefined })).to.equal('');
    });
  });

  describe('displayName and displayNameArray', function () {
    it('should format the display name using text_full_name first', function () {
      const input = {
        text_full_name: 'Mr Given1 Family1',
        givenName: 'given',
        familyName: 'family',
        honorific: 'HON',
      };
      const expected = 'Mr Given1 Family1';
      expect(handlebarsCompile('{{{json (displayName input)}}}')({ input: input })).to.equal(JSON.stringify(expected));
      expect(handlebarsCompile('{{{json (displayNameArray input)}}}')({ input: [input] })).to.equal(
        JSON.stringify([expected])
      );
    });
    it('should format the display name using individual properties', function () {
      const input = { givenName: 'given', familyName: 'family', honorific: 'HON' };
      const expected = 'HON given family';
      expect(handlebarsCompile('{{{json (displayName input)}}}')({ input })).to.equal(JSON.stringify(expected));
      expect(handlebarsCompile('{{{json (displayNameArray input)}}}')({ input: [input] })).to.equal(
        JSON.stringify([expected])
      );
    });
    it('should format the display name as empty string when no properties are suitable', function () {
      const input = {
        text_full_name: null,
        givenName: ['given'],
        familyName: { value: 'family' },
        honorific: function () {
          return 'HON';
        },
      };
      const expected = '';
      expect(handlebarsCompile('{{{json (displayName input)}}}')({ input })).to.equal(JSON.stringify(expected));
      expect(handlebarsCompile('{{{json (displayNameArray input)}}}')({ input: [input] })).to.equal(
        JSON.stringify([expected])
      );
    });
    it('should format the display name as empty string when input is not an object', function () {
      const input = ['one'];
      const expected = '';

      expect(handlebarsCompile('{{{json (displayName input)}}}')({ input })).to.equal(JSON.stringify(expected));
      expect(handlebarsCompile('{{{json (displayNameArray input)}}}')({ input: [input] })).to.equal(
        JSON.stringify([expected])
      );
      expect(handlebarsCompile('{{{json (displayNameArray input)}}}')({ input: {} })).to.equal(JSON.stringify({}));
    });
  });

  describe('sort', function () {
    it('should sort ignoring case and punctuation', function () {
      const input = ['réservé', 'Premier', 'Cli.ché', 'communiqué', 'c!afé', 'Adieu'];
      const expected = ['Adieu', 'c!afé', 'Cli.ché', 'communiqué', 'Premier', 'réservé'];
      expect(handlebarsCompile('{{{json (sort input)}}}')({ input })).to.equal(JSON.stringify(expected));
    });
    it('should return a non-array input unchanged', function () {
      const input = { text_full_name: 'My Name' };
      expect(handlebarsCompile('{{{json (sort input)}}}')({ input })).to.equal(JSON.stringify(input));
    });
  });

  describe('unique', function () {
    it('should remove duplicate strings', function () {
      const input = ['one', 'one', 'two', 'three', 'four', 'two', 0];
      const expected = ['one', 'two', 'three', 'four', 0];
      expect(handlebarsCompile('{{{json (unique input)}}}')({ input })).to.equal(JSON.stringify(expected));
    });
    it('should return non-array', function () {
      const input = { text_full_name: 'My Name' };
      expect(handlebarsCompile('{{{json (unique input)}}}')({ input })).to.equal(JSON.stringify(input));
    });
    it('should keep duplicate non-string entries', function () {
      const input = [{ text_full_name: 'My Name' }, 'one', 'one', null, undefined, 2, []];
      const expected = [{ text_full_name: 'My Name' }, 'one', null, undefined, 2, []];
      expect(handlebarsCompile('{{{json (unique input)}}}')({ input })).to.equal(JSON.stringify(expected));
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
