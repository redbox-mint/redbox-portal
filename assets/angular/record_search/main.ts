import { platformBrowser }    from '@angular/platform-browser';
import { RecordSearchModuleNgFactory } from './record_search.module.ngfactory';
import { enableProdMode } from '@angular/core';
enableProdMode();
platformBrowser().bootstrapModuleFactory(RecordSearchModuleNgFactory);
