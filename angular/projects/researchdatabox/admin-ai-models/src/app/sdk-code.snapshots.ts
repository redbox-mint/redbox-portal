// Reviewed adapter construction and call settings; update deliberately when the adapter contract changes.
export const OPENROUTER_SNAPSHOT = String.raw`import { generateText, Output, jsonSchema } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const provider = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "X-Title": "ReDBox"
  },
  supportsStructuredOutputs: true,
  fetch: guardedFetch,
  transformRequestBody: (sdkBody) => ({
    ...sdkBody,
    ...{
      "temperature": 0.2,
      "max_tokens": 4096,
      "top_p": 0.9,
      "seed": 7,
      "stop": [
        "END"
      ],
      "presence_penalty": 0.1,
      "frequency_penalty": -0.1
    },
    model: "anthropic/claude-haiku-4.5",
    stream: false,
    tools: undefined,
    plugins: undefined,
    provider: {
      "zdr": true,
      "data_collection": "deny",
      "allow_fallbacks": false,
      "sort": "price",
      "only": [
        "Anthropic"
      ],
      "ignore": [
        "Other"
      ],
      "order": [
        "Anthropic"
      ],
      "require_parameters": true
    },
  }),
  metadataExtractor,
});

const abortController = new AbortController();
const timeout = setTimeout(() => abortController.abort(), 90000);
try {
  const result = await generateText({
    model: provider("anthropic/claude-haiku-4.5"),
    messages,
    output: Output.object({
      schema: jsonSchema(responseSchema),
      name: "redbox_generation_candidate",
    }),
    maxRetries: 0,
    abortSignal: abortController.signal,
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    providerOptions: { openrouter: { strictJsonSchema: true } },
  });
} finally {
  clearTimeout(timeout);
}`;

export const BEDROCK_SNAPSHOT = String.raw`import { generateText, Output, jsonSchema } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
const provider = createAmazonBedrock({
  region: "ap-southeast-2",
  baseURL: "https://bedrock-runtime.ap-southeast-2.amazonaws.com",
  ...(apiKey ? { apiKey } : { credentialProvider: defaultProvider() }),
  headers: {},
  fetch: guardedFetch,
});

const abortController = new AbortController();
const timeout = setTimeout(() => abortController.abort(), 90000);
try {
  const result = await generateText({
    model: provider("amazon.nova-lite-v1:0"),
    messages,
    output: Output.object({
      schema: jsonSchema(responseSchema),
      name: "redbox_generation_candidate",
    }),
    maxRetries: 0,
    abortSignal: abortController.signal,
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    ...{
      "temperature": 0.2,
      "maxOutputTokens": 4096,
      "topP": 0.9,
      "stopSequences": [
        "END"
      ]
    },
    ...(instructions ? { instructions } : {}),
  });
} finally {
  clearTimeout(timeout);
}`;
