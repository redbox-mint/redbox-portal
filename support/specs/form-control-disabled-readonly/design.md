# Overview of design choices and approach for form control disabled and readonly states

## Background

The availability or access to form fields can be changed in a few ways.

The main ways are enabled / disabled, readonly / editable, and visible / hidden.

This design is concerned with readonly and disabled.

### Interactions:


#### readonly

Note a difference in HTML and angular for `readonly`:
- the readonly attribute does not impact the angular validation
- a readonly HTML element *does not* participate in constraint validation

HTML API
Ref: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/readonly

- be edited: no
- included in validation: no
- can be marked as required: no
- can be focused: yes
- can receive events like mouse click: yes
- supported by: input, textarea

Use readonly when a field should be shown,
not be able to be changed by the user,
participate in focus and events,
and still part of the form and included in form submission.

Angular API
Ref:

- be edited: no
- included in validation: yes
- can be marked as required: yes
- not part of the angular forms API
- needs to be implemented using angular property binding to a property in the model
- readonly does not affect the angular validation

#### disabled

HTML API
Ref: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/disabled

- be edited: no
- included in validation: no
- can be marked as required: no
- can be focused: no
- can receive events like mouse click: no
- supported by: input, textarea, select, option, optgroup, fieldset, button
- children form fields are also disabled

Use disabled when a field should be shown,
not be able to be changed by the user,
not be focused and not have events,
and not included in form submission.

Angular API
Ref: https://v20.angular.dev/api/forms/FormControl#disabled

- be edited: no
- included in validation: no ("disabled controls are exempt from validation checks")
- can be marked as required: no
- is part of the angular forms API
- disabled controls are exempt from validation checks
- disabled controls are not included in the aggregate value of their ancestor controls
- angular warns when using property binding for disabled:

```
It looks like you're using the disabled attribute with a reactive form directive. If you set disabled to true
when you set up this control in your component class, the disabled attribute will actually be set in the DOM for
you. We recommend using this approach to avoid 'changed after checked' errors.

Example:
// Specify the `disabled` property at control creation time:
form = new FormGroup({
  first: new FormControl({value: 'Nancy', disabled: true}, Validators.required),
  last: new FormControl('Drew', Validators.required)
});

// Controls can also be enabled/disabled after creation:
form.get('first')?.enable();
form.get('last')?.disable();
```
