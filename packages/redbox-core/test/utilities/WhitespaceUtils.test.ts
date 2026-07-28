import { expect } from 'chai';
import { trimRecordWhitespace } from '../../src/utilities/WhitespaceUtils';

describe('WhitespaceUtils', function () {
  it('trims strings nested in objects and arrays under metadata by default', function () {
    const record = {
      metadata: {
        title: '  Test project name  ',
        description: '\tA description\n',
        nested: {
          deeper: {
            value: ' deep '
          }
        },
        contributor_ci: [
          { text_full_name: '  Ada Lovelace ', email: ' ada@example.com' },
          { text_full_name: 'Grace Hopper' }
        ],
        keywords: [' one', 'two ', 'three']
      }
    };

    const changed = trimRecordWhitespace(record);

    expect(changed).to.equal(true);
    expect(record.metadata.title).to.equal('Test project name');
    expect(record.metadata.description).to.equal('A description');
    expect(record.metadata.nested.deeper.value).to.equal('deep');
    expect(record.metadata.contributor_ci[0]).to.deep.equal({
      text_full_name: 'Ada Lovelace',
      email: 'ada@example.com'
    });
    expect(record.metadata.contributor_ci[1]).to.deep.equal({ text_full_name: 'Grace Hopper' });
    expect(record.metadata.keywords).to.deep.equal(['one', 'two', 'three']);
  });

  it('reports no change when every string is already trimmed', function () {
    const record = {
      metadata: {
        title: 'Already clean',
        contributor_ci: [{ text_full_name: 'Ada Lovelace' }]
      }
    };

    expect(trimRecordWhitespace(record)).to.equal(false);
    expect(record.metadata.title).to.equal('Already clean');
  });

  it('leaves metaMetadata and authorization untouched by default', function () {
    const record = {
      metaMetadata: { type: '  rdmp  ' },
      authorization: { edit: ['  someone  '] },
      metadata: { title: '  Trim me  ' }
    };

    expect(trimRecordWhitespace(record)).to.equal(true);
    expect(record.metaMetadata.type).to.equal('  rdmp  ');
    expect(record.authorization.edit[0]).to.equal('  someone  ');
    expect(record.metadata.title).to.equal('Trim me');
  });

  it('walks the paths supplied by the caller', function () {
    const record = {
      metaMetadata: { type: '  rdmp  ' },
      metadata: { title: '  Trim me  ' }
    };

    expect(trimRecordWhitespace(record, { paths: ['metadata', 'metaMetadata'] })).to.equal(true);
    expect(record.metaMetadata.type).to.equal('rdmp');
    expect(record.metadata.title).to.equal('Trim me');
  });

  it('only trims the include-list when fields is supplied', function () {
    const record = {
      metadata: {
        title: '  Trim me  ',
        description: '  Leave me  ',
        contributor_ci: [{ text_full_name: '  Ada  ', email: '  ada@example.com  ' }]
      }
    };

    const changed = trimRecordWhitespace(record, { fields: ['title', 'contributor_ci[].text_full_name'] });

    expect(changed).to.equal(true);
    expect(record.metadata.title).to.equal('Trim me');
    expect(record.metadata.description).to.equal('  Leave me  ');
    expect(record.metadata.contributor_ci[0].text_full_name).to.equal('Ada');
    expect(record.metadata.contributor_ci[0].email).to.equal('  ada@example.com  ');
  });

  it('includes an entire subtree when the include-list names a container', function () {
    const record = {
      metadata: {
        title: '  Leave me  ',
        contributor_ci: [{ text_full_name: '  Ada  ', email: '  ada@example.com  ' }]
      }
    };

    trimRecordWhitespace(record, { fields: ['contributor_ci'] });

    expect(record.metadata.title).to.equal('  Leave me  ');
    expect(record.metadata.contributor_ci[0]).to.deep.equal({
      text_full_name: 'Ada',
      email: 'ada@example.com'
    });
  });

  it('excludes a field by leaf name inside a repeatable', function () {
    const record = {
      metadata: {
        title: '  Trim me  ',
        related: [
          { related_title: '  A title  ', related_url: '  http://example.com/a  ' },
          { related_title: '  B title  ', related_url: '  http://example.com/b  ' }
        ]
      }
    };

    trimRecordWhitespace(record, { excludeFields: ['related_url'] });

    expect(record.metadata.title).to.equal('Trim me');
    expect(record.metadata.related[0].related_title).to.equal('A title');
    expect(record.metadata.related[0].related_url).to.equal('  http://example.com/a  ');
    expect(record.metadata.related[1].related_url).to.equal('  http://example.com/b  ');
  });

  it('excludes everything beneath an excluded container', function () {
    const record = {
      metadata: {
        title: '  Trim me  ',
        related: [{ related_title: '  A title  ' }]
      }
    };

    trimRecordWhitespace(record, { excludeFields: ['related'] });

    expect(record.metadata.title).to.equal('Trim me');
    expect(record.metadata.related[0].related_title).to.equal('  A title  ');
  });

  it('gives fields precedence over excludeFields when both are set', function () {
    const record = {
      metadata: {
        title: '  Trim me  ',
        description: '  Leave me  '
      }
    };

    trimRecordWhitespace(record, { fields: ['title'], excludeFields: ['title'] });

    expect(record.metadata.title).to.equal('Trim me');
    expect(record.metadata.description).to.equal('  Leave me  ');
  });

  it('converts strings that trim to empty into null when nullifyEmpty is set', function () {
    const record = {
      metadata: {
        blank: '   ',
        empty: '',
        title: '  Trim me  '
      }
    };

    expect(trimRecordWhitespace(record, { nullifyEmpty: true })).to.equal(true);
    expect(record.metadata.blank).to.equal(null);
    expect(record.metadata.empty).to.equal(null);
    expect(record.metadata.title).to.equal('Trim me');
  });

  it('leaves whitespace-only strings as empty strings by default', function () {
    const record = { metadata: { blank: '   ' } };

    expect(trimRecordWhitespace(record)).to.equal(true);
    expect(record.metadata.blank).to.equal('');
  });

  it('leaves non-string values untouched', function () {
    const date = new Date('2026-07-28T00:00:00.000Z');
    const buffer = Buffer.from('  padded  ');
    const record = {
      metadata: {
        count: 42,
        flag: false,
        missing: null,
        absent: undefined,
        date,
        buffer,
        title: '  Trim me  '
      }
    };

    expect(trimRecordWhitespace(record)).to.equal(true);
    expect(record.metadata.count).to.equal(42);
    expect(record.metadata.flag).to.equal(false);
    expect(record.metadata.missing).to.equal(null);
    expect(record.metadata.absent).to.equal(undefined);
    expect(record.metadata.date).to.equal(date);
    expect(record.metadata.date.toISOString()).to.equal('2026-07-28T00:00:00.000Z');
    expect(record.metadata.buffer.toString()).to.equal('  padded  ');
  });

  it('preserves internal formatting of markdown strings', function () {
    const markdown = '# Heading\n\nA line ending in a markdown break  \nnext line\n\n- item one\n- item two';
    const record = { metadata: { description: `\n${markdown}\n  ` } };

    expect(trimRecordWhitespace(record)).to.equal(true);
    expect(record.metadata.description).to.equal(markdown);
  });

  it('never modifies object keys', function () {
    const record = { metadata: { '  spaced key  ': '  value  ' } };

    trimRecordWhitespace(record);

    expect(Object.keys(record.metadata)).to.deep.equal(['  spaced key  ']);
    expect(record.metadata['  spaced key  ']).to.equal('value');
  });

  it('handles cyclic structures without recursing forever', function () {
    const cyclic: Record<string, any> = { title: '  Trim me  ' };
    cyclic.self = cyclic;
    cyclic.children = [cyclic];
    const record = { metadata: cyclic };

    expect(trimRecordWhitespace(record)).to.equal(true);
    expect(record.metadata.title).to.equal('Trim me');
    expect(record.metadata.self).to.equal(cyclic);
  });

  it('ignores missing paths and non-object targets', function () {
    expect(trimRecordWhitespace({ metaMetadata: {} })).to.equal(false);
    expect(trimRecordWhitespace(null)).to.equal(false);
    expect(trimRecordWhitespace('  a string  ')).to.equal(false);
  });

  it('trims a root path that resolves directly to a string', function () {
    const record = { metadata: {}, title: '  Trim me  ' };

    expect(trimRecordWhitespace(record, { paths: ['title'] })).to.equal(true);
    expect(record.title).to.equal('Trim me');
  });

  it('includes the whole selected root when fields names that root', function () {
    const record = { metadata: { title: '  Trim me  ', nested: { value: '  Me too  ' } } };

    expect(trimRecordWhitespace(record, { fields: ['metadata'] })).to.equal(true);
    expect(record.metadata).to.deep.equal({ title: 'Trim me', nested: { value: 'Me too' } });
  });
});
