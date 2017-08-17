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

declare var jQuery: any;
/**
 * Convenience class to wrap JQuery calls ...
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export class LoadableComponent  {
  isLoading: boolean;
  translatorReady: boolean;
  translateI18Next: any;

  constructor() {
    this.isLoading = true;
    this.synchLoading();
  }

  initTranslator(translateI18Next: any) {
    this.translateI18Next = translateI18Next;
    this.translateI18Next.init({
        debug: true,                                                        // optional
        returnEmptyString: false,                                           // optional	- but.. it's important, please see http://i18next.com/docs/options/!
        // mapping: {"specific_backend_message": "message_for_translate"},     // optional
        // browserLanguageDetector: injectableCustomLanguageDetectorService,   // optional - the specific application language detector (allows you to return the language of the user.
        //                                                                     //            If it is absent, the service uses default "angular2 locale detector" behaviour using LOCALE_ID.
        // // supportedLanguages: ['en', 'pt'],                                //            Therefore you can pass the optional supportedLanguages parameter which indicates your supported languages.
        //                                                                     //            For example, LOCALE_ID = 'en-AU' or 'en-US' or 'en', you can pass only ['en'] -> locales/en/translation.json
        //                                                                     //                         LOCALE_ID = 'pt-BR' or 'pt', you can pass only ['pt'] -> locales/pt/translation.json
        // backend: injectableBackendConfigFactory                             // optional - allows to change "loadPath" i18next parameter
        lng: 'en',
        fallbackLang: 'en'
    }).then(() => {
      console.log(`Translator loaded...`);
      this.translatorLoaded();
    });
  }

  translatorLoaded() {
    this.translatorReady = true;
    this.checkIfHasLoaded();
  }

  public checkIfHasLoaded() {
    if (this.hasLoaded()) {
      this.setLoading(false);
    }
  }

  hasLoaded() {
    return this.isLoading && (this.translateI18Next ? this.translatorReady : true);
  }

  setLoading(loading: boolean=true) {
    this.isLoading = loading;
    this.synchLoading();
  }

  synchLoading() {
    if (this.isLoading) {
      jQuery("#loading").show();
    } else {
      jQuery("#loading").hide();
    }
  }

}
