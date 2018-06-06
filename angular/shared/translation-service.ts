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
import { TranslateI18Next } from 'ngx-i18next';
import { Subject } from 'rxjs/Subject';
import { ConfigService } from './config-service';
/**
 * Translation service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class TranslationService {
  protected subjects: any;
  protected translatorReady: boolean;
  protected config: any;

  constructor (protected translateI18Next: TranslateI18Next, protected configService: ConfigService) {
    this.subjects = {};
    this.initTranslator();
  }

  initTranslator() {
    this.subjects['init'] = new Subject();
    const ts = new Date().getTime();
    this.translateI18Next.init({
        debug: true,                                                        // optional
        returnNull: false,
        returnEmptyString: true,                                           // optional	- but.. it's important, please see http://i18next.com/docs/options/!
        // mapping: {"specific_backend_message": "message_for_translate"},     // optional
        // browserLanguageDetector: injectableCustomLanguageDetectorService,   // optional - the specific application language detector (allows you to return the language of the user.
        //                                                                     //            If it is absent, the service uses default "angular2 locale detector" behaviour using LOCALE_ID.
        // // supportedLanguages: ['en', 'pt'],                                //            Therefore you can pass the optional supportedLanguages parameter which indicates your supported languages.
        //                                                                     //            For example, LOCALE_ID = 'en-AU' or 'en-US' or 'en', you can pass only ['en'] -> locales/en/translation.json
        //                                                                     //                         LOCALE_ID = 'pt-BR' or 'pt', you can pass only ['pt'] -> locales/pt/translation.json
        // backend: injectableBackendConfigFactory                             // optional - allows to change "loadPath" i18next parameter
        lng: 'en',
        fallbackLng: 'en',
        backend: { loadPath: `/locales/{{lng}}/{{ns}}.json?ts=${ts}` }
    }).then(() => {
      console.log(`Translator loaded...`);
      this.translatorReady = true;
      this.translatorLoaded();
    });
  }

  translatorLoaded() {
    if (this.translatorReady) {
      this.subjects['init'].next(this);
    }
  }

  isReady(handler: any) {
    const subs = this.subjects['init'].subscribe(handler);
    this.translatorLoaded();
    return subs;
  }

  t(key: string) {
    return this.translateI18Next.translate(key);
  }
}
