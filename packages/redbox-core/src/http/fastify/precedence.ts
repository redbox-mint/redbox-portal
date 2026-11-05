import type { RoutePrecedence } from './routes';

/** Individually inventoried source-declaration precedence, across every method.
 * Named intent never bypasses native ownership proof. The two GET/TUS
 * fallthrough resources deliberately remain unresolved until FM-034.
 */
export const coreRoutePrecedence: readonly RoutePrecedence[] = [
  {
    name: 'legacy.core-http-head-e3ee2548904017ea.over.core-http-get-e3ee2548904017ea',
    reason: 'The explicit OIDC HEAD denial must block the GET provider-start action while retaining its own guards.',
    winner: 'core-http-head-e3ee2548904017ea',
    over: 'core-http-get-e3ee2548904017ea',
  },
  {
    name: 'legacy.core-http-post-114323363baef3cb.over.core-http-get-114323363baef3cb',
    reason:
      'Preserve UserController.logout before UserController.logout at /route-value/route-value/user/logout, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-114323363baef3cb',
    over: 'core-http-get-114323363baef3cb',
  },
  {
    name: 'legacy.core-http-get-34688e88abfb567d.over.core-http-get-3ce02681cd21a82c',
    reason:
      'Preserve RecordController.getType ownership of /route-value/route-value/record/type/edit from the existing mount order, including its access, CSRF and input contract before RecordController.edit.',
    winner: 'core-http-get-34688e88abfb567d',
    over: 'core-http-get-3ce02681cd21a82c',
  },
  {
    name: 'legacy.core-http-get-34688e88abfb567d.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.getType before RecordController.getPermissions at /route-value/route-value/record/type/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-34688e88abfb567d',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-34688e88abfb567d.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.getType before RecordController.getRelatedRecords at /route-value/route-value/record/type/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-34688e88abfb567d',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-34688e88abfb567d.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.getType before RecordController.getAttachments at /route-value/route-value/record/type/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-34688e88abfb567d',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-34688e88abfb567d.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getType before RecordController.getDataStream at /route-value/route-value/record/type/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-34688e88abfb567d',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-34688e88abfb567d.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.getType ownership of /route-value/route-value/record/type/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-34688e88abfb567d',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-ac2dcd5d92fe2e56.over.core-http-get-3ce02681cd21a82c',
    reason:
      'Preserve RecordController.getWorkflowSteps ownership of /route-value/route-value/record/wfSteps/edit from the existing mount order, including its access, CSRF and input contract before RecordController.edit.',
    winner: 'core-http-get-ac2dcd5d92fe2e56',
    over: 'core-http-get-3ce02681cd21a82c',
  },
  {
    name: 'legacy.core-http-get-ac2dcd5d92fe2e56.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.getWorkflowSteps before RecordController.getPermissions at /route-value/route-value/record/wfSteps/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ac2dcd5d92fe2e56',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-ac2dcd5d92fe2e56.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.getWorkflowSteps before RecordController.getRelatedRecords at /route-value/route-value/record/wfSteps/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ac2dcd5d92fe2e56',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-ac2dcd5d92fe2e56.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.getWorkflowSteps before RecordController.getAttachments at /route-value/route-value/record/wfSteps/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ac2dcd5d92fe2e56',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-ac2dcd5d92fe2e56.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getWorkflowSteps before RecordController.getDataStream at /route-value/route-value/record/wfSteps/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ac2dcd5d92fe2e56',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-ac2dcd5d92fe2e56.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.getWorkflowSteps ownership of /route-value/route-value/record/wfSteps/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-ac2dcd5d92fe2e56',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-9039fe9856f9a41e.over.core-http-get-55f55411a2079c97',
    reason:
      'Preserve RecordController.getAllDashboardTypes ownership of /route-value/route-value/dashboard/type from the existing mount order, including its access, CSRF and input contract before RecordController.render.',
    winner: 'core-http-get-9039fe9856f9a41e',
    over: 'core-http-get-55f55411a2079c97',
  },
  {
    name: 'legacy.core-http-get-4053b1665ede5475.over.core-http-get-c6a521f1b42f7a46',
    reason:
      'Preserve TranslationController.getNamespace before TranslationController.getNamespace at /route-value/route-value/locales/route-value/translation.json, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-4053b1665ede5475',
    over: 'core-http-get-c6a521f1b42f7a46',
  },
  {
    name: 'legacy.core-http-get-626a0864790ee5fa.over.core-http-post-626a0864790ee5fa',
    reason:
      'Preserve TranslationController.getBundleApp before TranslationController.setBundleApp at /route-value/route-value/app/i18n/bundles/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-626a0864790ee5fa',
    over: 'core-http-post-626a0864790ee5fa',
  },
  {
    name: 'legacy.core-http-get-05d222ebe87f3a5b.over.core-http-put-05d222ebe87f3a5b',
    reason:
      'Preserve webservice/DashboardConfigController.getWorkflowTarget before webservice/DashboardConfigController.saveWorkflowTarget at /route-value/route-value/api/dashboard-config/workflows/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-05d222ebe87f3a5b',
    over: 'core-http-put-05d222ebe87f3a5b',
  },
  {
    name: 'legacy.core-http-get-9b9f429b282a1400.over.core-http-put-9b9f429b282a1400',
    reason:
      'Preserve webservice/DashboardConfigController.getViewTarget before webservice/DashboardConfigController.saveViewTarget at /route-value/route-value/api/dashboard-config/views/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-9b9f429b282a1400',
    over: 'core-http-put-9b9f429b282a1400',
  },
  {
    name: 'legacy.core-http-get-3e61c61269b5a4ca.over.core-http-put-3e61c61269b5a4ca',
    reason:
      'Preserve webservice/DashboardConfigController.retiredOperation before webservice/DashboardConfigController.retiredOperation at /route-value/route-value/api/dashboard-config/overrides, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-3e61c61269b5a4ca',
    over: 'core-http-put-3e61c61269b5a4ca',
  },
  {
    name: 'legacy.core-http-get-e8e1819914cbfe68.over.core-http-put-e8e1819914cbfe68',
    reason:
      'Preserve webservice/DashboardConfigController.retiredOperation before webservice/DashboardConfigController.retiredOperation at /route-value/route-value/api/dashboard-config/merged/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-e8e1819914cbfe68',
    over: 'core-http-put-e8e1819914cbfe68',
  },
  {
    name: 'legacy.core-http-get-7e271c98bc1852e1.over.core-http-put-7e271c98bc1852e1',
    reason:
      'Preserve webservice/DashboardConfigController.retiredOperation before webservice/DashboardConfigController.retiredOperation at /route-value/route-value/api/dashboard-config/merged-view/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7e271c98bc1852e1',
    over: 'core-http-put-7e271c98bc1852e1',
  },
  {
    name: 'legacy.core-http-get-fa45f608309a129c.over.core-http-put-fa45f608309a129c',
    reason:
      'Preserve DashboardConfigController.getWorkflowTarget before DashboardConfigController.saveWorkflowTarget at /route-value/route-value/admin/dashboard-config/workflows/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-fa45f608309a129c',
    over: 'core-http-put-fa45f608309a129c',
  },
  {
    name: 'legacy.core-http-get-ca71b659b50cb9ce.over.core-http-put-ca71b659b50cb9ce',
    reason:
      'Preserve DashboardConfigController.getViewTarget before DashboardConfigController.saveViewTarget at /route-value/route-value/admin/dashboard-config/views/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ca71b659b50cb9ce',
    over: 'core-http-put-ca71b659b50cb9ce',
  },
  {
    name: 'legacy.core-http-get-ac7223a506b09fea.over.core-http-get-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.manager ownership of /route-value/route-value/admin/vocabulary/manager from the existing mount order, including its access, CSRF and input contract before VocabularyController.get.',
    winner: 'core-http-get-ac7223a506b09fea',
    over: 'core-http-get-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-get-ac7223a506b09fea.over.core-http-put-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.manager before VocabularyController.update at /route-value/route-value/admin/vocabulary/manager, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ac7223a506b09fea',
    over: 'core-http-put-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-get-ac7223a506b09fea.over.core-http-delete-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.manager before VocabularyController.delete at /route-value/route-value/admin/vocabulary/manager, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ac7223a506b09fea',
    over: 'core-http-delete-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-afec3dcb857d3a8d',
    reason:
      'Preserve RecordController.edit before RecordController.edit at /route-value/route-value/record/edit/edit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-afec3dcb857d3a8d',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-all-00338354d7fe954e',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/view/edit from the existing mount order, including its access, CSRF and input contract before RecordController.view.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-all-00338354d7fe954e',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-all-7657a265c12e6c30',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/view-orig/edit from the existing mount order, including its access, CSRF and input contract before RecordController.view.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-all-7657a265c12e6c30',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-43b64a326bf4b215',
    reason:
      'Preserve RecordController.edit before RecordAuditController.render at /route-value/route-value/record/viewAudit/edit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-43b64a326bf4b215',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-00af1968b1d943de',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/form/edit from the existing mount order, including its access, CSRF and input contract before RecordController.getForm.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-00af1968b1d943de',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-88ec087267e1c527',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/integrationStatus/edit from the existing mount order, including its access, CSRF and input contract before RecordAuditController.getIntegrationStatusData.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-88ec087267e1c527',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-44ec4fc0057f394e',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/metadata/edit from the existing mount order, including its access, CSRF and input contract before RecordController.getMeta.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-44ec4fc0057f394e',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-075b1fd6caf60910',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/default/edit from the existing mount order, including its access, CSRF and input contract before RecordController.getMetaDefault.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-075b1fd6caf60910',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-008a49641729ad5d',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/delete/edit from the existing mount order, including its access, CSRF and input contract before RecordController.getDeletedRecord.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-get-9962f835ecb38e73',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/search/edit from the existing mount order, including its access, CSRF and input contract before RecordController.search.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-get-9962f835ecb38e73',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-delete-008a49641729ad5d',
    reason:
      'Preserve RecordController.edit before RecordController.delete at /route-value/route-value/record/delete/edit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-delete-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-put-008a49641729ad5d',
    reason:
      'Preserve RecordController.edit before RecordController.restoreRecord at /route-value/route-value/record/delete/edit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-put-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-3ce02681cd21a82c.over.core-http-delete-21eb5a614e0c71c9',
    reason:
      'Preserve RecordController.edit before RecordController.destroyDeletedRecord at /route-value/route-value/record/destroy/edit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-3ce02681cd21a82c',
    over: 'core-http-delete-21eb5a614e0c71c9',
  },
  {
    name: 'legacy.core-http-get-afec3dcb857d3a8d.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/edit/permissions from the existing mount order, including its access, CSRF and input contract before RecordController.getPermissions.',
    winner: 'core-http-get-afec3dcb857d3a8d',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-afec3dcb857d3a8d.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/edit/relatedRecords from the existing mount order, including its access, CSRF and input contract before RecordController.getRelatedRecords.',
    winner: 'core-http-get-afec3dcb857d3a8d',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-afec3dcb857d3a8d.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/edit/attachments from the existing mount order, including its access, CSRF and input contract before RecordController.getAttachments.',
    winner: 'core-http-get-afec3dcb857d3a8d',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-afec3dcb857d3a8d.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/edit/datastreamroute-value from the existing mount order, including its access, CSRF and input contract before RecordController.getDataStream.',
    winner: 'core-http-get-afec3dcb857d3a8d',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-afec3dcb857d3a8d.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/edit/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-afec3dcb857d3a8d',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-217d6fc396c94488.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.edit ownership of /route-value/route-value/record/finalise/datastreamroute-value/edit/route-value from the existing mount order, including its access, CSRF and input contract before RecordController.getDataStream.',
    winner: 'core-http-get-217d6fc396c94488',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-all-00338354d7fe954e.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view/permissions from the existing mount order, including its access, CSRF and input contract before RecordController.getPermissions.',
    winner: 'core-http-all-00338354d7fe954e',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-all-00338354d7fe954e.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view/relatedRecords from the existing mount order, including its access, CSRF and input contract before RecordController.getRelatedRecords.',
    winner: 'core-http-all-00338354d7fe954e',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-all-00338354d7fe954e.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view/attachments from the existing mount order, including its access, CSRF and input contract before RecordController.getAttachments.',
    winner: 'core-http-all-00338354d7fe954e',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-all-00338354d7fe954e.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view/datastreamroute-value from the existing mount order, including its access, CSRF and input contract before RecordController.getDataStream.',
    winner: 'core-http-all-00338354d7fe954e',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-all-00338354d7fe954e.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-all-00338354d7fe954e',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-all-7657a265c12e6c30.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view-orig/permissions from the existing mount order, including its access, CSRF and input contract before RecordController.getPermissions.',
    winner: 'core-http-all-7657a265c12e6c30',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-all-7657a265c12e6c30.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view-orig/relatedRecords from the existing mount order, including its access, CSRF and input contract before RecordController.getRelatedRecords.',
    winner: 'core-http-all-7657a265c12e6c30',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-all-7657a265c12e6c30.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view-orig/attachments from the existing mount order, including its access, CSRF and input contract before RecordController.getAttachments.',
    winner: 'core-http-all-7657a265c12e6c30',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-all-7657a265c12e6c30.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view-orig/datastreamroute-value from the existing mount order, including its access, CSRF and input contract before RecordController.getDataStream.',
    winner: 'core-http-all-7657a265c12e6c30',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-all-7657a265c12e6c30.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.view ownership of /route-value/route-value/record/view-orig/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-all-7657a265c12e6c30',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-43b64a326bf4b215.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordAuditController.render ownership of /route-value/route-value/record/viewAudit/permissions from the existing mount order, including its access, CSRF and input contract before RecordController.getPermissions.',
    winner: 'core-http-get-43b64a326bf4b215',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-43b64a326bf4b215.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordAuditController.render ownership of /route-value/route-value/record/viewAudit/relatedRecords from the existing mount order, including its access, CSRF and input contract before RecordController.getRelatedRecords.',
    winner: 'core-http-get-43b64a326bf4b215',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-43b64a326bf4b215.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordAuditController.render ownership of /route-value/route-value/record/viewAudit/attachments from the existing mount order, including its access, CSRF and input contract before RecordController.getAttachments.',
    winner: 'core-http-get-43b64a326bf4b215',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-43b64a326bf4b215.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordAuditController.render ownership of /route-value/route-value/record/viewAudit/datastreamroute-value from the existing mount order, including its access, CSRF and input contract before RecordController.getDataStream.',
    winner: 'core-http-get-43b64a326bf4b215',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-43b64a326bf4b215.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordAuditController.render ownership of /route-value/route-value/record/viewAudit/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-43b64a326bf4b215',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-7621dfe6090e915f.over.core-http-get-55f55411a2079c97',
    reason:
      'Preserve RecordController.redirectLegacyConsolidatedDashboard before RecordController.render at /route-value/route-value/dashboard/consolidated, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7621dfe6090e915f',
    over: 'core-http-get-55f55411a2079c97',
  },
  {
    name: 'legacy.core-http-get-ac9a43d427c29c88.over.core-http-get-16c9edd7443be1e6',
    reason:
      'Preserve RecordController.renderDashboardView ownership of /fonts/branding/dashboard-view/route-value.woff2 from the existing mount order, including its access, CSRF and input contract before BrandingController.renderFont.',
    winner: 'core-http-get-ac9a43d427c29c88',
    over: 'core-http-get-16c9edd7443be1e6',
  },
  {
    name: 'legacy.core-http-get-55f55411a2079c97.over.core-http-get-16c9edd7443be1e6',
    reason:
      'Preserve RecordController.render ownership of /fonts/branding/dashboard/route-value.woff2 from the existing mount order, including its access, CSRF and input contract before BrandingController.renderFont.',
    winner: 'core-http-get-55f55411a2079c97',
    over: 'core-http-get-16c9edd7443be1e6',
  },
  {
    name: 'legacy.core-http-get-5f1ff218276af236.over.core-http-post-5f1ff218276af236',
    reason:
      'Preserve AppConfigController.getAppConfigForm before AppConfigController.saveAppConfig at /route-value/route-value/appconfig/form/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-5f1ff218276af236',
    over: 'core-http-post-5f1ff218276af236',
  },
  {
    name: 'legacy.core-http-get-6e10e2ff2e8c6383.over.core-http-post-6e10e2ff2e8c6383',
    reason:
      'Preserve webservice/AppConfigController.getAppConfig before webservice/AppConfigController.saveAppConfig at /route-value/route-value/api/appconfig/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-6e10e2ff2e8c6383',
    over: 'core-http-post-6e10e2ff2e8c6383',
  },
  {
    name: 'legacy.core-http-get-6e10e2ff2e8c6383.over.core-http-delete-6e10e2ff2e8c6383',
    reason:
      'Preserve webservice/AppConfigController.getAppConfig before webservice/AppConfigController.resetAppConfig at /route-value/route-value/api/appconfig/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-6e10e2ff2e8c6383',
    over: 'core-http-delete-6e10e2ff2e8c6383',
  },
  {
    name: 'legacy.core-http-get-7e577c55892702d9.over.core-http-post-7e577c55892702d9',
    reason:
      'Preserve webservice/TranslationController.getEntry before webservice/TranslationController.setEntry at /route-value/route-value/api/i18n/entries/route-value/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7e577c55892702d9',
    over: 'core-http-post-7e577c55892702d9',
  },
  {
    name: 'legacy.core-http-get-7e577c55892702d9.over.core-http-delete-7e577c55892702d9',
    reason:
      'Preserve webservice/TranslationController.getEntry before webservice/TranslationController.deleteEntry at /route-value/route-value/api/i18n/entries/route-value/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7e577c55892702d9',
    over: 'core-http-delete-7e577c55892702d9',
  },
  {
    name: 'legacy.core-http-get-eca20d7288dc9aab.over.core-http-post-eca20d7288dc9aab',
    reason:
      'Preserve webservice/TranslationController.getBundle before webservice/TranslationController.setBundle at /route-value/route-value/api/i18n/bundles/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-eca20d7288dc9aab',
    over: 'core-http-post-eca20d7288dc9aab',
  },
  {
    name: 'legacy.core-http-post-6e10e2ff2e8c6383.over.core-http-delete-6e10e2ff2e8c6383',
    reason:
      'Preserve webservice/AppConfigController.saveAppConfig before webservice/AppConfigController.resetAppConfig at /route-value/route-value/api/appconfig/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-6e10e2ff2e8c6383',
    over: 'core-http-delete-6e10e2ff2e8c6383',
  },
  {
    name: 'legacy.core-http-post-7e577c55892702d9.over.core-http-delete-7e577c55892702d9',
    reason:
      'Preserve webservice/TranslationController.setEntry before webservice/TranslationController.deleteEntry at /route-value/route-value/api/i18n/entries/route-value/route-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-7e577c55892702d9',
    over: 'core-http-delete-7e577c55892702d9',
  },
  {
    name: 'legacy.core-http-get-00af1968b1d943de.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.getForm before RecordController.getPermissions at /route-value/route-value/record/form/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-00af1968b1d943de',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-00af1968b1d943de.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.getForm before RecordController.getRelatedRecords at /route-value/route-value/record/form/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-00af1968b1d943de',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-00af1968b1d943de.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.getForm before RecordController.getAttachments at /route-value/route-value/record/form/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-00af1968b1d943de',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-00af1968b1d943de.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getForm before RecordController.getDataStream at /route-value/route-value/record/form/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-00af1968b1d943de',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-00af1968b1d943de.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.getForm ownership of /route-value/route-value/record/form/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-00af1968b1d943de',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-6f652455efcc42a0.over.core-http-get-394ddcf5e5780223',
    reason:
      'Preserve RecordController.getForm before RecordController.doAttachment at /route-value/route-value/record/form/attach/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-6f652455efcc42a0',
    over: 'core-http-get-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-6f652455efcc42a0.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getForm before RecordController.getDataStream at /route-value/route-value/record/form/datastreamroute-value/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-6f652455efcc42a0',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-6f652455efcc42a0.over.core-http-all-394ddcf5e5780223',
    reason:
      'Preserve RecordController.getForm ownership of /route-value/route-value/record/form/attach/route-value from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-6f652455efcc42a0',
    over: 'core-http-all-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-538b6d9684e29164.over.core-http-post-538b6d9684e29164',
    reason:
      'Preserve webservice/ReportController.listConfigs before webservice/ReportController.createConfig at /route-value/route-value/api/report-config, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-538b6d9684e29164',
    over: 'core-http-post-538b6d9684e29164',
  },
  {
    name: 'legacy.core-http-post-d12fa4b798249586.over.core-http-get-c1ed1483946207a0',
    reason:
      'Preserve webservice/ReportController.previewConfig before webservice/ReportController.getConfig at /route-value/route-value/api/report-config/preview, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d12fa4b798249586',
    over: 'core-http-get-c1ed1483946207a0',
  },
  {
    name: 'legacy.core-http-post-d12fa4b798249586.over.core-http-put-c1ed1483946207a0',
    reason:
      'Preserve webservice/ReportController.previewConfig before webservice/ReportController.updateConfig at /route-value/route-value/api/report-config/preview, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d12fa4b798249586',
    over: 'core-http-put-c1ed1483946207a0',
  },
  {
    name: 'legacy.core-http-post-d12fa4b798249586.over.core-http-delete-c1ed1483946207a0',
    reason:
      'Preserve webservice/ReportController.previewConfig before webservice/ReportController.deleteConfig at /route-value/route-value/api/report-config/preview, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d12fa4b798249586',
    over: 'core-http-delete-c1ed1483946207a0',
  },
  {
    name: 'legacy.core-http-get-c1ed1483946207a0.over.core-http-put-c1ed1483946207a0',
    reason:
      'Preserve webservice/ReportController.getConfig before webservice/ReportController.updateConfig at /route-value/route-value/api/report-config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-c1ed1483946207a0',
    over: 'core-http-put-c1ed1483946207a0',
  },
  {
    name: 'legacy.core-http-get-c1ed1483946207a0.over.core-http-delete-c1ed1483946207a0',
    reason:
      'Preserve webservice/ReportController.getConfig before webservice/ReportController.deleteConfig at /route-value/route-value/api/report-config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-c1ed1483946207a0',
    over: 'core-http-delete-c1ed1483946207a0',
  },
  {
    name: 'legacy.core-http-get-deb82de594475396.over.core-http-post-deb82de594475396',
    reason:
      'Preserve ReportController.listConfigs before ReportController.createConfig at /route-value/route-value/admin/report-config, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-deb82de594475396',
    over: 'core-http-post-deb82de594475396',
  },
  {
    name: 'legacy.core-http-post-521e53a4dc7f19ec.over.core-http-get-16b35f68b1eaa5ec',
    reason:
      'Preserve ReportController.previewConfig before ReportController.getConfig at /route-value/route-value/admin/report-config/preview, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-521e53a4dc7f19ec',
    over: 'core-http-get-16b35f68b1eaa5ec',
  },
  {
    name: 'legacy.core-http-post-521e53a4dc7f19ec.over.core-http-put-16b35f68b1eaa5ec',
    reason:
      'Preserve ReportController.previewConfig before ReportController.updateConfig at /route-value/route-value/admin/report-config/preview, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-521e53a4dc7f19ec',
    over: 'core-http-put-16b35f68b1eaa5ec',
  },
  {
    name: 'legacy.core-http-post-521e53a4dc7f19ec.over.core-http-delete-16b35f68b1eaa5ec',
    reason:
      'Preserve ReportController.previewConfig before ReportController.deleteConfig at /route-value/route-value/admin/report-config/preview, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-521e53a4dc7f19ec',
    over: 'core-http-delete-16b35f68b1eaa5ec',
  },
  {
    name: 'legacy.core-http-get-16b35f68b1eaa5ec.over.core-http-put-16b35f68b1eaa5ec',
    reason:
      'Preserve ReportController.getConfig before ReportController.updateConfig at /route-value/route-value/admin/report-config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-16b35f68b1eaa5ec',
    over: 'core-http-put-16b35f68b1eaa5ec',
  },
  {
    name: 'legacy.core-http-get-16b35f68b1eaa5ec.over.core-http-delete-16b35f68b1eaa5ec',
    reason:
      'Preserve ReportController.getConfig before ReportController.deleteConfig at /route-value/route-value/admin/report-config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-16b35f68b1eaa5ec',
    over: 'core-http-delete-16b35f68b1eaa5ec',
  },
  {
    name: 'legacy.core-http-get-62433fc7ac587d54.over.core-http-post-62433fc7ac587d54',
    reason:
      'Preserve webservice/NamedQueryController.listQueries before webservice/NamedQueryController.createQuery at /route-value/route-value/api/named-query, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-62433fc7ac587d54',
    over: 'core-http-post-62433fc7ac587d54',
  },
  {
    name: 'legacy.core-http-get-36c77e8cec688ea7.over.core-http-get-05e02b6148364ea0',
    reason:
      'The literal named-query collections endpoint owns /collections and its input contract before the query-name endpoint.',
    winner: 'core-http-get-36c77e8cec688ea7',
    over: 'core-http-get-05e02b6148364ea0',
  },
  {
    name: 'legacy.core-http-get-36c77e8cec688ea7.over.core-http-put-05e02b6148364ea0',
    reason:
      'Preserve webservice/NamedQueryController.getCollections before webservice/NamedQueryController.updateQuery at /route-value/route-value/api/named-query/collections, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-36c77e8cec688ea7',
    over: 'core-http-put-05e02b6148364ea0',
  },
  {
    name: 'legacy.core-http-get-36c77e8cec688ea7.over.core-http-delete-05e02b6148364ea0',
    reason:
      'Preserve webservice/NamedQueryController.getCollections before webservice/NamedQueryController.deleteQuery at /route-value/route-value/api/named-query/collections, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-36c77e8cec688ea7',
    over: 'core-http-delete-05e02b6148364ea0',
  },
  {
    name: 'legacy.core-http-get-05e02b6148364ea0.over.core-http-put-05e02b6148364ea0',
    reason:
      'Preserve webservice/NamedQueryController.getQuery before webservice/NamedQueryController.updateQuery at /route-value/route-value/api/named-query/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-05e02b6148364ea0',
    over: 'core-http-put-05e02b6148364ea0',
  },
  {
    name: 'legacy.core-http-get-05e02b6148364ea0.over.core-http-delete-05e02b6148364ea0',
    reason:
      'Preserve webservice/NamedQueryController.getQuery before webservice/NamedQueryController.deleteQuery at /route-value/route-value/api/named-query/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-05e02b6148364ea0',
    over: 'core-http-delete-05e02b6148364ea0',
  },
  {
    name: 'legacy.core-http-get-42cbc01ffff92789.over.core-http-put-42cbc01ffff92789',
    reason:
      'Preserve webservice/SiemController.getConfig before webservice/SiemController.saveConfig at /route-value/route-value/api/siem/config, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-42cbc01ffff92789',
    over: 'core-http-put-42cbc01ffff92789',
  },
  {
    name: 'legacy.core-http-get-2915e6de89880cbc.over.core-http-get-394ddcf5e5780223',
    reason:
      'Preserve RecordAuditController.getAuditData before RecordController.doAttachment at /route-value/route-value/record/viewAudit/attach/audit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-2915e6de89880cbc',
    over: 'core-http-get-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-2915e6de89880cbc.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordAuditController.getAuditData before RecordController.getDataStream at /route-value/route-value/record/viewAudit/datastreamroute-value/audit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-2915e6de89880cbc',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-2915e6de89880cbc.over.core-http-all-394ddcf5e5780223',
    reason:
      'Preserve RecordAuditController.getAuditData ownership of /route-value/route-value/record/viewAudit/attach/audit from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-2915e6de89880cbc',
    over: 'core-http-all-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-8d0356316272918c.over.core-http-get-394ddcf5e5780223',
    reason:
      'Preserve RecordAuditController.getPermissionsData before RecordController.doAttachment at /route-value/route-value/record/viewAudit/attach/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-8d0356316272918c',
    over: 'core-http-get-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-8d0356316272918c.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordAuditController.getPermissionsData before RecordController.getDataStream at /route-value/route-value/record/viewAudit/datastreamroute-value/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-8d0356316272918c',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-8d0356316272918c.over.core-http-all-394ddcf5e5780223',
    reason:
      'Preserve RecordAuditController.getPermissionsData ownership of /route-value/route-value/record/viewAudit/attach/permissions from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-8d0356316272918c',
    over: 'core-http-all-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-d12e5965a3b4447e.over.core-http-get-394ddcf5e5780223',
    reason:
      'Preserve RecordAuditController.getIntegrationAuditData before RecordController.doAttachment at /route-value/route-value/record/viewAudit/attach/integration-audit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-d12e5965a3b4447e',
    over: 'core-http-get-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-d12e5965a3b4447e.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordAuditController.getIntegrationAuditData before RecordController.getDataStream at /route-value/route-value/record/viewAudit/datastreamroute-value/integration-audit, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-d12e5965a3b4447e',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-d12e5965a3b4447e.over.core-http-all-394ddcf5e5780223',
    reason:
      'Preserve RecordAuditController.getIntegrationAuditData ownership of /route-value/route-value/record/viewAudit/attach/integration-audit from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-d12e5965a3b4447e',
    over: 'core-http-all-394ddcf5e5780223',
  },
  {
    name: 'legacy.core-http-get-88ec087267e1c527.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordAuditController.getIntegrationStatusData before RecordController.getPermissions at /route-value/route-value/record/integrationStatus/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-88ec087267e1c527',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-88ec087267e1c527.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordAuditController.getIntegrationStatusData before RecordController.getRelatedRecords at /route-value/route-value/record/integrationStatus/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-88ec087267e1c527',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-88ec087267e1c527.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordAuditController.getIntegrationStatusData before RecordController.getAttachments at /route-value/route-value/record/integrationStatus/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-88ec087267e1c527',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-88ec087267e1c527.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordAuditController.getIntegrationStatusData before RecordController.getDataStream at /route-value/route-value/record/integrationStatus/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-88ec087267e1c527',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-88ec087267e1c527.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordAuditController.getIntegrationStatusData ownership of /route-value/route-value/record/integrationStatus/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-88ec087267e1c527',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-ad16a72d70780c9d.over.core-http-get-c271e2590a98e8e8',
    reason:
      'The literal deleted-record list endpoint owns /list and its list-query validation before the record-id endpoint.',
    winner: 'core-http-get-ad16a72d70780c9d',
    over: 'core-http-get-c271e2590a98e8e8',
  },
  {
    name: 'legacy.core-http-get-ad16a72d70780c9d.over.core-http-put-c271e2590a98e8e8',
    reason:
      'Preserve webservice/RecordController.listDeletedRecords before webservice/RecordController.restoreRecord at /route-value/route-value/api/deletedrecords/list, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ad16a72d70780c9d',
    over: 'core-http-put-c271e2590a98e8e8',
  },
  {
    name: 'legacy.core-http-get-ad16a72d70780c9d.over.core-http-delete-c271e2590a98e8e8',
    reason:
      'Preserve webservice/RecordController.listDeletedRecords before webservice/RecordController.destroyDeletedRecord at /route-value/route-value/api/deletedrecords/list, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-ad16a72d70780c9d',
    over: 'core-http-delete-c271e2590a98e8e8',
  },
  {
    name: 'legacy.core-http-get-443ff9adb3d2b64f.over.core-http-post-443ff9adb3d2b64f',
    reason:
      'Preserve webservice/RecordController.getMeta before webservice/RecordController.create at /route-value/route-value/api/records/metadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-443ff9adb3d2b64f',
    over: 'core-http-post-443ff9adb3d2b64f',
  },
  {
    name: 'legacy.core-http-get-443ff9adb3d2b64f.over.core-http-put-443ff9adb3d2b64f',
    reason:
      'Preserve webservice/RecordController.getMeta before webservice/RecordController.updateMeta at /route-value/route-value/api/records/metadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-443ff9adb3d2b64f',
    over: 'core-http-put-443ff9adb3d2b64f',
  },
  {
    name: 'legacy.core-http-get-443ff9adb3d2b64f.over.core-http-delete-443ff9adb3d2b64f',
    reason:
      'Preserve webservice/RecordController.getMeta before webservice/RecordController.deleteRecord at /route-value/route-value/api/records/metadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-443ff9adb3d2b64f',
    over: 'core-http-delete-443ff9adb3d2b64f',
  },
  {
    name: 'legacy.core-http-get-c271e2590a98e8e8.over.core-http-put-c271e2590a98e8e8',
    reason:
      'Preserve webservice/RecordController.getDeletedRecord before webservice/RecordController.restoreRecord at /route-value/route-value/api/deletedrecords/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-c271e2590a98e8e8',
    over: 'core-http-put-c271e2590a98e8e8',
  },
  {
    name: 'legacy.core-http-get-c271e2590a98e8e8.over.core-http-delete-c271e2590a98e8e8',
    reason:
      'Preserve webservice/RecordController.getDeletedRecord before webservice/RecordController.destroyDeletedRecord at /route-value/route-value/api/deletedrecords/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-c271e2590a98e8e8',
    over: 'core-http-delete-c271e2590a98e8e8',
  },
  {
    name: 'legacy.core-http-get-4a2d283faa583fe8.over.core-http-put-4a2d283faa583fe8',
    reason:
      'Preserve webservice/RecordController.getObjectMeta before webservice/RecordController.updateObjectMeta at /route-value/route-value/api/records/objectmetadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-4a2d283faa583fe8',
    over: 'core-http-put-4a2d283faa583fe8',
  },
  {
    name: 'legacy.core-http-get-44ec4fc0057f394e.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.getMeta before RecordController.getPermissions at /route-value/route-value/record/metadata/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-44ec4fc0057f394e',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-44ec4fc0057f394e.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.getMeta before RecordController.getRelatedRecords at /route-value/route-value/record/metadata/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-44ec4fc0057f394e',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-44ec4fc0057f394e.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.getMeta before RecordController.getAttachments at /route-value/route-value/record/metadata/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-44ec4fc0057f394e',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-44ec4fc0057f394e.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getMeta before RecordController.getDataStream at /route-value/route-value/record/metadata/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-44ec4fc0057f394e',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-44ec4fc0057f394e.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.getMeta ownership of /route-value/route-value/record/metadata/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-44ec4fc0057f394e',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-075b1fd6caf60910.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.getMetaDefault before RecordController.getPermissions at /route-value/route-value/record/default/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-075b1fd6caf60910',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-075b1fd6caf60910.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.getMetaDefault before RecordController.getRelatedRecords at /route-value/route-value/record/default/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-075b1fd6caf60910',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-075b1fd6caf60910.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.getMetaDefault before RecordController.getAttachments at /route-value/route-value/record/default/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-075b1fd6caf60910',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-075b1fd6caf60910.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getMetaDefault before RecordController.getDataStream at /route-value/route-value/record/default/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-075b1fd6caf60910',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-075b1fd6caf60910.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.getMetaDefault ownership of /route-value/route-value/record/default/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-075b1fd6caf60910',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-get-f487c97e2344917f',
    reason:
      'Preserve RecordController.getDeletedRecord before RecordController.getPermissions at /route-value/route-value/record/delete/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-get-f487c97e2344917f',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-get-7a867fb2cef37165',
    reason:
      'Preserve RecordController.getDeletedRecord before RecordController.getRelatedRecords at /route-value/route-value/record/delete/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-get-7a867fb2cef37165',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-delete-008a49641729ad5d',
    reason:
      'Preserve RecordController.getDeletedRecord before RecordController.delete at /route-value/route-value/record/delete/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-delete-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-put-008a49641729ad5d',
    reason:
      'Preserve RecordController.getDeletedRecord before RecordController.restoreRecord at /route-value/route-value/record/delete/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-put-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.getDeletedRecord before RecordController.getAttachments at /route-value/route-value/record/delete/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.getDeletedRecord before RecordController.getDataStream at /route-value/route-value/record/delete/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-008a49641729ad5d.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.getDeletedRecord ownership of /route-value/route-value/record/delete/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-008a49641729ad5d',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-get-f487c97e2344917f.over.core-http-get-9962f835ecb38e73',
    reason:
      'Preserve RecordController.getPermissions before RecordController.search at /route-value/route-value/record/search/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-f487c97e2344917f',
    over: 'core-http-get-9962f835ecb38e73',
  },
  {
    name: 'legacy.core-http-get-f487c97e2344917f.over.core-http-delete-008a49641729ad5d',
    reason:
      'Preserve RecordController.getPermissions before RecordController.delete at /route-value/route-value/record/delete/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-f487c97e2344917f',
    over: 'core-http-delete-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-f487c97e2344917f.over.core-http-put-008a49641729ad5d',
    reason:
      'Preserve RecordController.getPermissions before RecordController.restoreRecord at /route-value/route-value/record/delete/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-f487c97e2344917f',
    over: 'core-http-put-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-f487c97e2344917f.over.core-http-delete-21eb5a614e0c71c9',
    reason:
      'Preserve RecordController.getPermissions before RecordController.destroyDeletedRecord at /route-value/route-value/record/destroy/permissions, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-f487c97e2344917f',
    over: 'core-http-delete-21eb5a614e0c71c9',
  },
  {
    name: 'legacy.core-http-get-7a867fb2cef37165.over.core-http-get-9962f835ecb38e73',
    reason:
      'Preserve RecordController.getRelatedRecords before RecordController.search at /route-value/route-value/record/search/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7a867fb2cef37165',
    over: 'core-http-get-9962f835ecb38e73',
  },
  {
    name: 'legacy.core-http-get-7a867fb2cef37165.over.core-http-delete-008a49641729ad5d',
    reason:
      'Preserve RecordController.getRelatedRecords before RecordController.delete at /route-value/route-value/record/delete/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7a867fb2cef37165',
    over: 'core-http-delete-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-7a867fb2cef37165.over.core-http-put-008a49641729ad5d',
    reason:
      'Preserve RecordController.getRelatedRecords before RecordController.restoreRecord at /route-value/route-value/record/delete/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7a867fb2cef37165',
    over: 'core-http-put-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-get-7a867fb2cef37165.over.core-http-delete-21eb5a614e0c71c9',
    reason:
      'Preserve RecordController.getRelatedRecords before RecordController.destroyDeletedRecord at /route-value/route-value/record/destroy/relatedRecords, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-7a867fb2cef37165',
    over: 'core-http-delete-21eb5a614e0c71c9',
  },
  {
    name: 'legacy.core-http-get-9962f835ecb38e73.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.search before RecordController.getAttachments at /route-value/route-value/record/search/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-9962f835ecb38e73',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-get-9962f835ecb38e73.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.search before RecordController.getDataStream at /route-value/route-value/record/search/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-9962f835ecb38e73',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-get-9962f835ecb38e73.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.search ownership of /route-value/route-value/record/search/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-get-9962f835ecb38e73',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-post-443ff9adb3d2b64f.over.core-http-put-443ff9adb3d2b64f',
    reason:
      'Preserve webservice/RecordController.create before webservice/RecordController.updateMeta at /route-value/route-value/api/records/metadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-443ff9adb3d2b64f',
    over: 'core-http-put-443ff9adb3d2b64f',
  },
  {
    name: 'legacy.core-http-post-443ff9adb3d2b64f.over.core-http-delete-443ff9adb3d2b64f',
    reason:
      'Preserve webservice/RecordController.create before webservice/RecordController.deleteRecord at /route-value/route-value/api/records/metadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-443ff9adb3d2b64f',
    over: 'core-http-delete-443ff9adb3d2b64f',
  },
  {
    name: 'legacy.core-http-put-443ff9adb3d2b64f.over.core-http-delete-443ff9adb3d2b64f',
    reason:
      'Preserve webservice/RecordController.updateMeta before webservice/RecordController.deleteRecord at /route-value/route-value/api/records/metadata/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-443ff9adb3d2b64f',
    over: 'core-http-delete-443ff9adb3d2b64f',
  },
  {
    name: 'legacy.core-http-put-c271e2590a98e8e8.over.core-http-delete-c271e2590a98e8e8',
    reason:
      'Preserve webservice/RecordController.restoreRecord before webservice/RecordController.destroyDeletedRecord at /route-value/route-value/api/deletedrecords/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-c271e2590a98e8e8',
    over: 'core-http-delete-c271e2590a98e8e8',
  },
  {
    name: 'legacy.core-http-post-fe4cd2c0911426be.over.core-http-delete-fe4cd2c0911426be',
    reason:
      'Preserve webservice/RecordController.addUserEdit before webservice/RecordController.removeUserEdit at /route-value/route-value/api/records/permissions/edit/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-fe4cd2c0911426be',
    over: 'core-http-delete-fe4cd2c0911426be',
  },
  {
    name: 'legacy.core-http-post-5b7d392f1f5bf7c4.over.core-http-delete-5b7d392f1f5bf7c4',
    reason:
      'Preserve webservice/RecordController.addUserView before webservice/RecordController.removeUserView at /route-value/route-value/api/records/permissions/view/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-5b7d392f1f5bf7c4',
    over: 'core-http-delete-5b7d392f1f5bf7c4',
  },
  {
    name: 'legacy.core-http-post-14efaf16539a724f.over.core-http-delete-14efaf16539a724f',
    reason:
      'Preserve webservice/RecordController.addRoleEdit before webservice/RecordController.removeRoleEdit at /route-value/route-value/api/records/permissions/editRole/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-14efaf16539a724f',
    over: 'core-http-delete-14efaf16539a724f',
  },
  {
    name: 'legacy.core-http-post-c3b6ff9cd56a8723.over.core-http-delete-c3b6ff9cd56a8723',
    reason:
      'Preserve webservice/RecordController.addRoleView before webservice/RecordController.removeRoleView at /route-value/route-value/api/records/permissions/viewRole/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-c3b6ff9cd56a8723',
    over: 'core-http-delete-c3b6ff9cd56a8723',
  },
  {
    name: 'legacy.core-http-post-dc2d42f6974a4502.over.core-http-put-dc2d42f6974a4502',
    reason:
      'Preserve RecordController.create before RecordController.update at /route-value/route-value/recordmeta/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-dc2d42f6974a4502',
    over: 'core-http-put-dc2d42f6974a4502',
  },
  {
    name: 'legacy.core-http-post-dc2d42f6974a4502.over.core-http-get-16c9edd7443be1e6',
    reason:
      'Preserve RecordController.create before BrandingController.renderFont at /fonts/branding/recordmeta/route-value.woff2, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-dc2d42f6974a4502',
    over: 'core-http-get-16c9edd7443be1e6',
  },
  {
    name: 'legacy.core-http-put-dc2d42f6974a4502.over.core-http-get-16c9edd7443be1e6',
    reason:
      'Preserve RecordController.update before BrandingController.renderFont at /fonts/branding/recordmeta/route-value.woff2, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-dc2d42f6974a4502',
    over: 'core-http-get-16c9edd7443be1e6',
  },
  {
    name: 'legacy.core-http-delete-008a49641729ad5d.over.core-http-put-008a49641729ad5d',
    reason:
      'Preserve RecordController.delete before RecordController.restoreRecord at /route-value/route-value/record/delete/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-008a49641729ad5d',
    over: 'core-http-put-008a49641729ad5d',
  },
  {
    name: 'legacy.core-http-delete-008a49641729ad5d.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.delete before RecordController.getAttachments at /route-value/route-value/record/delete/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-008a49641729ad5d',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-delete-008a49641729ad5d.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.delete before RecordController.getDataStream at /route-value/route-value/record/delete/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-008a49641729ad5d',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-delete-008a49641729ad5d.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.delete ownership of /route-value/route-value/record/delete/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-delete-008a49641729ad5d',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-put-008a49641729ad5d.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.restoreRecord before RecordController.getAttachments at /route-value/route-value/record/delete/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-008a49641729ad5d',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-put-008a49641729ad5d.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.restoreRecord before RecordController.getDataStream at /route-value/route-value/record/delete/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-008a49641729ad5d',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-put-008a49641729ad5d.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.restoreRecord ownership of /route-value/route-value/record/delete/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-put-008a49641729ad5d',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-delete-21eb5a614e0c71c9.over.core-http-get-ffc5ffbc62e80609',
    reason:
      'Preserve RecordController.destroyDeletedRecord before RecordController.getAttachments at /route-value/route-value/record/destroy/attachments, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-21eb5a614e0c71c9',
    over: 'core-http-get-ffc5ffbc62e80609',
  },
  {
    name: 'legacy.core-http-delete-21eb5a614e0c71c9.over.core-http-get-5d3b7784a7c762b2',
    reason:
      'Preserve RecordController.destroyDeletedRecord before RecordController.getDataStream at /route-value/route-value/record/destroy/datastreamroute-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-21eb5a614e0c71c9',
    over: 'core-http-get-5d3b7784a7c762b2',
  },
  {
    name: 'legacy.core-http-delete-21eb5a614e0c71c9.over.core-http-all-b3e034502bd4469d',
    reason:
      'Preserve RecordController.destroyDeletedRecord ownership of /route-value/route-value/record/destroy/attach from the existing mount order, including its access, CSRF and input contract before RecordController.doAttachment.',
    winner: 'core-http-delete-21eb5a614e0c71c9',
    over: 'core-http-all-b3e034502bd4469d',
  },
  {
    name: 'legacy.core-http-put-accf9c522fbb5a0e.over.core-http-post-accf9c522fbb5a0e',
    reason:
      'Preserve webservice/UserManagementController.createUser before webservice/UserManagementController.updateUser at /route-value/route-value/api/users, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-accf9c522fbb5a0e',
    over: 'core-http-post-accf9c522fbb5a0e',
  },
  {
    name: 'legacy.core-http-put-accf9c522fbb5a0e.over.core-http-get-accf9c522fbb5a0e',
    reason:
      'Preserve webservice/UserManagementController.createUser before webservice/UserManagementController.listUsers at /route-value/route-value/api/users, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-accf9c522fbb5a0e',
    over: 'core-http-get-accf9c522fbb5a0e',
  },
  {
    name: 'legacy.core-http-post-accf9c522fbb5a0e.over.core-http-get-accf9c522fbb5a0e',
    reason:
      'Preserve webservice/UserManagementController.updateUser before webservice/UserManagementController.listUsers at /route-value/route-value/api/users, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-accf9c522fbb5a0e',
    over: 'core-http-get-accf9c522fbb5a0e',
  },
  {
    name: 'legacy.core-http-put-05e02b6148364ea0.over.core-http-delete-05e02b6148364ea0',
    reason:
      'Preserve webservice/NamedQueryController.updateQuery before webservice/NamedQueryController.deleteQuery at /route-value/route-value/api/named-query/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-05e02b6148364ea0',
    over: 'core-http-delete-05e02b6148364ea0',
  },
  {
    name: 'legacy.core-http-put-c1ed1483946207a0.over.core-http-delete-c1ed1483946207a0',
    reason:
      'Preserve webservice/ReportController.updateConfig before webservice/ReportController.deleteConfig at /route-value/route-value/api/report-config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-c1ed1483946207a0',
    over: 'core-http-delete-c1ed1483946207a0',
  },
  {
    name: 'legacy.core-http-put-16b35f68b1eaa5ec.over.core-http-delete-16b35f68b1eaa5ec',
    reason:
      'Preserve ReportController.updateConfig before ReportController.deleteConfig at /route-value/route-value/admin/report-config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-16b35f68b1eaa5ec',
    over: 'core-http-delete-16b35f68b1eaa5ec',
  },
  {
    name: 'legacy.core-http-post-d1c36ba7362c8502.over.core-http-get-391dced803731e25',
    reason:
      'Preserve webservice/VocabularyController.import before webservice/VocabularyController.get at /route-value/route-value/api/vocabulary/import, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d1c36ba7362c8502',
    over: 'core-http-get-391dced803731e25',
  },
  {
    name: 'legacy.core-http-post-d1c36ba7362c8502.over.core-http-put-391dced803731e25',
    reason:
      'Preserve webservice/VocabularyController.import before webservice/VocabularyController.update at /route-value/route-value/api/vocabulary/import, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d1c36ba7362c8502',
    over: 'core-http-put-391dced803731e25',
  },
  {
    name: 'legacy.core-http-post-d1c36ba7362c8502.over.core-http-delete-391dced803731e25',
    reason:
      'Preserve webservice/VocabularyController.import before webservice/VocabularyController.delete at /route-value/route-value/api/vocabulary/import, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d1c36ba7362c8502',
    over: 'core-http-delete-391dced803731e25',
  },
  {
    name: 'legacy.core-http-post-155e06dea806e9f3.over.core-http-get-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.import before VocabularyController.get at /route-value/route-value/admin/vocabulary/import, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-155e06dea806e9f3',
    over: 'core-http-get-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-post-155e06dea806e9f3.over.core-http-put-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.import before VocabularyController.update at /route-value/route-value/admin/vocabulary/import, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-155e06dea806e9f3',
    over: 'core-http-put-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-post-155e06dea806e9f3.over.core-http-delete-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.import before VocabularyController.delete at /route-value/route-value/admin/vocabulary/import, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-155e06dea806e9f3',
    over: 'core-http-delete-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-get-667e032062e1a2d5.over.core-http-post-667e032062e1a2d5',
    reason:
      'Preserve webservice/VocabularyController.list before webservice/VocabularyController.create at /route-value/route-value/api/vocabulary, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-667e032062e1a2d5',
    over: 'core-http-post-667e032062e1a2d5',
  },
  {
    name: 'legacy.core-http-get-391dced803731e25.over.core-http-put-391dced803731e25',
    reason:
      'Preserve webservice/VocabularyController.get before webservice/VocabularyController.update at /route-value/route-value/api/vocabulary/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-391dced803731e25',
    over: 'core-http-put-391dced803731e25',
  },
  {
    name: 'legacy.core-http-get-391dced803731e25.over.core-http-delete-391dced803731e25',
    reason:
      'Preserve webservice/VocabularyController.get before webservice/VocabularyController.delete at /route-value/route-value/api/vocabulary/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-391dced803731e25',
    over: 'core-http-delete-391dced803731e25',
  },
  {
    name: 'legacy.core-http-put-391dced803731e25.over.core-http-delete-391dced803731e25',
    reason:
      'Preserve webservice/VocabularyController.update before webservice/VocabularyController.delete at /route-value/route-value/api/vocabulary/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-391dced803731e25',
    over: 'core-http-delete-391dced803731e25',
  },
  {
    name: 'legacy.core-http-get-e7fa213468adecb4.over.core-http-post-e7fa213468adecb4',
    reason:
      'Preserve VocabularyController.list before VocabularyController.create at /route-value/route-value/admin/vocabulary, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-e7fa213468adecb4',
    over: 'core-http-post-e7fa213468adecb4',
  },
  {
    name: 'legacy.core-http-get-6dc92b99c77f2a74.over.core-http-put-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.get before VocabularyController.update at /route-value/route-value/admin/vocabulary/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-6dc92b99c77f2a74',
    over: 'core-http-put-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-get-6dc92b99c77f2a74.over.core-http-delete-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.get before VocabularyController.delete at /route-value/route-value/admin/vocabulary/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-6dc92b99c77f2a74',
    over: 'core-http-delete-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-put-6dc92b99c77f2a74.over.core-http-delete-6dc92b99c77f2a74',
    reason:
      'Preserve VocabularyController.update before VocabularyController.delete at /route-value/route-value/admin/vocabulary/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-6dc92b99c77f2a74',
    over: 'core-http-delete-6dc92b99c77f2a74',
  },
  {
    name: 'legacy.core-http-get-a198ac98aac942ee.over.core-http-get-16c9edd7443be1e6',
    reason:
      'Preserve FormVocabularyController.get ownership of /fonts/branding/vocab/route-value.woff2 from the existing mount order, including its access, CSRF and input contract before BrandingController.renderFont.',
    winner: 'core-http-get-a198ac98aac942ee',
    over: 'core-http-get-16c9edd7443be1e6',
  },
  {
    name: 'legacy.core-http-post-4c34f907a3792e12.over.core-http-get-4c34f907a3792e12',
    reason:
      'Preserve webservice/AdminController.setAppConfig before webservice/AdminController.getAppConfig at /route-value/route-value/api/admin/config/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-4c34f907a3792e12',
    over: 'core-http-get-4c34f907a3792e12',
  },
  {
    name: 'legacy.core-http-delete-dae070910832881e.over.core-http-put-dae070910832881e',
    reason:
      'Preserve webservice/BrandingController.deleteFace before webservice/BrandingController.uploadFace at /route-value/route-value/api/branding/draft/typeface/faces/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-dae070910832881e',
    over: 'core-http-put-dae070910832881e',
  },
  {
    name: 'legacy.core-http-delete-6d783b0684788f65.over.core-http-put-6d783b0684788f65',
    reason:
      'Preserve BrandingAppController.deleteFace before BrandingAppController.uploadFace at /route-value/route-value/app/branding/draft/typeface/faces/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-6d783b0684788f65',
    over: 'core-http-put-6d783b0684788f65',
  },
  {
    name: 'legacy.core-http-get-69c84656aeb2c939.over.core-http-post-69c84656aeb2c939',
    reason:
      'Preserve webservice/FigshareCrosswalkController.list before webservice/FigshareCrosswalkController.create at /route-value/route-value/api/figshare-crosswalks, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-69c84656aeb2c939',
    over: 'core-http-post-69c84656aeb2c939',
  },
  {
    name: 'legacy.core-http-get-30dbafbf49acf7b9.over.core-http-put-30dbafbf49acf7b9',
    reason:
      'Preserve webservice/FigshareCrosswalkController.listMappings before webservice/FigshareCrosswalkController.saveMappings at /route-value/route-value/api/figshare-crosswalks/route-value/mappings, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-30dbafbf49acf7b9',
    over: 'core-http-put-30dbafbf49acf7b9',
  },
  {
    name: 'legacy.core-http-get-f7879cfbd43cdfb5.over.core-http-delete-f7879cfbd43cdfb5',
    reason:
      'Preserve webservice/FigshareCrosswalkController.get before webservice/FigshareCrosswalkController.delete at /route-value/route-value/api/figshare-crosswalks/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-f7879cfbd43cdfb5',
    over: 'core-http-delete-f7879cfbd43cdfb5',
  },
  {
    name: 'legacy.core-http-post-d0cf64689a6efd73.over.core-http-get-16c9edd7443be1e6',
    reason:
      'Preserve ActionController.callService before BrandingController.renderFont at /fonts/branding/action/route-value.woff2, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-d0cf64689a6efd73',
    over: 'core-http-get-16c9edd7443be1e6',
  },
  {
    name: 'legacy.core-http-post-82f94b3966e67137.over.core-http-get-82f94b3966e67137',
    reason:
      'Preserve webservice/RecordController.addDataStreams before webservice/RecordController.listDatastreams at /route-value/route-value/api/records/datastreams/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-82f94b3966e67137',
    over: 'core-http-get-82f94b3966e67137',
  },
  {
    name: 'legacy.core-http-post-3933244eb49cfdbb.over.core-http-put-3933244eb49cfdbb',
    reason:
      'Preserve AsynchController.start before AsynchController.update at /route-value/route-value/asynch, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-3933244eb49cfdbb',
    over: 'core-http-put-3933244eb49cfdbb',
  },
  {
    name: 'legacy.core-http-post-3933244eb49cfdbb.over.core-http-delete-3933244eb49cfdbb',
    reason:
      'Preserve AsynchController.start before AsynchController.stop at /route-value/route-value/asynch, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-3933244eb49cfdbb',
    over: 'core-http-delete-3933244eb49cfdbb',
  },
  {
    name: 'legacy.core-http-post-3933244eb49cfdbb.over.core-http-get-3933244eb49cfdbb',
    reason:
      'Preserve AsynchController.start before AsynchController.progress at /route-value/route-value/asynch, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-post-3933244eb49cfdbb',
    over: 'core-http-get-3933244eb49cfdbb',
  },
  {
    name: 'legacy.core-http-put-3933244eb49cfdbb.over.core-http-delete-3933244eb49cfdbb',
    reason:
      'Preserve AsynchController.update before AsynchController.stop at /route-value/route-value/asynch, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-3933244eb49cfdbb',
    over: 'core-http-delete-3933244eb49cfdbb',
  },
  {
    name: 'legacy.core-http-put-3933244eb49cfdbb.over.core-http-get-3933244eb49cfdbb',
    reason:
      'Preserve AsynchController.update before AsynchController.progress at /route-value/route-value/asynch, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-put-3933244eb49cfdbb',
    over: 'core-http-get-3933244eb49cfdbb',
  },
  {
    name: 'legacy.core-http-delete-3933244eb49cfdbb.over.core-http-get-3933244eb49cfdbb',
    reason:
      'Preserve AsynchController.stop before AsynchController.progress at /route-value/route-value/asynch, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-delete-3933244eb49cfdbb',
    over: 'core-http-get-3933244eb49cfdbb',
  },
  {
    name: 'legacy.core-http-get-49fc948e23e3f9f4.over.core-http-delete-49fc948e23e3f9f4',
    reason:
      'Preserve AsynchController.subscribe before AsynchController.unsubscribe at /route-value/route-value/asynch/subscribe/route-value, including Express capture decoding before method checks; each declaration retains its own supported methods and input contract.',
    winner: 'core-http-get-49fc948e23e3f9f4',
    over: 'core-http-delete-49fc948e23e3f9f4',
  },
  {
    name: 'legacy.core-http-get-16c9edd7443be1e6.over.core-http-get-718cddecf2cc3caa',
    reason:
      'Preserve BrandingController.renderFont ownership of /fonts/branding/dynamic/route-value.woff2 from the existing mount order, including its access, CSRF and input contract before DynamicAssetController.get.',
    winner: 'core-http-get-16c9edd7443be1e6',
    over: 'core-http-get-718cddecf2cc3caa',
  },
];
