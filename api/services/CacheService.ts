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

import { Observable } from 'rxjs/Rx';
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";
import * as NodeCache from "node-cache";
import moment from 'moment-es6';
declare var sails: Sails;
declare var CacheEntry: Model;

export module Services {
  /**
   * Cache related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class Cache extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'get',
      'set'
    ];

    protected cache;

    public bootstrap() {
      const cacheOpts = {stdTTL: sails.config.cache.cacheExpiry, checkperiod: sails.config.cache.checkPeriod ? sails.config.cache.checkPeriod : 600};
      sails.log.verbose(`Using node cache options: `);
      sails.log.verbose(cacheOpts);
      this.cache = new NodeCache(cacheOpts);
    }

    public get(name): Observable<any> {
      const cacheGet = Observable.bindNodeCallback(this.cache.get)(name);
      return cacheGet.flatMap(data => {
        if (data) {
          return Observable.of(data);
        } else {
          sails.log.verbose(`Getting DB cache entry for name: ${name}`);
          return super.getObservable(CacheEntry.findOne({name: name})).flatMap(dbData => {
            if (!_.isEmpty(dbData)) {
              sails.log.verbose(`Got DB cache entry`);
              // check if entry is expired...
              if (moment().unix() - dbData.ts_added > sails.config.cache.cacheExpiry) {
                sails.log.verbose(`Cache entry for ${name} has expired while on the DB, returning null...`);
                return Observable.of(null);
              } else {
                this.cache.set(name, dbData.data);
                return Observable.of(dbData.data);
              }
            }
            sails.log.verbose(`No DB cache entry for: ${name}`);
            return Observable.of(null);
          });
        }
      });
    }

    public set(name, data, expiry=sails.config.cache.cacheExpiry) {
      // update local cache then persist to DB...
      sails.log.verbose(`Setting cache for entry: ${name}...`);
      this.cache.set(name, data, expiry);
      super.getObservable(CacheEntry.findOne({name: name}))
      .flatMap(dbData => {
        if (!_.isEmpty(dbData)) {
          sails.log.verbose(`Updating entry name: ${name}`)
          return super.getObservable(CacheEntry.update({name: name}, {name: name, data:data, ts_added: moment().unix()}));
        } else {
          sails.log.verbose(`Creating entry name: ${name}`);
          return super.getObservable(CacheEntry.create({name: name, data:data, ts_added: moment().unix()}));
        }
      })
      .flatMap(dbData => {
        return Observable.of(dbData);
      })
      .subscribe(data => {
        sails.log.verbose(`Saved local and remote cache for entry:${name}`);
      }, error => {
        sails.log.error(`Error updating cache for entry ${name}:`);
        sails.log.error(error);
      });
    }


  }
}
module.exports = new Services.Cache().exports();
