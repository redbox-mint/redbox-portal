/**
 * Regenerates the frozen Phase 0 legacy authorization baseline snapshot.
 *
 * Maintained generation command for
 * `src/authorization/legacy-authorization-baseline.snapshot.ts`. Run only
 * after a REVIEWED change to `sails.config.auth.rules`,
 * `sails.config.routes`, or the contract route registry, and commit the
 * resulting snapshot diff alongside the source change:
 *
 * ```bash
 * npm --prefix packages/redbox-core run snapshot:legacy-baseline
 * ```
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { auth } from '../src/config/auth.config';
import { routes } from '../src/config/routes.config';
import { getMergedApiRoutes } from '../src/api-routes';
import {
  buildLegacyRouteBaseline,
  LEGACY_PATH_RULE_BASELINE,
} from '../src/authorization/legacy-authorization-baseline';

function literal(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'undefined';
}

async function main(): Promise<void> {
  const pathRows = [...LEGACY_PATH_RULE_BASELINE];
  const routeEntries = [...buildLegacyRouteBaseline(routes)];
  const contractIds = getMergedApiRoutes()
    .map(route => route.routeId)
    .sort();

  const kinds: Record<string, number> = { scope: 0, public: 0, 'pre-auth': 0 };
  for (const entry of routeEntries) {
    kinds[entry.authorizationKind] = (kinds[entry.authorizationKind] ?? 0) + 1;
  }

  const out = `/**
 * Frozen Phase 0 legacy authorization baseline snapshot.
 *
 * MAINTAINED ARTIFACT — DO NOT EDIT BY HAND.
 *
 * This module is the immutable characterization evidence for the legacy
 * PathRule/route compatibility baseline. It was generated from
 * \`sails.config.auth.rules\` (${pathRows.length} rows) and
 * \`sails.config.routes\` (${routeEntries.length} configured routes,
 * ${contractIds.length} contract routes) and is checked in so that drift or
 * omission in either source fails
 * \`test/authorization/legacy-authorization-baseline.test.ts\` instead of
 * silently moving the golden data.
 *
 * To regenerate after a REVIEWED change, run
 * \`npm --prefix packages/redbox-core run snapshot:legacy-baseline\`
 * (this file, \`scripts/regenerate-legacy-baseline-snapshot.ts\`) and commit
 * the resulting diff alongside the source change. Any snapshot change without
 * a matching reviewed source change must be rejected in review.
 */

import type {
  LegacyPathRuleBaselineRow,
  LegacyRouteBaselineEntry,
} from './legacy-authorization-baseline';

export const FROZEN_LEGACY_PATH_RULE_ROWS: readonly LegacyPathRuleBaselineRow[] = Object.freeze(
  ${literal(pathRows).replace(/\n/g, '\n  ')}
);

export const FROZEN_LEGACY_ROUTE_BASELINE: readonly LegacyRouteBaselineEntry[] = Object.freeze(
  ${literal(routeEntries).replace(/\n/g, '\n  ')}
);

export const FROZEN_CONTRACT_ROUTE_IDS: readonly string[] = Object.freeze(${literal(contractIds)});

export const FROZEN_BASELINE_COUNTS = Object.freeze({
  pathRuleRows: ${pathRows.length},
  configuredRoutes: ${routeEntries.length},
  contractRoutes: ${contractIds.length},
  scopedRoutes: ${kinds['scope']},
  publicRoutes: ${kinds['public']},
  preAuthRoutes: ${kinds['pre-auth']},
});
`;

  const target = path.resolve(__dirname, '../src/authorization/legacy-authorization-baseline.snapshot.ts');
  await fs.writeFile(target, out);
  process.stdout.write(`wrote ${target} (${out.length} bytes)\n`);
}

main().catch(error => {
  process.stderr.write(`snapshot generation failed: ${(error as Error)?.message ?? String(error)}\n`);
  process.exitCode = 1;
});
