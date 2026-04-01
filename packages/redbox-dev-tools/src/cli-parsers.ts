import { RouteMapping } from './generators/controller';
import { ModelAttribute, ModelAssociation } from './generators/model';
import { NavigationMapping, LanguageDefaultEntry } from './utils/config-helper';

// Helper functions for parsing model options
export function parseAttributes(val: string): ModelAttribute[] {
  return val.split(',').map(attr => {
    const parts = attr.trim().split(':');
    const name = parts[0];
    const type = (parts[1] || 'string') as ModelAttribute['type'];
    const required = parts.includes('required');
    const unique = parts.includes('unique');
    return { name, type, required, unique };
  });
}

// Helper function for parsing route mappings
// Format: action:verb:path[:role1:role2:...] (e.g., "listItems:get:/api/items:Admin:Researcher,deleteItem:delete:/api/items/:id:Admin")
export function parseRoutes(val: string): RouteMapping[] {
  return val.split(',').map(route => {
    const parts = route.trim().split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid route format: ${route}. Expected action:verb:path or action:path`);
    }
    if (parts.length === 2) {
      // action:path format (verb defaults to get)
      return { action: parts[0], verb: 'get', path: parts[1] };
    }
    // action:verb:path[:role1:role2:...] format
    const action = parts[0];
    const verb = parts[1].toLowerCase();
    const path = parts[2];
    const auth = parts.length > 3 ? parts.slice(3) : undefined;
    return { action, verb, path, auth };
  });
}

const NAV_TYPES = new Set(['menu', 'menuRoot', 'menu-root', 'homePanel', 'home-panel', 'adminSection', 'admin-section', 'adminFooter', 'admin-footer']);

function normalizeNavType(type: string): NavigationMapping['target'] {
  switch (type) {
    case 'menu-root':
      return 'menuRoot';
    case 'home-panel':
      return 'homePanel';
    case 'admin-section':
      return 'adminSection';
    case 'admin-footer':
      return 'adminFooter';
    default:
      return type as NavigationMapping['target'];
  }
}

// Format: [action:]type[:containerId]:labelKey[:itemId]
export function parseNavMappings(val: string): NavigationMapping[] {
  return val.split(',').map(entry => {
    const rawParts = entry.trim().split(':').filter(p => p.length > 0);
    if (rawParts.length < 2) {
      throw new Error(`Invalid navigation format: ${entry}. Expected action:type:containerId:labelKey or type:containerId:labelKey.`);
    }

    let action: string | undefined;
    let typeToken = rawParts[0];
    let parts = rawParts.slice(1);

    if (!NAV_TYPES.has(typeToken)) {
      action = rawParts[0];
      typeToken = rawParts[1] || '';
      parts = rawParts.slice(2);
    }

    if (!NAV_TYPES.has(typeToken)) {
      throw new Error(`Invalid navigation type: ${typeToken}. Allowed: menu, menuRoot, homePanel, adminSection, adminFooter.`);
    }

    const target = normalizeNavType(typeToken);

    if (target === 'menuRoot' || target === 'adminFooter') {
      if (parts.length < 1) {
        throw new Error(`Invalid navigation format: ${entry}. Expected ${target}:labelKey[:itemId].`);
      }
      const labelKey = parts[0];
      const itemId = parts[1];
      return { action, target, labelKey, itemId };
    }

    if (parts.length < 2) {
      throw new Error(`Invalid navigation format: ${entry}. Expected ${target}:containerId:labelKey[:itemId].`);
    }

    const containerId = parts[0];
    const labelKey = parts[1];
    const itemId = parts[2];
    return { action, target, containerId, labelKey, itemId };
  });
}

// Format: key=value[:lang]
export function parseLanguageDefaults(val: string): LanguageDefaultEntry[] {
  return val.split(',').map(entry => {
    const trimmed = entry.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      throw new Error(`Invalid language default format: ${entry}. Expected key=value[:lang].`);
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const valuePart = trimmed.slice(eqIdx + 1).trim();
    const valueParts = valuePart.split(':');
    const language = valueParts.length > 1 ? valueParts.pop() : undefined;
    const value = valueParts.join(':');
    if (!key || !value) {
      throw new Error(`Invalid language default format: ${entry}. Expected key=value[:lang].`);
    }
    return { key, value, language };
  });
}

export function parseBelongsTo(val: string): ModelAssociation[] {
  return val.split(',').map(assoc => {
    const parts = assoc.trim().split(':');
    return {
      name: parts[0],
      type: 'belongsTo' as const,
      model: parts[1] || parts[0]
    };
  });
}

export function parseHasMany(val: string): ModelAssociation[] {
  return val.split(',').map(assoc => {
    const parts = assoc.trim().split(':');
    return {
      name: parts[0],
      type: 'hasMany' as const,
      model: parts[1] || parts[0],
      via: parts[2],
      dominant: parts.includes('dominant')
    };
  });
}
