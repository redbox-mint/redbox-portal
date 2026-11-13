import {
  defineRedboxHook,
  Controllers,
  ReportingService as ReportingServiceModule,
} from '@researchdatabox/redbox-core';
import { mcp, mcpConfigSchema, protectedResourceMetadata } from './config';
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
  private handler?: ReturnType<typeof reportingMcpHttpHandler>;
  private configuration?: string;
  public async handle(req: Sails.Req, res: Sails.Res) {
    const parsed = mcpConfigSchema.safeParse(sails.config.mcp);
    if (!parsed.success)
      return this.sendResp(req, res, {
        status: 503,
        displayErrors: [{ code: 'MCP_UNAVAILABLE' }],
        headers: this.getNoCacheHeaders(),
      });
    const configuration = JSON.stringify(parsed.data);
    if (!this.handler || this.configuration !== configuration) {
      const service = sails.services.reportingservice as unknown as ReportingServiceModule.Services.Reporting;
      this.handler = reportingMcpHttpHandler(parsed.data, service, undefined, event => sails.log.info(event));
      this.configuration = configuration;
    }
    return this.handler(req, res);
  }
}
const controller = new McpController();
const hook = defineRedboxHook({
  registerRedboxControllers: () => ({ McpController: controller.exports() }),
  registerRedboxConfig: () => ({
    mcp,
    routes: {
      '/mcp': { controller: 'McpController', action: 'handle', csrf: false },
      'get /.well-known/oauth-protected-resource/mcp': { controller: 'McpController', action: 'handle', csrf: false },
      'options /.well-known/oauth-protected-resource/mcp': { controller: 'McpController', action: 'handle', csrf: false },
    },
    policies: { McpController: { '*': [] } },
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
