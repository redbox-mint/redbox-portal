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

import { Observable, from, of } from 'rxjs';
import { mergeMap as flatMap, last } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RoleModel } from '../model/storage/RoleModel';
import { default as UrlPattern } from 'url-pattern';


type PathRuleModel = {
  path?: string;
  role: { id: string };
  branding: { id?: string; name: string };
  can_read?: boolean;
  can_update?: boolean;
  custom?: unknown;
};

type PathRulePattern = {
  pattern: UrlPattern;
  rule: PathRuleModel;
};

type RoleLike = {
  id: string;
  name?: string;
  branding?: { name: string };
};

export namespace Services {

  /**
   * Enforces authorization rules on paths...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PathRules extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getRulesFromPath',
      'canRead',
      'canWrite'
    ]
    // compromising, will cache for speed...
    protected pathRules: PathRuleModel[] = [];
    protected rulePatterns: PathRulePattern[] = [];

    public bootstrap = (_defUser: unknown, defRoles: RoleLike[]) => {
      sails.log.verbose("Bootstrapping path rules....");
      const defBrand:BrandingModel = BrandingService.getDefault();
      return this.loadRules()
        .pipe(flatMap(rules => {
          if (!rules || rules.length == 0) {
            sails.log.verbose("Rules, don't exist, seeding...");
            const seedRules = sails.config.auth.rules as Array<{ role: string; branding?: string; path: string; can_read?: boolean; can_update?: boolean }>;
            _.forEach(seedRules, (rule) => {
              const role = RolesService.getRoleWithName(defRoles as unknown as RoleModel[], rule.role);
              rule.role = role?.id ?? '';
              rule.branding = defBrand.id;
            });
            return from(seedRules)
                           .pipe(flatMap((rule) => {
                             return super.getObservable<PathRuleModel>(PathRule.create(rule as unknown as PathRuleModel));
                           })
                           ,last()
                           ,flatMap(() => {
                             return this.loadRules();
                           })
                           ,flatMap((rules: PathRuleModel[]) => {
                             return of(rules);
                           }));
          } else {
              sails.log.verbose("Rules exists.");
              return this.repairLibrarianMetadataDefault(rules, defRoles, defBrand);
          }
        }));
    }

    /** Repair the legacy default once; leave customized authorization untouched. */
    private repairLibrarianMetadataDefault(rules: PathRuleModel[], roles: RoleLike[], brand: BrandingModel): Observable<PathRuleModel[]> {
      const metadataPath = '/:branding/:portal/recordmeta(/*)';
      const recordPath = '/:branding/:portal/record(/*)';
      const librarian = roles.find(role => role.name === 'Librarians');
      const researcher = roles.find(role => role.name === 'Researcher');
      if (!librarian || !researcher) return of(rules);
      const configured = (sails.config.auth.rules ?? []) as Array<{ path: string; role: string; can_read?: boolean; can_update?: boolean; custom?: unknown }>;
      const isLibrarian = (role: string) => role === 'Librarians' || role === librarian.id;
      const isResearcher = (role: string) => role === 'Researcher' || role === researcher.id;
      const configuredMetadata = configured.filter(rule => rule.path.toLowerCase().includes('recordmeta'));
      const configuredRecord = configured.filter(rule => rule.path === recordPath && isLibrarian(rule.role));
      // A disabled/removed grant or additional metadata restriction is an
      // operator policy choice, not a missing default to backfill.
      if (configuredMetadata.length !== 2 || !configuredMetadata.every(rule =>
        rule.path === metadataPath && rule.can_update === true && !rule.custom) ||
        configuredMetadata.filter(rule => isLibrarian(rule.role)).length !== 1 ||
        configuredMetadata.filter(rule => isResearcher(rule.role)).length !== 1 ||
        configuredRecord.length !== 1 || configuredRecord[0].can_update !== true || configuredRecord[0].custom ||
        configured.some(rule => isLibrarian(rule.role) && rule.can_read !== true && rule.can_update !== true)) return of(rules);
      const branded = rules.filter(rule => rule.branding?.id === brand.id);
      const metadata = branded.filter(rule => rule.path?.toLowerCase().includes('recordmeta'));
      const recordGrants = branded.filter(rule => rule.path === recordPath && rule.role?.id === librarian.id);
      if (metadata.length !== 1 || metadata[0].path !== metadataPath || metadata[0].role?.id !== researcher.id ||
        metadata[0].can_update !== true || metadata[0].custom || recordGrants.length !== 1 ||
        recordGrants[0].can_update !== true || recordGrants[0].custom ||
        branded.some(rule => rule.role?.id === librarian.id && rule.can_read !== true && rule.can_update !== true)) return of(rules);
      return super.getObservable(PathRule.create({ path: metadataPath, role: librarian.id, branding: brand.id,
        can_update: true } as unknown as PathRuleModel)).pipe(flatMap(() => this.loadRules()));
    }

    /**
    * Loads and caches rules...
    */
    public loadRules = (): Observable<PathRuleModel[]> => {
      return super.getObservable<PathRuleModel[]>(PathRule.find({}).populate('role').populate('branding'))
                  .pipe(flatMap((rules: PathRuleModel[]) => {
                    this.pathRules = rules;
                    this.rulePatterns = [];
                    _.forEach(rules, (rule: PathRuleModel) => {
                      this.rulePatterns.push({pattern: new UrlPattern(this.normalizePath(rule.path ?? '')), rule: rule});
                    });
                    return of(this.pathRules);
                  }));
    }
    /**
    * Check path using cached rules...
    @return PathRule[]
    */
    public getRulesFromPath = (path: string, brand: BrandingModel): PathRuleModel[] | null => {
      const normalizedPath = this.normalizePath(path);
      const matchedRulePatterns =  _.filter(this.rulePatterns, (rulePattern: PathRulePattern) => {
        const pattern = rulePattern.pattern;
        // matching by path and brand, meaning only brand-specific rules apply
        return pattern.match(normalizedPath) && rulePattern.rule.branding.id  == brand.id;
      });
      if (matchedRulePatterns && matchedRulePatterns.length > 0) {
        return _.map(matchedRulePatterns, 'rule');
      } else {
        return null;
      }
    }

    private normalizePath(path: string): string {
      // Sails dispatches routes without case sensitivity or a required trailing slash.
      // Apply the same normalization to stored rules and requests before matching.
      return (path.length > 1 ? path.replace(/\/$/, '') : path).toLowerCase();
    }

    public canRead = (rules: PathRuleModel[], roles: RoleLike[], brandName: string): boolean => {
      const matchRule = _.filter(rules, (rule: PathRuleModel) => {
        // user must have this role, and at least can_read
        const userRole = _.find(roles, (role: RoleLike) => {
          // match by id and branding
          return role.id == rule.role.id && rule.branding.name == brandName;
        });
        return userRole != undefined && (rule.can_read == true || rule.can_update == true);
      });
      return matchRule.length > 0;
    }

    public canWrite = (rules: PathRuleModel[], roles: RoleLike[], brandName: string): boolean => {
      return _.filter(rules, (rule: PathRuleModel) => {
        const userRole = _.find(roles, (role: RoleLike) => {
          // match by id and branding
          return role.id == rule.role.id && rule.branding.name == brandName;
        });
        return userRole != undefined && (rule.can_update == true);
      }).length > 0;
    }

  }
}

declare global {
  let PathRulesService: Services.PathRules;
}
