import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function GET() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'personalities.json'), 'utf-8');
  return Response.json(JSON.parse(raw));
}
