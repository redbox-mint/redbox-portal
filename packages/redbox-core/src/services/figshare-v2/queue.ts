import { FigshareJobData, UserModel } from './types';

/** Queue delivery is a wake-up; all generations and retry deadlines live in FigshareSync. */
export async function scheduleFigshareDelivery(oid: string, brandId: string, schedule: string | Date = new Date()): Promise<void> {
  await AgendaQueueService.scheduleUnique('Figshare-SyncRecord', schedule, { oid, brandId }, JSON.stringify([brandId, oid]));
}

export function buildPublishAfterUploadsMessage(oid: string, articleId: string, user: UserModel, brandId: string): FigshareJobData {
  return { oid, articleId, user, brandId };
}

export function buildDeleteFilesMessage(oid: string, user: UserModel, brandId: string, articleId: string): FigshareJobData {
  return { oid, user, brandId, articleId };
}
