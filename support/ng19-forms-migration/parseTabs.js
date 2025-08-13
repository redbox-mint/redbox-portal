module.exports = function parseTabs(input) {
  const tabContainer = input.fields.find(f => f.class === 'TabOrAccordionContainer');
  const tabFields = tabContainer?.definition?.fields || [];

  return {
    componentDefinitions: [
      {
        name: 'main_tab',
        component: {
          class: 'TabComponent',
          config: {
            mainCssClass: 'd-flex align-items-start',
            buttonSectionCssClass: 'nav flex-column nav-pills me-5',
            tabContentSectionCssClass: 'tab-content',
            tabPaneCssClass: 'tab-pane fade',
            tabPaneActiveCssClass: 'active show',
            tabs: tabFields.map(container => ({
              id: container.definition.id,
              buttonLabel: container.definition.label,
              componentDefinitions: container.definition.fields // placeholder
            }))
          }
        }
      }
    ]
  };
};
