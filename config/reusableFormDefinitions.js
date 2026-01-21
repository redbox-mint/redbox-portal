"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Re-usable, server-side only, component templates.
 * Used as defaults for properties not defined.
 *
 * The 'name' property for these templates can be used as the value
 * in the 'templateName' property in form component definitions.
 *
 * Think about how this could work if clients are allowed to define templates and store in db...
 */
const reusableDefinitions = {
    // definition of a reusable form config - standard component definitions
    // The standard people field
    "standard-contributor-field": [
        {
            name: "name",
            component: { class: "SimpleInputComponent", config: { type: "text" } }
        },
        {
            name: "email",
            component: { class: "SimpleInputComponent", config: { type: "text" } }
        },
        {
            name: "orcid",
            component: {
                class: "GroupComponent",
                config: {
                    componentDefinitions: [
                        {
                            name: "example1",
                            component: { class: "SimpleInputComponent", config: { type: "text" } },
                        }
                    ]
                }
            }
        },
    ],
    // TODO: The standard people fields - ci, data manager, supervisor, contributor.
    // definition of a reusable form config that refers to another reusable form config
    // the component definition can be either a standard component def or the 'reusableName' format
    "standard-people-fields": [
        {
            // this element in the array is replaced by the 3 items in the "standard-contributor-field" array
            overrides: { reusableFormName: "standard-contributor-field" },
            // Name does not matter, this array element will be replaced
            name: "",
            component: {
                class: "ReusableComponent",
                config: {
                    componentDefinitions: [
                        {
                            // for the item in the array that matches the match name, change the name to replace
                            // merge all other properties, preferring the definitions here
                            overrides: { replaceName: "contributor_ci_name" },
                            name: "name",
                            component: { class: "ContentComponent", config: {} },
                        },
                        {
                            // refer to the item without changing it
                            // this is useful for referring to an item that has nested components that will be changed
                            name: "orcid",
                            component: {
                                class: "GroupComponent",
                                config: {
                                    componentDefinitions: [
                                        {
                                            overrides: { replaceName: "orcid_nested_example1" },
                                            name: "example1",
                                            component: { class: "ContentComponent", config: {} },
                                        }
                                    ]
                                }
                            }
                        }
                        // the 'email' item in the reusable definition array is copied with no changes
                    ]
                }
            },
        },
        {
            // this element is used as-is
            name: "contributor_data_manager",
            component: { class: "SimpleInputComponent", config: { type: "text" } }
        }
    ],
    // TODO: The standard project info fields: title, description, keywords, SEO codes, FOR codes
    "standard-project-info-fields": [],
};
module.exports.reusableFormDefinitions = reusableDefinitions;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV1c2FibGVGb3JtRGVmaW5pdGlvbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2NvbmZpZy9yZXVzYWJsZUZvcm1EZWZpbml0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxtQkFBbUIsR0FBNEI7SUFDakQsd0VBQXdFO0lBQ3hFLDRCQUE0QjtJQUM1Qiw0QkFBNEIsRUFBRTtRQUMxQjtZQUNJLElBQUksRUFBRSxNQUFNO1lBQ1osU0FBUyxFQUFFLEVBQUMsS0FBSyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sRUFBRSxFQUFDLElBQUksRUFBRSxNQUFNLEVBQUMsRUFBQztTQUNyRTtRQUNEO1lBQ0ksSUFBSSxFQUFFLE9BQU87WUFDYixTQUFTLEVBQUUsRUFBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxFQUFFLEVBQUMsSUFBSSxFQUFFLE1BQU0sRUFBQyxFQUFDO1NBQ3JFO1FBQ0Q7WUFDSSxJQUFJLEVBQUUsT0FBTztZQUNiLFNBQVMsRUFBRTtnQkFDUCxLQUFLLEVBQUUsZ0JBQWdCO2dCQUN2QixNQUFNLEVBQUU7b0JBQ0osb0JBQW9CLEVBQUU7d0JBQ2xCOzRCQUNJLElBQUksRUFBRSxVQUFVOzRCQUNoQixTQUFTLEVBQUUsRUFBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxFQUFFLEVBQUMsSUFBSSxFQUFFLE1BQU0sRUFBQyxFQUFDO3lCQUNyRTtxQkFDSjtpQkFDSjthQUNKO1NBQ0o7S0FDSjtJQUNELGdGQUFnRjtJQUNoRixtRkFBbUY7SUFDbkYsK0ZBQStGO0lBQy9GLHdCQUF3QixFQUFFO1FBQ3RCO1lBQ0ksaUdBQWlHO1lBQ2pHLFNBQVMsRUFBRSxFQUFDLGdCQUFnQixFQUFFLDRCQUE0QixFQUFDO1lBQzNELDREQUE0RDtZQUM1RCxJQUFJLEVBQUUsRUFBRTtZQUNSLFNBQVMsRUFBRTtnQkFDUCxLQUFLLEVBQUUsbUJBQW1CO2dCQUMxQixNQUFNLEVBQUU7b0JBQ0osb0JBQW9CLEVBQUU7d0JBQ2xCOzRCQUNJLG9GQUFvRjs0QkFDcEYsOERBQThEOzRCQUM5RCxTQUFTLEVBQUUsRUFBQyxXQUFXLEVBQUUscUJBQXFCLEVBQUM7NEJBQy9DLElBQUksRUFBRSxNQUFNOzRCQUNaLFNBQVMsRUFBRSxFQUFDLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFDO3lCQUNyRDt3QkFDRDs0QkFDSSx3Q0FBd0M7NEJBQ3hDLDBGQUEwRjs0QkFDMUYsSUFBSSxFQUFFLE9BQU87NEJBQ2IsU0FBUyxFQUFFO2dDQUNQLEtBQUssRUFBRSxnQkFBZ0I7Z0NBQ3ZCLE1BQU0sRUFBRTtvQ0FDSixvQkFBb0IsRUFBRTt3Q0FDbEI7NENBQ0ksU0FBUyxFQUFFLEVBQUMsV0FBVyxFQUFFLHVCQUF1QixFQUFDOzRDQUNqRCxJQUFJLEVBQUUsVUFBVTs0Q0FDaEIsU0FBUyxFQUFFLEVBQUMsS0FBSyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUM7eUNBQ3JEO3FDQUNKO2lDQUNKOzZCQUNKO3lCQUNKO3dCQUNELDhFQUE4RTtxQkFDakY7aUJBQ0o7YUFDSjtTQUNKO1FBQ0Q7WUFDSSw2QkFBNkI7WUFDN0IsSUFBSSxFQUFFLDBCQUEwQjtZQUNoQyxTQUFTLEVBQUUsRUFBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxFQUFFLEVBQUMsSUFBSSxFQUFFLE1BQU0sRUFBQyxFQUFDO1NBQ3JFO0tBQ0o7SUFDRCw2RkFBNkY7SUFDN0YsOEJBQThCLEVBQUUsRUFBRTtDQUNyQyxDQUFDO0FBQ0YsTUFBTSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsR0FBRyxtQkFBbUIsQ0FBQyJ9