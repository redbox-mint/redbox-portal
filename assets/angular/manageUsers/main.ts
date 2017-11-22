import { platformBrowser }    from '@angular/platform-browser';
import { ManageUsersModuleNgFactory } from './manage_users.module.ngfactory';
import {enableProdMode} from '@angular/core';
enableProdMode();
platformBrowser().bootstrapModuleFactory(ManageUsersModuleNgFactory);
