import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Models we use
export const MODEL_FAST = "claude-haiku-4-5-20251001";
export const MODEL_SMART = "claude-sonnet-4-6-20250929";
