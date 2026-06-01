import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

async function readAgents() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'agents.json'), 'utf-8');
  return JSON.parse(raw);
}

async function writeAgents(agents: unknown) {
  await fs.writeFile(
    path.join(DATA_DIR, 'agents.json'),
    JSON.stringify(agents, null, 2),
    'utf-8'
  );
}

export async function GET() {
  const agents = await readAgents();
  return Response.json(agents);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const agents = await readAgents();

  const newAgent = {
    id: body.id || `${body.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name: body.name,
    model: body.model,
    baseUrl: body.baseUrl || 'https://api.openai.com/v1',
    apiKey: body.apiKey || '',
    supportsVision: body.supportsVision ?? false,
    personalityId: body.personalityId || '',
    personalityPrompt: body.personalityPrompt || '',
    color: body.color || '#6b7280',
    muted: body.muted ?? false,
  };

  agents.push(newAgent);
  await writeAgents(agents);
  return Response.json(newAgent, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const agents = await readAgents();
  const idx = agents.findIndex((a: { id: string }) => a.id === body.id);
  if (idx === -1) {
    return Response.json({ error: 'Agent not found' }, { status: 404 });
  }
  agents[idx] = { ...agents[idx], ...body };
  await writeAgents(agents);
  return Response.json(agents[idx]);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const agents = await readAgents();
  const filtered = agents.filter((a: { id: string }) => a.id !== body.id);
  if (filtered.length === agents.length) {
    return Response.json({ error: 'Agent not found' }, { status: 404 });
  }
  await writeAgents(filtered);
  return Response.json({ success: true });
}
