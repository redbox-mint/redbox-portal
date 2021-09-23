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

import {
  Observable
} from 'rxjs/Rx';
import {SearchService, Services as services}   from '@researchdatabox/redbox-core-types';

import {
  Sails,
  Model
} from "sails";
import * as request from "request-promise";
import * as crypto from 'crypto';

declare var sails: Sails;
declare var User, Role, UserAudit: Model;
declare var BrandingService, RolesService, ConfigService, RecordsService;
declare const Buffer;
declare var _;

export module Services {
  /**
   * Use services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Users extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'updateUserRoles',
      'updateUserDetails',
      'getUserWithId',
      'getUserWithUsername',
      'addLocalUser',
      'setUserKey',
      'hasRole',
      'findUsersWithName',
      'findUsersWithEmail',
      'findUsersWithQuery',
      'findAndAssignAccessToRecords',
      'getUsers',
      'addUserAuditEvent'
    ];

    searchService: SearchService;

    protected localAuthInit = () => {
      // users the default brand's configuration on startup
      // TODO: consider moving late initializing this if possible
      const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var usernameField = defAuthConfig.local.usernameField,
        passwordField = defAuthConfig.local.passwordField;
      //
      // --------- Passport --------------
      //
      sails.config.passport = require('passport')
      var LocalStrategy = require('passport-local').Strategy;
      var bcrypt;
      try {
        bcrypt = require('bcrypt');
      } catch (err) {
        bcrypt = require('bcryptjs');
      }
      sails.config.passport.serializeUser(function (user, done) {
        done(null, user.id);
      });
      sails.config.passport.deserializeUser(function (id, done) {
        User.findOne({
          id: id
        }).populate('roles').exec(function (err, user) {
          done(err, user);
        });
      });
      //
      //  Local Strategy
      //
      sails.config.passport.use(new LocalStrategy({
          usernameField: usernameField,
          passwordField: passwordField
        },
        function (username, password, done) {

          User.findOne({
            username: username
          }).populate('roles').exec(function (err, foundUser) {
            if (err) {
              return done(err);
            }
            if (!foundUser) {
              return done(null, false, {
                message: 'Incorrect username/password'
              });
            }

            bcrypt.compare(password, foundUser.password, function (err, res) {

              if (!res) {
                return done(null, false, {
                  message: 'Incorrect username/password'
                });
              }

              foundUser.lastLogin = new Date();

              User.update({
                username: foundUser.username
              }, {
                lastLogin: foundUser.lastLogin
              });

              return done(null, foundUser, {
                message: 'Logged In Successfully'
              });


            });
          });
        }
      ));
    }

    protected aafAuthInit = () => {
      // users the default brand's configuration on startup
      // TODO: consider moving late initializing this if possible
      const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      //
      // JWT/AAF Strategy
      //
      var JwtStrategy = require('passport-jwt').Strategy,
        ExtractJwt = require('passport-jwt').ExtractJwt;
      const aafOpts = defAuthConfig.aaf.opts;
      aafOpts.jwtFromRequest = ExtractJwt.fromBodyField('assertion');
      sails.config.passport.use('aaf-jwt', new JwtStrategy(aafOpts, function (req, jwt_payload, done) {
        var brand = BrandingService.getBrand(req.session.branding);
        const authConfig = ConfigService.getBrand(brand.name, 'auth');
        var aafAttributes = authConfig.aaf.attributesField;
        var aafDefRoles = _.map(RolesService.getNestedRoles(RolesService.getDefAuthenticatedRole(brand).name, brand.roles), 'id');
        var aafUsernameField = authConfig.aaf.usernameField;
        const userName = Buffer.from(jwt_payload[aafUsernameField]).toString('base64');
        User.findOne({
          username: userName
        }, function (err, user) {
          sails.log.verbose("At AAF Strategy verify, payload:");
          sails.log.verbose(jwt_payload);
          sails.log.verbose("User:");
          sails.log.verbose(user);
          sails.log.verbose("Error:");
          sails.log.verbose(err);
          if (err) {
            return done(err, false);
          }
          if (user) {
            user.lastLogin = new Date();
            user.name = jwt_payload[aafAttributes].cn;
            user.email = jwt_payload[aafAttributes].mail.toLowerCase();
            user.displayname = jwt_payload[aafAttributes].displayname;
            user.cn = jwt_payload[aafAttributes].cn;
            user.edupersonscopedaffiliation = jwt_payload[aafAttributes].edupersonscopedaffiliation;
            user.edupersontargetedid = jwt_payload[aafAttributes].edupersontargetedid;
            user.edupersonprincipalname = jwt_payload[aafAttributes].edupersonprincipalname;
            user.givenname = jwt_payload[aafAttributes].givenname;
            user.surname = jwt_payload[aafAttributes].surname;

            User.update(user).exec(function (err, user) {});
            return done(null, user);
          } else {
            sails.log.verbose("At AAF Strategy verify, creating new user...");
            // first time login, create with default role
            var userToCreate = {
              username: userName,
              name: jwt_payload[aafAttributes].cn,
              email: jwt_payload[aafAttributes].mail.toLowerCase(),
              displayname: jwt_payload[aafAttributes].displayname,
              cn: jwt_payload[aafAttributes].cn,
              edupersonscopedaffiliation: jwt_payload[aafAttributes].edupersonscopedaffiliation,
              edupersontargetedid: jwt_payload[aafAttributes].edupersontargetedid,
              edupersonprincipalname: jwt_payload[aafAttributes].edupersonprincipalname,
              givenname: jwt_payload[aafAttributes].givenname,
              surname: jwt_payload[aafAttributes].surname,
              type: 'aaf',
              roles: aafDefRoles,
              lastLogin: new Date()
            };
            sails.log.verbose(userToCreate);
            User.create(userToCreate).exec(function (err, newUser) {
              if (err) {
                sails.log.error("Error creating new user:");
                sails.log.error(err);
                return done(err, false);
              }

              sails.log.verbose("Done, returning new user:");
              sails.log.verbose(newUser);
              return done(null, newUser);
            });
          }
        });
      }));
    }

    protected openIdConnectAuth = () => {
      sails.on('ready', async () => {
        const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
        sails.log.verbose(`OIDC, checking if within active array: ${defAuthConfig.active}`);
        if (defAuthConfig.active != undefined && defAuthConfig.active.indexOf('oidc') != -1) {
          const that = this;
          sails.log.verbose(`OIDC is active, configuring....`);
          let oidcConfigArray = defAuthConfig.oidc;
          if (_.isObject(oidcConfigArray)) {
            let singleOidcConfig = oidcConfigArray;
            oidcConfigArray = [singleOidcConfig];
          }
          for (let oidcConfig of oidcConfigArray) {
            const oidcOpts = oidcConfig.opts;
            const {
              Issuer,
              Strategy,
              custom
            } = require('openid-client');
            let configured = false;
            let discoverAttemptsCtr = 0;
            while (!configured && discoverAttemptsCtr < oidcConfig.discoverAttemptsMax) {
              discoverAttemptsCtr++;
              try {
                let issuer;
                if (_.isString(oidcOpts.issuer)) {
                  sails.log.verbose(`OIDC, using issuer URL for discovery: ${oidcOpts.issuer}`);
                  issuer = await Issuer.discover(oidcOpts.issuer);
                } else {
                  sails.log.verbose(`OIDC, using issuer hardcoded configuration:`);
                  sails.log.verbose(JSON.stringify(oidcOpts.issuer));
                  issuer = new Issuer(oidcOpts.issuer);
                }
                configured = true;
                sails.log.verbose(`OIDC, Got issuer config, after ${discoverAttemptsCtr} attempt(s).`);
                sails.log.verbose(issuer);
                const oidcClient = new issuer.Client(oidcOpts.client);
                let verifyCallbackFn = (req, tokenSet, userinfo, done) => {
                  that.openIdConnectAuthVerifyCallback(oidcConfig, issuer, req, tokenSet, userinfo, done);
                };
                if (oidcConfig.userInfoSource == 'tokenset_claims') {
                  verifyCallbackFn = (req, tokenSet, done) => {
                    that.openIdConnectAuthVerifyCallback(oidcConfig, issuer, req, tokenSet, undefined, done);
                  };
                }
                let passportIdentifier = 'oidc';
                if(!_.isEmpty(oidcConfig.identifier)) {
                  passportIdentifier = `oidc-${oidcConfig.identifier}`
                }
                
                sails.config.passport.use(passportIdentifier, new Strategy({
                  client: oidcClient,
                  passReqToCallback: true,
                  params: oidcOpts.params
                }, verifyCallbackFn));
                sails.log.info(`OIDC is active, client ${passportIdentifier} configured and ready.`);
              
                
              } catch (e) {
                sails.log.error(`Failed to discover, attempt# ${discoverAttemptsCtr}:`);
                sails.log.error(e);
                await this.sleep(oidcConfig.discoverFailureSleep);
              }
            }
          }
        }
      });
    }

    protected openIdConnectAuthVerifyCallback(oidcConfig, issuer, req, tokenSet, userinfo = undefined, done) {
      const that = this;
      req.session.logoutUrl = issuer.end_session_endpoint;
      sails.log.verbose(`OIDC login success, tokenset: `);
      sails.log.verbose(JSON.stringify(tokenSet));
      sails.log.verbose(`Claims:`);
      sails.log.verbose(JSON.stringify(tokenSet.claims()));
      if (!_.isUndefined(userinfo)) {
        sails.log.verbose(`Userinfo:`);
        sails.log.verbose(JSON.stringify(userinfo));
      } else {
        userinfo = tokenSet.claims();
      }
      if (oidcConfig.debugMode === true) {
        sails.log.info("OIDC debug mode is active, intentionally failing the login, and redirecting to failure page with all details of this login attempt.");
        const err = {
          userinfo: userinfo,
          claims: tokenSet.claims(),
          tokenSet: tokenSet
        };
        req.session.errorTextRaw = JSON.stringify(err, null, 2);
        return done(null, false);
      }
      var brand = BrandingService.getBrand(req.session.branding);
      var claimsMappings = oidcConfig.claimMappings;
      const userName = _.get(userinfo, claimsMappings['username']);
      var openIdConnectDefRoles = _.map(RolesService.getNestedRoles(RolesService.getDefAuthenticatedRole(brand).name, brand.roles), 'id');

      User.findOne({
        username: userName
      }, function (err, user) {
        sails.log.verbose("At OIDC Strategy verify, payload:");
        sails.log.verbose(userinfo);
        sails.log.verbose("User:");
        sails.log.verbose(user);
        sails.log.verbose("Error:");
        sails.log.verbose(err);
        if (err) {
          return done(err, false);
        }
        if (user) {
          user.lastLogin = new Date();
          user.additionalAttributes = that.mapAdditionalAttributes(userinfo, claimsMappings['additionalAttributes']);
          user.name = _.get(userinfo, claimsMappings['name']);
          user.email = _.get(userinfo, claimsMappings['email']).toLowerCase();
          user.displayname = _.get(userinfo, claimsMappings['displayName']);
          user.cn = _.get(userinfo, claimsMappings['cn']);
          user.givenname = _.get(userinfo, claimsMappings['givenname']);
          user.surname = _.get(userinfo, claimsMappings['surname']);

          User.update(user).exec(function (err, user) {});
          return done(null, user);
        } else {
          sails.log.verbose("At OIDC Strategy verify, creating new user...");
          let additionalAttributes = that.mapAdditionalAttributes(userinfo, claimsMappings['additionalAttributes']);
          // first time login, create with default role
          var userToCreate = {
            username: userName,
            name: _.get(userinfo, claimsMappings['name']),
            email: _.get(userinfo, claimsMappings['email']).toLowerCase(),
            displayname: _.get(userinfo, claimsMappings['displayName']),
            cn: _.get(userinfo, claimsMappings['cn']),
            givenname: _.get(userinfo, claimsMappings['givenname']),
            surname: _.get(userinfo, claimsMappings['surname']),
            type: 'oidc',
            roles: openIdConnectDefRoles,
            additionalAttributes: additionalAttributes,
            lastLogin: new Date()
          };
          sails.log.verbose(`Creating user: `);
          sails.log.verbose(userToCreate);
          User.create(userToCreate).exec(function (err, newUser) {
            if (err) {
              sails.log.error("Error creating new user:");
              sails.log.error(err);
              return done(err, false);
            }

            sails.log.verbose("Done, returning new user:");
            sails.log.verbose(newUser);
            return done(null, newUser);
          });
        }
      });
    }



    protected bearerTokenAuthInit = () => {
      var BearerStrategy = require('passport-http-bearer').Strategy;
      sails.config.passport.use('bearer', new BearerStrategy(
        function (token, done) {
          if (!_.isEmpty(token) && !_.isUndefined(token)) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('base64');
            User.findOne({
              token: tokenHash
            }).populate('roles').exec(function (err, user) {
              if (err) {
                return done(err);
              }
              if (!user) {

                return done(null, false);
              }
              return done(null, user, {
                scope: 'all'
              });
            });
          } else {
            // empty token, deny
            return done(null, false);
          }
        }
      ));
    }

    protected initDefAdmin = (defRoles, defAdminRole) => {
      const authConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var usernameField = authConfig.local.usernameField,
        passwordField = authConfig.local.passwordField;
      var defaultUser = _.find(defAdminRole.users, (o) => {
        return o[usernameField] == authConfig.local.default.adminUser
      });

      if (defaultUser == null) {
        defaultUser = {
          type: 'local',
          name: 'Local Admin'
        };
        defaultUser[usernameField] = authConfig.local.default.adminUser;
        defaultUser[passwordField] = authConfig.local.default.adminPw;
        defaultUser["email"] = authConfig.local.default.email;
        if (authConfig.local.default.token) {
          defaultUser["token"] = crypto.createHash('sha256').update(authConfig.local.default.token).digest('base64');
        }
        sails.log.verbose("Default user missing, creating...");
        return super.getObservable(User.create(defaultUser))
          .flatMap(defUser => {
            // START Sails 1.0 upgrade
            const defRoleIds = _.map(defRoles, (o) => {
              return o.id;
            });
            let q = User.addToCollection(defUser.id, 'roles').members(defRoleIds);
            // END Sails 1.0 upgrade
            return super.getObservable(q, 'exec', 'simplecb')
              .flatMap(dUser => {
                return Observable.from(defRoles)
                  .map(roleObserved => {
                    let role: any = roleObserved;
                    // START Sails 1.0 upgrade
                    // role.users.add(defUser.id)
                    q = Role.addToCollection(role.id, 'users').members([defUser.id]);
                    // END Sails 1.0 upgrade
                    return super.getObservable(q, 'exec', 'simplecb');
                  });
              })
              .last()
              .flatMap(lastRole => {
                return Observable.of({
                  defUser: defUser,
                  defRoles: defRoles
                });
              });
          });
      } else {
        return Observable.of({
          defUser: defaultUser,
          defRoles: defRoles
        });
      }
    }

    protected mapAdditionalAttributes(profile, attributeMappings) {
      let additionalAttributes = {};
      for (let attributeMapping in attributeMappings) {
        additionalAttributes[attributeMapping] = _.get(profile, attributeMapping);
      }
      return additionalAttributes;
    }

    /**
     * Creates a user audit record
     *
     */
    public addUserAuditEvent = (user, action, additionalContext) => {
      let auditEvent = {}
      if (!_.isEmpty(user.password)) {
        delete user.password;
      }
      auditEvent['user'] = user;
      auditEvent['action'] = action;
      auditEvent['additionalContext'] = additionalContext;
      sails.log.verbose('Adding user audit event');
      sails.log.verbose(auditEvent);
      return super.getObservable(UserAudit.create(auditEvent)).toPromise();
    }

