import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const { label, apiKey, baseUrl, model } = await req.json();

  if (!label || !apiKey) {
    return Response.json({ error: 'label and apiKey are required' }, { status: 400 });
  }

  const client = new OpenAI({
    baseURL: baseUrl || 'https://api.openai.com/v1',
    apiKey: apiKey,
  });

  const systemPrompt =
    'You are a personality designer. Given a label describing a personality style, write a short description (2-3 sentences) that captures the tone, attitude, and communication style. Write in Indonesian. Keep it under 150 characters.';

  try {
    const completion = await client.chat.completions.create({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a personality description for: "${label}"` },
      ],
      max_tokens: 150,
    });

    const description = completion.choices?.[0]?.message?.content?.trim() || `${label} personality`;
    const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + crypto.randomBytes(2).toString('hex');

    return Response.json({ id, label, description });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to generate personality';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
