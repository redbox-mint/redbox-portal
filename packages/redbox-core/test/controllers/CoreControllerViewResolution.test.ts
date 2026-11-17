import assert from 'node:assert/strict';
import sinon from 'sinon';
import fs from 'node:fs';

import path from 'node:path';
import ejs from 'ejs';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

describe('Declared extension view resolution', function () {

it('guards optional branding locals in the core layout head extension point', function () {
    const viewsRoot = path.resolve(__dirname, '../../../../views');
    const layout = fs.readFileSync(path.join(viewsRoot, 'default/default/layout.ejs'), 'utf8');
    const functions = fs.readFileSync(path.join(viewsRoot, 'functions.ejs'), 'utf8');
    assert.ok(layout.includes("typeof branding !== 'undefined' && branding != null ? branding : page.brand.name"));
    assert.ok(layout.includes("typeof portal !== 'undefined' && portal != null ? portal : page.portal"));
    assert.ok(!functions.includes('sails.'));
    const extension = layout.match(/<%- superPartial\("\/layout\/head-extra.ejs",[\s\S]*?%>/)![0];
    const partial = sinon.spy(() => '');
    ejs.render(extension, { page: { brand: { name: 'brand' }, portal: 'portal' }, superPartial: partial });
    sinon.assert.calledWithExactly(partial, '/layout/head-extra.ejs', 'brand', 'portal', true);
  });
afterEach(() => sinon.restore());
});
