import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Models
export const MODEL_FAST = "claude-haiku-4-5-20251001";       // health check
export const MODEL_SMART = "claude-sonnet-4-6";              // scrape extraction, copy gen
export const MODEL_STRATEGIST = "claude-opus-4-7";           // architecture proposal
