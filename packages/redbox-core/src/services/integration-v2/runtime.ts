import { Effect } from 'effect';
import * as Cause from 'effect/Cause';

export async function runEffectProgram<A>(program: Effect.Effect<A, unknown, never>): Promise<A> {
  const exit = await Effect.runPromiseExit(program);
  if (exit._tag === 'Success') {
    return exit.value;
  }

  const failure = Cause.failureOrCause(exit.cause);
  if (failure._tag === 'Left') {
    throw failure.left;
  }
  throw Cause.squash(failure.right);
}
