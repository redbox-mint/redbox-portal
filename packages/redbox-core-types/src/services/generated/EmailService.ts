// This file is generated from internal/sails-ts/api/services/EmailService.ts. Do not edit directly.
import {
  Observable, from, of, throwError, firstValueFrom
} from 'rxjs';
import { Services as services } from '../../index';
import {
  Sails,
  Model
} from "sails";
import * as ejs from 'ejs';
import * as fs from 'graceful-fs';
import * as nodemailer from 'nodemailer';
import {isObservable} from "rxjs";

export interface EmailService {
  sendMessage(msgTo: any, msgBody: string, msgSubject?: string, msgFrom?: string, msgFormat?: string, cc?: string, bcc?: string, otherSendOptions?: { [dict_key: string]: any }): Observable<{ success: boolean, msg: string }>;
  buildFromTemplate(template: string, data?: any): Observable<any>;
  sendTemplate(to: any, subject: any, template: any, data: any): any;
  sendRecordNotification(oid: any, record: any, options: any, user: any, response: any): any;
  evaluateProperties(options: object, config?: object, templateData?: object): {
      format: string, formatRendered: string,
      from: string, fromRendered: string,
      to: string, toRendered: string,
      cc: string, ccRendered: string,
      bcc: string, bccRendered: string,
      subject: string, subjectRendered: string,
      template: any, templateRendered: any,
    };
  runTemplate(template: string, variables: any): any;
}
