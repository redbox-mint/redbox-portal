import { platformBrowser }    from '@angular/platform-browser';
import { ReportModuleNgFactory } from './report.module.ngfactory';
import {enableProdMode} from '@angular/core';
console.log('Running Dashboard on AoT');
enableProdMode();
platformBrowser().bootstrapModuleFactory(ReportModuleNgFactory);
