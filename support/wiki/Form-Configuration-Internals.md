# Form configuration

The types, interfaces, and classes in the `config` directory
define the configuration for the form and form components.

The various pieces work together to implement a range of functionality.

## Conventions

There are some conventions to make it easier to distinguish the pieces.

### 'Definition' classes

Classes ending `Definition` establish the metadata (name, class, config type) for the form and its components.
These classes are constructed from the object literal or json data.

### 'Config' classes

Classes ending `Config` establish the field-type-specific config structure of the form and its components.

The one exception to this is the top-level `FormConfig`, which is a special class.

### 'Frame' and 'Outline' interfaces

Interfaces ending with `Frame` are used for providing types for the typescript literal variables.
This can be used to generate JSON schema for validating the JSON structure, both on the client and server side.

The 'Outline' interfaces are to avoid circular import issues. See below for more details.

## Form field validation

The form config includes specifying the validators to apply to each form field.

### Available validators

The available form field validators are defined in `packages/sails-ng-common/src/validation/validators.ts`.
Each one has a name, error message, and function that creates the form validation function.
This approach allows these validators to be used both on the client side with angular components and on the server.

### Form config

In the form config, each component with a `model` can specify an array of validators in the `model.config.validators` property.

It is also possible to specify `validationGroups`, which give a name and description to a group of validators.
Each validator can specify the `groups` it is a member of.

### Client - angular components

Validators in a validation group can be enabled and disabled as a group.

*TODO* How can validators for form fields be enabled and disabled? Options:
- add / remove validators to angular components
- implement validators to be aware of form config (only on client side)

### Server - validator form config visitor

The server side can use a form config visitor to run validators that are in the specified groups.

## How to define a component

There are a few parts that must work together to define a component.

First, create the client-side angular component(s) and optional model and layout(s).
This is the client-side functionality.
There are some dependencies on the functionality shared between the server and client, so this will not work
immediately.

- Define the angular component and tests in `angular/projects/researchdatabox/form/src/app/component`
    - all components must extend `FormFieldBaseComponent`
    - some components have a layout to allow changing the display separately from the functionality of the component,
      such as `DefaultLayoutComponent`
- Some angular components can store and/or modify data from the server. These must have a model that extends
  `FormFieldModel<ValueType>`
    - Angular component models need a `*ValueType` defined in `sails-ng-common` that indicates the type of data the
      component works with
- Add the angular components to the module: `angular/projects/researchdatabox/form/src/app/form.module.ts`
- Add the angular component(s), model, layout(s) to the name to class mapping:
  `angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts`

Next, define the shared server and client form config interfaces and classes.

Create two files in `packages/sails-ng-common/src/config/component`: `[component-name].model.ts` and
`[component-name].outline.ts`.
There is some boilerplate to fill out.
This is needed to enable a range of type checks, server-side processing, and api and docs generation.

- `[component-name].outline.ts`:
    - For each field component / model / layout:
        - Name and name type constant: `*NameType` = typeof `*Name`;
        - Two interfaces for the field config: `Field[Component|Model|Layout]ConfigFrame` and
          `Field[Component|Model|Layout]ConfigOutline`
        - Two interfaces for the field definition: `Field[Component|Model|Layout]DefinitionFrame` and
          `Field[Component|Model|Layout]DefinitionOutline`
    - For each form component:
        - Two interfaces for the form definition: `FormComponentDefinitionFrame` and `FormComponentDefinitionOutline`
    - The mapping of kind to class
- `[component-name].model.ts`
    - For each component / model / layout:
        - Class for the field config: extend `FieldComponentConfig` and implement the `*Field*ConfigOutline`
        - Class for the field definition: extend `FieldComponentDefinition` and implement the `*Field*DefinitionOutline`
    - For each form component:
        - Class for the form definition: extends `FormComponentDefinition` and implement the
          `*FormComponentDefinitionOutline`
    - The mapping of kind to def (and class for the definitions, but not the configs)

Then, 'register' the new component with the server-side processing.

Add the `visit` methods to `FormConfigVisitorOutline` and `FormConfigVisitor`.
This enables the component to be transformed for various purposes.

