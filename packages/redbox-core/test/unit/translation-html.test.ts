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
});
