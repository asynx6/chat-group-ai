'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import ChatBubble from '@/components/ChatBubble';
import MentionInput from '@/components/MentionInput';
import ImageUpload from '@/components/ImageUpload';

interface Agent {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  supportsVision: boolean;
  personalityId: string;
  personalityPrompt: string;
  color: string;
  muted: boolean;
  profileLink: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  agentImage?: string;
  timestamp: number;
  replyTo?: string;
  isError?: boolean;
}

interface ImageAttachment {
  file: File;
  base64: string;
  hash: string;
}

interface MemoryEntry {
  text: string;
  timestamp: number;
  permanent: boolean;
}

// --- localStorage helpers ---
const MESSAGES_KEY = 'chat_messages';
const AGENT_MEMORY_KEY = 'agent_memory_v2';
const MAX_TEMP_MEMORIES = 50;

const PERMANENT_KEYWORDS = [
  'ingat', 'jangan lupa', 'selamanya', 'penting', 'catat', 'simpan',
  'remember', 'forever', 'selalu ingat', 'ingat selalu', 'jangan pernah lupa',
  'nama aku', 'nama saya', 'panggil aku', 'panggil saya',
];

function detectPermanent(text: string): boolean {
  const lower = text.toLowerCase();
  return PERMANENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(MESSAGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveMessages(msgs: Message[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs)); } catch {}
}

function loadAgentMemory(): Record<string, MemoryEntry[]> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(AGENT_MEMORY_KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function saveAgentMemory(mem: Record<string, MemoryEntry[]>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(AGENT_MEMORY_KEY, JSON.stringify(mem)); } catch {}
}

