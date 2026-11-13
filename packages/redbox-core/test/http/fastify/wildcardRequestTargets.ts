/** Expected decoded keys are explicit: the oracle must not share the parser
 * whose fragment/query/slash handling these requests qualify. */
export const wildcardRequestTargets = [
  { suffix: 'greeting', key: 'greeting' },
  { suffix: 'greeting/', key: 'greeting/' },
  { suffix: 'greeting#ignored/', key: 'greeting' },
  { suffix: 'greeting/#ignored', key: 'greeting/' },
  { suffix: 'greeting?ignored=/', key: 'greeting' },
  { suffix: 'greeting/?ignored=1', key: 'greeting/' },
  { suffix: 'greeting?ignored=/#ignored/', key: 'greeting' },
  { suffix: 'greeting/?ignored=1#ignored', key: 'greeting/' },
  { suffix: 'greeting%2F#ignored/', key: 'greeting/' },
  { suffix: 'greeting%2f?ignored=/', key: 'greeting/' },
  { suffix: 'group%2fitem#ignored/', key: 'group/item' },
  { suffix: 'group%252Fitem?ignored=/', key: 'group%2Fitem' },
  { suffix: 'group%23item#ignored/', key: 'group#item' },
  { suffix: 'group%3Fitem?ignored=/', key: 'group?item' },
  { suffix: 'greeting/#ignored/?query=/', key: 'greeting/' },
  { suffix: 'greeting#ignored?query=/', key: 'greeting' },
  { suffix: 'group//item/?ignored=/#ignored/', key: 'group//item/' },
] as const;
