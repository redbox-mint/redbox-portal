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
   and the `FormConfigVisitorOutline` interface and `FormConfigVisitor` and `CurrentPathFormConfigVisitor`
   abstract classes for visitors.

2. The aspects of each component, and the component's various pieces of config.
   This is implemented for each form component via the `visit[component_name]` methods in each visitor class.

To create a visitor:

1. Determine the input and how it will be transformed into the output. This is usually the server-side form config.
2. Create a new visitor. Extend either the base `FormConfigVisitor` or `CurrentPathFormConfigVisitor` to use the
   `currentPath` tree traversal approach.
3. Use the visitor-specific approach to starting the visiting process. This is usually a method on the visitor class,
   such as `start`.

The visitor definition and implementations are in `packages/sails-ng-common/src/config/visitor`.

Further transformations can be done using reusable form config or form mode overrides.

## Expressions: modify the client form by triggering a function

Expressions allow for modifying the client form by triggering a function attached to a component.

An expressions has three parts:

- object key: The path to the component property.
- object value template: The template of the function to execute. This is compiled on the server and executed on the
  client.
- object value condition: ???

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
