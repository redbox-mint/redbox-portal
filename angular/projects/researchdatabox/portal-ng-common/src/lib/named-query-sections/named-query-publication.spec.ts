import { parse, print } from 'graphql';
import { visualPublicationProjection } from './named-query-publication';
const field = (id: string, label: string, alias: string) => ({
  id: 'metadata:/' + id,
  label,
  type: 'text',
  selections: [{ responsePath: ['metadata', alias] }],
});
describe('Readable publication aliases', () => {
  it('uses catalogue keys and the same aliases across variants', () => {
    const result = visualPublicationProjection(
      '{records{nodes{metadata{... on A{a:one b:two c:three} ... on B{d:three}}}}}',
      [
        field('title', 'Title', 'a'),
        field('ethics_approval_status', 'Ethics approval', 'b'),
        {
          ...field('startDate', 'Start date', 'c'),
          selections: [{ responsePath: ['metadata', 'c'] }, { responsePath: ['metadata', 'd'] }],
        },
      ]
    );
    expect(result.fields.map(f => f.path.at(-1))).toEqual(['title', 'ethicsApprovalStatus', 'startDate']);
    expect(result.document).toContain('ethicsApprovalStatus: two');
    expect(() => parse(result.document)).not.toThrow();
  });
  it('makes valid unique names with stable suffixes independent of selection order', () => {
    const fields = [
      { ...field('a/title', 'One', 'a'), selections: [{ responsePath: ['metadata', 'p', 'a'] }] },
      { ...field('b/title', 'Two', 'b'), selections: [{ responsePath: ['metadata', 'q', 'b'] }] },
      field('123 strange-key', 'Three', 'c'),
    ];
    const document = '{metadata{p:one{a:title} q:two{b:title} c:three}}';
    const one = visualPublicationProjection(document, fields),
      two = visualPublicationProjection(document, [...fields].reverse());
    expect(one.fields.map(f => f.path.at(-1))).toEqual(['title', 'title2', 'field123StrangeKey']);
    expect(one.fields.every(f => /^[_A-Za-z][_0-9A-Za-z]*$/.test(f.path.at(-1)!))).toBeTrue();
    expect(one.fields.map(f => f.path.join('.')).sort()).toEqual(two.fields.map(f => f.path.join('.')).sort());
  });
  it('retains existing numbered publication response paths without rewriting their document', () => {
    const document = '{metadata{explorer_field_1:title}}';
    const result = visualPublicationProjection(document, [field('title', 'Title', 'internal')]);
    expect(result.fields[0].path).toEqual(['metadata', 'explorer_field_1']);
    expect(print(parse(result.document))).toBe(print(parse(document)));
  });
});
