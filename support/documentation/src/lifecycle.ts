import ts from 'typescript';
import { Lifecycle } from './catalogue';

export interface ParsedDocumentation {
  lifecycle: Lifecycle;
  summary: string;
  extensionSemantics?: string;
  caveats: string[];
  see: string[];
  deprecatedText?: string;
}

function commentText(comment: string | ts.NodeArray<ts.JSDocComment> | undefined): string {
  if (typeof comment === 'string') return comment.trim();
  if (!comment) return '';
  return comment
    .map(part => part.getText())
    .join('')
    .trim();
}

function tagText(tag: ts.JSDocTag): string {
  if (tag.tagName.text.toLowerCase() === 'see') {
    return tag
      .getText()
      .replace(/^@see\s+/, '')
      .replace(/\s*\*\/\s*$/, '')
      .trim();
  }
  return commentText(tag.comment);
}

function summaryText(value: string): string {
  return value
    .split('\n')
    .filter(line => !/^\s*author\s*:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseDocumentation(node: ts.Node, inherited: Lifecycle = 'unclassified'): ParsedDocumentation {
  const tags = ts.getJSDocTags(node);
  const tagMap = new Map(tags.map(tag => [tag.tagName.text.toLowerCase(), tagText(tag)]));
  let lifecycle = inherited;
  if (tagMap.has('internal')) lifecycle = 'internal';
  else if (tagMap.has('deprecated')) lifecycle = 'deprecated';
  else if (tagMap.has('experimental') && tagMap.has('extensionpoint')) lifecycle = 'experimental';
  else if (tagMap.has('extensionpoint')) lifecycle = 'supported';

  const jsDocs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const summary = jsDocs
    .map(doc => summaryText(commentText(doc.comment)))
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const semantics = tagMap.get('extensionpoint');
  const caveats = tags
    .filter(tag => tag.tagName.text.toLowerCase() === 'remarks')
    .map(tagText)
    .filter(Boolean);
  const see = tags
    .filter(tag => tag.tagName.text.toLowerCase() === 'see')
    .map(tagText)
    .filter(Boolean);
  return {
    lifecycle,
    summary,
    extensionSemantics: semantics || undefined,
    caveats,
    see,
    deprecatedText: tagMap.get('deprecated') || undefined,
  };
}

export function lifecycleFor(node: ts.Node, inherited: Lifecycle = 'unclassified'): Lifecycle {
  return parseDocumentation(node, inherited).lifecycle;
}
