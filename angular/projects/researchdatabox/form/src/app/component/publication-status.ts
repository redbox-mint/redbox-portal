import { IntegrationStatusItem } from '@researchdatabox/portal-ng-common';

const REASONS: Record<string, string> = {
  migration_quarantine: 'migration-quarantine',
  historical_observation_only: 'historical-observation',
  source_import_pending: 'queued',
  source_sync_pending: 'queued',
  save_finalisation_pending: 'saving',
  processing_disabled: 'paused',
  configuration_unavailable: 'configuration',
  configuration_invalid: 'configuration',
  configuration_changed: 'configuration-changed',
  target_changed: 'configuration-changed',
  save_outcome_unverified: 'save-unverified',
  save_abandoned: 'save-abandoned',
  approval_revoked: 'revoked',
  source_changed: 'source-changed',
  source_unavailable: 'source-changed',
  completion_unverified: 'completion-unverified',
  preparation_failed: 'preparation',
  resource_busy: 'busy',
  manual_publication: 'manual',
  manual_publish: 'manual',
  curation: 'curation',
  curation_pending: 'curation',
  awaiting_curation: 'curation',
  embargo: 'embargo',
  embargo_active: 'embargo',
  uploads: 'uploads',
  publication_confirmation: 'manual',
  content_sync_required: 'queued',
  uploads_pending: 'uploads',
  ingestion_pending: 'ingestion',
  ingestion_failed: 'ingestion',
};

export function publicationReasonKey(item: IntegrationStatusItem): string {
  if (!item.waitingReason) return '';
  const reason = REASONS[item.waitingReason];
  return `@publication-reason-${reason ?? (item.workStatus === 'repair_required' || item.workStatus === 'failed' ? 'repair' : 'waiting')}`;
}

export function publicationEvidenceKeys(item: IntegrationStatusItem): string[] {
  const evidence = item.completion?.current
    ? item.completion
    : item.observation?.current
      ? item.observation
      : undefined;
  if (!evidence) return item.completion || item.observation ? ['@publication-evidence-historical'] : [];
  const keys: string[] = [];
  keys.push(
    evidence.deposit === 'confirmed'
      ? '@publication-evidence-deposit-confirmed'
      : '@publication-evidence-deposit-unverified'
  );
  if (item.providerId !== 'oni') keys.push(`@publication-evidence-publication-${evidence.publication}`);
  keys.push(`@publication-evidence-ingestion-${evidence.ingestion}`);
  keys.push(`@publication-evidence-visibility-${evidence.visibility}`);
  if (evidence.embargoed === true) keys.push('@publication-evidence-embargoed');
  if (evidence.accessible === true) keys.push('@publication-evidence-accessible');
  if (evidence.accessible === false) keys.push('@publication-evidence-inaccessible');
  return keys;
}

/** Links in status remain useful during newer work, with an explicit historical label. */
export function publicationStatusLinks(item: IntegrationStatusItem): { url: string; current: boolean }[] {
  const urls = new Set<string>();
  for (const value of Object.values(item.links ?? {})) {
    try {
      const url = new URL(value);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash)
        urls.add(url.href);
    } catch {
      /* Do not render malformed or private links. */
    }
  }
  return [...urls].map(url => ({
    url,
    current: item.completion?.current === true,
  }));
}