An implementation is needed for each visitor class.

For example:

```
visit[name]Field[Component|Model|Layout]Definition(item: [name]Field[Component|Model|Layout]DefinitionOutline): void;
visit[name]FormComponentDefinition(item: [name]FormComponentDefinitionOutline): void;
```

Add the mapping constants to the `dictionary.outline.ts` (`AllTypes`) and `dictionary.model.ts` (`AllDefs`) files.

Add the `*.ts` files to `packages/sails-ng-common/src/index.ts`
so the components are exported and available to the server and client.

## Transforming Form Config

The form config needs to be transformed into other structures.
The starting form config is the 'server-side' config -
the structure used by the form config stored in .ts files and in the database.

There are two aspects to this:

1. The outcome: the complete structure that is needed after processing all items.
   This is implemented using the visitor pattern via the `CanVisit` interface for the components,
   and the `FormConfigVisitorOutline` interface and `FormConfigVisitor`
   abstract class for visitors.

2. The aspects of each component, and the component's various pieces of config.
   This is implemented for each form component via the `visit[component_name]` methods in each visitor class.

To create a visitor:

1. Determine the input and how it will be transformed into the output. This is usually the server-side form config.
2. Create a new visitor. Extend either the base `FormConfigVisitor`  to use the
   `currentPath` tree traversal approach.
3. Use the visitor-specific approach to starting the visiting process. This is usually a method on the visitor class,
   such as `start`.

The visitor definition and implementations are in `packages/sails-ng-common/src/config/visitor`.

Further transformations can be done using reusable form config or form mode overrides.

## Expressions: modify the client form by triggering a function

Expressions allow for modifying the client form by triggering a function attached to a component.
The expression system is built on an event-driven architecture using a publish-subscribe pattern.

### Expression Architecture

The expression system consists of several key components:

1. **Event Bus** (`FormComponentEventBus`): A centralized service that routes typed events between components
2. **Event Producers** (`FormComponentValueChangeEventProducer`): Emit events when component state changes
3. **Event Consumers** (`FormComponentValueChangeEventConsumer`): Listen for events and execute expressions
4. **Expression Configuration**: Declarative configuration that defines conditions and transformations

### Event Types

The following event types are supported:

- `field.value.changed` - Published when a field's value changes
- `field.meta.changed` - Published when field metadata changes
- `form.definition.ready` - Published when the form has fully loaded
- `form.definition.changed` - Published when form structure changes (e.g., repeatable items)
- `form.validation.broadcast` - Published on form-wide validation
- `form.save.*` - Save lifecycle events

### Expression Configuration Structure

An expression has these parts:

- `name`: A unique identifier for the expression within the component
- `description`: Optional human-readable description
- `config.condition`: The condition that must be satisfied (JSONPointer, JSONata, or JSONata Query)
- `config.conditionKind`: The type of condition evaluation to use
- `config.template`: A JSONata expression that produces the result
- `config.target`: Where to store the result (`model.value`, `layout.*`, `component.*`)
- `config.runOnFormReady`: Whether to evaluate on form initialization (default: true)

### Condition Kinds

**JSONPointer** (`jsonpointer`): Uses JSON Pointer syntax to reference source fields.
Format: `/path/to/field::event.type`

**JSONata** (`jsonata`): Uses JSONata expressions evaluated against form data.
Context includes: `value`, `event`, `formData`

**JSONata Query** (`jsonata_query`): Extends JSONata with access to the form's component tree.
Enables queries like counting repeatable elements or checking form structure.

### Expression Processing Flow

1. **Server-side compilation**: The `TemplateFormConfigVisitor` extracts and pre-compiles JSONata expressions
2. **Client-side binding**: `FormBaseWrapperComponent` creates producer/consumer instances for each component
3. **Event emission**: When a field value changes, the producer publishes a `field.value.changed` event
4. **Event matching**: Consumers evaluate their conditions against incoming events
5. **Expression execution**: Matching expressions evaluate their templates and apply results to targets

### Query Source

For `jsonata_query` conditions, the `querySource` provides access to the form's component tree.
This is automatically updated when the form structure changes (e.g., repeatable items added/removed).

