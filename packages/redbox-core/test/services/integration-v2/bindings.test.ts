let expect: Chai.ExpectStatic;
import { validateHandlebarsTemplate as validateDoiHandlebarsTemplate } from '../../../src/services/doi-v2/bindings';
import { validateHandlebarsTemplate as validateFigshareHandlebarsTemplate } from '../../../src/services/figshare-v2/bindings';
import { validateHandlebarsTemplate as validateOniHandlebarsTemplate } from '../../../src/services/oni-v2/bindings';

describe('integration-v2 bindings', function () {
  const validators: Array<[string, (template: string) => void]> = [
    ['DOI', validateDoiHandlebarsTemplate],
    ['Figshare', validateFigshareHandlebarsTemplate],
    ['Oni', validateOniHandlebarsTemplate],
  ];

  before(async function () {
    ({ expect } = await import('chai'));
  });

  it('allows simple lookups and approved inline helpers', function () {
    for (const [, validate] of validators) {
      expect(() => validate('{{metadata.title}} {{default metadata.subtitle "Untitled"}}')).to.not.throw();
    }
  });

  it('rejects block helpers with whitespace control', function () {
    for (const [name, validate] of validators) {
      expect(() => validate('{{~#each metadata.creators}}{{text_full_name}}{{/each}}')).to.throw(
        `Unsupported Handlebars block helper 'each' in ${name} binding`
      );
    }
  });

  it('rejects unapproved inline helpers with whitespace control', function () {
    for (const [name, validate] of validators) {
      expect(() => validate('{{~lookup metadata key}}')).to.throw(
        `Unsupported Handlebars helper 'lookup' in ${name} binding`
      );
    }
  });

  it('rejects unapproved helpers inside subexpressions', function () {
    for (const [name, validate] of validators) {
      expect(() => validate('{{default (lookup metadata key) "fallback"}}')).to.throw(
        `Unsupported Handlebars helper 'lookup' in ${name} binding`
      );
    }
  });
});
