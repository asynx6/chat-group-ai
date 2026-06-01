# AI Group Chat — Planning & Rules

## Design Colors (FIXED)
| Elemen | Hex |
|---|---|
| Background utama | `#2a2a2a` |
| Hover / Card / Surface | `#1a1a1a` |
| Teks | `#ffffff` |
| Tombol / Aksen | `#f97316` (orange) |
| Markdown highlight / dark element | `#000000` |

---

## Tech Stack
- **Framework**: Next.js 14 (App Router) — sudah di-init sendiri
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Storage**: File lokal JSON (`/data/`)
- **AI SDK**: OpenAI SDK (compatible semua provider OpenAI-format)
- **Streaming**: Server-Sent Events (SSE)

---

## Struktur File

```
/app
  /page.tsx                  ← main chat room
  /settings/page.tsx         ← kelola AI agents
  /api/chat/route.ts         ← SSE streaming handler
  /api/personality/route.ts  ← generate personality prompt via AI

/data
  agents.json                ← list AI + config + personality
  personalities.json         ← list semua kepribadian yang tersedia
  messages.json              ← riwayat chat (optional, in-memory juga oke)

/components
  ChatBubble.tsx
  TypingIndicator.tsx
  AgentAvatar.tsx
  ImageUpload.tsx
  MentionInput.tsx           ← autocomplete @mention
  PersonalityPicker.tsx      ← saat add/edit AI
```

---

## Data Schema

### `agents.json`
```json
[
  {
    "id": "claude-1",
    "name": "Claude",
    "model": "claude-sonnet-4-20250514",
    "baseUrl": "https://api.anthropic.com/v1",
    "apiKey": "sk-ant-...",
    "supportsVision": true,
    "personalityId": "dewasa",
    "personalityPrompt": "...",
    "color": "#a78bfa",
    "muted": false
  }
]
```

### `personalities.json`
```json
[
  { "id": "ngelawak", "label": "Ngelawak", "description": "Suka humor, sering bercanda, gampang ketawa" },
  { "id": "dewasa", "label": "Dewasa", "description": "Bijak, tenang, kasih perspektif matang" },
  { "id": "soft-spoken", "label": "Soft Spoken", "description": "Lembut, baik, ga pernah kasar" },
  { "id": "kasar", "label": "Kasar", "description": "Blak-blakan, ga disaring, sering misuh" },
  { "id": "skeptis", "label": "Skeptis", "description": "Suka nanya balik, meragukan, kritis" },
  { "id": "hype", "label": "Hype", "description": "Antusias berlebihan, exclamation marks everywhere" },
  { "id": "pendiam", "label": "Pendiam", "description": "Jawab seperlunya, ga banyak omong" },
  { "id": "drama", "label": "Drama Queen", "description": "Lebay, dramatisasi semua hal" }
]
```

---

## Global AI Rules (WAJIB masuk ke setiap system prompt)

```
RULES — WAJIB DIIKUTI:

1. BACA HANYA PESAN TERBARU. Pesan lama sudah ada di context, jangan diulang atau dirangkum ulang. Langsung respon yang relevan.

2. JAWAB SINGKAT DAN NATURAL seperti manusia chat. Bukan essay. Bukan bullet point. Kecuali diminta jelasin sesuatu yang panjang, jawab 1-3 kalimat aja.

3. BISA REPLY KE AI LAIN. Kalau ada AI lain yang ngomong sesuatu yang lucu/salah/menarik, boleh langsung balas ke mereka. Contoh: "bego lu deepseek 😂" atau "wkwk iya juga sih".

4. JANGAN FORMAL. Ga perlu bilang "Tentu saja!" atau "Pertanyaan yang bagus!". Langsung to the point.

5. KALAU ADA @TAG ke AI lain: tetap baca konteks percakapan, boleh komentar singkat tapi jangan dominasi — itu giliran yang di-tag.

6. REAKSI WAJAR: boleh ketawa (wkwk/haha), setuju, ga setuju, atau diam kalau emang ga relevan buat lo.

7. IMAGE: kalau lo ga support vision dan dapet [IMAGE:hashid], WAJIB bilang ga bisa lihat dengan cara yang sesuai kepribadian lo. Contoh untuk yang kasar: "Anjing penasaran banget, ga bisa buka tai lah". Untuk yang soft: "Aduh maaf aku ga bisa lihat gambarnya 😢".

8. JANGAN bertingkah kayak AI assistant. Lo adalah karakter dengan kepribadian sendiri yang lagi nongkrong bareng.
```

---

## Flow Logika — Siapa yang Respon

### Tanpa @tag
- Semua AI aktif respon secara paralel
- Tiap AI dapet: system prompt kepribadian + global rules + context percakapan + pesan terbaru
- Response di-stream satu per satu atau paralel dengan typing indicator masing-masing

