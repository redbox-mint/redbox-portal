## Styling your site

This guide provides an overview of the SCSS structure and variables for customizing the default theme. The SCSS files are designed to make it easy to update colors, fonts, and responsive behavior without altering the original theme files.

## Overview

The theme customization is split into several SCSS files:

- `default-theme.scss`: Contains base layout and element styles.
- `default-variables.scss`: Defines default variables for the theme, including colors and dimensions.
- `default-responsive.scss`: Contains media queries and styles for responsive design.
- `default-colors.scss`: Defines the color palette for the theme.
- Customization placeholders:
  - `custom-variables.scss`: Intended for overriding default variables.
  - `custom-theme.scss`: Intended for adding custom styles.
  - `custom-responsive.scss`: Intended for custom responsive design overrides.
  - `custom-colors.scss`: Intended for defining a custom color scheme.

## Default Theme Styles (`default-theme.scss`)

- **Font Configuration**: Sets up Font Awesome and custom fonts.
- **Layout and Alignment**: Includes classes for floating and aligning elements.
- **Image and Focus Styles**: Custom styles for images and focus states.

## Theme Variables (`default-variables.scss`)

Variables are used for styling consistency and are defined for:

- Site branding area (background, heading colors)
- Panel branding (background, text, border colors)
- Main menu and header (background, link colors)

## Responsive Design (`default-responsive.scss`)

Includes print media styles to ensure content is print-friendly:

- Hides unnecessary elements like buttons and menus.
- Ensures important elements are visible and properly formatted.

## Color Scheme (`default-colors.scss`)

Defines a set of branding colors used throughout the theme:

- Primary and secondary colors (e.g., `$branding-color-1`, `$branding-color-2`)
- Text and background colors for different elements.

## Customization Files

Placeholder files (`custom-variables.scss`, `custom-theme.scss`, `custom-responsive.scss`, `custom-colors.scss`) are provided for you to add your own styles, variables, and responsive design overrides. These files are intended to keep your customizations separate from the default theme, facilitating easier updates and maintenance.

## Customizing Your Theme

To customize your theme, add your SCSS variables and styles to the respective "custom" files. This allows you to modify the look and feel of your site without altering the core theme files:

1. **Variables**: Define your own colors, fonts, and other variables in `custom-variables.scss`.
2. **Styles**: Add custom styles and overrides in `custom-theme.scss`.
3. **Responsive Design**: Write custom media queries and responsive styles in `custom-responsive.scss`.
4. **Colors**: Set up a custom color scheme in `custom-colors.scss`.

## Brand Typeface

Administrators can upload one static WOFF2 brand typeface per branding scope from the Admin branding page (Typography section). Logos and favicons keep their existing immediate lifecycle and are unaffected.

- **Supported format**: static WOFF2 only. TTF, OTF, WOFF1, variable WOFF2, remote font URLs, and cross-origin hosting are rejected. Uploaded fonts are never converted, repaired, or subset.
- **Face slots**: four fixed slots — Regular (required to publish a custom typeface), Bold, Italic, and Bold Italic (optional; browsers synthesise missing optional faces). The slot is authoritative: embedded family/subfamily metadata that disagrees only produces a warning.
- **Default Typography**: the portal default. Generated typeface CSS is absent and all current typography and Google font requests remain unchanged.
- **Scope and rendering**: an active custom typeface replaces the Google-hosted text fonts in brand-resolved browser pages (public, login, researcher, Admin, branded error, and print views). Icon fonts and monospace/code content are excluded. Hook CSS loads after the theme stylesheet and can still override it.
- **Draft, preview, publish, restore**: colour and typeface edits share one persistent draft guarded by optimistic concurrency (a stale draft returns 409 with a reload action). Preview is optional and bound to an exact draft revision. Publish is atomic and idempotent when nothing changed. Restoring a retained version immediately publishes it as the next version; versions never rewind. The three newest complete versions are retained by default (configurable).
- **Delivery**: faces are served same-origin from immutable content-addressed URLs (`/fonts/branding/<brand>/<sha256>.woff2`, cached for one year). Identical bytes are deduplicated within a brand only; different brands intentionally use separate storage objects. Only the active Regular face is preloaded; Google font requests are omitted only while a custom typeface is active. A missing or corrupt active face falls back to the CSS font stack in the browser and raises an Admin health warning.
- **Errors**: oversized uploads return 413 (2 MiB per face, 8 MiB distinct family bytes by default); malformed/variable fonts and publish-without-Regular return 400; stale counters return 409.

## Contextual button text colours

In Admin → Branding, the Bootstrap Contextual group pairs each background with
a button text colour. Set `primary-text-color`, `secondary-text-color`,
`success-text-color`, `info-text-color`, `warning-text-color`, `danger-text-color`,
`light-text-color` or `dark-text-color` in the brand's `variables` map. The
`-text-colour` aliases and optional leading `$` are also accepted. Values must
be three- or six-digit hexadecimal colours; saved drafts normalise them to
lowercase six-digit hex. Older drafts may omit these settings.

Button text colours are opt-in for each context. Until a brand explicitly sets
one, existing Sass-customised button text colours (including Bootstrap's
computed contrast colours) remain untouched. Setting only a background does not
opt in. The exposed variable defaults match Bootstrap 5.3.8: white (`#ffffff`)
for primary, secondary, success, danger and dark; black (`#000000`) for info,
warning and light. These defaults are not applied to buttons automatically.
For example, a dark blue informational button can use
`{ "info": "#003087", "info-text-color": "#ffffff" }`.

Generated CSS always exposes `--rb-<context>-text-color` on `:root` and `:host`.
Only when a brand explicitly sets that context's text colour does it use the
variable for `--bs-btn-color`, `--bs-btn-hover-color`, `--bs-btn-active-color` and
`--bs-btn-disabled-color` on `.btn-<context>`. Its disabled buttons also use the
brand background and border
(`--bs-btn-disabled-bg`, `--bs-btn-disabled-border-color`), so the text sits on the
same colour as the other states. Brands that do not set it keep Bootstrap's
disabled pairing. The default theme's `.btn-secondary` rule keeps its Sass text,
background and border colours. An explicit `secondary-text-color` adds generated
`.btn-secondary` text, background and border declarations, loaded after the
compiled theme, so the normal state uses the configured `secondary-text-color` on
the configured `secondary` colour, matching hover, active and disabled. Clear the
text colour setting to return to the Sass behaviour.
These settings do not change outline buttons, alerts or badges.

Two existing default-theme rules keep their own branding and take precedence over
these settings:

- Submit buttons (`input[type="submit"]`, `button[type="submit"]`) use the
  submit-button colours (`submit-button-background-color`,
  `submit-button-text-color`) in their normal state, including contextual submit
  buttons such as the local login button. Their hover, focus, active and disabled
  text follows the contextual setting.
- Any `.btn` inside a `.panel-default > .panel-heading` uses the panel heading
  text colour (`panel-branding-color`) so it matches its heading.

Generate Preview saves the draft and uses the same opt-in CSS generator as
Publish, preserving Sass button colours for unset contexts in both. Save draft
and Publish use the existing shared colour/typeface revision and
version workflow; Restore also includes these colours. Check text contrast
against the chosen background, including hover, before publishing.
