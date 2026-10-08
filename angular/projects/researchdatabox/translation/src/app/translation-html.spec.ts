import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { getTranslationHtmlClasses } from '@researchdatabox/sails-ng-common';
import { restoreTranslationTableSections, sanitizeTranslationEditorHtml, translationPresentationExtensions, translationTableView,
  TranslationTableHeader, TranslationTableCell } from './translation-html';

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
        TableRow, TranslationTableHeader, TranslationTableCell, ...translationPresentationExtensions(policy)],
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

  it('keeps rows added in the editor within the surrounding table section', () => {
    roundTrip('<table class="table table-striped"><thead class="table-light"><tr><th>Level</th></tr><tr><th>Detail</th></tr></thead>'
      + '<tbody class="table-group-divider"><tr><td>Public</td></tr><tr><td>Protected</td></tr></tbody>'
      + '<tfoot class="table-light"><tr><td>Notes</td></tr></tfoot></table>');
    const addRow = (text: string, command: 'addRowBefore' | 'addRowAfter') => {
      let position = -1;
      editor.state.doc.descendants((node, nodePosition) => {
        if (node.isText && node.text === text) position = nodePosition;
      });
      editor.chain().setTextSelection(position + 1)[command]().run();
    };
    addRow('Level', 'addRowBefore');
    addRow('Level', 'addRowAfter');
    addRow('Detail', 'addRowAfter');
    addRow('Public', 'addRowAfter');
    addRow('Protected', 'addRowAfter');
    addRow('Notes', 'addRowAfter');

    const output = sanitizeTranslationEditorHtml(restoreTranslationTableSections(editor.getHTML()), sanitizer, policy);
    const table = new DOMParser().parseFromString(output, 'text/html').querySelector('table')!;
    const sections = Array.from(table.children).filter(element => element.tagName !== 'COLGROUP');
    expect(sections.map(section => `${section.tagName.toLowerCase()}.${section.className}`))
      .toEqual(['thead.table-light', 'tbody.table-group-divider', 'tfoot.table-light']);
    // Rows inside a section stay there; a row after the last header row starts the body.
    expect(sections.map(section => Array.from(section.children).map(row => row.textContent)))
      .toEqual([['', 'Level', '', 'Detail'], ['', 'Public', '', 'Protected', ''], ['Notes', '']]);
    expect(output).not.toContain('data-translation-');
  });

  it('preserves alert wrappers and permitted span marks', () => {
    const doc = roundTrip('<div class="alert alert-warning"><p>Care <span class="approved-emphasis">needed</span></p></div>');
    expect(doc.querySelector('div')?.className).toBe('alert alert-warning');
    expect(doc.querySelector('span')?.className).toBe('approved-emphasis');
    expect(doc.body.textContent).toBe('Care needed');
  });

  it('retains resized header and cell widths through sanitisation and reopening', () => {
    roundTrip('<table class="table"><tbody><tr><th>Level</th><th>Description</th></tr>'
      + '<tr><td>Public</td><td>Details</td></tr></tbody></table>');
    // Resizing updates Tiptap's document attributes; test the actual exported HTML.
    let resized = editor.state.tr;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'tableHeader' || node.type.name === 'tableCell') {
        resized = resized.setNodeMarkup(position, undefined, {
          ...node.attrs, colwidth: [node.textContent === 'Level' || node.textContent === 'Public' ? 220 : 400]
        });
      }
    });
    editor.view.dispatch(resized);
    const saved = sanitizeTranslationEditorHtml(restoreTranslationTableSections(editor.getHTML()), sanitizer, policy);
    const savedDoc = new DOMParser().parseFromString(saved, 'text/html');
    expect(Array.from(savedDoc.querySelectorAll('col')).map(col => col.getAttribute('width'))).toEqual(['220', '400']);
    expect(saved).not.toMatch(/style=|colwidth=/);
    editor.commands.setContent(saved);
    const widths: number[][] = [];
    editor.state.doc.descendants(node => {
      if (node.type.name === 'tableHeader' || node.type.name === 'tableCell') widths.push(node.attrs['colwidth']);
    });
    expect(widths).toEqual([[220], [400], [220], [400]]);
    expect(editor.view.dom.querySelector('col')?.style.width).toBe('220px');
  });

  it('reads logical widths across merged cells, rowspans and nested tables', () => {
    const html = '<table><colgroup><col width="220"><col width="400"><col width="300"></colgroup><tbody>'
      + '<tr><th colspan="2" colwidth="220,400">Merged</th><th rowspan="2" colwidth="300">Fixed</th></tr>'
      + '<tr><td colwidth="220">A</td><td colwidth="400">B</td></tr>'
      + '<tr><td rowspan="2">C</td><td>D</td><td>E</td></tr>'
      + '<tr><td colspan="2">F<table><tr><td colwidth="90">Nested</td></tr></table></td></tr>'
      + '</tbody></table>';
    roundTrip(html);
    const widths: Record<string, number[] | null> = {};
    editor.state.doc.descendants(node => {
      if (node.type.name === 'tableHeader' || node.type.name === 'tableCell') {
        widths[node.textContent] = node.attrs['colwidth'];
      }
    });
    expect(widths['Merged']).toEqual([220, 400]);
    expect(widths['B']).toEqual([400]);
    expect(widths['FNested']).toEqual([400, 300]);
    expect(widths['Nested']).toEqual([90]);
    const saved = sanitizeTranslationEditorHtml(restoreTranslationTableSections(editor.getHTML()), sanitizer, policy);
    editor.commands.setContent(saved);
    const mergedWidths: number[][] = [];
    editor.state.doc.descendants(node => {
      if (node.attrs['colspan'] === 2) mergedWidths.push(node.attrs['colwidth']);
    });
    expect(mergedWidths).toEqual([[220, 400], [400, 300]]);
  });

  it('rejects malformed or misplaced widths without enabling inline CSS', () => {
    const saved = sanitizeTranslationEditorHtml('<p width="220">Text</p><table width="620"><colgroup>'
      + '<col width="220"><col width="50%"><col width="9007199254740992"></colgroup>'
      + '<tr><td colwidth="200px" style="color:red">A</td><td colwidth="-1">B</td><td>C</td></tr></table>', sanitizer, policy);
    const document = new DOMParser().parseFromString(saved, 'text/html');
    expect(document.querySelectorAll('[width]').length).toBe(1);
    expect(document.querySelector('[width]')?.tagName).toBe('COL');
    expect(saved).not.toMatch(/style=|colwidth=|200px|50%/);
  });

  it('removes executable markup before width normalization reaches Angular sanitization', () => {
    const angularSanitize = spyOn(sanitizer, 'sanitize').and.callThrough();
    const payload = '<p>&lt;img src=x onerror="alert(1)"&gt;</p>'
      + '<table><tr><td colwidth="220" onclick="alert(1)">Text</td></tr></table>'
      + '<img src="x" onerror="alert(1)"><script>alert(1)</script><svg onload="alert(1)"></svg>';
    const saved = sanitizeTranslationEditorHtml(payload, sanitizer, policy);
    const normalized = String(angularSanitize.calls.first().args[1]);
    const document = new DOMParser().parseFromString(normalized, 'text/html');

    expect(document.querySelector('img, script, svg, [onclick], [onerror], [onload]')).toBeNull();
    expect(document.querySelector('col')?.getAttribute('width')).toBe('220');
    expect(document.querySelector('p')?.textContent).toBe('<img src=x onerror="alert(1)">');
    const reopened = new DOMParser().parseFromString(sanitizeTranslationEditorHtml(saved, sanitizer, policy), 'text/html');
    expect(reopened.querySelector('img, script, svg, [onclick], [onerror], [onload]')).toBeNull();
    expect(reopened.querySelector('p')?.textContent).toBe('<img src=x onerror="alert(1)">');
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
