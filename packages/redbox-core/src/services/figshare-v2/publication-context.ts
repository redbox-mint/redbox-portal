import { AsyncLocalStorage } from 'node:async_hooks';
import type { ResolvedFigsharePublishingConfigData } from './config';
import type { FigshareArticlePayload } from './types';

/** Destination-local context also applies to inherited customer service methods. */
export const figsharePublicationContext = new AsyncLocalStorage<{
  oid: string;
  brandId: string;
  configuration: ResolvedFigsharePublishingConfigData;
  preflight: boolean;
  payload?: FigshareArticlePayload;
}>();
