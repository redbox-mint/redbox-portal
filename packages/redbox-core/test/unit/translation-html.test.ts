import { strict as assert } from 'node:assert';
import { JSDOM } from 'jsdom';
import { getTranslationHtmlClasses, filterTranslationHtmlClasses } from '@researchdatabox/sails-ng-common';
import { sanitizeTranslationHtml } from '../../src/utilities/TranslationHtml';

describe('HTML translation policy', () => {
  it('accepts only exact, element-specific developer additions', () => {
    const policy = getTranslationHtmlClasses({
      th: ['classification-public', '*', 'two classes', 'classification-public', 42],
      script: ['anything'], td: 'classification-public'
    });
    assert.equal(filterTranslationHtmlClasses('classification-public table-light evil classification-public', 'TH', policy),
      'classification-public table-light');
    assert.equal(filterTranslationHtmlClasses('classification-public', 'td', policy), '');
    assert.equal(policy.script, undefined);
  });

  it('retains permitted presentation but rejects inline CSS, executable content and arbitrary classes', () => {
    const output = sanitizeTranslationHtml(
      '<style>body{display:none}</style><script>alert(1)</script><iframe src="https://example.com"></iframe>'
      + '<table class="table table-bordered d-none" style="color:red"><thead class="table-light"><tr>'
      + '<th class="classification-public unknown" scope="col" onclick="alert(1)">Public</th></tr></thead></table>'
      + '<a href="javascript:alert(1)" target="_blank" onmouseover="alert(1)">Link</a>'
      + '<svg onload="alert(1)"></svg><p class="alert alert-info" data-translation-section="thead">Help</p>',
      { th: ['classification-public'] }
    );
    const document = new JSDOM(output).window.document;
    assert.equal(document.querySelector('table')?.className, 'table table-bordered');
    assert.equal(document.querySelector('thead')?.className, 'table-light');
    assert.equal(document.querySelector('th')?.className, 'classification-public');
    assert.equal(document.querySelector('th')?.getAttribute('scope'), 'col');
    assert.equal(document.querySelector('a')?.hasAttribute('href'), false);
    assert.equal(document.querySelector('a')?.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(document.querySelector('p')?.className, 'alert alert-info');
    assert.doesNotMatch(output, /<style|<script|<iframe|<svg|style=|onclick=|onmouseover=|data-translation-/);
  });

  it('does not leak one site policy into another call', () => {
    const html = '<p class="site-specific">Wording</p>';
    assert.match(sanitizeTranslationHtml(html, { p: ['site-specific'] }), /class="site-specific"/);
    assert.equal(sanitizeTranslationHtml(html), '<p>Wording</p>');
  });

  it('converts editor widths to numeric columns and preserves them across repeated server saves', () => {
    const html = '<table class="table" style="width:620px"><tbody><tr>'
      + '<th colwidth="220">Level</th><td colwidth="400">Description</td></tr></tbody></table>';
    const saved = sanitizeTranslationHtml(html);
    const document = new JSDOM(saved).window.document;
    assert.deepEqual(Array.from(document.querySelectorAll('col')).map(col => col.getAttribute('width')), ['220', '400']);
    assert.doesNotMatch(saved, /style=|colwidth=/);
    assert.equal(sanitizeTranslationHtml(saved), saved);
  });

  it('allows only numeric width attributes on columns and rejects malformed editor width arrays', () => {
    const html = '<p width="220">Text</p><table width="620"><colgroup>'
      + '<col width="220"><col width="50%"><col width="-1"><col width="1e3">'
      + '<col width="9007199254740992"><col width="expression(alert(1))"></colgroup><tbody><tr>'
      + '<td colwidth="200px">A</td><td colwidth="-5">B</td><td colwidth="220,400">C</td>'
      + '<td colspan="2" colwidth="220">D</td><td width="100">E</td></tr></tbody></table>';
    const saved = sanitizeTranslationHtml(html);
    const document = new JSDOM(saved).window.document;
    assert.equal(document.querySelectorAll('[width]').length, 1);
    assert.equal(document.querySelector('[width]')?.tagName, 'COL');
    assert.equal(document.querySelector('[width]')?.getAttribute('width'), '220');
    assert.doesNotMatch(saved, /colwidth=|expression|200px/);
  });

  it('keeps unmeasured columns in place when only a later column has an editor width', () => {
    const saved = sanitizeTranslationHtml('<table><tr><td>Automatic</td><td colwidth="400">Sized</td></tr></table>');
    const document = new JSDOM(saved).window.document;
    assert.deepEqual(Array.from(document.querySelectorAll('col')).map(col => col.getAttribute('width')), [null, '400']);
  });

  it('reads editor widths from later rows using their logical columns', () => {
    const later = new JSDOM(sanitizeTranslationHtml('<table><tr><td>A</td></tr><tr><td colwidth="220">B</td></tr></table>'))
      .window.document;
    assert.deepEqual(Array.from(later.querySelectorAll('col')).map(col => col.getAttribute('width')), ['220']);

    // C sits in the second logical column because A spans both rows; the first measured width wins.
    const spanned = new JSDOM(sanitizeTranslationHtml('<table><tr><td rowspan="2">A</td><td>B</td><td colwidth="0">D</td></tr>'
      + '<tr><td colwidth="300">C</td><td colwidth="150">E</td></tr><tr><td colwidth="90">F</td><td colwidth="400">G</td>'
      + '<td colwidth="500">H</td></tr></table>')).window.document;
    assert.deepEqual(Array.from(spanned.querySelectorAll('col')).map(col => col.getAttribute('width')), ['90', '300', '150']);
  });

  it('does not let unmeasured editor widths clear saved column widths', () => {
    const saved = sanitizeTranslationHtml('<table><colgroup><col width="220"><col width="400"></colgroup><tbody>'
      + '<tr><td>A</td><td>B</td></tr><tr><td colspan="2" colwidth="0,400">C</td></tr></tbody></table>');
    const document = new JSDOM(saved).window.document;
    assert.deepEqual(Array.from(document.querySelectorAll('col')).map(col => col.getAttribute('width')), ['220', '400']);
  });

  it('keeps encoded markup as text while removing executable HTML across saves', () => {
    const payload = '<p>&lt;img src=x onerror="alert(1)"&gt;</p>'
      + '<table><tr><td colwidth="220" onclick="alert(1)">Text</td></tr></table>'
      + '<img src="x" onerror="alert(1)"><script>alert(1)</script><svg onload="alert(1)"></svg>';
    const saved = sanitizeTranslationHtml(payload);
    const document = new JSDOM(saved).window.document;
    assert.equal(document.querySelector('img, script, svg, [onclick], [onerror], [onload]'), null);
    assert.equal(document.querySelector('p')?.textContent, '<img src=x onerror="alert(1)">');
    assert.equal(document.querySelector('col')?.getAttribute('width'), '220');
    assert.equal(sanitizeTranslationHtml(saved), saved);
  });
});
