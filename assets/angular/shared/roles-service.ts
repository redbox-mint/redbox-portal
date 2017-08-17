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

import { Injectable, Inject} from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { BaseService } from '../shared/base-service'
import { SaveResult, Role, User, LoginResult } from './user-models'
import { ConfigService } from './config-service';

/**
 * Role related service
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
@Injectable()
export class RolesService extends BaseService {

  constructor (@Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  getBrandRoles() :Promise<Role[]> {
    return this.http.get(`${this.brandingAndPortallUrl}/admin/roles`, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as Role[]);
  }

  updateUserRoles(userid: any, roleIds: any) {
    return this.http.post(`${this.brandingAndPortallUrl}/admin/roles/user`, {userid: userid, roles:roleIds}, this.options)
    .toPromise()
    .then((res:any) => this.extractData(res) as SaveResult[]);
  }
}
