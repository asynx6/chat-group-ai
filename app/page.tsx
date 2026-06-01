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
}

interface ImageAttachment {
  file: File;
  base64: string;
  hash: string;
}

// --- localStorage helpers ---
const MESSAGES_KEY = 'chat_messages';
const AGENT_MEMORY_KEY = 'agent_memory';

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(MESSAGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveMessages(msgs: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs));
  } catch {}
}

function loadAgentMemory(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(AGENT_MEMORY_KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function saveAgentMemory(mem: Record<string, string[]>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AGENT_MEMORY_KEY, JSON.stringify(mem));
  } catch {}
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
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [agentMemory, setAgentMemory] = useState<Record<string, string[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const initializedRef = useRef(false);

  // Load saved messages + agent memory on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setMessages(loadMessages());
    setAgentMemory(loadAgentMemory());
  }, []);

  // Save messages to localStorage whenever they change (skip initial load)
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(() => {});
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
    const memories = agentMemory[agent.id];
    if (!memories || memories.length === 0) return baseHistory;

    const memoryContext = `[INGATAN KAMU dari percakapan sebelumnya — gunakan ini untuk konteks dan jangan diabaikan]:\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;

    return [
      { role: 'system' as const, content: memoryContext },
      ...baseHistory,
    ];
  };

  const updateAgentMemory = (agentId: string, userText: string, agentResponse: string) => {
    if (!agentResponse.trim()) return;

    const entry = `User: "${userText}" → Kamu menjawab: "${agentResponse.slice(0, 300)}"`;
    setAgentMemory((prev) => {
      const existing = prev[agentId] || [];
      // Keep last 15 memory entries, newest first, avoid duplicates
      const filtered = existing.filter((m) => !m.includes(userText));
      const updated = [entry, ...filtered].slice(0, 15);
      const next = { ...prev, [agentId]: updated };
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
              m.id === assistantMsg.id ? { ...m, content: '' } : m
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
                ? { ...m, content: `⚠️ ${(err as Error).message || 'Gagal'}\n\n_Mencoba ulang dalam ${RETRY_DELAY / 1000} detik... (${retriesLeft}x lagi)_` }
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
                ? { ...m, content: `❌ ${(err as Error).message || 'Gagal setelah 10x percobaan'}\n\n_Semua retry habis. Coba periksa API key atau koneksi._` }
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
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
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
    </div>
  );
}
