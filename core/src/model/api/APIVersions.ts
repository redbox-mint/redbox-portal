/**
 * The available API versions.
 */
export const ApiVersion = {
  VERSION_1_0: "1.0",
  VERSION_2_0: "2.0",
} as const;
export type ApiVersionStrings = typeof ApiVersion[keyof typeof ApiVersion];
