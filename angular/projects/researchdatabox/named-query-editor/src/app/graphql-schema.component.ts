import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import {
  buildSchema,
  isObjectType,
  isInputObjectType,
  isEnumType,
  type GraphQLArgument,
  type GraphQLSchema,
} from 'graphql';

/** Schema-only assistance uses the named-query permission boundary, without executing data. */
@Component({
  selector: 'nq-graphql-schema',
  imports: [CommonModule, FormsModule, I18NextPipe],
  template: `<p class="rb-ws-lede">{{ 'named-query-graphql-schema-help' | i18next }}</p>
    <label for="nq-graphql-type" class="rb-ws-label">{{ 'named-query-graphql-schema-type' | i18next }}</label>
    <select id="nq-graphql-type" class="form-select" [(ngModel)]="typeName">
      <option *ngFor="let name of types" [value]="name">{{ friendlyType(name) }}</option>
    </select>
    <label for="nq-graphql-field-search" class="rb-ws-label mt-2">{{
      'named-query-graphql-field-search' | i18next
    }}</label>
    <input id="nq-graphql-field-search" type="search" class="form-control" [(ngModel)]="search" />
    <ul class="list-unstyled mt-2">
      <li *ngFor="let field of fields" class="mb-2">
        <code>{{ field.name }}{{ field.signature }}: {{ field.type }}</code>
        <p class="small mb-0">{{ field.description }}</p>
      </li>
    </ul>
    <details class="rb-ws-disclosure">
      <summary>{{ 'named-query-graphql-schema-sdl' | i18next }}</summary>
      <pre class="rb-ws-json">{{ sdl }}</pre>
    </details>`,
})
export class GraphqlSchemaComponent implements OnChanges {
  @Input() sdl = '';
  schema: GraphQLSchema | null = null;
  typeName = 'Query';
  search = '';
  friendlyType(name: string): string {
    return name
      .replace(/^(M|R)_/, '')
      .replace(/_[a-f0-9]{6,}$/i, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  get types(): string[] {
    return Object.keys(this.schema?.getTypeMap() ?? {})
      .filter(name => !name.startsWith('__'))
      .sort();
  }
  ngOnChanges(): void {
    try {
      this.schema = buildSchema(this.sdl);
    } catch {
      this.schema = null;
    }
  }
  get fields() {
    const type = this.schema?.getType(this.typeName);
    if (type && isEnumType(type))
      return type
        .getValues()
        .map(value => ({ name: value.name, type: '', signature: '', description: value.description ?? '' }));
    if (!type || (!isObjectType(type) && !isInputObjectType(type))) return [];
    return Object.values(type.getFields())
      .filter(field => field.name.toLowerCase().includes(this.search.toLowerCase()))
      .map(field => ({
        name: field.name,
        type: String(field.type),
        description: field.description ?? '',
        signature:
          'args' in field && field.args.length
            ? '(' + field.args.map((arg: GraphQLArgument) => `${arg.name}: ${arg.type}`).join(', ') + ')'
            : '',
      }));
  }
}
