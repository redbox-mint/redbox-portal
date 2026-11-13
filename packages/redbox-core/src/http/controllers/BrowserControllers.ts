import type { FastifyRequest, FastifyReply } from 'fastify';
import { defineController } from '../controllers';
import { runNativePage, type PageControllerInput } from './PageController';
import { shellPage, editPage, dashboardPage, dashboardViewPage, appConfigPage, reportsPage } from '../../pages/browser';
import type { NativeAuthenticationActions } from '../fastify/authentication';
import * as m from './MutationControllers';
import * as i from './IntegrationControllers';
import * as a from './IdentityAdministrationControllers';
import * as r from './ReadControllers';

export interface BrowserPageBinding {
  readonly pages: PageControllerInput;
  readonly authentication: NativeAuthenticationActions;
}

export interface RecordBrowserControllerInput extends m.RecordMutationControllerInput {
  readonly browser: BrowserPageBinding;
}
export class RecordBrowserController extends m.RecordMutationController {
  constructor(private readonly browserInput: RecordBrowserControllerInput) {
    super(browserInput);
  }
  renderDeletedRecords(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
  edit(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, editPage, 'edit');
  }
  view(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
  redirectLegacyConsolidatedDashboard(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'legacy');
  }
  renderDashboardView(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, dashboardViewPage, 'dashboard');
  }
  render(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, dashboardPage, 'dashboard');
  }
}
export const recordMutationBrowserController = defineController({
  name: m.recordMutationController.name,
  requires: [...(m.recordMutationController.requires ?? []), 'portal-pages'],
  actions: [
    ...m.recordMutationController.actions,
    'renderDeletedRecords',
    'edit',
    'view',
    'redirectLegacyConsolidatedDashboard',
    'renderDashboardView',
    'render',
  ],
  create: (input: RecordBrowserControllerInput) => new RecordBrowserController(input),
});