    /**
     * @return User: the newly created user
     *
     */
    public addLocalUser = (username, name, email, password) => {
      const authConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var usernameField = authConfig.local.usernameField,
        passwordField = authConfig.local.passwordField;

      return this.getUserWithUsername(username).flatMap(user => {
        if (user) {
          return Observable.throw(new Error(`Username already exists`));
        } else {
          return this.findUsersWithEmail(email, null, null).flatMap(emailCheck => {
            if (_.size(emailCheck) > 0) {
              return Observable.throw(new Error(`Email already exists, it must be unique`));
            } else {
              var newUser = {
                type: 'local',
                name: name
              };
              if (!_.isEmpty(email)) {
                newUser["email"] = email;
              }
              newUser[usernameField] = username;
              newUser[passwordField] = password;
              return super.getObservable(User.create(newUser));
            }
          });
        }
      });

    }

    private getSearchService() {
      return sails.services[sails.config.search.serviceName];
    }

    /**
    @return Object {
          defUser: the default admin user
          defRoles: the default brand's roles
        }
    */
    public bootstrap = (defRoles) => {
      let that = this;
      const defAuthConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      sails.log.verbose("Bootstrapping users....");

      var usernameField = defAuthConfig.local.usernameField,
        passwordField = defAuthConfig.local.passwordField;
      var defAdminRole = RolesService.getAdminFromRoles(defRoles);
      return Observable.of(defAdminRole)
        .flatMap(defAdminRole => {
          this.localAuthInit();
          this.aafAuthInit();
          this.openIdConnectAuth();
          this.bearerTokenAuthInit();
          return this.initDefAdmin(defRoles, defAdminRole);
        });
    }

