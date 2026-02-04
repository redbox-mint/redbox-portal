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
import { default as UrlPattern } from 'url-pattern';

declare var sails: any;
declare var PathRule: any;
declare var _: any;

type PathRuleModel = {
  path: string;
  role: { id: string };
  branding: { id: string; name: string };
  can_read?: boolean;
  can_update?: boolean;
};

type PathRulePattern = {
  pattern: UrlPattern;
  rule: PathRuleModel;
};

export module Services {

  /**
   * Enforces authorization rules on paths...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PathRules extends services.Core.Service {

    protected override _exportedMethods: any = [
      'bootstrap',
      'getRulesFromPath',
      'canRead',
      'canWrite'
    ]
    // compromising, will cache for speed...
    protected pathRules: PathRuleModel[] = [];
    protected rulePatterns: PathRulePattern[] = [];

    public bootstrap = (_defUser: unknown, defRoles: any[]) => {
      sails.log.verbose("Bootstrapping path rules....");
      var defBrand:BrandingModel = BrandingService.getDefault();
      return this.loadRules()
        .pipe(flatMap(rules => {
          if (!rules || rules.length == 0) {
            sails.log.verbose("Rules, don't exist, seeding...");
            var seedRules = sails.config.auth.rules;
            _.forEach(seedRules, (rule: any) => {
              var role = RolesService.getRoleWithName(defRoles, rule.role);
              rule.role = role.id;
              rule.branding = defBrand.id;
            });
            return from(seedRules)
                           .pipe(flatMap((rule: any) => {
                             return super.getObservable(PathRule.create(rule));
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
              return of(rules);
          }
        }));
    }

    /**
    * Loads and caches rules...
    */
    public loadRules = (): Observable<PathRuleModel[]> => {
      return super.getObservable(PathRule.find({}).populate('role').populate('branding'))
                  .pipe(flatMap((rules: PathRuleModel[]) => {
                    this.pathRules = rules;
                    this.rulePatterns = [];
                    _.forEach(rules, (rule: PathRuleModel) => {
                      this.rulePatterns.push({pattern: new UrlPattern(rule.path), rule: rule});
                    });
                    return of(this.pathRules);
                  }));
    }
    /**
    * Check path using cached rules...
    @return PathRule[]
    */
    public getRulesFromPath = (path: string, brand: any): any[] | null => {
      var matchedRulePatterns =  _.filter(this.rulePatterns, (rulePattern: PathRulePattern) => {
        var pattern = rulePattern.pattern;
        // matching by path and brand, meaning only brand-specific rules apply
        return pattern.match(path) && rulePattern.rule.branding.id  == brand.id;
      });
      if (matchedRulePatterns && matchedRulePatterns.length > 0) {
        return _.map(matchedRulePatterns, 'rule');
      } else {
        return null;
      }
    }

    public canRead = (rules: any[], roles: any[], brandName: string): boolean => {
      var matchRule = _.filter(rules, (rule: any) => {
        // user must have this role, and at least can_read
        var userRole = _.find(roles, (role: any) => {
          // match by id and branding
          return role.id == rule.role.id && rule.branding.name == brandName;
        });
        return userRole != undefined && (rule.can_read == true || rule.can_update == true);
      });
      return matchRule.length > 0;
    }

    public canWrite = (rules: any[], roles: any[], brandName: string): boolean => {
      return _.filter(rules, (rule: any) => {
        var userRole = _.find(roles, (role: any) => {
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