### Dengan @tag (contoh: `@deepseek buatin fungsi sorting`)
- **DeepSeek**: respon penuh, ini giliran dia
- **AI lain**: dapet context termasuk pesan ke deepseek + response deepseek, boleh komentar singkat (setuju/kritik/ketawa) — tapi bukan jawab tugas utamanya

### AI balas AI
- Setelah semua AI respon, context ter-update
- AI bisa "lihat" response teman-temannya dan boleh follow-up natural
- Contoh flow:
  ```
  User: gimana codingan di atas?
  DeepSeek: udah bagus sih tapi bagian loopnya bisa dioptimasi
  Claude: bener juga, mending pake map() aja
  GPT: setuju sama claude wkwk
  DeepSeek: oke deh 😅
  ```

### User kontrol
- **Mute semua**: semua AI diam, hanya user yang bisa ngomong
- **Mute per AI**: AI tertentu skip giliran
- **Un-mute**: aktif lagi

---

## Sistem Kepribadian

### Flow Add Model
1. User buka Settings → Add AI
2. Isi: nama, model, base URL, API key, supports vision (toggle)
3. Bagian kepribadian:
   - Tampilkan **list kepribadian yang tersedia** (dari `personalities.json`)
   - Tiap kepribadian punya status: `tersedia` (belum dipake AI manapun) atau `sudah dipakai oleh: [nama AI]`
   - User bisa:
     - **Pilih kepribadian existing** → langsung assign
     - **Klik "Buat Kepribadian Baru"** → lihat bawah

### Flow Buat Kepribadian Baru
1. User klik tombol **"+ Buat Kepribadian"**
2. Isi form:
   - Label kepribadian (contoh: "Nyinyir", "Philosopher", "Toxic Positivity")
   - Deskripsi singkat (1 kalimat)
3. Klik **"Generate Prompt"**
4. Sistem kirim request ke AI (model default/cheapest) dengan prompt:

```
Buatkan system prompt kepribadian untuk AI chat dengan karakter berikut:
Label: {label}
Deskripsi: {deskripsi}

Rules:
- Harus natural, bukan corporate AI
- Tetap bisa ngerti konteks teknikal
- Boleh misuh/kasar kalau karakternya memang gitu
- Max 150 kata
- Bahasa Indonesia campur english natural (bukan formal)

Output: hanya system prompt-nya saja, tanpa penjelasan tambahan.
```

5. Hasil generate langsung ditampilkan, user bisa edit manual sebelum save
6. Simpan ke `personalities.json` + langsung assign ke AI yang lagi dibuat

### AI Milih Kepribadian Otomatis (opsional)
- Kalau user ga milih kepribadian, sistem random assign dari yang `tersedia`
- Kalau semua sudah terpakai, boleh share kepribadian

---

## Image Handling

```
Upload gambar → hash SHA-256 → simpan ke /public/uploads/[hash].[ext]

Context yang dikirim ke AI:
- AI dengan supportsVision: true  → dapet base64 image
- AI dengan supportsVision: false → dapet teks "[IMAGE:{hash8char}]"

AI non-vision WAJIB trigger roast sesuai kepribadian (lihat global rules point 7)
```

---

## Typing Indicator
- Muncul: `{nama AI} lagi ngetik...` pas request mulai
- Per AI punya typing state sendiri
- Bisa muncul bersamaan kalau paralel
- Hilang otomatis pas stream selesai

---

## UI Notes
- Markdown rendered di chat bubble (bold, code block, list)
- Tiap AI punya warna avatar berbeda (set saat add, atau auto-assign dari palette)
- Tombol mute per AI ada di hover avatar atau settings
- Input box support `@mention` dengan autocomplete dropdown nama AI yang aktif
- Attachment button untuk image upload

---

## Token Efficiency Rules (Ringkasan)
| Rule | Detail |
|---|---|
| Baca pesan terbaru aja | Context lama sudah ada, jangan re-read atau rangkum |
| Jawab singkat | 1-3 kalimat default, panjang hanya kalau diminta |
| Paralel request | Semua AI di-hit sekaligus, bukan sequential |
| Stream langsung | Jangan buffer — token langsung ke UI |
| No preamble | Jangan "Tentu saja!" atau "Pertanyaan bagus!" |

---

## Development Order

| Phase | Yang Dibangun |
|---|---|
| P1 | Settings page — CRUD AI agents + personalities system |
| P2 | `/api/chat` route + SSE streaming ke satu AI |
| P3 | Chat UI — bubble, avatar, markdown, scroll |
| P4 | Multi-AI paralel + typing indicator |
| P5 | @mention parsing + filter responder |
| P6 | Image upload + hash + vision routing |
| P7 | Mute control + AI balas AI flow |
| P8 | Polish UI, warna, animasi ringan |
