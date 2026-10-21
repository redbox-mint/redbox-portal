import Ajv from 'ajv';
import { cloneDeep, merge } from 'lodash';
import {
  FigsharePublishing,
  FIGSHARE_PUBLISHING_SCHEMA,
  resolveFigshareConnectionToken,
} from '../../configmodels/FigsharePublishing';
import type { PublicationObject } from '../publication/contracts';
import type { ResolvedFigsharePublishingConfigData } from './config';
import { isPublicationObject } from '../publication/builtins';

const validate = new Ajv({ strict: false }).compile<FigsharePublishing>(FIGSHARE_PUBLISHING_SCHEMA);
export function figsharePreparedConfiguration(value: unknown): ResolvedFigsharePublishingConfigData {
  const candidate: unknown = merge(new FigsharePublishing(), cloneDeep(value));
  if (!validate(candidate)) throw new Error('Invalid prepared Figshare configuration');
  return { ...candidate, runtime: { mode: 'live' } };
}

export function figsharePublicationOutputPaths(destination: PublicationObject): string[] {
  const config = figshareDestinationConfiguration(destination);
  return [
    ...new Set(
      [
        config.writeBack.articleId,
        ...config.writeBack.articleUrls,
        config.record.statusPath,
        config.record.errorPath,
        config.record.syncStatePath,
        config.record.allFilesUploadedPath,
        ...config.writeBack.extraFields.map(field => field.targetPath),
      ].filter((path): path is string => typeof path === 'string' && path.length > 0)
    ),
  ];
}
/** Reuse the established provider config and defaults without consulting legacy AppConfig. */
export function figshareDestinationConfiguration(
  destination: PublicationObject,
  credentials: PublicationObject = {}
): ResolvedFigsharePublishingConfigData {
  const mapping = isPublicationObject(destination.mapping) ? destination.mapping : {};
  const attachments = isPublicationObject(destination.attachments) ? destination.attachments : {};
  const options = isPublicationObject(destination.providerOptions) ? destination.providerOptions : {};
  const candidate: unknown = merge(new FigsharePublishing(), cloneDeep(mapping), cloneDeep(options), {
    connection: cloneDeep(destination.connection),
    selection: cloneDeep(attachments.selection),
    assets: cloneDeep(attachments.assets),
  });
  if (!validate(candidate)) throw new Error('Invalid Figshare destination configuration');
  // Record paths are provider inputs. Output paths are declared centrally, so destinations cannot silently collide.
  const writeBack = isPublicationObject(destination.writeBack) ? destination.writeBack : {};
  if (typeof writeBack.articleId === 'string')
    candidate.writeBack.articleId = candidate.record.articleIdPath = writeBack.articleId;
  if (
    Array.isArray(writeBack.articleUrls) &&
    writeBack.articleUrls.every((path): path is string => typeof path === 'string')
  )
    candidate.writeBack.articleUrls = writeBack.articleUrls;
  for (const [key, property] of [
    ['status', 'statusPath'],
    ['error', 'errorPath'],
    ['syncState', 'syncStatePath'],
    ['allFilesUploaded', 'allFilesUploadedPath'],
  ] as const)
    if (typeof writeBack[key] === 'string') candidate.record[property] = writeBack[key];
  candidate.enabled = true;
  candidate.processing.enabled = true;
  candidate.workflow.transitionJob.enabled = false; // Shared workflow owns advancement.
  if (typeof credentials.token === 'string') candidate.connection.token = credentials.token;
  if (candidate.connection.token)
    candidate.connection.token = resolveFigshareConnectionToken(candidate.connection.token, { allowEmpty: true });
  return { ...candidate, runtime: { mode: 'live' } };
}
