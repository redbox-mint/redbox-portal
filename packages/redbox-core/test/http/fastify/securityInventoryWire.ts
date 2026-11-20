// Normalize only generation-specific values. Keep the rest of the decoded
// wire body byte for byte, including key order and whitespace.
export function stableInventoryBody(route: string, contentType: string | null, body: string): string {
  if (contentType === 'text/html') return body.replace(/(ngCspNonce)="[A-Za-z0-9+/]{22}=="/g, '$1="<nonce>"');
  if (contentType !== 'application/json') return body;
  const ids = new Map<string, number>();
  let text = body
    .replace(
      /("(?:createdAt|updatedAt|dateCreated|dateModified|lastSaveDate|capturedAt)":\s*)"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z"/g,
      '$1"<time>"'
    )
    .replace(/("(?:id|_id|bundle)":\s*)"([a-f0-9]{24})"/g, (match, key: string, id: string) => {
      if (id.startsWith('000000000000000000')) return match;
      if (!ids.has(id)) ids.set(id, ids.size + 1);
      return `${key}"<id:${ids.get(id)}>"`;
    })
    .replace(/("incarnationId":\s*)"[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}"/g, '$1"<incarnation>"');
  if (route.endsWith('/asynch/socket-token')) text = text.replace(/("token":\s*)"[a-f0-9]{64}"/, '$1"<socket-grant>"');
  if (route.endsWith('/user/genKey'))
    text = text.replace(
      /("message":\s*)"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"/,
      '$1"<api-token>"'
    );
  if (route.endsWith('/preview')) {
    const preview = /"token":\s*"([a-f0-9]{32})"/.exec(text)?.[1];
    if (preview)
      text = text
        .replace(`"${preview}"`, '"<preview-token>"')
        .replace(`/preview/${preview}.css`, '/preview/<preview-token>.css');
  }
  return text;
}
