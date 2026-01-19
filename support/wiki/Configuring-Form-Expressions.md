# Configuring Form Expressions

## Introduction

ReDBox provides a powerful expression system that enables dynamic form behavior based on field value changes and form state. Expressions allow form components to react to changes in other components, enabling features such as:

- Updating a field's value when another field changes
- Showing or hiding fields based on conditions
- Validating fields based on the values of other fields
- Complex cross-field interactions using JSONata queries

## Architecture Overview

The expression system is built on a publish-subscribe (pub/sub) architecture:

1. **Event Bus**: A centralized service (`FormComponentEventBus`) that routes events between components
2. **Event Producers**: Components that emit events when their state changes (e.g., value changes)
3. **Event Consumers**: Components that listen for events and execute expressions when conditions are met
4. **Expressions**: Configuration that defines what action to take when a condition is satisfied

### Event Types

For supported events, see [Form Event Bus Architecture](Form-Event-Bus-Architecture.md)

## Configuring Expressions

Expressions are configured within a form component's definition using the `expressions` array property.

### Expression Structure

```javascript
{
    name: 'text_field',
    model: {
        class: 'SimpleInputModel',
        config: { defaultValue: '' }
    },
    component: {
        class: 'SimpleInputComponent'
    },
    expressions: [
        {
            name: "uniqueExpressionName",
            description: "Optional description of what this expression does",
            config: {
                condition: "/path/to/source/field::field.value.changed",
                conditionKind: "jsonpointer",
                template: `value & "_suffix"`,
                target: "model.value",
                runOnFormReady: true
            }
        }
    ]
}
```

