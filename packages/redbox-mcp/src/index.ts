import {
  defineRedboxHook,
  Controllers,
  ReportingService as ReportingServiceModule,
} from '@researchdatabox/redbox-core';
import {
  mcp,
  mcpSetup,
  mcpConfigSchema,
  mcpDeploymentEnabled,
  brandMcpSettings,
  resolveMcpConfig,
  protectedResourceMetadata,
} from './config';
import { McpSetupController } from './setup';
import { reportingMcpHttpHandler } from './http';
import { createReportingMcpServer } from './server';
import { McpAuthenticator, McpAuthError } from './auth';

export { createReportingMcpServer } from './server';
export { reportingMcpHttpHandler } from './http';
export { McpAuthenticator, McpAuthError } from './auth';
export { mcp, mcpConfigSchema, protectedResourceMetadata } from './config';
export type { McpConfig } from './config';
export type { McpIdentityResolver } from './auth';

class McpController extends Controllers.Core.Controller {
  protected override _exportedMethods = ['handle'];
  private readonly handlers = new Map<
    string,
    {
      configuration: string;
      handler: ReturnType<typeof reportingMcpHttpHandler>;
    }
  >();
  public async handle(req: Sails.Req, res: Sails.Res) {
    const brandName = req.params?.branding;
    const settings = brandMcpSettings(brandName);
    if (!settings || typeof brandName !== 'string')
      return this.sendResp(req, res, {
        status: 404,
        displayErrors: [{ code: 'NOT_FOUND' }],
        headers: this.getNoCacheHeaders(),
      });
    const parsed = resolveMcpConfig(settings.mcp, brandName);
    if (!parsed.success || sails.config.reporting?.enabled !== true)
      return this.sendResp(req, res, {
        status: 503,
        displayErrors: [{ code: 'MCP_UNAVAILABLE' }],
        headers: this.getNoCacheHeaders(),
      });
    const configuration = JSON.stringify(parsed.data);
    let cached = this.handlers.get(brandName);
    if (!cached || cached.configuration !== configuration) {
      const service = sails.services.reportingservice as unknown as ReportingServiceModule.Services.Reporting;
      cached = {
        configuration,
        handler: reportingMcpHttpHandler(parsed.data, service, undefined, event => sails.log.info(event)),
      };
      this.handlers.set(brandName, cached);
    }
    return cached.handler(req, res);
  }
}
const controller = new McpController();
const setupController = new McpSetupController();
const hook = defineRedboxHook({
  configure: application => {
    application.config.mcp = { enabled: mcpDeploymentEnabled() };
  },
  registerRedboxControllers: () => ({
    McpController: controller.exports(),
    McpSetupController: setupController.exports(),
  }),
  registerRedboxConfig: () => ({
    mcp: { enabled: false },
    brandingConfigurationDefaults: { mcp, mcpSetup },
    routes: {
      'get /:branding/:portal/admin/mcp': { controller: 'McpSetupController', action: 'page' },
      'get /:branding/:portal/admin/mcp/status': { controller: 'McpSetupController', action: 'status' },
      '/:branding/mcp': { controller: 'McpController', action: 'handle', csrf: false },
      'get /.well-known/oauth-protected-resource/:branding/mcp': {
        controller: 'McpController',
        action: 'handle',
        csrf: false,
      },
      'options /.well-known/oauth-protected-resource/:branding/mcp': {
        controller: 'McpController',
        action: 'handle',
        csrf: false,
      },
    },
    policies: {
      McpController: { '*': [] },
      // Browser admin policy chain. McpSetupController enforces canonical Admin/Librarians roles
      // with the same redirect/403 behavior as checkAuth, independently of bootstrapped path rules.
      McpSetupController: {
        '*': [
          'noCache',
          'brandingAndPortal',
          'checkBrandingValid',
          'setLang',
          'prepWs',
          'i18nLanguages',
          'menuResolver',
          'contentSecurityPolicy',
        ],
      },
    },
  }),
  additionalExports: {
    createReportingMcpServer,
    reportingMcpHttpHandler,
    McpAuthenticator,
    McpAuthError,
    mcp,
    mcpConfigSchema,
    protectedResourceMetadata,
  },
});
// Hook discovery expects a callable CommonJS export with registration functions.
module.exports = hook;
