import { cloneDeep, get } from 'lodash';
import { applyCitationWriteBack } from './crate';
import { oniSourceRecord, type OniExecution } from './publication-source';
import type { ResolvedOniPublishingConfigData } from './types';
import { oniJson } from './publication-config';

/** Provider formatting only. The host owns current access, registered paths and revision retries. */
export async function projectOniPublication(
  context: OniExecution,
  config: ResolvedOniPublishingConfigData,
  datasetUrl: string
): Promise<void> {
  const next = cloneDeep(oniSourceRecord(context.source.metadata, context.oid, context.brandId));
  applyCitationWriteBack(next, config, datasetUrl);
  const paths = [
    config.writeBack.citationUrlPath,
    config.writeBack.citationDoiPath,
    config.writeBack.publicationErrorPath,
  ];
  await context.project(oniJson(Object.fromEntries(paths.map(path => [path, get(next, path) ?? null]))));
  await context.audit({ category: 'oni_projection', message: 'Oni citation projection persisted' });
}
