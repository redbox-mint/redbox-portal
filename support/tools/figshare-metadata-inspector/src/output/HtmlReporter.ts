import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FigshareMetadataModel, NormalisedField } from '../normalisation/types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fieldDetails(field: NormalisedField): string {
  const values =
    field.values == null || field.values.length === 0
      ? ''
      : `<details><summary>${field.values.length} controlled value${field.values.length === 1 ? '' : 's'}</summary>
        <table class="values"><thead><tr><th>ID</th><th>Value</th></tr></thead><tbody>
          ${field.values.map(value => `<tr><td>${escapeHtml(value.id)}</td><td>${escapeHtml(value.label ?? value.value)}</td></tr>`).join('')}
        </tbody></table></details>`;
  return `<details class="technical">
    <summary>Technical details</summary>
    <dl>
      <dt>Figshare field ID</dt><dd><code>${escapeHtml(field.id)}</code></dd>
      <dt>API field name</dt><dd><code>${escapeHtml(field.name)}</code></dd>
      <dt>Figshare type</dt><dd><code>${escapeHtml(field.type)}</code></dd>
      <dt>Field source</dt><dd>${escapeHtml(field.source)}</dd>
      <dt>Field order</dt><dd>${escapeHtml(field.order)}</dd>
      <dt>Value source</dt><dd>${escapeHtml(field.valueSource)}</dd>
    </dl>
    ${field.valueSourceDescription == null ? '' : `<p>${escapeHtml(field.valueSourceDescription)}</p>`}
    <h4>Configuration</h4><pre>${escapeHtml(JSON.stringify(field.rawConfiguration, null, 2))}</pre>
    ${field.rawDefinition == null ? '' : `<h4>Field definition</h4><pre>${escapeHtml(JSON.stringify(field.rawDefinition, null, 2))}</pre>`}
  </details>${values}`;
}

export class HtmlReporter {
  public async write(outputDirectory: string, model: FigshareMetadataModel): Promise<void> {
    const sections = model.itemTypes
      .map(
        itemType => `<section>
      <h2>${escapeHtml(itemType.name)} <small>(${escapeHtml(itemType.id)}, group ${escapeHtml(itemType.groupId)})</small></h2>
      <table><thead><tr><th>Field</th><th>Required</th><th>Type</th><th>Source</th><th>Values</th></tr></thead><tbody>
      ${itemType.fields
        .map(
          field => `<tr>
        <td><strong>${escapeHtml(field.displayName ?? field.name)}</strong>${field.hint == null ? '' : `<br><span class="muted">${escapeHtml(field.hint)}</span>`}${fieldDetails(field)}</td>
        <td><span class="pill ${field.required ? 'required' : ''}">${field.required ? 'Yes' : 'No'}</span></td>
        <td><code>${escapeHtml(field.type)}</code></td>
        <td>${escapeHtml(field.source)}</td>
        <td>${field.values?.length ?? (field.valueSource === 'none' ? 'Free-form' : escapeHtml(field.valueSource))}</td>
      </tr>`
        )
        .join('')}
      </tbody></table>
    </section>`
      )
      .join('');

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Figshare metadata schema</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17202a;background:#f5f7fa}body{margin:0}main{max-width:1200px;margin:auto;padding:2rem}header{background:#14213d;color:white;padding:2rem;border-radius:12px;margin-bottom:2rem}h1{margin:.2rem 0}h2{margin-top:0}small,.muted{color:#65758b;font-weight:normal}header small{color:#ced8ea}section{background:white;padding:1.5rem;margin:1.25rem 0;border-radius:12px;box-shadow:0 2px 12px #14213d12;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #e5e9ef;vertical-align:top}th{background:#eef2f7}.values{margin-top:.7rem;font-size:.92rem}.pill{display:inline-block;padding:.15rem .5rem;border-radius:1rem;background:#edf1f5}.pill.required{background:#ffe1dc;color:#8a2418}details{margin-top:.6rem}summary{cursor:pointer;color:#315da8}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:.75rem;border-radius:6px;max-height:24rem;overflow:auto}dl{display:grid;grid-template-columns:max-content 1fr;gap:.3rem 1rem}dt{font-weight:600}dd{margin:0}@media(max-width:700px){main{padding:.75rem}th,td{padding:.45rem}}
</style></head><body><main>
<header><h1>CQU Figshare dataset metadata schema</h1><p>Dataset metadata for group <code>${escapeHtml(model.source.groupId)}</code>, discovered from the Figshare v2 API at <code>${escapeHtml(model.source.baseUrl)}</code>.</p><small>Generated ${escapeHtml(model.generatedAt)} · ${model.itemTypes[0]?.fields.length ?? 0} fields · ${model.referencedEntities.licenses.length} licences · ${model.referencedEntities.categories.length} categories</small></header>
${sections}
</main></body></html>\n`;
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, 'figshare-schema.html'), html, 'utf8');
  }
}
