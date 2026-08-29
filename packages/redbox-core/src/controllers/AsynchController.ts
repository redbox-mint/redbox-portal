import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model/storage/BrandingModel';
import {
  authorizationResourceError,
  requireAllowedResource,
  type AuthorizationContext,
  type AuthorizationDecision,
  type ScopeKey,
} from '../authorization';
import { requireRequestResourceAuthorization } from '../api-routes';
import { ensureAuthorizationRequestId, sendAuthorizationResourceError } from '../policies/authorization-response';
import type { RecordsService } from '../RecordsService';

const MAX_ROOM_RESOLUTION_CANDIDATES = 32;
const MAX_ROOM_RESOLUTION_VISITS = 64;

interface PrivilegedSocketAuthorizationService {
  resolveUserContext(
    userId: string,
    brandIdentifier: string,
    authMethod: 'session' | 'bearer',
    tokenScopeCeiling?: readonly string[]
  ): Promise<AuthorizationContext>;
  authorizeBrandEntity(
    context: AuthorizationContext,
    requiredScope: ScopeKey,
    entityBrandId: string | undefined
  ): AuthorizationDecision;
}

export namespace Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Asynch extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'index',
      'start',
      'progress',
      'stop',
      'update',
      'subscribe',
      'unsubscribe',
    ];

    /**
     * *************************************************************************************************
     * ************************************** Add custom methods **************************************
     * *************************************************************************************************
     */
    public override index(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'asynch/index');
    }

    public async start(req: Sails.Req, res: Sails.Res) {
      try {
        await this.reauthorizePrivilegedSocketMessage(req);
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        throw error;
      }
      const progressObj = this.createProgressObjFromRequest(req);
      AsynchsService.start(progressObj).subscribe((progress: globalThis.Record<string, unknown>) => {
        this.broadcast(req, 'start', progress);
        this.sendResp(req, res, { data: progress, headers: this.getNoCacheHeaders() });
      });
    }

    public async stop(req: Sails.Req, res: Sails.Res) {
      const id = req.param('id');
      let authorization: ReturnType<typeof requireRequestResourceAuthorization>;
      let brand: BrandingModel;
      try {
        authorization = await this.reauthorizePrivilegedSocketMessage(req);
        brand = this.authorizedBrand(req, authorization.context);
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        throw error;
      }
      AsynchsService.get({ id, branding: brand.id }).subscribe((existing: globalThis.Record<string, unknown>[]) => {
        const existingProgress = existing?.[0];
        const startedBy = String(existingProgress?.started_by ?? '');
        const username = String(req.user?.username ?? '');
        const actorId = String(existingProgress?.actorId ?? '');
        const currentActorId = String(authorization.context.principal.userId ?? '');
        if (
          !existingProgress ||
          (actorId ? !currentActorId || actorId !== currentActorId : !startedBy || !username || startedBy !== username)
        ) {
          return this.sendAccessDenied(req, res);
        }
        AsynchsService.finish({ id, branding: brand.id }).subscribe(
          (progress: globalThis.Record<string, unknown>[]) => {
            this.broadcast(req, 'stop', progress[0]);
            this.sendResp(req, res, { data: progress[0], headers: this.getNoCacheHeaders() });
          }
        );
      });
    }

    public async update(req: Sails.Req, res: Sails.Res) {
      const id = req.param('id');
      let authorization: ReturnType<typeof requireRequestResourceAuthorization>;
      let brand: BrandingModel;
      try {
        authorization = await this.reauthorizePrivilegedSocketMessage(req);
        brand = this.authorizedBrand(req, authorization.context);
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        throw error;
      }
      AsynchsService.get({ id, branding: brand.id }).subscribe((existing: globalThis.Record<string, unknown>[]) => {
        const existingProgress = existing?.[0];
        const startedBy = String(existingProgress?.started_by ?? '');
        const username = String(req.user?.username ?? '');
        const actorId = String(existingProgress?.actorId ?? '');
        const currentActorId = String(authorization.context.principal.userId ?? '');
        if (
          !existingProgress ||
          (actorId ? !currentActorId || actorId !== currentActorId : !startedBy || !username || startedBy !== username)
        ) {
          return this.sendAccessDenied(req, res);
        }
        const progressObj = this.createProgressObjFromRequest(req);
        AsynchsService.update({ id, branding: brand.id }, progressObj).subscribe(
          (progress: globalThis.Record<string, unknown>[]) => {
            this.broadcast(req, 'update', progress[0]);
            this.sendResp(req, res, { data: progress[0], headers: this.getNoCacheHeaders() });
          }
        );
      });
    }

    protected createProgressObjFromRequest(req: Sails.Req): Record<string, unknown> {
      const brand: BrandingModel = BrandingService.getBrandFromReq(req);
      const username = req.user!.username;
      const name = req.param('name');
      const recordOid = req.param('relatedRecordId');
      const metadata = req.param('metadata') ? req.param('metadata') : null;
      const status = req.param('status');
      const progressObj: globalThis.Record<string, unknown> = {
        name: name,
        started_by: username,
        branding: brand.id,
        status: status,
        metadata: metadata,
        relatedRecordId: recordOid,
        message: req.param('message'),
        taskType: req.param('taskType'),
      };
      const authorization = requireRequestResourceAuthorization(req);
      progressObj.actorId = authorization.context.principal.userId;
      progressObj.operationId = ensureAuthorizationRequestId(req);
      progressObj.requiredScope = authorization.requiredScope;
      if (!_.isUndefined(req.param('targetIdx'))) {
        progressObj.targetIdx = req.param('targetIdx');
      }
      if (!_.isUndefined(req.param('currentIdx'))) {
        progressObj.currentIdx = req.param('currentIdx');
      }
      return progressObj;
    }

    public async progress(req: Sails.Req, res: Sails.Res) {
      let authorization: ReturnType<typeof requireRequestResourceAuthorization>;
      let brand: BrandingModel;
      try {
        authorization = await this.reauthorizePrivilegedSocketMessage(req);
        brand = this.authorizedBrand(req, authorization.context);
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        throw error;
      }
      const fq = this.getQuery(req.param('fq'));
      if (_.isEmpty(fq)) {
        return this.sendResp(req, res, {
          data: { status: false, message: 'Empty queries are not allowed.' },
          headers: this.getNoCacheHeaders(),
        });
      }
      (fq.where as globalThis.Record<string, unknown>).branding = brand.id;
      return AsynchsService.get(fq).subscribe((progress: unknown) => {
        this.sendResp(req, res, { data: progress, headers: this.getNoCacheHeaders() });
      });
    }

    protected getQuery(fq: unknown): globalThis.Record<string, unknown> {
      if (typeof fq === 'string') {
        fq = JSON.parse(fq);
      }
      const result = fq as globalThis.Record<string, unknown>;
      _.unset(result, '$where');
      _.unset(result, 'group');
      _.unset(result, 'mapReduce');
      return result;
    }

    public async subscribe(req: Sails.Req, res: Sails.Res) {
      const roomId = req.param('roomId');
      sails.log.verbose(`Trying to join asynchronous room: ${roomId}`);
      if (!req.isSocket) {
        return res.badRequest();
      }

      let authorization: ReturnType<typeof requireRequestResourceAuthorization>;
      let brand: BrandingModel;
      try {
        authorization = await this.reauthorizePrivilegedSocketMessage(req);
        brand = this.authorizedBrand(req, authorization.context);
      } catch (error) {
        if (sendAuthorizationResourceError(req, res, error)) return;
        throw error;
      }
      const recordsService = sails.services.recordsservice as unknown as RecordsService;

      if (!brand?.id || !req.user?.username) {
        return this.sendAccessDenied(req, res);
      }

      try {
        requireAllowedResource(
          recordsService.authorizeRecordCollection(authorization.context, authorization.requiredScope, 'read')
        );
      } catch {
        return this.sendAccessDenied(req, res);
      }

      let record: Record<string, unknown> | null;
      try {
        record = await this.tryFindRelatedRecord(roomId, String(brand.id), authorization, recordsService);
      } catch {
        return this.sendAccessDenied(req, res);
      }
      if (record == null) {
        return this.sendAccessDenied(req, res);
      }

      sails.sockets.join(req, roomId, (err: unknown) => {
        if (err) {
          sails.log.verbose(`Failed to join asynchronous room: ${roomId}`);
          return this.sendResp(req, res, {
            data: err ?? { status: false, message: `Failed to join room: ${roomId}` },
            headers: this.getNoCacheHeaders(),
          });
        }
        sails.log.verbose(`Joined asynchronous room: ${roomId}`);
        return this.sendResp(req, res, {
          data: {
            status: true,
            message: `Successfully joined: ${roomId}`,
          },
          headers: this.getNoCacheHeaders(),
        });
      });
    }

    /**
     * A socket handshake establishes identity presentation only. Every
     * privileged message resolves current user state, assignments, effective
     * scopes and brand authority afresh so revocation applies to the next
     * message without reconnecting.
     */
    private async reauthorizePrivilegedSocketMessage(
      req: Sails.Req
    ): Promise<ReturnType<typeof requireRequestResourceAuthorization>> {
      const attached = requireRequestResourceAuthorization(req);
      if (!req.isSocket) return attached;

      const userId = attached.context.principal.userId?.trim();
      const brandId = attached.context.brand?.id?.trim();
      const authMethod = attached.context.principal.authMethod;
      if (!userId || !brandId || (authMethod !== 'session' && authMethod !== 'bearer')) {
        throw authorizationResourceError({ allowed: false, reasonCode: 'principal-inactive' });
      }

      const service = sails.services.authorizationservice as unknown as
        Partial<PrivilegedSocketAuthorizationService> | undefined;
      if (
        service === undefined ||
        typeof service.resolveUserContext !== 'function' ||
        typeof service.authorizeBrandEntity !== 'function'
      ) {
        throw new Error('AuthorizationService is unavailable for privileged socket reauthorization.');
      }

      const refreshed = await service.resolveUserContext(
        userId,
        brandId,
        authMethod,
        authMethod === 'bearer' ? attached.context.tokenScopeCeiling : undefined
      );
      const decision = service.authorizeBrandEntity(refreshed, attached.requiredScope, refreshed.brand?.id);
      if (!decision.allowed) throw authorizationResourceError(decision);

      req.authorization = refreshed;
      req.resourceAuthorization = Object.freeze({
        context: refreshed,
        requiredScope: attached.requiredScope,
        routeId: attached.routeId,
      });
      // Mirrors the request-context projection: refreshed authority replaces the stale
      // socket principal, and credential material is never carried forward on `req.user`.
      const projectedUser: globalThis.Record<string, unknown> = {
        ...(req.user ?? {}),
        id: refreshed.principal.userId,
        username: refreshed.principal.username ?? '',
        roles: refreshed.compatibilityRoles,
      };
      Reflect.deleteProperty(projectedUser, 'password');
      Reflect.deleteProperty(projectedUser, 'token');
      req.user = projectedUser;
      return req.resourceAuthorization;
    }

    private authorizedBrand(req: Sails.Req, context: AuthorizationContext): BrandingModel {
      const brand = BrandingService.getBrandFromReq(req);
      if (!brand?.id || String(brand.id) !== context.brand?.id) {
        throw authorizationResourceError({ allowed: false, reasonCode: 'resource-brand-mismatch' });
      }
      return brand;
    }

    private async tryFindRelatedRecord(
      roomId: string,
      brandId: string,
      authorization: ReturnType<typeof requireRequestResourceAuthorization>,
      recordsService: RecordsService,
      visitedRoomIds: Set<string> = new Set<string>()
    ): Promise<Record<string, unknown> | null> {
      if (visitedRoomIds.has(roomId) || visitedRoomIds.size >= MAX_ROOM_RESOLUTION_VISITS) {
        return null;
      }
      visitedRoomIds.add(roomId);

      const directRecord = await this.tryFindDirectRelatedRecord(
        roomId,
        brandId,
        authorization,
        recordsService,
        visitedRoomIds
      );
      if (directRecord) {
        return directRecord;
      }

      // Composite task rooms are broadcast as `${relatedRecordId}-${taskType}`.
      // Resolve them through persisted field pairs instead of trusting a prefix,
      // because both values may contain hyphens.
      const relatedRecordIds = new Set<string>();
      let separatorIndex = roomId.lastIndexOf('-');
      let candidatesChecked = 0;
      while (separatorIndex > 0 && candidatesChecked < MAX_ROOM_RESOLUTION_CANDIDATES) {
        candidatesChecked += 1;
        const relatedRecordId = roomId.substring(0, separatorIndex);
        const taskType = roomId.substring(separatorIndex + 1);
        const relatedRecord = await this.tryFindDirectRelatedRecord(
          relatedRecordId,
          brandId,
          authorization,
          recordsService,
          visitedRoomIds
        );
        if (relatedRecord) {
          return relatedRecord;
        }
        try {
          const progressRecords = await AsynchsService.get({
            relatedRecordId,
            taskType,
            branding: brandId,
          }).toPromise();
          for (const progressRecord of (progressRecords ?? []) as Array<Record<string, unknown>>) {
            if (progressRecord.relatedRecordId === relatedRecordId && progressRecord.taskType === taskType) {
              relatedRecordIds.add(relatedRecordId);
            }
          }
        } catch {
          sails.log.verbose(`AsynchController: failed to resolve composite roomId ${roomId}`);
        }
        separatorIndex = roomId.lastIndexOf('-', separatorIndex - 1);
      }

      // A room name that maps to multiple record/task pairs is ambiguous and
      // cannot be authorized safely.
      if (relatedRecordIds.size !== 1) {
        return null;
      }
      return this.tryFindRelatedRecord(
        [...relatedRecordIds][0],
        brandId,
        authorization,
        recordsService,
        visitedRoomIds
      );
    }

    private async tryFindDirectRelatedRecord(
      roomId: string,
      brandId: string,
      authorization: ReturnType<typeof requireRequestResourceAuthorization>,
      recordsService: RecordsService,
      visitedRoomIds: Set<string>
    ): Promise<Record<string, unknown> | null> {
      try {
        const result = await recordsService.getAuthorizedMeta(
          authorization.context,
          authorization.requiredScope,
          roomId,
          'read'
        );
        if (result.allowed) {
          return result.resource as unknown as Record<string, unknown>;
        }
        if (
          result.decision.reasonCode !== 'resource-not-found' &&
          result.decision.reasonCode !== 'resource-brand-mismatch'
        ) {
          throw new Error('Record room access is denied.');
        }
      } catch {
        throw new Error('Record room access is denied.');
      }
      try {
        const progressRecords = await AsynchsService.get({ id: roomId, branding: brandId }).toPromise();
        if (progressRecords && (progressRecords as Array<Record<string, unknown>>).length > 0) {
          const relatedRecordId = (progressRecords as Array<Record<string, unknown>>)[0]?.relatedRecordId as string;
          if (relatedRecordId && relatedRecordId !== roomId) {
            return this.tryFindRelatedRecord(relatedRecordId, brandId, authorization, recordsService, visitedRoomIds);
          }
        }
      } catch {
        sails.log.verbose(`AsynchController: failed to resolve roomId ${roomId} as progress`);
      }
      return null;
    }

    private sendAccessDenied(req: Sails.Req, res: Sails.Res) {
      return this.sendResp(req, res, {
        status: 403,
        data: { status: false, message: 'Access denied' },
        headers: this.getNoCacheHeaders(),
      });
    }

    public unsubscribe(req: Sails.Req, res: Sails.Res) {
      if (!req.isSocket) {
        return res.badRequest();
      }
      const roomId = req.param('roomId');
      sails.sockets.leave(req, roomId, (err: unknown) => {
        if (err) {
          return this.sendResp(req, res, {
            data: err ?? { status: false, message: `Failed to leave room: ${roomId}` },
            headers: this.getNoCacheHeaders(),
          });
        }
        return this.sendResp(req, res, {
          data: {
            status: true,
            message: `Successfully left: ${roomId}`,
          },
          headers: this.getNoCacheHeaders(),
        });
      });
    }

    protected broadcast(req: Sails.Req, eventName: string, progressObj: globalThis.Record<string, unknown>) {
      if (!_.isEmpty(progressObj.relatedRecordId) && !_.isUndefined(progressObj.relatedRecordId)) {
        sails.sockets.broadcast(progressObj.relatedRecordId as string, eventName, progressObj, req);
        sails.sockets.broadcast(progressObj.id as string, eventName, progressObj, req);
        if (progressObj.taskType) {
          sails.sockets.broadcast(
            `${progressObj.relatedRecordId}-${progressObj.taskType}`,
            eventName,
            progressObj,
            req
          );
        }
      }
    }

    /**
     * *************************************************************************************************
     * ************************************** Override magic methods **********************************
     * *************************************************************************************************
     */
  }
}
