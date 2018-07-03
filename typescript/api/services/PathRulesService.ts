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
import services = require('../core/CoreService.js');
import {Sails, Model} from "sails";
import UrlPattern = require('url-pattern');

declare var sails: Sails;
declare var PathRule: Model;
declare var RolesService, BrandingService;
declare var _this;

export module Services {

  /**
   * Enforces authorization rules on paths...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PathRules extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'getRulesFromPath',
      'canRead',
      'canWrite'
    ]
    // compromising, will cache for speed...
    protected pathRules;
    protected rulePatterns;

    public bootstrap = (defUser, defRoles) => {
      sails.log.verbose("Bootstrapping path rules....");
      var defBrand = BrandingService.getDefault();
      return this.loadRules()
        .flatMap(rules => {
          if (!rules || rules.length == 0) {
            sails.log.verbose("Rules, don't exist, seeding...");
            var seedRules = sails.config.auth.rules;
            _.forEach(seedRules, (rule) => {
              var role = RolesService.getRoleWithName(defRoles, rule.role);
              rule.role = role.id;
              rule.branding = defBrand.id;
            });
            return Observable.from(seedRules)
                           .flatMap(rule => {
                             return super.getObservable(PathRule.create(rule));
                           })
                           .last()
                           .flatMap(rule => {
                             return this.loadRules();
                           })
                           .flatMap(rules => {
                             return Observable.of(rules);
                           });
          } else {
              sails.log.verbose("Rules exists.");
              return Observable.of(rules);
          }
        });
    }

    /**
    * Loads and caches rules...
    */
    public loadRules = () => {
      return super.getObservable(PathRule.find({}).populate('role').populate('branding'))
                  .flatMap(rules => {
                    this.pathRules = rules;
                    this.rulePatterns = [];
                    _.forEach(rules, (rule) => {
                      this.rulePatterns.push({pattern: new UrlPattern(rule.path), rule: rule});
                    });
                    return Observable.of(this.pathRules);
                  });
    }
    /**
    * Check path using cached rules...
    @return PathRule[]
    */
    public getRulesFromPath = (path, brand) => {
      var matchedRulePatterns =  _.filter(this.rulePatterns, (rulePattern) => {
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

    public canRead = (rules, roles, brandName) => {
      var matchRule = _.filter(rules, (rule) => {
        // user must have this role, and at least can_read
        var userRole = _.find(roles, (role) => {
          // match by id and branding
          return role.id == rule.role.id && rule.branding.name == brandName;
        });
        return userRole != undefined && (rule.can_read == true || rule.can_update == true);
      });
      return matchRule.length > 0;
    }

    public canWrite = (rules, roles, brandName) => {
      return _.filter(rules, (rule) => {
        var userRole = _.find(roles, (role) => {
          // match by id and branding
          return role.id == rule.role.id && rule.branding.name == brandName;
        });
        return userRole != undefined && (rule.can_update == true);
      }).length > 0;
    }

  }
}

module.exports = new Services.PathRules().exports();
