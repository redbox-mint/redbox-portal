import * as path from 'path';
import { escapeHtmlText } from '@researchdatabox/sails-ng-common';
import { createMockSails, setupServiceTestGlobals } from '../services/testHelper';
import {
  buildCompanionSendTokenConfig,
  buildCompanionSendTokenHtml,
  http,
  isImmutableAssetPath,
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

    it('should only mark fingerprinted static asset paths as immutable', function () {
      expect(isImmutableAssetPath('/default/default/angular/form/browser/main-ABC123DEF.js')).to.equal(true);
      expect(isImmutableAssetPath('/default/default/angular/form/browser/styles-ABC123DEF.css')).to.equal(true);
      expect(isImmutableAssetPath('/default/default/js/index.bundle.js')).to.equal(false);
      expect(isImmutableAssetPath('/default/default/js/jquery.min.js')).to.equal(false);
      expect(isImmutableAssetPath('/default/default/images/logo.png')).to.equal(false);
    });
  });

  describe('cache-control middleware', function () {
    let originalSessionConfig: unknown;
    let originalCustomConfig: unknown;

    beforeEach(function () {
      setupServiceTestGlobals(createMockSails());
      originalSessionConfig = (global as any).sails.config.session;
      originalCustomConfig = (global as any).sails.config.custom;
      (global as any).sails.config.session = { cookie: { maxAge: 600000 } };
      (global as any).sails.config.custom = { cacheControl: { noCache: [] } };
    });

    afterEach(function () {
      (global as any).sails.config.session = originalSessionConfig;
      (global as any).sails.config.custom = originalCustomConfig;
    });

    function runCacheControl(pathname: string): Record<string, string> {
      const headers: Record<string, string> = {};
      const req = { path: pathname } as any;
      const res = {
        set(name: string, value: string) {
          headers[name] = value;
          return this;
        },
        setHeader(name: string, value: number | string | readonly string[]) {
          headers[name] = Array.isArray(value) ? value.join(',') : String(value);
          return this;
        },
        removeHeader(name: string) {
          delete headers[name];
        }
      } as any;

      http.middleware.cacheControl?.(req, res, () => undefined);
      return headers;
    }

    it('should keep immutable caching for fingerprinted Angular bundles', function () {
      const headers = runCacheControl('/default/default/angular/form/browser/main-ABC123DEF.js');

      expect(headers['Cache-Control']).to.equal('public, max-age=31536000, immutable');
      expect(headers['Pragma']).to.equal(undefined);
      expect(headers['Cross-Origin-Opener-Policy']).to.equal('same-origin-allow-popups');
    });

    it('should fall back to non-immutable caching for unversioned js bundles', function () {
      const headers = runCacheControl('/default/default/js/index.bundle.js');

      expect(headers['Cache-Control']).to.equal('max-age=600, private');
      expect(headers['Pragma']).to.equal('no-cache');
      expect(headers['Cross-Origin-Opener-Policy']).to.equal('same-origin-allow-popups');
    });
  });
});
