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

import { zip, of } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';

declare var sails: any;
declare var WorkspaceType: any;
declare var _: any;

type BrandingLike = { id: string };
type WorkspaceTypeConfig = {
  name: string;
  label: string;
  subtitle?: string;
  description?: string;
  logo?: string;
  externallyProvisioned?: boolean;
};

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
   *
   */
  export class WorkspaceTypes extends services.Core.Service {

    protected override _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getOne'
    ];

    public bootstrap = (defBrand: BrandingLike) => {
      return super.getObservable(WorkspaceType.destroy({ branding: defBrand.id })).pipe(flatMap(() => {
        const obsArr: any[] = [];
        sails.log.debug('WorkspaceTypes::Bootstrap');
        sails.log.debug(sails.config.workspacetype);
        let workspaceTypes: string[] = [];
        if (!_.isEmpty(sails.config.workspacetype)) {
          sails.log.verbose("Bootstrapping workspace type definitions... ");
          _.forOwn(sails.config.workspacetype, (config: WorkspaceTypeConfig, workspaceType: string) => {
            workspaceTypes.push(workspaceType);
            var obs = this.create(defBrand, config);
            obsArr.push(obs);
          });
        }
        // check if we have services to bootstrap...
        if (!_.isEmpty(sails.config.workspacetype_services) && _.isArray(sails.config.workspacetype_services)) {
          _.each(sails.config.workspacetype_services, (wservice: string) => {
            obsArr.push(sails.services[wservice]['bootstrap']());
          });
        }
        if (_.isEmpty(obsArr)) {
          sails.log.verbose("Default or no workspaceTypes definition(s).");
        } else {
          return zip(...obsArr);
        }
        return of(obsArr);
      }));
    }

    public create(brand: BrandingLike, workspaceType: WorkspaceTypeConfig) {
      return super.getObservable(
        WorkspaceType.create({
          name: workspaceType['name'],
          label: workspaceType['label'],
          branding: brand.id,
          subtitle: workspaceType['subtitle'],
          description: workspaceType['description'],
          logo: workspaceType['logo'],
          externallyProvisioned: workspaceType['externallyProvisioned']
        })
      )
    }

    public get(brand: BrandingLike) {
      return super.getObservable(WorkspaceType.find({ branding: brand.id }));
    }

    public getOne(brand: BrandingLike, name: string) {
      return super.getObservable(WorkspaceType.findOne({ branding: brand.id, name: name }));
    }
  }
}

declare global {
  let WorkspaceTypesService: Services.WorkspaceTypes;
}
