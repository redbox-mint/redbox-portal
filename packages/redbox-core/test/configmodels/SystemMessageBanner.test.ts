import { expect } from 'chai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';

// Render the actual shared portal layout fragment, including its dismissal key.
const layout = fs
  .readFileSync(path.resolve(__dirname, '../../../../views/default/default/layout.ejs'), 'utf8')
  .replace(/\r\n/g, '\n');
const start = layout.lastIndexOf('<%', layout.indexOf('  var brandingName ='));
const template = layout.slice(start, layout.indexOf('  <div class="maincontent-body">'));
const render = (config: object) =>
  ejs.render(template, {
    req: {},
    BrandingService: { getBrandNameFromReq: () => 'brand', getPortalFromReq: () => 'portal' },
    sails: { config: { brandingAware: () => ({ systemMessage: config }) } },
  });
describe('Portal system message banner', () => {
  for (const [style, expectedStyle, role] of [
    [undefined, 'info', 'status'],
    ['info', 'info', 'status'],
    ['warning', 'warning', 'status'],
    ['critical', 'critical', 'alert'],
    ['invalid', 'info', 'status'],
  ]) {
    it(`renders ${String(style)} as ${expectedStyle} with role ${role} and a dismiss button`, () => {
      const html = render({ enabled: true, style, title: 'Maintenance', message: 'Soon' });
      expect(html).to.contain(`rb-system-message-${expectedStyle}`);
      expect(html).to.contain(`role="${role}"`);
      expect(html).to.contain('data-bs-dismiss="alert"');
      expect(html).to.contain('data-system-message-scope="brand:portal"');
      expect(html).to.contain('data-system-message-dismissal-hours="8"');
    });
  }
  it('changes the dismissal identity on escalation, but preserves the legacy info identity', () => {
    const key = (style?: string) => render({ enabled: true, style }).match(/data-system-message-key="(.*?)"/)![1];
    expect(key()).to.equal(key('info'));
    expect(key('info')).not.to.equal(key('critical'));
  });
  it('honours disabled and non-dismissible configurations', () => {
    expect(render({ enabled: false })).not.to.contain('id="system-message"');
    const html = render({ enabled: true, dismissalDurationHours: 0 });
    expect(html).not.to.contain('data-bs-dismiss');
    expect(html).not.to.contain('alert-dismissible');
  });
});
