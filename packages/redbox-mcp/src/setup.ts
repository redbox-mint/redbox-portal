import {
  Controllers,
  ReportingError,
  recordRoleNames,
  resolveReportingPrincipal,
  type ReportingApi,
  type ReportingPrincipal,
} from '@researchdatabox/redbox-core';
import {
  brandMcpSettings,
  mcpDeploymentEnabled,
  mcpSetupConfigSchema,
  metadataUrl,
  resolveMcpConfig,
  type McpConfig,
} from './config';
import { McpAuthError, resolveOidcIdentity } from './auth';

/** Linked OIDC aliases can authenticate a primary account of another login type. */
export async function hasMcpOidcIdentity(principal: ReportingPrincipal, config?: McpConfig): Promise<boolean> {
  const bound = (username: string) =>
    !config ||
    config.identityBindings.some(binding => binding.issuer === config.issuer && binding.username === username);
  if (principal.user.type === 'oidc' && bound(principal.user.username)) return true;
  const linked = await new Promise<{ linkedAccounts: Array<{ type: string; username: string }> }>((resolve, reject) => {
    UsersService.getLinkedAccounts(principal.user.id).subscribe({ next: resolve, error: reject });
  });
  for (const account of linked.linkedAccounts.filter(account => account.type === 'oidc' && bound(account.username))) {
    try {
      const mapped = await resolveOidcIdentity(account.username, principal.brand.name);
      if (mapped.user.id === principal.user.id) return true;
    } catch (error) {
      if (
        !(error instanceof McpAuthError) &&
        !(error instanceof ReportingError && error.code === 'AUTHENTICATION_REQUIRED')
      )
        throw error;
    }
  }
  return false;
}

/** Inspect readiness through the same schema authorization used by MCP tools. No records are read. */
export async function connectionSetup(
  configuration: unknown,
  setupConfiguration: unknown,
  reportingEnabled: boolean,
  recordTypes: readonly string[],
  principal: ReportingPrincipal,
  reporting: ReportingApi,
  oidcAccount = principal.user.type === 'oidc'
) {
  const parsed = resolveMcpConfig(configuration, principal.brand.name);
  const setup = mcpSetupConfigSchema.safeParse(setupConfiguration);
  const isAdmin = recordRoleNames(principal.brand, principal.roles).includes('Admin');
  const authorizedTypes: string[] = [];
  const identityBound = parsed.success && oidcAccount && (await hasMcpOidcIdentity(principal, parsed.data));
  if (parsed.success && setup.success && reportingEnabled && identityBound) {
    for (const recordType of recordTypes) {
      try {
        await reporting.getReportingSchema(principal, { recordType }, { channel: 'rest' });
        authorizedTypes.push(recordType);
      } catch (error) {
        if (!(error instanceof ReportingError) || error.code !== 'FORBIDDEN') throw error;
      }
    }
  }
  const configurationReady = parsed.success && setup.success && (!oidcAccount || identityBound);
  const state = !configurationReady
    ? 'needs-configuration'
    : !reportingEnabled
      ? 'reporting-disabled'
      : !oidcAccount
        ? 'oidc-required'
        : !authorizedTypes.length
          ? 'no-reporting-access'
          : 'ready';
  return {
    state,
    brand: principal.brand.name,
    isAdmin,
    checks: {
      configuration: configurationReady,
      reporting: reportingEnabled,
      account: oidcAccount,
      records: authorizedTypes.length > 0,
    },
    recordTypes: authorizedTypes,
    ...(parsed.success && setup.success
      ? {
          connection: {
            brand: principal.brand.name,
            endpoint: parsed.data.resourceUrl,
            issuer: parsed.data.issuer,
            scope: parsed.data.scope,
            metadataUrl: metadataUrl(parsed.data),
            ...setup.data,
          },
        }
      : {}),
    ...(isAdmin
      ? {
          configurationProblems: [
            ...new Set([
              ...(!parsed.success ? parsed.error.issues.map(issue => `mcp.${issue.path.join('.')}`) : []),
              ...(!setup.success ? setup.error.issues.map(issue => `mcpSetup.${issue.path.join('.')}`) : []),
              ...(parsed.success && oidcAccount && !identityBound ? ['mcp.identityBindings'] : []),
            ]),
          ],
        }
      : {}),
  };
}

export class McpSetupController extends Controllers.Core.Controller {
  protected override _exportedMethods = ['page', 'status'];

  private async principal(req: Sails.Req): Promise<ReportingPrincipal> {
    if (!req.isAuthenticated() || !req.user?.id) throw new ReportingError('AUTHENTICATION_REQUIRED');
    const brand = req.params?.branding;
    if (typeof brand !== 'string' || !brandMcpSettings(brand)) throw new ReportingError('NOT_FOUND');
    const principal = await resolveReportingPrincipal(brand, String(req.user.id));
    // Recheck persisted, canonical brand roles even if session roles or path rules are stale.
    if (!recordRoleNames(principal.brand, principal.roles).some(role => role === 'Admin' || role === 'Librarians'))
      throw new ReportingError('FORBIDDEN');
    return principal;
  }

  private async run(req: Sails.Req, res: Sails.Res, action: (principal: ReportingPrincipal) => unknown) {
    try {
      if (!mcpDeploymentEnabled()) throw new ReportingError('NOT_FOUND');
      return await action(await this.principal(req));
    } catch (error) {
      const code = error instanceof ReportingError ? error.code : 'UNAVAILABLE';
      // Match checkAuth's browser sign-in redirect and authenticated forbidden response.
      if (code === 'AUTHENTICATION_REQUIRED' && !req.isAuthenticated())
        return (sails.getActions()['user/redirlogin'] as (req: Sails.Req, res: Sails.Res) => unknown)(req, res);
      const status =
        code === 'NOT_FOUND' ? 404 : code === 'AUTHENTICATION_REQUIRED' ? 401 : code === 'FORBIDDEN' ? 403 : 503;
      return this.sendResp(req, res, { status, displayErrors: [{ code }], headers: this.getNoCacheHeaders() });
    }
  }

  public async page(req: Sails.Req, res: Sails.Res) {
    return this.run(req, res, () =>
      this.sendView(req, res, 'admin/mcp-connect', {
        title: TranslationService.t('mcp-connect-title'),
      })
    );
  }

  public async status(req: Sails.Req, res: Sails.Res) {
    return this.run(req, res, async principal => {
      const settings = brandMcpSettings(principal.brand.name);
      if (!settings) throw new ReportingError('NOT_FOUND');
      const data = await connectionSetup(
        settings.mcp,
        settings.mcpSetup,
        sails.config.reporting?.enabled === true,
        Object.keys(sails.config.recordtype ?? {}).filter(
          name => sails.config.recordtype[name]?.reporting?.enabled === true
        ),
        principal,
        sails.services.reportingservice as unknown as ReportingApi,
        await hasMcpOidcIdentity(principal)
      );
      return this.sendResp(req, res, {
        data: {
          ...data,
          // Only expose labels for record types authorized by schema discovery.
          recordTypeLabels: Object.fromEntries(
            data.recordTypes.map(recordType => [
              recordType,
              sails.config.recordtype[recordType]?.labels?.namePlural ||
                sails.config.recordtype[recordType]?.labels?.name ||
                recordType,
            ])
          ),
          // Use the existing branded login page: it also supports multiple institutional providers.
          institutionalLoginUrl: BrandingService.getBrandAndPortalPath(req) + '/user/login',
        },
        headers: this.getNoCacheHeaders(),
      });
    });
  }
}
