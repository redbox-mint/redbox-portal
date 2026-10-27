import type { RecordsService } from '../RecordsService';
import type { Services as Progress } from './Asynchs';
import type { RecordModel } from '../model/storage/RecordModel';
import type { AuthenticatedActor } from '../http/express/identity';
import { BrandingModel } from '../model/storage/BrandingModel';
import { firstValueFrom } from 'rxjs';

/** Resolve persisted room relationships; hyphens alone never establish a task binding. */
export async function resolveProgressRecord(
  roomId: string,
  brandId: string,
  input: { records: Pick<RecordsService, 'getMeta'>; progress: Pick<Progress.Asynchs, 'get'> },
  visited: ReadonlySet<string> = new Set()
): Promise<RecordModel | null> {
  if (!roomId || roomId.length > 512 || visited.has(roomId) || visited.size >= 20) return null;
  const next = new Set(visited).add(roomId),
    candidates = new Map<string, RecordModel>();
  try {
    const record = await input.records.getMeta(roomId);
    if (record?.metaMetadata?.brandId === brandId) candidates.set(record.redboxOid, record);
  } catch {
    /* Unknown room identifiers disclose nothing. */
  }
  const references = new Set<string>();
  const progress = /^[a-f0-9]{24}$/.test(roomId)
    ? await firstValueFrom(input.progress.get({ id: roomId, branding: brandId }))
    : [];
  for (const row of progress) {
    if (typeof row.relatedRecordId === 'string' && row.relatedRecordId !== roomId) references.add(row.relatedRecordId);
  }
  let split = roomId.lastIndexOf('-');
  while (split > 0) {
    const relatedRecordId = roomId.slice(0, split),
      taskType = roomId.slice(split + 1);
    const tasks = await firstValueFrom(input.progress.get({ relatedRecordId, taskType, branding: brandId }));
    if (tasks.some(t => t.relatedRecordId === relatedRecordId && t.taskType === taskType))
      references.add(relatedRecordId);
    split = roomId.lastIndexOf('-', split - 1);
  }
  for (const reference of references) {
    const record = await resolveProgressRecord(reference, brandId, input, next);
    if (record) candidates.set(record.redboxOid, record);
  }
  return candidates.size === 1 ? [...candidates.values()][0]! : null;
}
export async function authorizeProgressRoom(
  room: string,
  brand: { id: string; name?: string },
  actor: AuthenticatedActor,
  input: { records: Pick<RecordsService, 'getMeta' | 'hasViewAccess'>; progress: Pick<Progress.Asynchs, 'get'> }
): Promise<boolean> {
  if (!actor.roles.some(r => r.brandId === brand.id)) return false;
  const record = await resolveProgressRecord(room, brand.id, input);
  if (!record) return false;
  const roles = actor.roles.map(r => ({ id: r.id, name: r.name, branding: { id: r.brandId } }));
  return input.records.hasViewAccess(Object.assign(new BrandingModel(), brand), { ...actor, roles }, roles, record);
}
