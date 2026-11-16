import { z } from 'zod';
const secureUrl = z
  .string()
  .url()
  .refine(value => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search;
  });
const mcpBrandName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const mcpConfigSchema = z
  .strictObject({
    enabled: z.literal(true),
    resourceUrl: secureUrl,
    issuer: secureUrl,
    jwksUrl: secureUrl,
    brand: mcpBrandName,
    scope: z.string().regex(/^[A-Za-z0-9._:-]+$/),
    identityClaim: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    usernameToLowercase: z.boolean(),
    // Administrator-verified issuer/subject -> existing account bindings. Never infer from a username claim.
    identityBindings: z
      .array(
        z.strictObject({
          issuer: secureUrl,
          subject: z.string().min(1).max(500),
          username: z.string().min(1).max(200),
        })
      )
      .max(10000)
      .default([]),
    algorithms: z.array(z.enum(['RS256', 'ES256', 'PS256'])).min(1),
    allowedOrigins: z
      .array(
        secureUrl.refine(
          value => URL.canParse(value) && new URL(value).origin === value,
          'Use an HTTPS origin without a path'
        )
      )
      .max(20),
    maxRequestBytes: z.number().int().min(1024).max(64_000),
  })
  .superRefine((config, context) => {
    if (
      URL.canParse(config.resourceUrl) &&
      config.resourceUrl !== `${new URL(config.resourceUrl).origin}/${config.brand}/mcp`
    )
      context.addIssue({ code: 'custom', path: ['resourceUrl'], message: 'The hook endpoint must be /<brand>/mcp' });
  });
export type McpConfig = z.infer<typeof mcpConfigSchema>;
/** The deployment environment is authoritative, including over customer hook overrides. */
export function mcpDeploymentEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.REDBOX_MCP_ENABLED?.trim().toLowerCase() === 'true';
}

export function resolveMcpConfig(configuration: unknown, brandName: string) {
  return mcpConfigSchema.safeParse({
    ...(configuration && typeof configuration === 'object' ? configuration : {}),
    // The environment is a deployment ceiling; each brand must opt in independently.
    ...(!mcpDeploymentEnabled() ? { enabled: false } : {}),
    // Bind the resource to the request's brand, never a caller-supplied tool or token claim.
    ...(configuration && typeof configuration === 'object' && Reflect.get(configuration, 'brand') === brandName
      ? {}
      : { brand: undefined }),
  });
}

/** No global/default-brand lookup: inherited settings must explicitly bind to this existing brand. */
export function brandMcpSettings(brandName: unknown): { mcp: unknown; mcpSetup: unknown } | undefined {
  if (!mcpDeploymentEnabled() || !mcpBrandName.safeParse(brandName).success || typeof brandName !== 'string')
    return undefined;
  const brand = BrandingService.getBrand(brandName);
  if (!brand || brand.name !== brandName || typeof sails.config.brandingAware !== 'function') return undefined;
  const configuration = sails.config.brandingAware(brandName);
  const settings = configuration && Reflect.get(configuration, 'mcp');
  if (
    !settings ||
    typeof settings !== 'object' ||
    Reflect.get(settings, 'brand') !== brandName ||
    Reflect.get(settings, 'enabled') !== true
  )
    return undefined;
  return { mcp: settings, mcpSetup: Reflect.get(configuration, 'mcpSetup') ?? mcpSetup };
}

const publicClient = z.strictObject({
  clientId: z.string().min(1).max(500).optional(),
  callbackUrl: z
    .string()
    .url()
    .max(2000)
    .refine(value => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash;
    })
    .optional(),
  callbackPort: z.number().int().min(1).max(65535).optional(),
});

/** Public client registration details only. Client secrets and tokens never belong here. */
export const mcpSetupConfigSchema = z.strictObject({
  clients: z
    .strictObject({
      codex: publicClient.optional(),
      claudeCode: publicClient.omit({ callbackUrl: true }).optional(),
      claude: publicClient.pick({ clientId: true }).optional(),
    })
    .default({}),
  chatgptPluginUrl: secureUrl.optional(),
});
export const mcpSetup = { clients: {} };
export const mcp = {
  enabled: false,
  resourceUrl: '',
  issuer: '',
  jwksUrl: '',
  brand: 'default',
  scope: 'redbox.reporting',
  identityClaim: 'sub',
  usernameToLowercase: false,
  identityBindings: [],
  algorithms: ['RS256', 'ES256'],
  allowedOrigins: [],
  maxRequestBytes: 16_000,
};
export function metadataUrl(config: McpConfig): string {
  const resource = new URL(config.resourceUrl);
  return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname === '/' ? '' : resource.pathname}`;
}
export function protectedResourceMetadata(config: McpConfig) {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.issuer],
    scopes_supported: [config.scope],
    bearer_methods_supported: ['header'],
    resource_name: `ReDBox reporting (${config.brand})`,
  };
}
