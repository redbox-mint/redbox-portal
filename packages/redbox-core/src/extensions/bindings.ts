import type { ExtensionFactory } from './contract';

/** Compose the selected factory with its concrete, factory-specific input. */
export function bindExtensionFactory<Input, Output>(
  factory: ExtensionFactory<Input, Output>,
  input: Input
): () => Output {
  return () => factory.create(input);
}

export function bindExtensionWork<Input>(
  work: { run(input: Input): Promise<void> },
  input: Input
): () => Promise<void> {
  return () => work.run(input);
}
