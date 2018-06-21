// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
import { Observable } from 'rxjs/Rx';
import moment from 'moment-es6';

declare function require(name:string);
declare var AsynchsService, VocabService, BrandingService;
/**
 * Package that contains all Controllers.
 */
import controller = require('../core/CoreController.js');
export module Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Asynch extends controller.Controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'index',
        'start',
        'progress',
        'stop',
        'update',
        'subscribe',
        'unsubscribe'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */
    public index(req, res) {
      return this.sendView(req, res, 'asynch/index');
    }

    public start(req, res) {
      const progressObj = this.createProgressObjFromRequest(req);
      AsynchsService.start(progressObj).subscribe(progress => {
        this.broadcast(req, 'start', progress);
        this.ajaxOk(req, res, null, progress, true);
      });
    }

    public stop(req, res) {
      const id = req.param('id');
      AsynchsService.finish(id).subscribe(progress => {
        this.broadcast(req, 'stop', progress[0]);
        this.ajaxOk(req, res, null, progress[0], true);
      });
    }

    public update(req, res) {
      const id = req.param('id');
      const progressObj = this.createProgressObjFromRequest(req);
      AsynchsService.update({id: id}, progressObj).subscribe(progress => {
        this.broadcast(req, 'update', progress[0]);
        this.ajaxOk(req, res, null, progress[0], true);
      });
    }

    protected createProgressObjFromRequest(req) {
      const brand = BrandingService.getBrand(req.session.branding);
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

    public progress(req, res) {
      const fq = this.getQuery(req.param('fq'));
      if (_.isEmpty(fq)) {
        return this.ajaxFail(req, res, 'Empty queries are not allowed.');
      }
      const brand = BrandingService.getBrand(req.session.branding);
      fq.where.branding = brand.id;
      AsynchsService.get(fq).subscribe(progress => {
        this.ajaxOk(req, res, null, progress, true);
      });
    }

    protected getQuery(fq) {
      if (_.isString(fq)) {
        fq = JSON.parse(fq);
      }
      _.unset(fq, '$where');
      _.unset(fq, 'group');
      _.unset(fq, 'mapReduce');
      return fq;
    }

    public subscribe(req, res) {
      const roomId = req.param('roomId');
      console.log(`Trying to join: ${roomId}`);
      if (!req.isSocket) {
        return res.badRequest();
      }

      sails.sockets.join(req, roomId, (err) => {
        if (err) {
          console.log(`Failed to join room`);
          return this.ajaxFail(req, res, `Failed to join room: ${roomId}`, err, true);
        }
        console.log(`Joined room: ${roomId}`);
        return this.ajaxOk(req, res, null, {
          status: true,
          message: `Successfully joined: ${roomId}`
        },
        true);
      });
    }

    public unsubscribe(req, res) {
      if (!req.isSocket) {
        return res.badRequest();
      }
      const roomId = req.param('roomId')
      sails.sockets.leave(req, roomId, (err) => {
        if (err) {
          return this.ajaxFail(req, res, `Failed to leave room: ${roomId}`, err, true);
        }
        return this.ajaxOk(req, res, null, {
          status: true,
          message: `Successfully left: ${roomId}`
        },
        true);
      });
    }

    protected broadcast(req, eventName, progressObj) {
      if (!_.isEmpty(progressObj.relatedRecordId) && !_.isUndefined(progressObj.relatedRecordId)) {
        sails.sockets.broadcast(progressObj.relatedRecordId, eventName, progressObj, req);
        sails.sockets.broadcast(progressObj.id, eventName, progressObj, req);
        if (progressObj.taskType) {
          sails.sockets.broadcast(`${progressObj.relatedRecordId}-${progressObj.taskType}`, eventName, progressObj, req);
        }
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}

module.exports = new Controllers.Asynch().exports();