    public getUserWithUsername = (username) => {
      return this.getObservable(User.findOne({
        username: username
      }).populate('roles'));
    }

    public getUserWithId = (userid) => {
      return this.getObservable(User.findOne({
        id: userid
      }).populate('roles'));
    }

    /**
     * @return Collection of all users (local and AAF)
     */
    public getUsers = (): Observable < any > => {
      return super.getObservable(User.find({}).populate('roles'));
    }

    public setUserKey = (userid, uuid) => {
      const uuidHash = _.isEmpty(uuid) ? uuid : crypto.createHash('sha256').update(uuid).digest('base64');
      return this.getUserWithId(userid).flatMap(user => {
        if (user) {
          const q = User.update({
            id: userid
          }, {
            token: uuidHash
          });
          return this.getObservable(q, 'exec', 'simplecb');
        } else {
          return Observable.throw(new Error('No such user with id:' + userid));
        }
      });
    }

    public updateUserDetails = (userid, name, email, password) => {
      const authConfig = ConfigService.getBrand(BrandingService.getDefault().name, 'auth');
      var passwordField = authConfig.local.passwordField;
      return this.getUserWithId(userid).flatMap(user => {
        if (user) {
          const update = {
            name: name
          };

          if (!_.isEmpty(email)) {
            update["email"] = email;
          }

          if (!_.isEmpty(password)) {
            var bcrypt;
            try {
              bcrypt = require('bcrypt');
            } catch (err) {
              bcrypt = require('bcryptjs');
            }
            var salt = salt = bcrypt.genSaltSync(10);
            update[passwordField] = bcrypt.hashSync(password, salt);
          }
          const q = User.update({
            id: userid
          }, update);
          return this.getObservable(q, 'exec', 'simplecb');
        } else {
          return Observable.throw(new Error('No such user with id:' + userid));
        }
      });
    }

