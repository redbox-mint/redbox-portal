import { bootstrapPathRules } from '../identity/bootstrap';
import { getIdentityRepositories } from '../persistence/runtime';
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

import { Observable, defer, from, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import type { BrandingModel } from '../model/storage/BrandingModel';
import { RoleModel } from '../model/storage/RoleModel';
import {
  PathRules as OwnedPathRules,
  type PathRule as PathRuleModel,
  type RuleRole as RoleLike,
} from '../authorization/PathRules';

export namespace Services {
  /**
   * Enforces authorization rules on paths...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PathRules extends services.Core.Service {
    protected override _exportedMethods: string[] = ['bootstrap', 'getRulesFromPath', 'canRead', 'canWrite'];
    private readonly rules = new OwnedPathRules(async () =>
      getIdentityRepositories().list('pathrule', {}, { populate: ['role', 'branding'] })
    );

    public bootstrap = (_defUser: unknown, defRoles: RoleLike[]) => {
      return defer(() =>
        bootstrapPathRules({
          repository: getIdentityRepositories(),
          brandId: BrandingService.getDefault().id,
          rules: sails.config.auth.rules,
          readRules: () => firstValueFrom(this.loadRules()),
          roleId: name => RolesService.getRoleWithName(defRoles as RoleModel[], name)?.id,
        })
      ).pipe(flatMap(() => this.loadRules()));
    };

    /**
     * Loads and caches rules...
     */
    public loadRules = (): Observable<PathRuleModel[]> => from(this.rules.loadRules());

    public getRulesFromPath = (path: string, brand: BrandingModel): PathRuleModel[] | null =>
      this.rules.getRulesFromPath(path, brand);

    public canRead = (rules: PathRuleModel[], roles: RoleLike[], brandName: string): boolean =>
      this.rules.canRead(rules, roles, brandName);

    public canWrite = (rules: PathRuleModel[], roles: RoleLike[], brandName: string): boolean =>
      this.rules.canWrite(rules, roles, brandName);
  }
}

declare global {
  let PathRulesService: Services.PathRules;
}
