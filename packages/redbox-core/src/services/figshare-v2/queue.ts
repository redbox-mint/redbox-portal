import { AnyRecord } from './types';

export interface FigshareQueueMessage extends AnyRecord {
  oid: string;
  articleId?: string;
  brandId?: string;
  user?: AnyRecord;
}

export function buildPublishAfterUploadsMessage(oid: string, articleId: string, user: AnyRecord, brandId: string): FigshareQueueMessage {
  return { oid, articleId, user, brandId };
}

export function buildDeleteFilesMessage(oid: string, user: AnyRecord, brandId: string, articleId: string): FigshareQueueMessage {
  return { oid, user, brandId, articleId };
}
