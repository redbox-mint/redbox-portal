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

import { zip, of, Observable } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import _ from 'lodash';
import { defer } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { ReferenceRepositories } from '../persistence/reference/ReferenceRepositories';

type BrandingLike = { id: string };
type WorkspaceTypeConfig = {
  name: string;
  label: string;
  subtitle?: string;
  description?: string;
  logo?: string;
  externallyProvisioned?: boolean;
};

export interface WorkspaceTypesInput {
  readonly references: Pick<ReferenceRepositories, 'workspaceTypes'>;
  readonly config: { workspacetype: Record<string, WorkspaceTypeConfig> };
  readonly log: ILogger;
  readonly bootstrapProviders: ReadonlyArray<() => Observable<unknown>>;
}

export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
   *
   */
  export class WorkspaceTypes {
    public constructor(protected readonly input: WorkspaceTypesInput) {}

    public bootstrap = (defBrand: BrandingLike) => {
      return defer(() => this.input.references.workspaceTypes.removeForBrand(defBrand.id)).pipe(
        flatMap(() => {
          const obsArr: Array<Observable<unknown>> = [];
          this.input.log.debug('WorkspaceTypes::Bootstrap');
          this.input.log.debug(this.input.config.workspacetype);
          const workspaceTypes: string[] = [];
          if (!_.isEmpty(this.input.config.workspacetype)) {
            this.input.log.verbose('Bootstrapping workspace type definitions... ');
            _.forOwn(this.input.config.workspacetype, (config: WorkspaceTypeConfig, workspaceType: string) => {
              workspaceTypes.push(workspaceType);
              const obs = this.create(defBrand, config);
              obsArr.push(obs);
            });
          }
          for (const bootstrap of this.input.bootstrapProviders) obsArr.push(bootstrap());
          if (_.isEmpty(obsArr)) {
            this.input.log.verbose('Default or no workspaceTypes definition(s).');
          } else {
            return zip(...obsArr);
          }
          return of(obsArr);
        })
      );
    };

    public create(brand: BrandingLike, workspaceType: WorkspaceTypeConfig): Observable<Record<string, unknown>> {
      return defer(() =>
        this.input.references.workspaceTypes.createDefinition({
          name: workspaceType['name'],
          label: workspaceType['label'],
          branding: brand.id,
          subtitle: workspaceType['subtitle'],
          description: workspaceType['description'],
          logo: workspaceType['logo'],
          externallyProvisioned: workspaceType['externallyProvisioned'],
        })
      );
    }

    public get(brand: BrandingLike): Observable<Record<string, unknown>[]> {
      return defer(() => this.input.references.workspaceTypes.listForBrand(brand.id));
    }

    public getOne(brand: BrandingLike, name: string): Observable<Record<string, unknown> | null> {
      return defer(() => this.input.references.workspaceTypes.findByName(brand.id, name));
    }
  }
}
