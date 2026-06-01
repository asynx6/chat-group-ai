import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

async function loadAgent(agentId: string) {
  const raw = await fs.readFile(path.join(DATA_DIR, 'agents.json'), 'utf-8');
  const agents = JSON.parse(raw);
  return agents.find((a: { id: string }) => a.id === agentId);
}

export async function POST(req: NextRequest) {
  const { messages, agentId, images } = await req.json();

  if (!messages || !agentId) {
    return Response.json({ error: 'messages and agentId are required' }, { status: 400 });
  }

  const agent = await loadAgent(agentId);
  if (!agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 });
  }

  const apiKey = agent.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: `No API key configured for ${agent.name}. Please add it in Settings.` },
      { status: 400 }
    );
  }

  const client = new OpenAI({
    baseURL: agent.baseUrl,
    apiKey: apiKey,
  });

  const systemPrompt = agent.personalityPrompt
    ? `You are ${agent.name}. ${agent.personalityPrompt}\n\nRespond in the same language as the user's message. Keep responses concise and natural.`
    : `You are ${agent.name}, a helpful AI assistant. Respond in the same language as the user's message.`;

  // Only add system prompt if client hasn't already sent one
  const hasSystemMessage = messages.length > 0 && messages[0].role === 'system';
  const rawMessages: { role: string; content: string }[] = hasSystemMessage ? messages : [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  // Build final chat messages with multimodal image support
  const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = rawMessages.map(
    (m: { role: string; content: string }, i: number) => {
      // If this is the last user message and we have images, make it multimodal
      if (m.role === 'user' && i === rawMessages.length - 1 && images && images.length > 0) {
        const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
          { type: 'text', text: m.content || 'Describe this image:' },
        ];
        for (const img of images) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${img.base64}` },
          });
        }
        return { role: 'user', content: parts };
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      };
    });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await client.chat.completions.create({
          model: agent.model,
          messages: chatMessages,
          stream: true,
        });

        for await (const chunk of completion) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            const data = JSON.stringify({ content: delta });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        // Send done signal
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        const data = JSON.stringify({ error: errMsg });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
