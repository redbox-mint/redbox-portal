import { changedLineCount, identifierAt, sameContent, utf8Bytes } from './email-templates.model';

describe('email template helpers', () => {
  describe('changedLineCount', () => {
    it('is zero for identical bodies', () => {
      expect(changedLineCount('a\nb', 'a\nb')).toBe(0);
    });

    it('counts a single edited line once', () => {
      expect(changedLineCount('a\nb\nc', 'a\nB\nc')).toBe(1);
    });

    it('counts an inserted line once rather than every following line', () => {
      expect(changedLineCount('a\nb\nc\nd', 'a\nnew\nb\nc\nd')).toBe(1);
    });

    it('counts removals and the larger side of a replaced block', () => {
      expect(changedLineCount('a\nb\nc', 'a')).toBe(2);
      expect(changedLineCount('a\nx\ny\nz', 'a\nq')).toBe(3);
    });
  });

  describe('identifierAt', () => {
    const source = '<p>\n  Submitted by {{submitter.name}}\n</p>';

    it('returns the context root at a one-based position', () => {
      expect(identifierAt(source, 2, 18)).toBe('submitter');
    });

    it('strips @root and returns null away from identifiers', () => {
      expect(identifierAt('{{@root.secret.x}}', 1, 3)).toBe('secret');
      expect(identifierAt(source, 1, 1)).toBeNull();
      expect(identifierAt(source, 9, 1)).toBeNull();
    });
  });

  it('compares content and measures UTF-8 bytes', () => {
    expect(
      sameContent({ subject: 'a', body: 'b', format: 'html' }, { subject: 'a', body: 'b', format: 'html' })
    ).toBeTrue();
    expect(
      sameContent({ subject: 'a', body: 'b', format: 'html' }, { subject: 'a', body: 'b', format: 'text' })
    ).toBeFalse();
    expect(utf8Bytes('é')).toBe(2);
  });
});
