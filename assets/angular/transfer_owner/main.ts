import { platformBrowser }    from '@angular/platform-browser';
import { TransferOwnerModuleNgFactory } from './transfer_owner.module.ngfactory';
import {enableProdMode} from '@angular/core';
enableProdMode();
platformBrowser().bootstrapModuleFactory(TransferOwnerModuleNgFactory);
