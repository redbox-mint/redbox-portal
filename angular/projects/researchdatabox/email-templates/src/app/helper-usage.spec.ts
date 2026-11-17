import { blockHelperScaffold, DOCUMENTED_HELPERS, helperInsertion, helperUsage } from './helper-usage';
import { completionEdit, completionQuery } from './template-completion';

describe('helper usage and scaffolds (UR-U03)', () => {
  for (const helper of ['each', 'if', 'unless', 'with']) {
    it(`inserts a balanced ${helper} block with a replaceable path from panel or completion`, () => {
      const scaffold = helperInsertion(helper);
      expect(scaffold).toContain(`{{#${helper} record.metadata.YOUR_`);
      expect(scaffold).toContain(`{{/${helper}}}`);
      expect(scaffold).toContain('\n');
      const prefix = helper.slice(0, 2);
      for (const text of [`{{${prefix}`, `{{#${prefix}`, `{{${prefix}}}`, `{{#${prefix}}}`, `{{{${prefix}}}}`]) {
        const query = completionQuery(text, text.indexOf(prefix) + prefix.length, [helper])!;
        const edit = completionEdit(text, query, {
          kind: 'helper',
          label: helper,
          value: helper,
          type: 'helper',
          container: false,
        });
        expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(scaffold);
        expect(edit.text.slice(edit.selection!.start, edit.selection!.end)).toMatch(/^YOUR_[A-Z]+$/);
      }
    });
  }
  it('supplies syntax and example keys for every bundled helper and keeps unknown hook helpers optional', () => {
    for (const helper of DOCUMENTED_HELPERS)
      expect(helperUsage(helper)).toEqual({
        syntaxKey: `email-templates-helper-${helper}-syntax`,
        exampleKey:
          helper === 'attachmentDownloadUrl'
            ? 'email-templates-helper-attachmentDownloadUrl-example-brand-name'
            : `email-templates-helper-${helper}-example`,
      });
    expect(helperUsage('customHookHelper')).toBeNull();
    expect(blockHelperScaffold('get')).toBeNull();
    expect(helperInsertion('formatDate')).toBe('{{formatDate }}');
  });
});
