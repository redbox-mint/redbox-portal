import type { CorePrismaClient, StoragePrismaClient } from '../prisma/client';

const LEGACY_DEFAULT = '#b1101a';
const SIDEBAR_KEY = 'admin-sidebar-text-color';

function normalizeKey(key: string) {
  return key.replace(/^\$/, '').replace(/colour$/, 'color');
}

export function sidebarVariables(variables: Record<string, unknown> | null = {}) {
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
      color =
        '#' +
        (hex.length === 3
          ? hex
              .split('')
              .map(char => char + char)
              .join('')
          : hex);
    }
  }
  return { ...variables, [SIDEBAR_KEY]: color };
}

/** Frozen migration only: no normal-write allowlist/callback/audit side effects. */
export async function migrateBrandingSidebar(
  application: CorePrismaClient,
  storage: StoragePrismaClient
): Promise<number> {
  let updated = 0;
  // Each logical datastore keeps its own client, even when the servers differ.
  for (const row of await application.orm.brandingconfig.select('_id', 'variables').all().toArray()) {
    const variables = sidebarVariables(row.variables as Record<string, unknown> | null);
    if (variables) {
      await application.orm.brandingconfig.where({ _id: row._id }).update({ variables });
      updated++;
    }
  }
  for (const row of await storage.orm.brandingconfighistory.select('_id', 'variables').all().toArray()) {
    const variables = sidebarVariables(row.variables as Record<string, unknown> | null);
    if (variables) {
      await storage.orm.brandingconfighistory.where({ _id: row._id }).update({ variables });
      updated++;
    }
  }
  return updated;
}
