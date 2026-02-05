import { Observable } from 'rxjs';
import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model/storage/BrandingModel';


export module Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Asynch extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
        'index',
        'start',
        'progress',
        'stop',
        'update',
        'subscribe',
        'unsubscribe'
    ];

    /**
     * *************************************************************************************************
     * ************************************** Add custom methods **************************************
     * *************************************************************************************************
     */
    public override index(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'asynch/index');
    }

    public start(req: Sails.Req, res: Sails.Res) {
      const progressObj = this.createProgressObjFromRequest(req);
      AsynchsService.start(progressObj).subscribe((progress: any) => {
        this.broadcast(req, 'start', progress);
        this.sendResp(req, res, { data: progress, headers: this.getNoCacheHeaders() });
      });
    }

    public stop(req: Sails.Req, res: Sails.Res) {
      const id = req.param('id');
      AsynchsService.finish(id).subscribe((progress: any[]) => {
        this.broadcast(req, 'stop', progress[0]);
        this.sendResp(req, res, { data: progress[0], headers: this.getNoCacheHeaders() });
      });
    }

    public update(req: Sails.Req, res: Sails.Res) {
      const id = req.param('id');
      const progressObj = this.createProgressObjFromRequest(req);
      AsynchsService.update({id: id}, progressObj).subscribe((progress: any[]) => {
        this.broadcast(req, 'update', progress[0]);
        this.sendResp(req, res, { data: progress[0], headers: this.getNoCacheHeaders() });
      });
    }

    protected createProgressObjFromRequest(req: Sails.Req): Record<string, unknown> {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const username = req.user.username;
      const name = req.param('name');
      const recordOid = req.param('relatedRecordId');
      const metadata = req.param('metadata') ? req.param('metadata') : null;
      const method = req.method;
      const status = req.param('status');
      const progressObj:any = {
         name: name,
         started_by: username,
         branding: brand.id,
         status:status,
         metadata: metadata,
         relatedRecordId: recordOid,
         message: req.param('message'),
         taskType: req.param('taskType')
      };
      if (!_.isUndefined(req.param('targetIdx'))) {
        progressObj.targetIdx = req.param('targetIdx');
      }
      if (!_.isUndefined(req.param('currentIdx'))) {
        progressObj.currentIdx = req.param('currentIdx')
      }
      return progressObj;
    }

    public progress(req: Sails.Req, res: Sails.Res) {
      const fq = this.getQuery(req.param('fq'));
      if (_.isEmpty(fq)) {
        return this.sendResp(req, res, { data: { status: false, message: 'Empty queries are not allowed.' }, headers: this.getNoCacheHeaders() });
      }
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      fq.where.branding = brand.id;
      return AsynchsService.get(fq).subscribe((progress: any) => {
        this.sendResp(req, res, { data: progress, headers: this.getNoCacheHeaders() });
      });
    }

    protected getQuery(fq: unknown): any {
      if (typeof fq === 'string') {
        fq = JSON.parse(fq);
      }
      _.unset(fq, '$where');
      _.unset(fq, 'group');
      _.unset(fq, 'mapReduce');
      return fq;
    }

    public subscribe(req: Sails.Req, res: Sails.Res) {
      const roomId = req.param('roomId');
      console.log(`Trying to join: ${roomId}`);
      if (!req.isSocket) {
        return res.badRequest();
      }

      sails.sockets.join(req, roomId, (err: unknown) => {
        if (err) {
          console.log(`Failed to join room`);
          return this.sendResp(req, res, { data: err ?? { status: false, message: `Failed to join room: ${roomId}` }, headers: this.getNoCacheHeaders() });
        }
        console.log(`Joined room: ${roomId}`);
        return this.sendResp(req, res, { data: {
          status: true,
          message: `Successfully joined: ${roomId}`
        }, headers: this.getNoCacheHeaders() });
      });
    }

    public unsubscribe(req: Sails.Req, res: Sails.Res) {
      if (!req.isSocket) {
        return res.badRequest();
      }
      const roomId = req.param('roomId')
      sails.sockets.leave(req, roomId, (err: unknown) => {
        if (err) {
          return this.sendResp(req, res, { data: err ?? { status: false, message: `Failed to leave room: ${roomId}` }, headers: this.getNoCacheHeaders() });
        }
        return this.sendResp(req, res, { data: {
          status: true,
          message: `Successfully left: ${roomId}`
        }, headers: this.getNoCacheHeaders() });
      });
    }

    protected broadcast(req: Sails.Req, eventName: string, progressObj: any) {
      if (!_.isEmpty(progressObj.relatedRecordId) && !_.isUndefined(progressObj.relatedRecordId)) {
        sails.sockets.broadcast(progressObj.relatedRecordId, eventName, progressObj, req);
        sails.sockets.broadcast(progressObj.id, eventName, progressObj, req);
        if (progressObj.taskType) {
          sails.sockets.broadcast(`${progressObj.relatedRecordId}-${progressObj.taskType}`, eventName, progressObj, req);
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
