import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

export function getOpenAIClient() {
  const env = getServerEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to the server environment.");
  }

  return { client: new OpenAI({ apiKey: env.OPENAI_API_KEY }), model: env.OPENAI_TEXT_MODEL };
}

export async function generateJson(prompt: string) {
  const { client, model } = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error("The AI provider returned an empty draft.");
  }

  return JSON.parse(content) as unknown;
}
