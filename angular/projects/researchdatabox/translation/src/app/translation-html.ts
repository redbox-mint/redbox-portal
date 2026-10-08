import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Extension, Mark, Node } from '@tiptap/core';
import { TableView } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  filterTranslationHtmlClasses, translationHtmlTags, translationHtmlAttributes,
  type TranslationHtmlClasses
} from '@researchdatabox/sails-ng-common';

const sectionAttribute = 'data-translation-section';
const sectionClassAttribute = 'data-translation-section-class';

/** The resizing plugin's table view does not apply document class attributes itself. */
export function translationTableView(policy: TranslationHtmlClasses) {
  return class extends TableView {
    constructor(...args: ConstructorParameters<typeof TableView>) {
      super(...args);
      this.applyPresentation(args[0]);
    }

    override update(node: ProseMirrorNode): boolean {
      const updated = super.update(node);
      if (updated) this.applyPresentation(node);
      return updated;
    }

    private applyPresentation(node: ProseMirrorNode): void {
      const value: unknown = node.attrs['class'];
      const classes = filterTranslationHtmlClasses(typeof value === 'string' ? value : '', 'table', policy);
      if (classes) this.table.setAttribute('class', classes);
      else this.table.removeAttribute('class');
    }
  };
}

/** Preserve presentation attributes in the schema, without enabling arbitrary attributes or CSS. */
export function translationPresentationExtensions(policy: TranslationHtmlClasses) {
  return [
    Node.create({
      name: 'translationDiv', group: 'block', content: 'block+',
      parseHTML: () => [{ tag: 'div' }],
      renderHTML: ({ HTMLAttributes }) => ['div', HTMLAttributes, 0]
    }),
    Mark.create({
      name: 'translationSpan', excludes: '',
      parseHTML: () => [{ tag: 'span[class]' }],
      renderHTML: ({ HTMLAttributes }) => ['span', HTMLAttributes, 0]
    }),
    Extension.create({
      name: 'translationPresentation',
      addGlobalAttributes() {
        return [
          {
            types: ['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList',
              'listItem', 'horizontalRule', 'table', 'tableRow', 'tableHeader', 'tableCell',
              'link', 'bold', 'italic', 'strike', 'underline', 'code', 'translationDiv', 'translationSpan'],
            attributes: {
              class: {
                default: null,
                parseHTML: element => filterTranslationHtmlClasses(element.getAttribute('class'), element.tagName, policy) || null,
                renderHTML: attributes => attributes['class'] ? { class: attributes['class'] } : {}
              }
            }
          },
          {
            types: ['tableHeader', 'tableCell'],
            attributes: {
              scope: {
                default: null,
                parseHTML: element => element.getAttribute('scope'),
                renderHTML: attributes => attributes['scope'] ? { scope: attributes['scope'] } : {}
              }
            }
          },
          {
            types: ['tableRow'],
            attributes: {
              translationSection: {
                default: 'tbody',
                parseHTML: element => {
                  const tag = element.parentElement?.tagName.toLowerCase();
                  return tag === 'thead' || tag === 'tfoot' ? tag : 'tbody';
                },
                renderHTML: attributes => ({ [sectionAttribute]: attributes['translationSection'] })
              },
              translationSectionClass: {
                default: null,
                parseHTML: element => {
                  const parent = element.parentElement;
                  return parent ? filterTranslationHtmlClasses(parent.getAttribute('class'), parent.tagName, policy) || null : null;
                },
                renderHTML: attributes => attributes['translationSectionClass']
                  ? { [sectionClassAttribute]: attributes['translationSectionClass'] } : {}
              }
            }
          }
        ];
      }
    })
  ];
}

/** Tiptap requires flat table rows. Rebuild their original sections only when exporting HTML. */
export function restoreTranslationTableSections(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('table').forEach(table => {
    const rows = Array.from(table.rows).filter(row => row.closest('table') === table);
    if (!rows.some(row => row.hasAttribute(sectionAttribute))) return;
    let section: HTMLTableSectionElement | undefined;
    for (const row of rows) {
      const tag = row.getAttribute(sectionAttribute) ?? 'tbody';
      const sectionTag = tag === 'thead' || tag === 'tfoot' ? tag : 'tbody';
      const classes = row.getAttribute(sectionClassAttribute) ?? '';
      row.removeAttribute(sectionAttribute);
      row.removeAttribute(sectionClassAttribute);
      if (!section || section.tagName.toLowerCase() !== sectionTag || section.className !== classes) {
        section = document.createElement(sectionTag);
        if (classes) section.className = classes;
        table.appendChild(section);
      }
      section.appendChild(row);
    }
    Array.from(table.children).filter(element =>
      ['THEAD', 'TBODY', 'TFOOT'].includes(element.tagName) && !element.children.length
    ).forEach(element => element.remove());
  });
  return document.body.innerHTML;
}

/** Keep Angular's HTML sanitisation; never turn a translation into trusted HTML. */
export function sanitizeTranslationEditorHtml(html: string, sanitizer: DomSanitizer, policy: TranslationHtmlClasses): string {
  const document = new DOMParser().parseFromString(sanitizer.sanitize(SecurityContext.HTML, html) ?? '', 'text/html');
  document.body.querySelectorAll('*').forEach(element => {
    if (!translationHtmlTags.includes(element.tagName.toLowerCase())) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach(attribute => {
      if (!translationHtmlAttributes.includes(attribute.name)) element.removeAttribute(attribute.name);
    });
    const classes = filterTranslationHtmlClasses(element.getAttribute('class'), element.tagName, policy);
    if (classes) element.setAttribute('class', classes);
    else element.removeAttribute('class');
    if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return document.body.innerHTML;
}
