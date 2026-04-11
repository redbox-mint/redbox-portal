import { FigshareJobData, UserModel } from './types';

export function buildPublishAfterUploadsMessage(oid: string, articleId: string, user: UserModel, brandId: string): FigshareJobData {
  return { oid, articleId, user, brandId };
}

export function buildDeleteFilesMessage(oid: string, user: UserModel, brandId: string, articleId: string): FigshareJobData {
  return { oid, user, brandId, articleId };
}
