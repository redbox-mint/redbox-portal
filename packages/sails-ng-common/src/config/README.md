# Form configuration

## Overview

The types, interfaces, and classes in this directory and sub-directories
define the configuration for the form and form components.

The various pieces work together to implement a range of functionality:


## Conventions

There are some conventions to make it easier to distinguish the pieces.

### 'Definition' classes

Classes ending `Definition` establish the metadata (name, class, config type) for the form and its components.
These classes are constructed from the object literal or json data.

### 'Config' classes

Classes ending `Config` establish the field-type-specific config structure of the form and its components.

The one exception to this is the top-level `FormConfig`, which is a special class.

### 'Frame' classes

Interfaces ending with `Frame` are used for providing types for the  typescript literal variables.
This can be used to generate JSON schema for validating the JSON structure, both on the client and server side.


## Transforming Form Config

The form config needs to be transformed into other structures.

There are two aspects to this:

1. The outcome: the complete structure that is needed after processing all items.
   This is implemented by 'visitors' via the `Visitee` interface and `IFormConfigVisitor` abstract class.

2. The aspects of each component, and the component's various pieces of config.
   This is implemented by each form components via the abstract class `FormComponentDefinition`.

To use these features:

1. Decide which visitor is needed.
2. Create a new visitor.
3. Use the visitor-specific approach to starting the visiting process. This is usually a method on the visitor class.

The structures and data are:

- Server form config - this is the structure used by the form config stored in .ts files and in the database
- Client form config - this is the structure sent to the client-side angular apps
- json typedef - this is the structure used for merging two records
- templates to be compiled - this is the data allowing templates and expressions to be compiled on the server-side so they can be provided to the client
- default values for each component - this is the structure of the data model, populated with default values, which the client uses for new forms

