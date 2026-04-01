// Copyright (c) 2025 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

/**
 * Declarative "generated-view-only" form config for the new form framework.
 *
 * This replaces the legacy `generateFormFromSchema` runtime generation in FormsService.
 * The heading and action row follow the same v5 pattern used by the JCU form configs:
 * a hidden model-backed field for values we want in `formData`, plus ContentComponents
 * that render from `formData` and runtime route context.
 */
const formConfig: FormConfigFrame = {
  name: 'generated-view-only',
  editCssClasses: 'row col-md-12',
  viewCssClasses: 'row col-md-offset-1 col-md-10',
  attachmentFields: [],
  componentDefinitions: [
    {
      name: 'generated_view_only_title',
      constraints: {
        authorization: {
          allowRoles: [],
        },
        allowModes: ['view'],
      },
      component: {
        class: 'ContentComponent',
        config: {
          label: 'title',
          content: 'title',
          template: '<h1 class="rb-view-title">{{get formData content ""}}</h1>',
        },
      },
    },
    {
      name: 'title',
      constraints: {
        authorization: {
          allowRoles: [],
        },
        allowModes: ['view'],
      },
      component: {
        class: 'SimpleInputComponent',
        config: {
          label: 'title',
          visible: false,
          type: 'hidden',
        },
      },
      model: {
        class: 'SimpleInputModel',
        config: {
          validators: [],
        },
      },
    },
    {
      name: 'generated_view_only_action_bar',
      component: {
        class: 'GroupComponent',
        config: {
          componentDefinitions: [
            {
              name: 'generated_view_only_view_audit',
              constraints: {
                authorization: {
                  allowRoles: ['Admin', 'Librarians'],
                },
                allowModes: ['view'],
              },
              component: {
                class: 'ContentComponent',
                config: {
                  content: {
                    cssClasses: 'btn btn-info',
                    label: 'View Audit Records',
                  },
                  template: '<a href="{{concat \"/\" branding \"/\" portal \"/record/viewAudit/\" oid}}" class="{{content.cssClasses}}">{{content.label}}</a>',
                },
              },
              layout: {
                class: 'InlineLayout',
                config: {},
              },
            },
            {
              name: 'generated_view_only_delete_record',
              constraints: {
                authorization: {
                  allowRoles: ['Admin', 'Librarians'],
                },
                allowModes: ['view'],
              },
              component: {
                class: 'ContentComponent',
                config: {
                  content: {
                    cssClasses: 'btn btn-danger',
                    label: 'Delete Record',
                  },
                  template: '<a href="{{concat \"/\" branding \"/\" portal \"/record/delete/\" oid}}" class="{{content.cssClasses}}" data-confirm="Are you sure you want to delete this record? This action cannot be undone.">{{content.label}}</a>',
                },
              },
              layout: {
                class: 'InlineLayout',
                config: {},
              },
            },
          ],
        },
      },
      model: {
        class: 'GroupModel',
        config: {
          validators: [],
        },
      },
      layout: {
        class: 'ActionRowLayout',
        config: {
          alignment: 'start',
          hostCssClasses: 'rb-form-action-row-layout',
          containerCssClass: 'rb-form-action-row rb-form-action-row--legacy-inline',
          wrap: true,
          slotCssClass: 'rb-form-action-slot',
          compact: true,
        },
      },
      constraints: {
        allowModes: ['view'],
        authorization: {
          allowRoles: ['Admin', 'Librarians'],
        },
      },
    },

    {
      name: 'generated_view_only_metadata',
      overrides: {
        reusableFormName: 'generated-view-only-metadata-display',
      },
      component: {
        class: 'ReusableComponent',
        config: {
          componentDefinitions: [],
        },
      },
    },
  ],
};

export default formConfig;
