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

import { Observable, firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';


export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RecordTypes extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'create',
      'get',
      'getAll',
      'getAllCache'
    ];

    protected recordTypes!:RecordTypeModel[];

    public async bootstrap (defBrand:BrandingModel):Promise<RecordTypeModel[]> {
      let recordTypes:RecordTypeModel[] = await RecordType.find({branding:defBrand.id}) as unknown as RecordTypeModel[];
      if (sails.config.appmode.bootstrapAlways) {
        await RecordType.destroy({branding:defBrand.id});
        recordTypes  = [];
      }
        if (_.isUndefined(recordTypes)) {
          recordTypes = [];
        }
        sails.log.debug(`RecordTypes found: ${recordTypes} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
        if (_.isEmpty(recordTypes)) {
          // var rTypesObs = [];
          sails.log.verbose("Bootstrapping record type definitions... ");
          // _.forOwn(sails.config.recordtype, (config, recordType) => {
          //   recordTypes.push(recordType);
          //   var obs = this.create(defBrand, recordType, config);
          //   rTypesObs.push(obs);
          // });

          this.recordTypes= recordTypes;
          const rTypes = [];
          for(const recordType in sails.config.recordtype) {
            const config:RecordTypeModel = sails.config.recordtype[recordType] as unknown as RecordTypeModel;
            rTypes.push(await firstValueFrom(this.create(defBrand, recordType, config)))
          }    
          return rTypes;
        } 
          sails.log.verbose("Default recordTypes definition(s) exist.");
          sails.log.verbose(JSON.stringify(recordTypes));
          this.recordTypes = recordTypes;
          return recordTypes;
    }

    public create(brand:BrandingModel, name:string, config: RecordTypeModel & { dashboard?: unknown }):Observable<RecordTypeModel> {
    
      return super.getObservable(RecordType.create({
        name: name,
        branding: brand.id,
        packageType: config.packageType,
        searchCore: config.searchCore,
        searchFilters: config.searchFilters,
        hooks: config.hooks,
        transferResponsibility: config.transferResponsibility,
        relatedTo: config.relatedTo,
        searchable: config.searchable,
        dashboard: config.dashboard
      }));
    }

    public get(brand:BrandingModel, name:string, fields: string[] | null = null): Observable<RecordTypeModel> {
      const criteria: { where: { branding: string; name: string }; select?: string[] } = {where: {branding: brand.id, name: name}};
      if (fields) {
        criteria.select = fields;
      }
      return super.getObservable(RecordType.findOne(criteria));
    }

    public getAll(brand:BrandingModel, fields: string[] | null = null): Observable<RecordTypeModel[]> {
      const criteria: { where: { branding: string }; select?: string[] } = {where: {branding: brand.id}};
      if (fields) {
        criteria.select = fields;
      }
      return super.getObservable(RecordType.find(criteria));
    }

    public getAllCache(): RecordTypeModel[] {
      return this.recordTypes;
        }
  }
}

declare global {
  let RecordTypesService: Services.RecordTypes;
}
