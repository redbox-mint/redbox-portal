import * as Effect from 'effect/Effect';
import * as Cause from 'effect/Cause';

export async function runEffectProgram<A>(program: Effect.Effect<A, unknown, never>): Promise<A> {
  const exit = await Effect.runPromiseExit(program);
  if (exit._tag === 'Success') {
    return exit.value;
  }

  const failure = Cause.findErrorOption(exit.cause);
  if (failure._tag === 'Some') {
    throw failure.value;
  }
  throw Cause.squash(exit.cause);
}
