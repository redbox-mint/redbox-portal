export function assertNoNullByteObjectKeys(value: unknown, context = 'body'): void {
  const visit = (candidate: unknown, path: string): void => {
    if (candidate == null || typeof candidate !== 'object') {
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    const objectValue = candidate as Record<string, unknown>;
    for (const key of Object.keys(objectValue)) {
      if (key.includes('\0')) {
        throw new Error(`Invalid JSON object key at ${path}: keys must not contain null bytes`);
      }
      visit(objectValue[key], path ? `${path}.${key}` : key);
    }
  };

  visit(value, context);
}
