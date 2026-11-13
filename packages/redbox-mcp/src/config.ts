import { z } from 'zod';
const secureUrl = z
  .string()
  .url()
  .refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search;
  });
export const mcpConfigSchema = z.strictObject({
  enabled: z.literal(true),
  resourceUrl: secureUrl.refine(value => new URL(value).pathname === '/mcp', 'The hook endpoint is /mcp'),
  issuer: secureUrl,
  jwksUrl: secureUrl,
  brand: z.string().min(1),
  scope: z.string().regex(/^[A-Za-z0-9._:-]+$/),
  identityClaim: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  usernameToLowercase: z.boolean(),
  algorithms: z.array(z.enum(['RS256', 'ES256', 'PS256'])).min(1),
  allowedOrigins: z
    .array(secureUrl.refine(value => new URL(value).origin === value, 'Use an HTTPS origin without a path'))
    .max(20),
  maxRequestBytes: z.number().int().min(1024).max(64_000),
});
export type McpConfig = z.infer<typeof mcpConfigSchema>;
export const mcp = {
  enabled: false,
  resourceUrl: '',
  issuer: '',
  jwksUrl: '',
  brand: 'default',
  scope: 'redbox.reporting',
  identityClaim: 'sub',
  usernameToLowercase: false,
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
    resource_name: 'ReDBox reporting',
  };
}