    public updateUserRoles = (userid, newRoleIds) => {
      return this.getUserWithId(userid).flatMap(user => {
        if (user) {
          if (_.isEmpty(newRoleIds) || newRoleIds.length == 0) {
            return Observable.throw(new Error('Please assign at least one role'));
          }
          // START Sails 1.0 upgrade
          const q = User.replaceCollection(user.id, 'roles').members(newRoleIds);
          // END Sails 1.0 upgrade
          return this.getObservable(q, 'exec', 'simplecb');
        } else {
          return Observable.throw(new Error('No such user with id:' + userid));
        }
      });
    }

    public hasRole(user, targetRole) {
      return _.find(user.roles, (role) => {
        return role.id == targetRole.id;
      });
    }

    public findUsersWithName(name: string, brandId: string, source: any = null) {
      const query = {
        name: {
          'contains': name
        }
      };
      // S2TEST-21
      return this.findUsersWithQuery(query, brandId, source);
    }
    // S2TEST-21
    public findUsersWithEmail(email: string, brandId: string, source: any) {
      const query = {
        email: {
          'contains': email
        }
      };
      return this.findUsersWithQuery(query, brandId, source);
    }
    // S2TEST-21
    public findUsersWithQuery(query: any, brandId: string, source: any = null) {
      if (!_.isEmpty(source) && !_.isUndefined(source) && !_.isNull(source)) {
        query['type'] = source;
      }
      return this.getObservable(User.find(query).populate('roles'))
        .flatMap(users => {
          if (brandId) {
            _.remove(users, (user) => {
              const isInBrand = _.find(user.roles, (role) => {
                return role.branding == brandId;
              });
              return !isInBrand;
            });
          }
          return Observable.of(users);
        });
    }

