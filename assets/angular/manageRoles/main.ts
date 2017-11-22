import { platformBrowser }    from '@angular/platform-browser';
import { ManageRolesModuleNgFactory } from './manage_roles.module.ngfactory';
import {enableProdMode} from '@angular/core';
enableProdMode();
platformBrowser().bootstrapModuleFactory(ManageRolesModuleNgFactory);
