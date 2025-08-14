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
import { Http, Response, RequestOptions, Headers } from '@angular/http';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { BaseService } from '../shared/base-service'
import { ConfigService } from '../shared/config-service';
/**
 * User related service...
 *
 * @author <a target='_' href='https://github.com/thomcuddihy'>Thom Cuddihy</a>
 *
 */
@Injectable()
export class EmailNotificationService extends BaseService {
  protected baseUrl: any;
  protected config: any;
  protected headers: any;

  constructor (@Inject(Http) http: Http, @Inject(ConfigService) protected configService: ConfigService) {
    super(http, configService);
  }

  sendNotification(
    to: string,
    template: string,
    data: any = {},
    subject: string = null,
    from: string = null,
    format: string = null,
    cc: string = null,
    bcc: string = null
  ): Promise<any> {
    const payload = {to: to, template: template, data: data};
    if (subject) {
      payload['subject'] = subject;
    }
    if (from) {
      payload['from'] = from;
    }
    if (format) {
      payload['format'] = format;
    }
    if (cc) {
      payload['cc'] = cc;
    }
    if (bcc) {
      payload['bcc'] = bcc;
    }
    return this.http.post(`${this.brandingAndPortalUrl}/api/sendNotification`, payload, this.getOptionsClient())
      .toPromise()
      .then(this.extractData);
  }

}