export interface UserBrowserControllerInput extends i.UserControllerInput {
  readonly browser: BrowserPageBinding;
}
export class UserBrowserController extends i.UserController {
  constructor(private readonly browserInput: UserBrowserControllerInput) {
    super(browserInput);
  }
  login(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
  profile(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
  localLogin(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.localLogin(request, reply);
  }
  aafLogin(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.aafLogin(request, reply);
  }
  openidConnectLogin(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.openidConnectLogin(request, reply);
  }
  beginOidc(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.beginOidc(request, reply);
  }
  disallowedHeadRequestHandler(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.disallowedHeadRequestHandler(request, reply);
  }
  info(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.info(request, reply);
  }
  logout(request: FastifyRequest, reply: FastifyReply) {
    return this.browserInput.browser.authentication.logout(request, reply);
  }
}
export const userBrowserController = defineController({
  name: i.userController.name,
  requires: [...(i.userController.requires ?? []), 'portal-pages'],
  actions: [
    ...i.userController.actions,
    'login',
    'profile',
    'localLogin',
    'aafLogin',
    'openidConnectLogin',
    'beginOidc',
    'disallowedHeadRequestHandler',
    'info',
    'logout',
  ],
  create: (input: UserBrowserControllerInput) => new UserBrowserController(input),
});

export interface AdminBrowserControllerInput extends a.AdminIdentityControllerInput {
  readonly browser: BrowserPageBinding;
}
export class AdminBrowserController extends a.AdminIdentityController {
  constructor(private readonly browserInput: AdminBrowserControllerInput) {
    super(browserInput);
  }
  harvestRunsIndex(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
  rolesIndex(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
  usersIndex(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
}
export const adminIdentityBrowserController = defineController({
  name: a.adminIdentityController.name,
  requires: [...(a.adminIdentityController.requires ?? []), 'portal-pages'],
  actions: [...a.adminIdentityController.actions, 'harvestRunsIndex', 'rolesIndex', 'usersIndex'],
  create: (input: AdminBrowserControllerInput) => new AdminBrowserController(input),
});

export interface DashboardBrowserControllerInput extends m.DashboardMutationControllerInput {
  readonly browser: BrowserPageBinding;
}
export class DashboardBrowserController extends m.DashboardMutationController {
  constructor(private readonly browserInput: DashboardBrowserControllerInput) {
    super(browserInput);
  }
  editor(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
}
export const dashboardMutationBrowserController = defineController({
  name: m.dashboardMutationController.name,
  requires: [...(m.dashboardMutationController.requires ?? []), 'portal-pages'],
  actions: [...m.dashboardMutationController.actions, 'editor'],
  create: (input: DashboardBrowserControllerInput) => new DashboardBrowserController(input),
});

export interface AppConfigBrowserControllerInput extends m.AppConfigMutationControllerInput {
  readonly browser: BrowserPageBinding;
}
export class AppConfigBrowserController extends m.AppConfigMutationController {
  constructor(private readonly browserInput: AppConfigBrowserControllerInput) {
    super(browserInput);
  }
  editAppConfig(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, appConfigPage, 'shell');
  }
}
export const appConfigMutationBrowserController = defineController({
  name: m.appConfigMutationController.name,
  requires: [...(m.appConfigMutationController.requires ?? []), 'portal-pages'],
  actions: [...m.appConfigMutationController.actions, 'editAppConfig'],
  create: (input: AppConfigBrowserControllerInput) => new AppConfigBrowserController(input),
});

export interface ReportBrowserControllerInput extends m.ReportMutationControllerInput {
  readonly browser: BrowserPageBinding;
}
export class ReportBrowserController extends m.ReportMutationController {
  constructor(private readonly browserInput: ReportBrowserControllerInput) {
    super(browserInput);
  }
  render(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
}
export const reportMutationBrowserController = defineController({
  name: m.reportMutationController.name,
  requires: [...(m.reportMutationController.requires ?? []), 'portal-pages'],
  actions: [...m.reportMutationController.actions, 'render'],
  create: (input: ReportBrowserControllerInput) => new ReportBrowserController(input),
});

export interface VocabularyBrowserControllerInput extends i.VocabularyControllerInput {
  readonly browser: BrowserPageBinding;
}
export class VocabularyBrowserController extends i.VocabularyController {
  constructor(private readonly browserInput: VocabularyBrowserControllerInput) {
    super(browserInput);
  }
  manager(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
}
export const vocabularyBrowserController = defineController({
  name: i.vocabularyController.name,
  requires: [...(i.vocabularyController.requires ?? []), 'portal-pages'],
  actions: [...i.vocabularyController.actions, 'manager'],
  create: (input: VocabularyBrowserControllerInput) => new VocabularyBrowserController(input),
});

export interface ExportBrowserControllerInput extends r.ExportReadControllerInput {
  readonly browser: BrowserPageBinding;
}
export class ExportBrowserController extends r.ExportReadController {
  constructor(private readonly browserInput: ExportBrowserControllerInput) {
    super(browserInput);
  }
  index(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
}
export const exportReadBrowserController = defineController({
  name: r.exportReadController.name,
  requires: [...(r.exportReadController.requires ?? []), 'portal-pages'],
  actions: [...r.exportReadController.actions, 'index'],
  create: (input: ExportBrowserControllerInput) => new ExportBrowserController(input),
});

export interface RecordAuditBrowserControllerInput extends r.RecordAuditReadControllerInput {
  readonly browser: BrowserPageBinding;
}
export class RecordAuditBrowserController extends r.RecordAuditReadController {
  constructor(private readonly browserInput: RecordAuditBrowserControllerInput) {
    super(browserInput);
  }
  render(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.browserInput.browser.pages, shellPage, 'shell');
  }
}
export const recordAuditReadBrowserController = defineController({
  name: r.recordAuditReadController.name,
  requires: [...(r.recordAuditReadController.requires ?? []), 'portal-pages'],
  actions: [...r.recordAuditReadController.actions, 'render'],
  create: (input: RecordAuditBrowserControllerInput) => new RecordAuditBrowserController(input),
});

export interface NamedQueryPageControllerInput {
  readonly browser: BrowserPageBinding;
}
export class NamedQueryPageController {
  constructor(private readonly input: NamedQueryPageControllerInput) {}
  editor(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.input.browser.pages, shellPage);
  }
}
export const namedQueryPageController = defineController({
  name: 'NamedQueryController',
  requires: ['portal-pages'],
  actions: ['editor'],
  create: (input: NamedQueryPageControllerInput) => new NamedQueryPageController(input),
});

export interface ReportsPageControllerInput {
  readonly browser: BrowserPageBinding;
}
export class ReportsPageController {
  constructor(private readonly input: ReportsPageControllerInput) {}
  render(request: FastifyRequest, reply: FastifyReply) {
    return runNativePage(request, reply, this.input.browser.pages, reportsPage);
  }
}
export const reportsPageController = defineController({
  name: 'ReportsController',
  requires: ['portal-pages'],
  actions: ['render'],
  create: (input: ReportsPageControllerInput) => new ReportsPageController(input),
});
