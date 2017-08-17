import { platformBrowser }    from '@angular/platform-browser';
import { AppModuleNgFactory } from './app.module.ngfactory';
import {enableProdMode} from '@angular/core';
console.log('Running Dashboard on AoT');
enableProdMode();
platformBrowser().bootstrapModuleFactory(AppModuleNgFactory);