For user-facing configuration documentation, see [Configuring Form Expressions](Configuring-Form-Expressions).

For detailed technical documentation of the event bus implementation, see [Form Event Bus Architecture](Form-Event-Bus-Architecture).

## Constraints: restrict when components are included in the form config

Constraints define prerequisites for a component to be included in the form definition.

### authorization

The current user must fulfill the authorization constraints.

#### allowRoles

The current user must have at least one of these roles for the form field to be included.

### allowModes

This form field is included when the displayed form is in one of these modes.
If this is not specified, the form field will be included in all modes.

## Overrides: modify and extend existing form config

Form config can be extended, replaced, and transformed based on form-wide conditions.

### reusableFormName

Insert a pre-defined reusable form config referenced by name.

- Reusable form config is the same format as the standard form config.
- Individual items in the reusable form config can be further transformed.
- The replacement is done before any other changes, so that subsequent changes are performed on the evaluated form
  config.
- After processing, the form config will have no indication that it was built from a reusable form config.

### replaceName

Replace the form component name of an inserted reusable form config.

### formModeClasses

Transform a component, model, and/or layout class into another class.

- This is useful for using different form components in different form modes.
- The transformation is defined in code and cannot be modified.
  Use reusable form config to make changes before transforming the class.

All the available and default transforms are implemented in the `FormOverride` class in `packages/sails-ng-common/src/config/form-override.model.ts`.

- All possible transforms are defined in `knownTransforms`.
- The transforms applied by default to a particular form mode are defined in `defaultTransforms`.
  These defaults reduce boilerplate transform definitions.
  The defaults can be overridden by specifying the transform in form config using `overrides.formModeClasses`.
- Each transform is from one component to one component.
- A transform could be from and to the same component. This is mostly a no-op, except that any `overrides` config is removed.
- A transform might change between a component that has a model and one that doesn't, or the other way.
  This is fine, provided the transform migrates the model data from or to an appropriate place in the component config for a form component without a model.

## Design Decisions

### FormConfig and component class constructors

The FormConfig class and each component class could have a constructor that accepts the `*Frame` interface.
This would allow keeping some of the constructions steps in the same place as the properties are declared, which would
be good.

However, this is not done, because there is more than one way to construct the Form and Component classes.
Putting part of the construction in the class constructors restricts how the class can be built.

Instead, the classes do nothing special in the constructor.
This means that each visitor method must set all the relevant class instance properties.

### 'Outline' interfaces, and '*.model.ts' and '*.outline.ts' files

Interfaces ending with 'Outline' are needed to avoid circular imports that can cause issues
in the runtime javascript. This should only be an issue for aspects that are present in the compiled
javascript.

The convention is to separate the classes into a '<name>.model.ts' file
and the types and interfaces into a '<name>.outline.ts' file.

Files that contain and import only interface and type declarations
should be able to contain circular imports with only other files that contain compile-time-only items.

Some examples of the problems that runtime circular imports and dependencies can cause:

- `TypeError: Class extends value undefined is not a constructor or null`
- Imported items seem to be missing or partly-constructed.

The way to resolve this is to extract some part of the dependency cycle into another file,
which does not depend on or import any of the other items.

The most common way to do this in Typescript is to create an interface in a new file,
and use that for typing instead of the class.


### Validation groups and conditional validation

We want to be able to control whether form field validation should run or not, based on a number of states.

The conditional and group-based validation must be able to function on the client and server, which increases the complexity.

Running validators on the server is straightforward, as we have full control of when and how the validators are run.
This allows us to incorporate validators however is best. At the moment, this would be as a validator visitor.

#### Validation group considerations

Similar things in other frameworks:

- ASP.Net ValidationGroup: https://learn.microsoft.com/en-us/previous-versions/aspnet/ms227424(v=vs.100)
- Java Bean Validation groups: https://www.baeldung.com/javax-validation-groups
- Symfony validation groups: https://symfony.com/doc/current/validation/groups.html

All of these work by specifying the validation group where the validator is applied to the form field, rather than somewhere else.
This makes sense. I think I'll try to implement something very similar to these, and see how that goes.

