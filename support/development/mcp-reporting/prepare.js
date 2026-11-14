'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const directory = path.join(__dirname, '.dev');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const url = new URL(process.argv[2]);
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
  throw new Error('Provide the HTTPS Tailscale origin, including port if used');
const base = url.origin;
const credentialsPath = path.join(directory, 'credentials.json');
const credentials = fs.existsSync(credentialsPath)
  ? JSON.parse(fs.readFileSync(credentialsPath))
  : {
      researcher: randomBytes(15).toString('base64url'),
      admin: randomBytes(18).toString('base64url'),
      oidcSecret: randomBytes(24).toString('base64url'),
      sessionSecret: randomBytes(32).toString('base64url'),
    };
function write(name, value) {
  fs.writeFileSync(path.join(directory, name), value, { mode: 0o600 });
}
write('credentials.json', JSON.stringify(credentials, null, 2));
write(
  'demo.env',
  `REDBOX_DEMO_URL=${base}\nREDBOX_DEMO_ADMIN_PASSWORD=${credentials.admin}\nREDBOX_DEMO_OIDC_SECRET=${credentials.oidcSecret}\nsails__redboxSession_secret=${credentials.sessionSecret}\n`
);
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json')));
manifest.dependencies['redbox-hook-reporting-demo'] = 'file:support/development/mcp-reporting/hook';
manifest.hookLoadPriority = [...(manifest.hookLoadPriority || []), 'redbox-hook-reporting-demo'];
write('package.json', JSON.stringify(manifest, null, 2));
const mapper = (name, claim, property) => ({
  name,
  protocol: 'openid-connect',
  protocolMapper: 'oidc-usermodel-property-mapper',
  config: {
    'user.attribute': property,
    'claim.name': claim,
    'jsonType.label': 'String',
    'id.token.claim': 'true',
    'access.token.claim': 'true',
    'userinfo.token.claim': 'true',
  },
});
const scope = {
  name: 'redbox.reporting',
  protocol: 'openid-connect',
  attributes: {
    'include.in.token.scope': 'true',
    'display.on.consent.screen': 'true',
    'consent.screen.text': 'Read ReDBox reporting results permitted for your account',
  },
};
const realm = {
  realm: 'redbox-reporting',
  enabled: true,
  displayName: 'ReDBox Reporting Demo',
  sslRequired: 'external',
  registrationAllowed: false,
  resetPasswordAllowed: false,
  accessTokenLifespan: 300,
  roles: { realm: [{ name: 'offline_access' }] },
  scopeMappings: [{ clientScope: 'offline_access', roles: ['offline_access'] }],
  clientScopes: [
    scope,
    {
      name: 'basic',
      protocol: 'openid-connect',
      protocolMappers: [
        {
          name: 'subject',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-sub-mapper',
          config: { 'access.token.claim': 'true' },
        },
      ],
    },
    {
      name: 'offline_access',
      protocol: 'openid-connect',
      attributes: {
        'include.in.token.scope': 'true',
        'display.on.consent.screen': 'true',
        'consent.screen.text': 'Keep the reporting connection signed in',
      },
    },
    {
      name: 'profile',
      protocol: 'openid-connect',
      protocolMappers: [
        mapper('username', 'preferred_username', 'username'),
        mapper('given name', 'given_name', 'firstName'),
        mapper('family name', 'family_name', 'lastName'),
        {
          name: 'full name',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-full-name-mapper',
          config: { 'id.token.claim': 'true', 'access.token.claim': 'true', 'userinfo.token.claim': 'true' },
        },
      ],
    },
    { name: 'email', protocol: 'openid-connect', protocolMappers: [mapper('email', 'email', 'email')] },
  ],
  clients: [
    {
      // Use the same URI as the resource identity for code and refresh token audiences.
      clientId: `${base}/default/mcp`,
      name: 'ReDBox reporting resource',
      protocol: 'openid-connect',
      bearerOnly: true,
      attributes: { resource_url: `${base}/default/mcp` },
    },
    {
      clientId: 'redbox-reporting-work',
      name: 'ReDBox reporting in local ChatGPT Work',
      protocol: 'openid-connect',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      consentRequired: true,
      redirectUris: ['http://127.0.0.1:52344/callback', 'http://127.0.0.1:52344/callback/*'],
      defaultClientScopes: ['basic', 'profile', 'email'],
      optionalClientScopes: ['redbox.reporting', 'offline_access'],
      attributes: { 'pkce.code.challenge.method': 'S256' },
      protocolMappers: [
        {
          name: 'reporting audience',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-audience-mapper',
          config: {
            'included.client.audience': `${base}/default/mcp`,
            'access.token.claim': 'true',
            'id.token.claim': 'false',
          },
        },
      ],
    },
    {
      clientId: 'redbox-portal-demo',
      name: 'ReDBox browser',
      protocol: 'openid-connect',
      publicClient: false,
      secret: credentials.oidcSecret,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [`${base}/user/login_oidc`],
      defaultClientScopes: ['basic', 'profile', 'email'],
      attributes: { 'post.logout.redirect.uris': `${base}/default/rdmp/user/logout` },
    },
  ],
  users: [
    {
      id: 'reporting-demo-researcher',
      username: 'reporting-researcher',
      enabled: true,
      email: 'reporting-researcher@example.invalid',
      emailVerified: true,
      firstName: 'Reporting',
      lastName: 'Researcher',
      realmRoles: ['offline_access'],
      credentials: [{ type: 'password', value: credentials.researcher, temporary: false }],
    },
  ],
};
write('realm.json', JSON.stringify(realm, null, 2));
// Keycloak runs as a different container UID. The host directory remains private (0700).
fs.chmodSync(path.join(directory, 'realm.json'), 0o644);
write('expected-results.json', JSON.stringify(require('./hook/seed').expectedResults(), null, 2));
console.log(`Demo prepared for ${base}/default/mcp. Credentials are in ${credentialsPath}; no tokens are stored.`);
