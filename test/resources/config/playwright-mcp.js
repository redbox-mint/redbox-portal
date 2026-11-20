// The disposable browser stack opts its default brand into the readiness page.
// Sails' rc environment parser retains strings, but MCP requires boolean true.
module.exports = {
  // Exercise the real administration apps without provisioning AI providers.
  generation: {
    enabled: true,
    bootstrap: { enabled: false },
    artifacts: { encryptionKeyRef: 'env:PLAYWRIGHT_GENERATION_KEY' },
  },
  brandingConfigurationDefaults: {
    mcp: { enabled: true, brand: 'default' },
  },
};
