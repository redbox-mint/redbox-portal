import { expect } from 'chai';
import * as path from 'path';
import { escapeHtmlText } from '@researchdatabox/sails-ng-common';
import {
  buildCompanionSendTokenConfig,
  buildCompanionSendTokenHtml,
  resolvePublicAssetPath,
  sanitizeStaticResourcePath,
  sanitizeStaticSegment
} from '../../src/config/http.config';

describe('HTTP config security helpers', function () {
  describe('Companion send-token response', function () {
    it('should escape malicious provider values out of inert HTML text content', function () {
      const appUrl = 'https://portal.example.edu/default/rdmp';
      const provider = 'drive</script><script>alert(1)</script>';
      const html = buildCompanionSendTokenHtml(appUrl, provider);
      const expectedConfigJson = escapeHtmlText(JSON.stringify(buildCompanionSendTokenConfig(appUrl, provider)));

      expect(html).to.include('<div hidden id="companion-send-token-config">');
      expect(html).not.to.include('drive</script><script>alert(1)</script>');
      expect(html).to.include(expectedConfigJson);
    });

    it('should normalize configured appUrl to an origin', function () {
      const config = buildCompanionSendTokenConfig('https://portal.example.edu/default/rdmp?x=1', 'drive');

      expect(config.targetOrigin).to.equal('https://portal.example.edu');
      expect(config.provider).to.equal('drive');
      expect(config.secureCookie).to.equal(true);
    });

    it('should keep invalid appUrl as inert data without executing injected HTML', function () {
      const html = buildCompanionSendTokenHtml('"><img src=x onerror=alert(1)>', 'drive');

      expect(html).not.to.include('"><img src=x onerror=alert(1)>');
      expect(html).to.include('&quot;targetOrigin&quot;:&quot;\\&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&quot;');
    });

    it('should mark HTTPS send-token cookies as Secure', function () {
      const appUrl = 'https://portal.example.edu';
      const provider = 'onedrive';
      const html = buildCompanionSendTokenHtml(appUrl, provider);
      const expectedConfigJson = escapeHtmlText(JSON.stringify(buildCompanionSendTokenConfig(appUrl, provider)));

      expect(html).to.include("config.secureCookie?'; Secure':''");
      expect(html).to.include(expectedConfigJson);
    });
  });

  describe('branding static routing path helpers', function () {
    it('should accept simple branding and portal segments', function () {
      expect(sanitizeStaticSegment('default')).to.equal('default');
      expect(sanitizeStaticSegment('rdmp_portal-1')).to.equal('rdmp_portal-1');
    });

    it('should reject malicious branding or portal segments', function () {
      expect(sanitizeStaticSegment('../default')).to.equal(null);
      expect(sanitizeStaticSegment('%2e%2e')).to.equal(null);
      expect(sanitizeStaticSegment('default<script>')).to.equal(null);
      expect(sanitizeStaticSegment('')).to.equal(null);
    });

    it('should sanitize resource paths and reject traversal', function () {
      expect(sanitizeStaticResourcePath('assets/app.js?cache=1')).to.equal('assets/app.js');
      expect(sanitizeStaticResourcePath('../secrets.txt')).to.equal(null);
      expect(sanitizeStaticResourcePath('%2e%2e/secrets.txt')).to.equal(null);
      expect(sanitizeStaticResourcePath('/absolute/path')).to.equal(null);
      expect(sanitizeStaticResourcePath('assets/%2e%2e/secrets.txt')).to.equal(null);
    });

    it('should resolve asset paths only under the public directory', function () {
      const publicBase = path.resolve('/tmp/redbox/.tmp/public');

      expect(resolvePublicAssetPath(publicBase, 'default', 'rdmp', 'assets/app.js')).to.equal(
        path.join(publicBase, 'default', 'rdmp', 'assets/app.js')
      );
      expect(resolvePublicAssetPath(publicBase, 'default', '..', '..', 'secrets.txt')).to.equal(null);
    });
  });
});
