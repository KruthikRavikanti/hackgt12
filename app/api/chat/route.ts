import { DuetSystemPrompt } from "@/app/api/chat/systemPrompt";
import { streamText, convertToCoreMessages, Message, ImagePart } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Models } from "@/app/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, apiKey, model } = await req.json();

  let llm;
  let options: Record<string, any> = {};

  if (model.startsWith("gpt")) {
    const openai = createOpenAI({
      compatibility: "strict", // strict mode, enable when using the OpenAI API
      apiKey,
    });

    llm = openai(model);
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }

  const initialMessages = messages.slice(0, -1);
  const currentMessage: Message = messages[messages.length - 1];
  const attachments = currentMessage.experimental_attachments || [];
  const imageParts: ImagePart[] = attachments.map((file) => ({
    type: "image",
    image: new URL(file.url),
  }));

  const result = await streamText({
    model: llm,
    messages: [
      ...convertToCoreMessages(initialMessages),
      {
        role: "user",
        content: [
          {
            type: "text",
            text: currentMessage.content,
          },
          ...imageParts,
        ],
      },
    ],
    system: DuetSystemPrompt,
    ...options,
  });

  return result.toAIStreamResponse();
}
