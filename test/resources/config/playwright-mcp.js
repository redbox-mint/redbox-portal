// The disposable browser stack opts its default brand into the readiness page.
// Sails' rc environment parser retains strings, but MCP requires boolean true.
module.exports = {
  brandingConfigurationDefaults: {
    mcp: { enabled: true, brand: 'default' },
  },
};
