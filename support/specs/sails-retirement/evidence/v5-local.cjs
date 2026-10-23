// Synthetic released-v5 comparison settings, mounted as config/local.js.
// Local identity and API behavior only; external auth/imports remain unqualified.
module.exports = {
  brandingConfigurationDefaults: { auth: { active: ['local'] } },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  crontab: { enabled: false },
  log: { level: 'info' },
};
