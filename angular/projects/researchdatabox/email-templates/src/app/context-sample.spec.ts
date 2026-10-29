import Ajv2020 from 'ajv/dist/2020';
import { validateContextJson } from './context-validation';
import { generateSampleContext, MAX_SAMPLE_CONDITION_PASSES, SampleContextError } from './context-sample';

describe('generateSampleContext', () => {
  const ajv = new Ajv2020({ strict: false });
  it('uses examples, defaults, enums and placeholders, with one array item', () => {
    const schema = {
      type: 'object',
      properties: {
        example: { examples: ['Example title'], default: 'Other' },
        default: { default: 4 },
        enum: { enum: ['draft', 'published'] },
        authors: {
          type: 'array',
          items: { type: 'object', properties: { email: { type: 'string', format: 'email' } } },
        },
        enabled: { type: 'boolean' },
        count: { type: 'integer', minimum: 2 },
        nullable: { type: 'null' },
      },
    };
    expect(generateSampleContext(schema)).toEqual({
      example: 'Example title',
      default: 4,
      enum: 'draft',
      authors: [{ email: 'researcher@example.org' }],
      enabled: true,
      count: 2,
      nullable: null,
    });
    expect(schema.properties.authors.items.properties.email).toEqual({ type: 'string', format: 'email' });
  });
  it('uses labels as sample text for typeless form-config fields, leaving unlabelled nodes empty', () => {
    expect(
      generateSampleContext({
        type: 'object',
        properties: { text_1: { title: 'Project title' }, hookRoot: {} },
      })
    ).toEqual({ text_1: 'Project title', hookRoot: null });
  });
  it('resolves references and filters prototype keys in defaults without mutating them', () => {
    const result = generateSampleContext({
      type: 'object',
      $defs: { title: { examples: ['Research'] } },
      properties: {
        title: { $ref: '#/$defs/title' },
        safe: { default: JSON.parse('{"__proto__":{"polluted":true},"ok":1}') },
      },
    });
    expect(JSON.stringify(result)).toBe('{"title":"Research","safe":{"ok":1}}');
    expect(({} as any).polluted).toBeUndefined();
  });
  it('keeps base properties beside renderer-style conditional allOf and deep merges applicable branches', () => {
    // json-schema-renderer.applyConditionals emits properties + allOf[{if, then, else}].
    const schema = {
      properties: {
        record: {
          properties: {
            metadata: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', examples: ['Research'] },
                authors: { type: 'array', items: { properties: { name: { type: 'string' } } } },
                details: { properties: { summary: { type: 'string', default: 'Keep summary' } } },
              },
              allOf: [
                {
                  if: { required: ['title'], properties: { title: { const: 'Research' } } },
                  then: {
                    required: ['authors'],
                    properties: {
                      details: { properties: { access: { const: 'Open' } } },
                      authors: { type: 'array', items: { properties: { email: { const: 'jo@example.org' } } } },
                    },
                  },
                  else: { properties: { details: { properties: { access: { const: 'Closed' } } } } },
                },
                {
                  if: { properties: { title: { const: 'Other' } } },
                  then: { properties: { unwanted: { const: true } } },
                  else: { properties: { details: { properties: { licence: { const: 'CC-BY' } } } } },
                },
              ],
            },
          },
        },
      },
    };
    const before = JSON.stringify(schema);
    const result = generateSampleContext(schema);
    expect(result).toEqual({
      record: {
        metadata: {
          title: 'Research',
          authors: [{ name: 'Example', email: 'jo@example.org' }],
          details: { summary: 'Keep summary', access: 'Open', licence: 'CC-BY' },
        },
      },
    });
    expect(validateContextJson(result, schema)).toEqual([]);
    expect(JSON.stringify(schema)).toBe(before);
  });
  it('leaves read-only (derived) fields such as imports out of the sample', () => {
    const schema = {
      type: 'object',
      properties: {
        record: { type: 'object', properties: { title: { type: 'string' } } },
        imports: { type: 'object', readOnly: true, properties: { record: { $ref: '#/properties/record' } } },
      },
    };
    expect(generateSampleContext(schema)).toEqual({ record: { title: 'Example' } });
  });
  it('merges unconditional properties in a conditional child before selecting its branch', () => {
    const schema = {
      type: 'object',
      properties: { kind: { default: 'original' } },
      allOf: [
        {
          properties: { kind: { const: 'conditional' } },
          if: { properties: { kind: { const: 'conditional' } } },
          then: { required: ['extra'], properties: { extra: { const: 1 } } },
          else: { properties: { other: { const: 2 } } },
        },
      ],
    };
    const result = generateSampleContext(schema);
    expect(result).toEqual({ kind: 'conditional', extra: 1 });
    expect(validateContextJson(result, schema)).toEqual([]);
    expect(ajv.validate(schema, result)).toBeTrue();
  });
  it('revisits earlier conditions after later branches change discriminators, in either order', () => {
    const branches = [
      {
        if: { properties: { kind: { const: 'new' } } },
        then: { required: ['extra'], properties: { extra: { const: 1 } } },
        else: { properties: { obsolete: { const: 2 } } },
      },
      {
        if: { properties: { title: { const: 'Research' } } },
        then: { properties: { kind: { const: 'new' } } },
      },
    ];
    for (const allOf of [branches, [...branches].reverse()]) {
      const schema = {
        type: 'object',
        properties: { kind: { default: 'old' }, title: { default: 'Research' }, extra: { default: 0 } },
        allOf,
      };
      const result = generateSampleContext(schema);
      expect(result).toEqual({ kind: 'new', title: 'Research', extra: 1 });
      expect(validateContextJson(result, schema)).toEqual([]);
      expect(ajv.validate(schema, result)).toBeTrue();
    }
  });
  it('caps conditional stabilization when a discriminator oscillates', () => {
    let evaluations = 0;
    const condition = { properties: { kind: { const: 'a' } } };
    const branch = {
      get if() {
        evaluations++;
        return condition;
      },
      then: { properties: { kind: { const: 'b' } } },
      else: { properties: { kind: { const: 'a' } } },
    };
    const schema = { properties: { kind: { default: 'a' } }, allOf: [branch] };
    expect(() => generateSampleContext(schema)).toThrowError(SampleContextError);
    expect(evaluations).toBe(MAX_SAMPLE_CONDITION_PASSES + 1);
  });
  it('validates the final sample and reports unsatisfied constraints without data values', () => {
    const schema = { properties: { secret: { type: 'string', default: 'PRIVATE', minLength: 20 } } };
    expect(() => generateSampleContext(schema)).toThrowError(
      SampleContextError,
      'Unable to generate a valid context sample within the generation limits.'
    );
  });
});
