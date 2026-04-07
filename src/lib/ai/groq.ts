import { randomUUID } from "node:crypto";

import { defaultPolicyConfig } from "@/lib/policy/engine";
import { agentActionSchema, type AgentPlanRequestInput } from "@/lib/validation/schemas";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1] ?? text;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model did not return a valid JSON object.");
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export async function generateAgentActionWithGroq(input: AgentPlanRequestInput) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing. Set it in .env.local.");
  }

  const systemPrompt = [
    "You are an AI agent planner for Fortexa.",
    "Return only one JSON object matching this schema:",
    '{"id":"string","name":"string","kind":"api_payment|tool_access|transfer|endpoint_call","target":"string","domain":"string","amountXLM":number,"tool":"string(optional)","outputPreview":"string(optional)","metadata":{}}',
    "Hard rules:",
    "- amountXLM must be a positive number with realistic testnet values (1-250).",
    "- domain must be a plausible hostname (no protocol).",
    "- target must be specific and stable, not random gibberish.",
    "- If uncertain, choose a conservative action under 50 XLM.",
    "- Do not include explanations, markdown, or extra text.",
  ].join("\n");

  const userPrompt = [
    `Goal: ${input.goal}`,
    input.context ? `Context: ${input.context}` : "",
    input.destinationHint ? `Destination hint: ${input.destinationHint}` : "",
    `Allowed domains example: ${defaultPolicyConfig.allowedDomains.join(", ")}`,
    `Blocked domains example: ${defaultPolicyConfig.blockedDomains.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const completionResponse = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!completionResponse.ok) {
    const detail = await completionResponse.text();
    throw new Error(`Groq request failed (${completionResponse.status}): ${detail}`);
  }

  const payload = (await completionResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq response did not include model content.");
  }

  const parsed = JSON.parse(extractJsonObject(content));

  const validated = agentActionSchema.parse({
    ...parsed,
    id: parsed.id || randomUUID(),
  });

  return validated;
}
