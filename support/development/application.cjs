'use strict';
// Explicit local deployment data. Production deployments supply their own module.
const drive = { key: process.env.UPPY_GOOGLE_KEY || '', secret: process.env.UPPY_GOOGLE_SECRET || '' };
const onedrive = { key: process.env.UPPY_ONEDRIVE_KEY || '', secret: process.env.UPPY_ONEDRIVE_SECRET || '' };
const companionEnabled = process.env.UPPY_COMPANION_ENABLED === 'true';
if (companionEnabled && !((drive.key && drive.secret) || (onedrive.key && onedrive.secret)))
  throw new Error('Enabled development Companion requires a complete Google or OneDrive credential pair.');
const publicUrl = new URL(process.env.REDBOX_PUBLIC_URL || 'http://localhost:1500');
const rootContext = process.env.REDBOX_ROOT_CONTEXT || '';
const uploadUrls = (process.env.UPPY_COMPANION_UPLOAD_URLS || '').split(',').map(value => value.trim()).filter(Boolean);

module.exports = {
  redboxSession: { name: 'redbox.v6.sid', cookie: { secure: false } },
  storage: { disks: {
    staging: { driver: 'fs', config: { root: '/attachments/staging' } },
    primary: { driver: 'fs', config: { root: '/attachments/primary' } },
    'figshare-staging': { driver: 'fs', config: { root: '/attachments/figshare' } },
  } },
  redbox: { apiKey: process.env.REDBOX_ADMIN_TOKEN || 'c8e844fc-8550-497f-b970-7900ec8741ca' },
  brandingConfigurationDefaults: { auth: { active: ['local'] } },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  solr: { clientSleepTimeMillis: 0, cores: { default: { options: { host: 'solr', port: 8983, core: 'redbox' } } } },
  record: { baseUrl: { redbox: 'http://redbox:9000/redbox', mint: 'https://demo.redboxresearchdata.com.au/mint' } },
  companion: {
    enabled: companionEnabled,
    secret: process.env.UPPY_COMPANION_SECRET || '',
    uploadUrls: uploadUrls.length ? uploadUrls : [`${publicUrl.origin}${rootContext}/default/rdmp/companion/record/`],
    server: {
      host: process.env.UPPY_COMPANION_HOST || publicUrl.host,
      protocol: process.env.UPPY_COMPANION_PROTOCOL || publicUrl.protocol.slice(0, -1),
      path: '/companion',
    },
    providerOptions: { drive, onedrive },
  },
};
