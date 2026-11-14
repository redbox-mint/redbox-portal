import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { Services as Progress } from '../../progress/Asynchs';
import type { RecordsService } from '../../RecordsService';
import type { ProgressSockets } from '../express/progressSockets';
import { authorizeProgressRoom } from '../../progress/authorization';
import { referenceValue as singleHttpResult } from './reference';
import { actionApiData, actionApiErrors, type ActionRequest, type ActionReply } from './actionReply';
export interface ProgressOperationInput {
  readonly progress: Pick<Progress.Asynchs, 'start' | 'update' | 'finish' | 'get'>;
  readonly records: Pick<RecordsService, 'getMeta' | 'hasViewAccess'>;
  readonly sockets: Pick<ProgressSockets, 'issue' | 'emit'>;
  readonly log: Pick<ILogger, 'error'>;
  audit(actor: { id: string; username: string }, action: string, context: { brandId: string }): Promise<unknown>;
}
export async function executeProgressOperation(
  input: ProgressOperationInput,
  operation: 'start' | 'update' | 'stop' | 'progress' | 'subscribe' | 'unsubscribe',
  req: ActionRequest,
  res: ActionReply
): Promise<void> {
  const { actor, brand } = req.context();
  try {
    if (!actor) {
      actionApiErrors(req, res, 401, [{ detail: 'Authentication required' }]);
      return;
    }
    if (!actor.roles.some(r => r.brandId === brand.id)) {
      actionApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
      return;
    }
    if (operation === 'subscribe' || operation === 'unsubscribe') {
      actionApiErrors(req, res, 410, [
        { detail: 'Use direct Socket.IO subscribe/unsubscribe events with an owned socket grant.' },
      ]);
      return;
    }
    const value = req.body ?? {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      actionApiErrors(req, res, 400, [{ detail: 'Invalid progress payload' }]);
      return;
    }
    const body = value as Record<string, unknown>;
    const permitted = (room: string) => authorizeProgressRoom(room, brand, actor, input);
    if (operation === 'progress') {
      let query: unknown = req.query?.fq;
      if (typeof query === 'string')
        try {
          query = JSON.parse(query);
        } catch {
          actionApiErrors(req, res, 400, [{ detail: 'Invalid progress query' }]);
          return;
        }
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        actionApiData(req, res, { status: false, message: 'Empty queries are not allowed.' });
        return;
      }
      const where = Reflect.get(query, 'where') ?? query;
      if (!where || typeof where !== 'object' || Array.isArray(where)) {
        actionApiErrors(req, res, 400, [{ detail: 'Invalid progress query' }]);
        return;
      }
      const filter: Record<string, unknown> = { branding: brand.id };
      for (const [key, value] of Object.entries(where)) {
        if (
          !['id', 'name', 'relatedRecordId', 'taskType', 'status', 'started_by'].includes(key) ||
          typeof value !== 'string'
        ) {
          actionApiErrors(req, res, 400, [{ detail: 'Invalid progress query' }]);
          return;
        }
        filter[key] = value;
      }
      const rows = await singleHttpResult(input.progress.get({ where: filter, limit: 1000 }));
      const readable = [];
      for (const row of rows.slice(0, 1000))
        if (typeof row.relatedRecordId === 'string' && (await permitted(row.relatedRecordId))) readable.push(row);
      actionApiData(req, res, readable);
      return;
    }
    const id = body.id ?? req.query?.id;
    let existing: Record<string, unknown> | undefined;
    if (operation !== 'start') {
      if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) {
        actionApiErrors(req, res, 400, [{ detail: 'Progress identifier is required' }]);
        return;
      }
      existing = (await singleHttpResult(input.progress.get({ id, branding: brand.id })))[0];
      if (
        !existing ||
        existing.started_by !== actor.username ||
        typeof existing.relatedRecordId !== 'string' ||
        !(await permitted(existing.relatedRecordId))
      ) {
        actionApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
        return;
      }
    }
    const relatedRecordId = body.relatedRecordId ?? existing?.relatedRecordId;
    if (typeof relatedRecordId !== 'string' || !(await permitted(relatedRecordId))) {
      actionApiErrors(req, res, 403, [{ detail: 'Access Denied' }]);
      return;
    }
    if (existing && relatedRecordId !== existing.relatedRecordId) {
      actionApiErrors(req, res, 400, [{ detail: 'Progress record ownership cannot change' }]);
      return;
    }
    const values: Record<string, unknown> = { branding: brand.id, started_by: actor.username, relatedRecordId };
    for (const key of ['name', 'status', 'message', 'taskType', 'metadata', 'targetIdx', 'currentIdx'])
      if (body[key] !== undefined) values[key] = body[key];
    if (
      (operation === 'start' && (typeof values.name !== 'string' || !values.name.trim())) ||
      ['name', 'status', 'message', 'taskType'].some(
        key => values[key] !== undefined && (typeof values[key] !== 'string' || String(values[key]).length > 8192)
      ) ||
      ['targetIdx', 'currentIdx'].some(
        key => values[key] !== undefined && (!Number.isSafeInteger(values[key]) || Number(values[key]) < 0)
      )
    ) {
      actionApiErrors(req, res, 400, [{ detail: 'Invalid progress fields' }]);
      return;
    }
    const result =
      operation === 'start'
        ? await singleHttpResult(input.progress.start(values))
        : operation === 'stop'
          ? (await singleHttpResult(input.progress.finish(String(id))))[0]
          : (
              await singleHttpResult(
                input.progress.update({ id, branding: brand.id, started_by: actor.username }, values)
              )
            )[0];
    if (!result) throw new Error('Progress write returned no result');
    await input.sockets.emit(operation === 'update' ? 'update' : operation, result);
    await input.audit(actor, 'progress-' + operation, { brandId: brand.id });
    actionApiData(req, res, result);
  } catch (_error) {
    input.log.error('Progress operation failed');
    actionApiErrors(req, res, 500, [{ detail: 'Progress operation failed. Review current state before retrying.' }]);
  }
}
