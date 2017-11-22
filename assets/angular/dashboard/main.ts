import { platformBrowser }    from '@angular/platform-browser';
import { DashboardModuleNgFactory } from './dashboard.module.ngfactory';
import { enableProdMode } from '@angular/core';
console.log('Running Dashboard on AoT');
enableProdMode();
platformBrowser().bootstrapModuleFactory(DashboardModuleNgFactory);