function parseMentions(text: string, agents: Agent[]): string[] {
  const mentioned = new Set<string>();
  for (const agent of agents) {
    const regex = new RegExp(`@${agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      mentioned.add(agent.id);
    }
  }
  return Array.from(mentioned);
}

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [resetDialog, setResetDialog] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(5);
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [agentMemory, setAgentMemory] = useState<Record<string, MemoryEntry[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const initializedRef = useRef(false);
  const isNearBottomRef = useRef(true);

  // Load saved messages + agent memory on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setMessages(loadMessages());
    setAgentMemory(loadAgentMemory());
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(() => {});
  }, []);

  // Smart scroll: only auto-scroll when user is near bottom
  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 200;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!resetDialog) {
      setResetCountdown(5);
      return;
    }
    if (resetCountdown <= 0) return;
    const timer = setTimeout(() => setResetCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resetDialog, resetCountdown]);

  const getActiveAgents = () => agents.filter((a) => !a.muted);

  const getTargetAgents = (text: string): Agent[] => {
    const mentionedIds = parseMentions(text, agents);
    if (mentionedIds.length > 0) {
      return agents.filter((a) => !a.muted && mentionedIds.includes(a.id));
    }
    return getActiveAgents();
  };

  const toggleMute = async (agentId: string) => {
    const updated = agents.map((a) =>
      a.id === agentId ? { ...a, muted: !a.muted } : a
    );
    setAgents(updated);

    const agent = updated.find((a) => a.id === agentId);
    if (agent) {
      await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
    }
  };

  const buildAgentHistory = (agent: Agent, baseHistory: { role: string; content: string }[]) => {
    // Build global context: info about all other AIs in the chat
    const otherAgents = agents.filter((a) => a.id !== agent.id && !a.muted);
    const globalContextParts: string[] = [];
    if (otherAgents.length > 0) {
      globalContextParts.push(`\n## AI Lain di Chat Ini:\nKamu sedang dalam group chat dengan AI lain. Berikut daftar AI yang juga ikut ngobrol:`);
      otherAgents.forEach((a) => {
        const personality = a.personalityPrompt ? ` — ${a.personalityPrompt}` : '';
        globalContextParts.push(`- **${a.name}** (${a.model})${personality}`);
      });
      globalContextParts.push('\nKamu bisa menyapa, merespon, atau berdebat dengan AI lain. Jangan berpura-pura menjadi AI lain. Gunakan nama mereka saat merujuk.');
    }

    const identityPrompt = `Kamu adalah **${agent.name}** (model: ${agent.model}). Namamu "${agent.name}".${agent.personalityPrompt ? `\n\nKepribadianmu: ${agent.personalityPrompt}` : ''}\n\nSelalu ingat: namamu **${agent.name}**. Perkenalkan dirimu sebagai "${agent.name}" jika ditanya.${globalContextParts.join('\n')}`;

    const entries = agentMemory[agent.id];
    const hasMemories = entries && entries.length > 0;

    if (!hasMemories) {
      return [
        { role: 'system' as const, content: identityPrompt },
        ...baseHistory,
      ];
    }

    const permanent = entries!.filter((e) => e.permanent);
    const recent = entries!.filter((e) => !e.permanent).slice(0, 20);

    const parts: string[] = [identityPrompt];

    if (permanent.length > 0) {
      parts.push('\n---\n## INGATAN PENTING (wajib diingat selamanya):');
      permanent.forEach((m, i) => {
        parts.push(`${i + 1}. ${m.text}`);
      });
    }

    if (recent.length > 0) {
      parts.push('\n## Ingatan Baru-baru Ini:');
      recent.forEach((m, i) => {
        parts.push(`${i + 1}. ${m.text}`);
      });
    }

    parts.push('\n_Kamu bisa memilih ingatan mana yang relevan dengan percakapan sekarang. Abaikan yang tidak relevan._');

    const systemContent = parts.join('\n');
    return [
      { role: 'system' as const, content: systemContent },
      ...baseHistory,
    ];
  };

  const updateAgentMemory = (agentId: string, userText: string, agentResponse: string) => {
    if (!agentResponse.trim()) return;

    const isPermanent = detectPermanent(userText);
    const summary = agentResponse.slice(0, 400).replace(/\n+/g, ' ').trim();
    const entry: MemoryEntry = {
      text: `User: "${userText}" → Jawaban: "${summary}"`,
      timestamp: Date.now(),
      permanent: isPermanent,
    };

    setAgentMemory((prev) => {
      const existing = prev[agentId] || [];

      // Remove similar old entries
      const filtered = existing.filter((e) => {
        const similarity = e.text.includes(userText.slice(0, 30));
        if (similarity && !e.permanent) return false; // Replace non-permanent duplicates
        return true;
      });

      const updated = [entry, ...filtered];

      // Sort: permanent first, then by timestamp
      updated.sort((a, b) => {
        if (a.permanent && !b.permanent) return -1;
        if (!a.permanent && b.permanent) return 1;
        return b.timestamp - a.timestamp;
      });

      // Keep all permanent + up to MAX_TEMP_MEMORIES temporary
      const permanent = updated.filter((e) => e.permanent);
      const temporary = updated.filter((e) => !e.permanent).slice(0, MAX_TEMP_MEMORIES);

      const next = { ...prev, [agentId]: [...permanent, ...temporary] };
      saveAgentMemory(next);
      return next;
    });
  };

  const fetchAndStreamAgentResponse = async (
    agent: Agent,
    history: { role: string; content: string }[],
    replyTo?: string
  ): Promise<string> => {
    setTypingAgents((prev) => new Set(prev).add(agent.id));

    const assistantMsg: Message = {
      id: `${Date.now()}-${agent.id}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      content: '',
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      agentImage: agent.profileLink || undefined,
      timestamp: Date.now(),
      replyTo,
    };

    setMessages((prev) => [...prev, assistantMsg]);

    let fullContent = '';
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 10000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Create fresh controller per attempt
      const controller = new AbortController();
      abortControllersRef.current.set(agent.id, controller);

      // Check if stopped externally
      if (!abortControllersRef.current.has(agent.id)) return fullContent;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history,
            agentId: agent.id,
            images: agent.supportsVision
              ? images.map((img) => ({ base64: img.base64, hash: img.hash }))
              : [],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          const errorMsg = err.error || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }

        // Clear previous error content if retrying
        if (attempt > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: '', isError: false } : m
            )
          );
          fullContent = '';
        }

        const reader = res.body?.getReader();
        if (!reader) return '';

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              } else if (parsed.content) {
                fullContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + parsed.content }
                      : m
                  )
                );
              }
            } catch {
              // skip unparseable
            }
          }
        }

        // Success — clean up and return
        abortControllersRef.current.delete(agent.id);
        setTypingAgents((prev) => {
          const next = new Set(prev);
          next.delete(agent.id);
          return next;
        });
        return fullContent;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          abortControllersRef.current.delete(agent.id);
          return fullContent;
        }

        if (attempt < MAX_RETRIES) {
          // Update message with retry status
          const retriesLeft = MAX_RETRIES - attempt;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `⚠️ ${(err as Error).message || 'Gagal'}\n\n_Mencoba ulang dalam ${RETRY_DELAY / 1000} detik... (${retriesLeft}x lagi)_`, isError: true }
                : m
            )
          );

          // Wait before retry
          await new Promise((r) => setTimeout(r, RETRY_DELAY));

          // Check if stopped during wait
          if (!abortControllersRef.current.has(agent.id)) return fullContent;
        } else {
          // Final failure
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `❌ ${(err as Error).message || 'Gagal setelah 10x percobaan'}\n\n_Semua retry habis. Coba periksa API key atau koneksi._`, isError: true }
                : m
            )
          );
          abortControllersRef.current.delete(agent.id);
          setTypingAgents((prev) => {
            const next = new Set(prev);
            next.delete(agent.id);
            return next;
          });
          return '';
        }
      }
    }

    return fullContent;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && images.length === 0) return;

    const targetAgents = getTargetAgents(text);
    if (targetAgents.length === 0) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    const baseHistory = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Phase 1: All target agents respond to user
    const responses: { agent: Agent; text: string }[] = [];
    for (const agent of targetAgents) {
      const historyWithMemory = buildAgentHistory(agent, baseHistory);
      const responseText = await fetchAndStreamAgentResponse(agent, historyWithMemory);
      responses.push({ agent, text: responseText });
      updateAgentMemory(agent.id, text, responseText);
    }

    // Phase 2: AI-to-AI replies
    let aiReplies = [...responses];
    let maxRounds = 3;
    const alreadyReplied = new Set(targetAgents.map((a) => a.id));

    while (aiReplies.length > 0 && maxRounds > 0) {
      maxRounds--;
      const nextReplies: typeof responses = [];

      for (const reply of aiReplies) {
        const mentionedIds = parseMentions(reply.text, agents);
        for (const agentId of mentionedIds) {
          if (alreadyReplied.has(agentId)) continue;
          const agent = agents.find((a) => a.id === agentId);
          if (!agent || agent.muted) continue;

          alreadyReplied.add(agentId);

          const context = [
            ...baseHistory,
            ...responses.map((r) => ({
              role: 'assistant' as const,
              content: `[${r.agent.name}]: ${r.text}`,
            })),
          ];

          const contextWithMemory = buildAgentHistory(agent, context);
          const aiResponseText = await fetchAndStreamAgentResponse(
            agent,
            contextWithMemory,
            reply.agent.id
          );
          nextReplies.push({ agent, text: aiResponseText });
          updateAgentMemory(agent.id, reply.text.slice(0, 200), aiResponseText);
        }
      }
      aiReplies = nextReplies;
    }

    setImages([]);
    setSending(false);
  };

  const handleImageUpload = (file: File, base64: string, hash: string) => {
    setImages((prev) => [...prev, { file, base64, hash }]);
  };

  const stopAll = () => {
    for (const [, controller] of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    setTypingAgents(new Set());
    setSending(false);
  };

  const resetAll = () => {
    stopAll();
    setMessages([]);
    setImages([]);
    setAgentMemory({});
    if (typeof window !== 'undefined') {
      localStorage.removeItem(MESSAGES_KEY);
      localStorage.removeItem(AGENT_MEMORY_KEY);
    }
  };

  return (
    <div className="h-dvh bg-[#0f0f0f] flex flex-col">
      {/* Floating Agents Header */}
      {agents.length > 0 && (
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => toggleMute(agent.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all shrink-0 ${
                  agent.muted
                    ? 'bg-white/3 opacity-40 grayscale'
                    : 'bg-white/5 hover:bg-white/10'
                }`}
                title={agent.muted ? `Unmute ${agent.name}` : `Mute ${agent.name}`}
              >
                {agent.profileLink ? (
                  <img
                    src={agent.profileLink}
                    alt={agent.name}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-white/20"
                  />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: agent.color }}
                  >
                    {agent.name[0]}
                  </div>
                )}
                <span className="text-xs text-gray-300">{agent.name}</span>
                {typingAgents.has(agent.id) && (
                  <span className="flex gap-0.5 ml-1">
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </button>
            ))}
            <Link
              href="/settings"
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-all shrink-0 ml-auto"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span className="text-xs text-gray-400">Setup</span>
            </Link>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-4 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-600">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p className="text-gray-400 text-sm font-medium">Mulai percakapan</p>
              <p className="text-gray-600 text-xs mt-1 max-w-xs mx-auto">
                Ketik pesan untuk chatting dengan semua AI agents sekaligus
              </p>
              <p className="text-gray-700 text-xs mt-1">
                Gunakan <code className="bg-white/10 px-1 py-0.5 rounded text-gray-400">@NamaAgent</code> untuk mention spesifik
              </p>
              {agents.length === 0 && (
                <Link
                  href="/settings"
                  className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  Setup AI Agents
                </Link>
              )}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              {msg.replyTo && (
                <div className="text-[10px] text-gray-600 ml-12 mb-1 italic">
                  ↳ membalas @{agents.find((a) => a.id === msg.replyTo)?.name || 'unknown'}
                </div>
              )}
              <ChatBubble message={msg} />
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Input Pill */}
      <div className="p-3 pb-5 shrink-0 flex justify-center">
        <div className="w-full max-w-2xl bg-[#1a1a1a] rounded-3xl shadow-2xl ring-1 ring-white/10 flex items-center gap-2 px-3 py-2">
          <ImageUpload onUpload={handleImageUpload} disabled={sending} />
          <div className="flex-1">
            <MentionInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              agents={agents.filter((a) => !a.muted)}
            />
          </div>
          <button
            onClick={sending ? stopAll : handleSend}
            disabled={!sending && !input.trim() && images.length === 0}
            className={`p-2 rounded-full transition-colors shrink-0 ${
              sending
                ? 'bg-red-500 hover:bg-red-400 text-white'
                : 'bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
            title={sending ? 'Stop' : 'Kirim'}
          >
            {sending ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Floating Reset Button */}
      <button
        onClick={() => setResetDialog(true)}
        className="fixed bottom-4 right-6 z-40 w-11 h-11 rounded-full bg-[#1a1a1a] border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 text-gray-400 hover:text-red-400 flex items-center justify-center transition-all shadow-lg"
        title="Reset chat & ingatan"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      </button>

      {/* Reset Confirmation Modal */}
      {resetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Reset Chat</h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  Ini akan menghapus <span className="text-red-400 font-medium">semua chat</span> dan <span className="text-red-400 font-medium">ingatan semua AI</span>. Data tidak bisa dikembalikan.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResetDialog(false)}
                className="px-4 py-2 text-xs bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => { resetAll(); setResetDialog(false); }}
                disabled={resetCountdown > 0}
                className="px-4 py-2 text-xs bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-w-[80px]"
              >
                {resetCountdown > 0 ? `${resetCountdown}s` : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
