'use strict';

// Freeze the pre-upgrade default so rerunning this migration is independent of
// future theme defaults. Sidebar text previously used the panel background colour.
const LEGACY_DEFAULT = '#b1101a';
const SIDEBAR_KEY = 'admin-sidebar-text-color';

function normalizeKey(key) {
  return key.replace(/^\$/, '').replace(/colour$/, 'color');
}

function sidebarVariables(variables = {}) {
  const entries = Object.entries(variables || {});
  if (entries.some(([key]) => normalizeKey(key) === SIDEBAR_KEY)) {
    return null;
  }

  let color = LEGACY_DEFAULT;
  for (const [key, value] of entries) {
    if (normalizeKey(key) !== 'panel-branding-background-color' || typeof value !== 'string') {
      continue;
    }
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (match) {
      const hex = match[1].toLowerCase();
      color = '#' + (hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex);
    }
  }
  return { ...variables, [SIDEBAR_KEY]: color };
}

module.exports = {
  name: '20261014T000000-admin-sidebar-text-color',

  up: async ({ context: sails }) => {
    let updated = 0;
    for (const model of [sails.models.brandingconfig, sails.models.brandingconfighistory]) {
      // Older installations may retain keys outside today's variable allowlist.
      // Use the native collection to preserve them without triggering validation.
      const collection = model.getDatastore().manager.collection(model.tableName);
      for await (const row of collection.find({})) {
        const variables = sidebarVariables(row.variables);
        if (variables) {
          // Preserve active CSS, hashes, versions and unpublished draft changes.
          // The sidebar's CSS fallback keeps old published/rollback themes readable.
          await collection.updateOne({ _id: row._id }, { $set: { variables } });
          updated += 1;
        }
      }
    }
    sails.log.info(`Admin sidebar text colour: migrated ${updated} branding and history settings.`);
  },
};
