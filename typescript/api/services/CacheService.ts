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
import {Services as services}   from '@researchdatabox/redbox-core-types';
import {Sails, Model} from "sails";
import * as NodeCache from "node-cache";
import moment = require('moment');
import { readdir } from 'node:fs/promises';
declare var sails: Sails;
declare var _;
declare var CacheEntry: Model;

export module Services {
  /**
   * Cache related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Cache extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'get',
      'set',
      'getNgAppFileHash'
    ];

    protected cache;
    protected ngFileAppHash;

    public async bootstrap() {
      const cacheOpts = {stdTTL: sails.config.custom_cache.cacheExpiry, checkperiod: sails.config.custom_cache.checkPeriod ? sails.config.custom_cache.checkPeriod : 600};
      sails.log.verbose(`Using node cache options: `);
      sails.log.verbose(cacheOpts);
      this.cache = new NodeCache(cacheOpts);
      await this.buildNgAppFileHash();
    }

    public get(name): Observable<any> {
      const cacheGet = Observable.of(this.cache.get(name));
      return cacheGet.flatMap(data => {
        if (data) {
          return Observable.of(data);
        } else {
          sails.log.verbose(`Getting DB cache entry for name: ${name}`);
          return super.getObservable(CacheEntry.findOne({name: name})).flatMap(dbData => {
            if (!_.isEmpty(dbData)) {
              sails.log.verbose(`Got DB cache entry`);
              // check if entry is expired...
              if (moment().unix() - dbData.ts_added > sails.config.custom_cache.cacheExpiry) {
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

    public set(name, data, expiry=sails.config.custom_cache.cacheExpiry) {
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

    public async buildNgAppFileHash() {
      this.ngFileAppHash = {};
      if (_.isEmpty(sails.config.angularDev) || sails.config.angularDev == 'false') {
        const ngRootPath = `${sails.config.appPath}/assets/angular/`;
        const ngAppDirs = await readdir(ngRootPath);
        const targetFilesPrefix = ['runtime', 'polyfills', 'main', 'styles'];
        for (const appName of ngAppDirs) {
          let ngPath = `${sails.config.appPath}/assets/angular/${appName}`;
          const ngFiles = await readdir(ngPath);
          for (const fileNamePrefix of targetFilesPrefix) {
            const fileName = _.find(ngFiles, (file) => { return _.startsWith(file, fileNamePrefix) });
            const nameParts = _.split(fileName, '.');
            let appHash = '';
            if (nameParts && nameParts.length == 3) {
              appHash = nameParts[1];
            }   
            _.set(this.ngFileAppHash, `${appName}.${fileNamePrefix}`, appHash);
          }
        }
      }
      sails.log.verbose(JSON.stringify(this.ngFileAppHash));
    }

    public getNgAppFileHash(appName: string, fileNamePrefix: string, namePrefix: string = '', nameSuffix: string = '', insertEvenOnEmpty:boolean = false): string {
      let appHash = _.get(this.ngFileAppHash, `${appName}.${fileNamePrefix}`);
      if (!_.isEmpty(appHash) || insertEvenOnEmpty) {
        appHash = `${namePrefix}${appHash}${nameSuffix}`;
      }
      return appHash;
    }

  }
}
module.exports = new Services.Cache().exports();
