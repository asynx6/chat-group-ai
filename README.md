# AI Group Chat

Chat multi-AI dengan SSE streaming, di mana beberapa AI agent bisa ngobrol bareng dalam satu ruangan. Dibangun dengan Next.js 16.

## Fitur

- **Multi-AI parallel chat** — semua agent merespon secara paralel
- **SSE streaming** — respon real-time dengan Server-Sent Events
- **@mention** — sebut agent spesifik untuk interaksi tertarget
- **AI-to-AI reply** — agent otomatis membalas mention dari agent lain
- **Vision support** — upload gambar untuk agent yang mendukung vision (GPT-4o, Claude, dll)
- **Retry otomatis** — 10x retry dengan jeda 10 detik jika API error
- **Mute control** — bisukan agent yang tidak ingin ikut nimbrung
- **Custom model** — ketik manual nama model, tidak terbatas dropdown
- **Personality system** — pilih atau generate kepribadian agent via AI
- **Dark theme** — UI gelap dengan floating pills, tanpa garis/border

## Tech Stack

- **Next.js 16** (App Router + Turbopack)
- **React 19**
- **Tailwind CSS v4**
- **OpenAI SDK** (kompatibel dengan semua provider OpenAI-compatible)
- **react-markdown** (render markdown response)

## Cara Menjalankan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Setup

1. Buka halaman Settings (ikon gear di kanan atas)
2. Tambah agent dengan mengisi:
   - **Name** — nama panggilan agent
   - **Model** — nama model (contoh: `gpt-4o`, `claude-sonnet-4-20250514`, `gemini-2.0-flash`)
   - **Base URL** — endpoint API (default OpenAI: `https://api.openai.com/v1`)
   - **API Key** — disimpan aman di localStorage browser
   - **Profile Model Link** (opsional) — link ke dokumentasi/model card
3. Pilih personality atau generate baru via AI
4. Kembali ke chat dan mulai ngobrol

## Struktur Proyek

```
app/
  page.tsx              — halaman utama chat
  settings/page.tsx     — halaman setup agent
  globals.css           — styling global + animasi
  api/
    chat/route.ts       — SSE streaming endpoint
    agents/route.ts     — CRUD agent (REST)
    personalities/route.ts  — daftar personalities
    personality/route.ts    — generate personality via AI
components/
  ChatBubble.tsx        — bubble chat dengan markdown
  MentionInput.tsx      — textarea dengan @mention autocomplete
  ImageUpload.tsx       — upload gambar + SHA-256 hash
  PersonalityPicker.tsx — pilih/generate kepribadian
data/
  agents.json           — konfigurasi agent (tidak di-commit)
  personalities.json    — daftar kepribadian
  messages.json         — log chat (opsional)
```

## Lisensi

MIT
