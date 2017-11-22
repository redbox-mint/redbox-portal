import { platformBrowser }    from '@angular/platform-browser';
import { UserProfileModuleNgFactory } from './user_profile.module.ngfactory';
import {enableProdMode} from '@angular/core';
enableProdMode();
platformBrowser().bootstrapModuleFactory(UserProfileModuleNgFactory);
