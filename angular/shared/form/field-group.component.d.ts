import { EmbeddableComponent, RepeatableComponent } from './field-repeatable.component';
/**
#### Generic Group Component

Generic component for grouping components together. The resulting JSON will have the field names as keys.

```
{
   class: 'Container',
   compClass: 'GenericGroupComponent',
   definition: {
     name: "related_website",
     cssClasses: "form-inline",
     fields: [
       {
         class: 'TextField',
         editOnly: true,
         definition: {
           name: 'related_url',
           label: '@dmpt-related-website-url',
           type: 'text',
           required: true,
           groupName: 'related_website',
           groupClasses: 'width-30',
           cssClasses : "width-80 form-control"
         }
       },
       {
         class: 'TextField',
         editOnly: true,
         definition: {
           name: 'related_title',
           label: '@dmpt-related-website-title',
           type: 'text',
           required: true,
           groupName: 'related_website',
           groupClasses: 'width-30',
           cssClasses : "width-80 form-control"
         }
       },
       {
         class: 'TextField',
         editOnly: true,
         definition: {
           name: 'related_notes',
           label: '@dmpt-related-website-notes',
           type: 'text',
           required: true,
           groupName: 'related_website',
           groupClasses: 'width-30',
           cssClasses : "width-80 form-control"
         }
       }
     ]
   }
 }
```
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
export declare class GenericGroupComponent extends EmbeddableComponent {
}
/**
 * ### Repeatable Generic Component
 *
 *
 * ```
 * {
   class: 'RepeatableContainer',
   compClass: 'RepeatableGroupComponent',
   definition: {
     name: "related_websites",
     label: "@dmpt-related-website",
     help: "@dmpt-related-website-help",
     forceClone: ['fields', 'fieldMap'],
     fields: [
       {
         class: 'Container',
         compClass: 'GenericGroupComponent',
         definition: {
           name: "related_website",
           cssClasses: "form-inline",
           fields: [
             {
               class: 'TextField',
               editOnly: true,
               definition: {
                 name: 'related_url',
                 label: '@dmpt-related-website-url',
                 type: 'text',
                 required: true,
                 groupName: 'related_website',
                 groupClasses: 'width-30',
                 cssClasses : "width-80 form-control"
               }
             },
             {
               class: 'TextField',
               editOnly: true,
               definition: {
                 name: 'related_title',
                 label: '@dmpt-related-website-title',
                 type: 'text',
                 required: true,
                 groupName: 'related_website',
                 groupClasses: 'width-30',
                 cssClasses : "width-80 form-control"
               }
             },
             {
               class: 'TextField',
               editOnly: true,
               definition: {
                 name: 'related_notes',
                 label: '@dmpt-related-website-notes',
                 type: 'text',
                 required: true,
                 groupName: 'related_website',
                 groupClasses: 'width-30',
                 cssClasses : "width-80 form-control"
               }
             }
           ]
         }
       }
     ]
   }
 }
 ```
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
export declare class RepeatableGroupComponent extends RepeatableComponent {
}