    /**
     *
     * Find all records that the user is intended to have access to and assign actual access using their userId.
     * This is used as users or services may want to provide access for a user to a record but due to single sign-on solutions,
     * we're not able to reliably determine the username before they login to the system for the first time.
     *
     **/
    public findAndAssignAccessToRecords(pendingValue, userid) {
      var oid = null;
      const query = `authorization_editPending:${pendingValue}%20OR%20authorization_viewPending:${pendingValue}&sort=date_object_modified desc&version=2.2&wt=json&rows=10000`;
      this.getSearchService().searchAdvanced(query).then(results => {
        if (_.isEmpty(results) || _.isEmpty(results['response'])) {
          sails.log.verbose(`UsersService::findAndAssignAccessToRecords() -> No pending records: ${pendingValue}`);
          return;
        }
        sails.log.verbose(JSON.stringify(results));
        if (results["response"] != null) {
          var docs = results["response"]["docs"];
          for (var i = 0; i < docs.length; i++) {
            var doc = docs[i];
            var item = {};
            oid = doc["storage_id"];
            RecordsService.provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue);
          }
        }
      }).catch((error: any) => {
        // swallow !!!!
        sails.log.warn(`Failed to assign access to OID: ${oid}`);
        sails.log.warn(error);
      });
    }

  }
}

module.exports = new Services.Users().exports();