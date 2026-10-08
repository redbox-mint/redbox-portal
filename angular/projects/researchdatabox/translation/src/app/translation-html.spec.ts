import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { getTranslationHtmlClasses } from '@researchdatabox/sails-ng-common';
import { restoreTranslationTableSections, sanitizeTranslationEditorHtml, translationPresentationExtensions, translationTableView } from './translation-html';

describe('HTML translation presentation', () => {
  const policy = getTranslationHtmlClasses({ th: ['classification-public'], span: ['approved-emphasis'] });
  let editor: Editor;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    sanitizer = TestBed.inject(DomSanitizer);
  });
  afterEach(() => editor?.destroy());

  function roundTrip(html: string): Document {
    editor = new Editor({
      extensions: [StarterKit, Table.configure({ resizable: true, View: translationTableView(policy) }),
        TableRow, TableHeader, TableCell, ...translationPresentationExtensions(policy)],
      content: sanitizeTranslationEditorHtml(html, sanitizer, policy)
    });
    const output = sanitizeTranslationEditorHtml(restoreTranslationTableSections(editor.getHTML()), sanitizer, policy);
    return new DOMParser().parseFromString(output, 'text/html');
  }

  it('retains table and classification classes, section classes and scope after changing wording', () => {
    const html = '<table class="table table-bordered"><thead class="table-light"><tr><th scope="col">Level</th></tr></thead>'
      + '<tbody class="table-group-divider"><tr><th class="classification-public" scope="row">Public</th></tr></tbody>'
      + '<tfoot class="table-light"><tr><td>Notes</td></tr></tfoot></table>';
    roundTrip(html);
    expect(editor.view.dom.querySelector('table')?.className).toBe('table table-bordered');
    const textPosition: number[] = [];
    editor.state.doc.descendants((node, position) => {
      if (node.isText && node.text === 'Public') textPosition.push(position);
    });
    editor.commands.insertContentAt({ from: textPosition[0], to: textPosition[0] + 6 }, 'Official (Public)');
    expect(editor.view.dom.querySelector('table')?.className).toBe('table table-bordered');
    const output = sanitizeTranslationEditorHtml(restoreTranslationTableSections(editor.getHTML()), sanitizer, policy);
    const doc = new DOMParser().parseFromString(output, 'text/html');
    expect(doc.querySelector('table')?.className).toBe('table table-bordered');
    expect(doc.querySelector('thead')?.className).toBe('table-light');
    expect(doc.querySelector('tbody')?.className).toBe('table-group-divider');
    expect(doc.querySelector('tbody th')?.className).toBe('classification-public');
    expect(doc.querySelector('tbody th')?.getAttribute('scope')).toBe('row');
    expect(doc.querySelector('tbody th')?.textContent).toBe('Official (Public)');
    expect(doc.querySelector('tfoot')?.className).toBe('table-light');
    expect(output).not.toContain('data-translation-');
    // Reopening the exported source must retain the same presentation.
    editor.destroy();
    const reopened = roundTrip(output);
    expect(reopened.querySelector('tbody th')?.className).toBe('classification-public');
    expect(reopened.querySelector('thead')?.className).toBe('table-light');
  });

  it('preserves alert wrappers and permitted span marks', () => {
    const doc = roundTrip('<div class="alert alert-warning"><p>Care <span class="approved-emphasis">needed</span></p></div>');
    expect(doc.querySelector('div')?.className).toBe('alert alert-warning');
    expect(doc.querySelector('span')?.className).toBe('approved-emphasis');
    expect(doc.body.textContent).toBe('Care needed');
  });

  it('removes CSS, executable HTML and unapproved or misplaced classes in both source and rich mode', () => {
    const html = '<style>body{display:none}</style><script>alert(1)</script>'
      + '<p class="table d-none" style="position:fixed" onclick="alert(1)">Safe</p>'
      + '<table class="table evil"><tbody><tr><th class="classification-public evil" style="color:red">Public</th></tr></tbody></table>'
      + '<a href="javascript:alert(1)" onmouseover="alert(1)" target="_blank">Unsafe link</a>'
      + '<a href="https://example.com" target="_blank">Safe link</a>';
    const source = sanitizeTranslationEditorHtml(html, sanitizer, policy);
    const doc = roundTrip(source);
    expect(source).not.toMatch(/<script|<style|style=|onclick=|onmouseover=|href="javascript:/);
    expect(doc.querySelector('p')?.hasAttribute('class')).toBeFalse();
    expect(doc.querySelector('table')?.className).toBe('table');
    expect(doc.querySelector('th')?.className).toBe('classification-public');
    expect(doc.querySelector('a')?.getAttribute('rel')).toContain('noopener');
  });
});