### Expression Configuration Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | A unique name for the expression within the component |
| `description` | string | No | A human-readable description of the expression's purpose |
| `config.condition` | string | No | The condition that must be true for the expression to execute. If omitted, the expression always executes on matching events |
| `config.conditionKind` | string | No | The type of condition: `jsonpointer`, `jsonata`, or `jsonata_query`. Defaults to `jsonpointer` |
| `config.template` | string | Yes* | A JSONata expression that produces the result value. *Required unless `operation` is specified |
| `config.operation` | string | Yes* | The name of a predefined operation to execute. *Required unless `template` is specified |
| `config.target` | string | No | Where to store the expression result. See [Target Properties](#target-properties) |
| `config.runOnFormReady` | boolean | No | Whether to run this expression when the form initially loads. Defaults to `true` |

## Condition Types

### JSONPointer Conditions (`jsonpointer`)

JSONPointer conditions use a path-based syntax to reference source fields and optionally specify which event type to listen for.

**Syntax**: `/path/to/field::event.type`

- The path is a JSON Pointer to the source field, starting from the form root
- The event type (after `::`) is optional; defaults to `*` (all events)

**Examples**:

```javascript
// Listen to value changes on a specific field
condition: "/main_tab/tab_1/text_field::field.value.changed"

// Listen to any event from a field (using implicit wildcard)
condition: "/main_tab/tab_1/text_field"

// Explicit wildcard for all events
condition: "/main_tab/tab_1/text_field::*"
```

**How it works**:
- JSONPointer conditions are matched against the event's `fieldId` and `sourceId` properties
- Broadcast events (with `sourceId: '*'`) will match if the condition's path appears in the event's `fieldId`
- Scoped events will match if the condition's path exactly matches the `sourceId`

### JSONata Conditions (`jsonata`)

JSONata conditions use the [JSONata](https://jsonata.org/) query language to evaluate complex conditions based on form data.

**Syntax**: A JSONata expression that evaluates to a truthy value when the condition should match.

**Available Context Variables**:
- `value` - The current value of the target field
- `event` - The event object that triggered the evaluation
- `formData` - The complete form data object

**Example**:

```javascript
// Execute only when the source field contains "jsonata" (case-insensitive)
{
    name: "conditionalUpdate",
    config: {
        conditionKind: "jsonata",
        condition: `$contains($lowercase(formData.source_field), "jsonata")`,
        template: `formData.target_field & "_modified"`,
        target: "model.value"
    }
}
```

**How it works**:
- JSONata conditions only evaluate on broadcast events (events with `sourceId: '*'`) or when the form is ready
- The condition expression is pre-compiled on the server for performance and CSP compliance
- The expression must return a truthy value for the expression to execute

### JSONata Query Conditions (`jsonata_query`)

JSONata Query conditions extend JSONata conditions with access to the form's component structure, enabling conditions based on the form's hierarchy and metadata.

**Additional Context Variables**:
- All JSONata variables plus:
- `querySource` - The form's component definition tree, allowing queries like counting repeatable elements

**Example**:

```javascript
// Execute when a repeatable has 2 or more items
{
    name: "repeatableCountCondition",
    config: {
        conditionKind: "jsonata_query",
        condition: `$count(**[name="repeatable_field"].children) >= 2`,
        template: `formData.text_field & "_hasMultipleItems"`,
        target: "model.value"
    }
}
```

**How it works**:
- The `querySource` is automatically updated when the form structure changes (e.g., when repeatable items are added or removed)
- Allows complex queries over the form's component tree structure
- The `**` operator in JSONata performs a recursive descent through the tree

## Template Expressions

Templates define the transformation to apply when an expression's condition is satisfied. Templates use JSONata syntax.

### Available Context Variables

| Variable | Description |
|----------|-------------|
| `value` | The current value of the field that triggered the event |
| `event` | The complete event object with `type`, `fieldId`, `previousValue`, etc. |
| `formData` | The complete form data object with all field values |

### Template Examples

```javascript
// Append a suffix to the source value
template: `value & "_suffix"`

// Use the previous value if current is empty
template: `value ? value : event.previousValue`

// Combine multiple form fields
template: `formData.first_name & " " & formData.last_name`

// Conditional transformation
template: `value > 100 ? "High" : "Low"`

// Math operations
template: `formData.quantity * formData.unit_price`
```

## Target Properties

The `target` property specifies where to store the expression result.

| Target | Description |
|--------|-------------|
| `model.value` | Sets the field's form control value |
| `layout.visible` | Controls field visibility (boolean) |
| `layout.*` | Sets any property on the layout configuration |
| `component.*` | Sets any property on the component configuration |

### Examples

```javascript
// Update the field's value
target: "model.value"

// Control visibility
target: "layout.visible"

// Set a custom layout property
target: "layout.cssClasses"

// Set a component configuration property
target: "component.disabled"
```

## Complete Examples

### Example 1: Field Value Mirroring

Mirror the value of one field to another with a transformation:

```javascript
{
    name: 'target_field',
    model: { class: 'SimpleInputModel' },
    component: { class: 'SimpleInputComponent' },
    expressions: [
        {
            name: "mirrorSourceField",
            config: {
                conditionKind: "jsonpointer",
                condition: "/form_tab/source_field::field.value.changed",
                template: `$uppercase(value)`,
                target: "model.value"
            }
        }
    ]
}
```

### Example 2: Conditional Visibility

Show or hide a field based on another field's value:

```javascript
{
    name: 'conditional_field',
    layout: {
        class: 'DefaultLayout',
        config: { visible: false }
    },
    model: { class: 'SimpleInputModel' },
    component: { class: 'SimpleInputComponent' },
    expressions: [
        {
            name: "toggleVisibility",
            config: {
                conditionKind: "jsonpointer",
                condition: "/form_tab/radio_selection::field.value.changed",
                template: `value = "show_details"`,
                target: "layout.visible"
            }
        }
    ]
}
```

### Example 3: Complex JSONata Condition

Update a field only when multiple conditions are met:

```javascript
{
    name: 'calculated_field',
    model: { class: 'SimpleInputModel' },
    component: { class: 'SimpleInputComponent' },
    expressions: [
        {
            name: "complexCalculation",
            config: {
                conditionKind: "jsonata",
                condition: `formData.is_active = true and formData.quantity > 0`,
                template: `formData.quantity * formData.unit_price * (1 - formData.discount / 100)`,
                target: "model.value"
            }
        }
    ]
}
```

### Example 4: Repeatable-Aware Expression

React to changes in repeatable element count:

```javascript
{
    name: 'summary_field',
    model: { class: 'SimpleInputModel' },
    component: { class: 'SimpleInputComponent' },
    expressions: [
        {
            name: "updateOnRepeatableChange",
            config: {
                conditionKind: "jsonata_query",
                condition: `$count(**[name="line_items"].children) > 0`,
                template: `"Total items: " & $string($count(**[name="line_items"].children))`,
                target: "model.value",
                runOnFormReady: true
            }
        }
    ]
}
```

## Best Practices

1. **Use descriptive names**: Give expressions meaningful names that describe their purpose
2. **Prefer JSONPointer for simple cases**: JSONPointer conditions are faster to evaluate than JSONata
3. **Use `runOnFormReady: false` for event-only expressions**: If an expression should only run in response to user actions, disable the initial execution
4. **Test expressions thoroughly**: Complex JSONata expressions should be tested independently before adding to form configuration
5. **Consider performance**: JSONata Query conditions with deep recursive searches can be expensive on large forms
6. **Document complex expressions**: Use the `description` property to explain what complex expressions do

## Troubleshooting

### Expression not executing

1. Verify the `condition` path matches the source field's location in the form hierarchy
2. Check that the source field is actually emitting events (has a model with a form control)
3. Ensure the `conditionKind` matches the condition syntax used
4. Check browser console for expression evaluation errors

### Unexpected values

1. Use browser developer tools to inspect the event data
2. Verify the JSONata template syntax is correct
3. Check that `formData` contains the expected field names

### Performance issues

1. Reduce the use of recursive JSONata Query conditions (`**`)
2. Add specific conditions to prevent unnecessary expression executions
3. Consider using `runOnFormReady: false` where appropriate
