import { expect } from 'chai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';

// Render the real head fragment; in particular, exercise EJS attribute escaping.
const layout = fs.readFileSync(path.resolve(__dirname, '../../../../views/default/default/layout.ejs'), 'utf8');
const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('<base href='));

describe('Portal bootstrap CSRF token', () => {
  it('embeds the current session token without permitting markup injection', () => {
    const html = ejs.render(head, { _csrf: 'token"><script>alert(1)</script>&' });
    expect(html).to.contain('name="rb-csrf-token"');
    expect(html).to.contain('content="token&#34;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;"');
    expect(html).not.to.contain('<script>');
  });

  it('retains the empty token when CSRF is disabled', () => {
    expect(ejs.render(head, { _csrf: '' })).to.contain('name="rb-csrf-token" content=""');
  });

  it('omits unavailable tokens so hook layouts can use the existing token endpoint', () => {
    expect(ejs.render(head, {})).not.to.contain('rb-csrf-token');
    expect(ejs.render(head, { _csrf: undefined })).not.to.contain('rb-csrf-token');
  });
});
