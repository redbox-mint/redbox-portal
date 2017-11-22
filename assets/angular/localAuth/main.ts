import { platformBrowser }    from '@angular/platform-browser';
import { LocalAuthModuleNgFactory } from './local_auth.module.ngfactory';
import {enableProdMode} from '@angular/core';
enableProdMode();
platformBrowser().bootstrapModuleFactory(LocalAuthModuleNgFactory);
