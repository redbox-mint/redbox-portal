// Mocha filters test bodies by full title. Aggregate fixture hooks also need
// the selection so they prepare only the requested production observations.
export function mutationWitnessCases<T>(suite: string, cases: readonly T[], title: (entry: T) => string) {
  const selected = process.env.FM043_MUTATION_TITLES;
  if (!selected) return cases;
  const titles: string[] = JSON.parse(selected);
  return cases.filter(entry => titles.includes(suite + ' ' + title(entry)));
}