#### Client-side considerations

On the client, using the angular components, there are a range of issues that are not easy to resolve.

Given these issues, it is best to wait for some of the other features to be functional first, to explore if they help solve these problems.

Some of the issues are:

*Changing the visibility / display / presence / other attributes of Angular components does not interact well with validators*

I haven't seen this directly myself, but there's a bug report that conditional rendering with @if still needs the updateValueAndValidity method call. 
Which is required when adding and removing validators, too.
https://github.com/angular/angular/issues/62318

If we ever need to change a control's updateOn, that will cause problems with adding or removing validators
https://angular.dev/api/forms/AbstractControl#updateOn
https://github.com/angular/angular/issues/24003

The key method in all of this, which updates the value and validity after changing a validator updateValueAndValidity, only updates itself and ancestors, not descendants. 
Which means iterating through FormGroup / FormArray controls to ensure everything has been updated.
https://angular.dev/api/forms/AbstractControl#updateValueAndValidity

All of this seems to push towards adding validators when the form is built, and never changing them.
Then the check for whether to run is in the validator. That will require an interface, to be able to work for client & server.

*We don't have a clear approach for setting which validators to run*

Implementing the definitions of the validator groups is straightforward.
There are open questions for how to actually make the change between a validator that runs or does not run.

The most likely approach is to combine the upcoming event bus with expressions, but those two features are
not yet far enough along.

Given that we're operating in an area that appears to be on the edges of what angular supports,
it might be better to create an interface that each angular component can implement to perform the actions needed to
enable or disable validators, e.g.:
- each component may need to update layout or model or other things before or after a validator is toggled
- toggling a validator on a component that has been removed from the DOM can end up with a validator that cannot be changed - order of operations can differ and is important
- we're using both angular signals and observables to do things, which mostly works, but has edge cases that each component might need to handle differently

### Merging defaults from ancestors

The construct visitor gathers the default values from each component.
The defaults for a component are the combination of the `defaultValue` for that component, and any default specified in an ancestor component.
This approach was used because it allows for specifying defaults for deeply nested components in less deeply nested components,
making it easier to define more complex defaults.

Note that Repeatable Components work differently, see the section about Repeatable special features.

### The Repeatable Component has some special features

- Repeatable default: The repeatable model.config.defaultValue is the default for the whole repeatable.
  Can be specified only in the form config.

- Repeatable value: The repeatable model.config.value is the value for the whole repeatable.
  Is available only after the form config has been processed, not in 'raw' the form config.

- Repeatable template name: The repeatable elementTemplate must not have a name.
  The name property needs to be present, but it must be a falsy value (usually empty string "").
  This is because it is a template, and the name is generated based on the repeatable's name.

- Repeatable new item default: The repeatable elementTemplate model.config.newEntryValue is the default for *new* entries.
  - The property 'newEntryValue' is only available in elementTemplates.
  - An elementTemplate 'resets' the usual merging of ancestor defaultValues. Only 'newEntryValue' is used.
  - This is because it does not make sense for ancestor components to provide defaults for new entries - they can only operate on the whole repeatable.
  - This also means there is no way to provide the values for new repeatable entries from a record, only the form config.
  - This also means that a descendant of an element template cannot provide defaultValues.

### Order of construct visitor operations

The `ConstructFormConfigVisitor` performs a number of operations to construct class instances from a form config.
The order of these operations will change the resulting class instances.

The general order, as currently implemented, is:

1. Create an instance of the form component class from the form config data.
2. Visit the form component class instance.
3. Populate any top-level properties from the form config, including creating instances of the component, model, layout.
4. Visit the component class instance, then model class instance, then layout class instance.
5. In the visit method for each class instance, check it is the expected class instance, and populate the properties, including config.
   - This step includes setting the model value.
6. If a component has nested components, apply any re-usable form overrides to all nested components, then go to the start of this list.
7. Process any component transforms after processing the original form component and component, model, layout properties.
   - The component transforms are done at this stage to allow access to the model data values and other properties from the original component.
8. If this is a nested form component, add it to the parent's list of components.
9. Return the hierarchy of form components.
