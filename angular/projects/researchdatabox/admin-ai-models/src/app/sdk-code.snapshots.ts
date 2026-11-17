// Reviewed SDK examples; update deliberately when the displayed contract changes.
export const OPENROUTER_SNAPSHOT = String.raw`import { generateText, Output, jsonSchema } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const provider = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "X-Title": "ReDBox",
  },
  supportsStructuredOutputs: true,
  // ReDBox's fetch limits size and blocks redirects
  transformRequestBody: (body) => ({
    ...body,
    stream: false,
    tools: undefined,
    plugins: undefined,
    provider: {
      zdr: true,
      data_collection: "deny",
      allow_fallbacks: false,
      sort: "price",
      only: ["Anthropic"],
      ignore: ["Other"],
      order: ["Anthropic"],
      require_parameters: true,
    },
  }),
});

// ReDBox stops the call after 90 seconds
const result = await generateText({
  model: provider("anthropic/claude-haiku-4.5"),
  messages, // built from the profile and the researcher's inputs
  temperature: 0.2,
  maxOutputTokens: 4096,
  topP: 0.9,
  seed: 7,
  stopSequences: ["END"],
  presencePenalty: 0.1,
  frequencyPenalty: -0.1,
  output: Output.object({
    schema: jsonSchema(responseSchema),
    name: "redbox_generation_candidate",
  }),
  maxRetries: 0,
  telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
  providerOptions: { openrouter: { strictJsonSchema: true } },
});`;

export const BEDROCK_SNAPSHOT = String.raw`import { generateText, Output, jsonSchema } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

const provider = createAmazonBedrock({
  region: "ap-southeast-2",
  credentialProvider: defaultProvider(),
  // ReDBox's fetch limits size and blocks redirects
});

// ReDBox stops the call after 90 seconds
const result = await generateText({
  model: provider("amazon.nova-lite-v1:0"),
  messages, // built from the profile and the researcher's inputs
  temperature: 0.2,
  maxOutputTokens: 4096,
  topP: 0.9,
  stopSequences: ["END"],
  output: Output.object({
    schema: jsonSchema(responseSchema),
    name: "redbox_generation_candidate",
  }),
  maxRetries: 0,
  telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
});`;
