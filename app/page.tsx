'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ChatBubble from '@/components/ChatBubble';
import AgentAvatar from '@/components/AgentAvatar';
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
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  timestamp: number;
  replyTo?: string;
}

interface ImageAttachment {
  file: File;
  base64: string;
  hash: string;
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [showMuted, setShowMuted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(() => {});

    // Detect mobile
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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

  const streamAIResponse = async (
    agent: Agent,
    history: { role: string; content: string }[],
    replyTo?: string
  ) => {
    setTypingAgents((prev) => new Set(prev).add(agent.id));

    const assistantMsg: Message = {
      id: `${Date.now()}-${agent.id}`,
      role: 'assistant',
      content: '',
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      timestamp: Date.now(),
      replyTo,
    };

    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortControllersRef.current.set(agent.id, controller);

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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${err.error || 'Failed to get response'}` }
              : m
          )
        );
        return '';
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: `Error: ${parsed.error}` }
                    : m
                )
              );
            } else if (parsed.content) {
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
    } catch (err) {
      if ((err as Error).name === 'AbortError') return '';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${err instanceof Error ? err.message : 'Request failed'}` }
            : m
        )
      );
    } finally {
      setTypingAgents((prev) => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
      abortControllersRef.current.delete(agent.id);
    }

    // Get the current state of this message
    return '';
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

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Phase 1: All target agents respond to user
    const responses: { agent: Agent; text: string }[] = [];
    for (const agent of targetAgents) {
      const responseText = await fetchAndStreamAgentResponse(agent, history);
      responses.push({ agent, text: responseText });
    }

    // Phase 2: AI-to-AI replies — check if any AI mentioned another AI
    let aiReplies = [...responses];
    let maxRounds = 3; // prevent infinite loops
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
            ...history,
            ...responses.map((r) => ({
              role: 'assistant' as const,
              content: `[${r.agent.name}]: ${r.text}`,
            })),
          ];

          const aiResponseText = await fetchAndStreamAgentResponse(
            agent,
            context,
            reply.agent.id
          );
          nextReplies.push({ agent, text: aiResponseText });
        }
      }
      aiReplies = nextReplies;
    }

    setImages([]);
    setSending(false);
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
      timestamp: Date.now(),
      replyTo,
    };

    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortControllersRef.current.set(agent.id, controller);

    let fullContent = '';

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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${err.error || 'Failed to get response'}` }
              : m
          )
        );
        return '';
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: `Error: ${parsed.error}` }
                    : m
                )
              );
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
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return fullContent;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${err instanceof Error ? err.message : 'Request failed'}` }
            : m
        )
      );
    } finally {
      setTypingAgents((prev) => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
      abortControllersRef.current.delete(agent.id);
    }

    return fullContent;
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

  const visibleAgents = showMuted ? agents : agents.filter((a) => !a.muted);

  return (
    <div className="h-screen bg-[#0f0f0f] flex">
      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-72 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : sidebarOpen ? 'w-64' : 'w-0'
        } bg-[#0a0a0a] border-r border-white/10 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}
      >
        <div className="p-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Agents</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <AgentAvatar name={agent.name} color={agent.color} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{agent.name}</div>
                <div className="text-[10px] text-gray-500 truncate">
                  {agent.personalityId || agent.model}
                </div>
              </div>
              {typingAgents.has(agent.id) ? (
                <div className="flex gap-0.5">
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <button
                  onClick={() => toggleMute(agent.id)}
                  className={`text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    agent.muted
                      ? 'bg-red-500/20 text-red-400 opacity-100'
                      : 'bg-white/10 text-gray-400'
                  }`}
                  title={agent.muted ? 'Unmute' : 'Mute'}
                >
                  {agent.muted ? 'Muted' : 'Mute'}
                </button>
              )}
            </div>
          ))}
          {agents.filter((a) => a.muted).length > 0 && (
            <button
              onClick={() => setShowMuted(!showMuted)}
              className="w-full text-xs text-gray-500 hover:text-gray-300 py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              {showMuted ? 'Hide muted' : `${agents.filter((a) => a.muted).length} muted agents`}
            </button>
          )}
          {agents.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-4">
              No agents configured.
              <br />
              <a href="/settings" className="text-purple-400 hover:underline">Add in Settings</a>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/10">
          <a
            href="/settings"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Settings
          </a>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <h1 className="text-sm font-medium text-gray-300">Group Chat</h1>
          {agents.length > 0 && (
            <span className="text-xs text-gray-500">{agents.filter((a) => !a.muted).length} active agents</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center animate-fade-in">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-600">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <p className="text-gray-400 text-sm font-medium">Start a conversation</p>
                <p className="text-gray-600 text-xs mt-1 max-w-xs mx-auto">
                  Type a message to chat with all AI agents simultaneously
                </p>
                <p className="text-gray-700 text-xs mt-1">
                  Use <code className="bg-white/10 px-1 py-0.5 rounded text-gray-400">@AgentName</code> to mention specific agents
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id}>
                {msg.replyTo && (
                  <div className="text-[10px] text-gray-600 ml-10 mb-1 italic">
                    ↳ replying to @{agents.find((a) => a.id === msg.replyTo)?.name || 'unknown'}
                  </div>
                )}
                <ChatBubble message={msg} />
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
              <ImageUpload onUpload={handleImageUpload} disabled={sending} />
              <MentionInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                agents={agents.filter((a) => !a.muted)}
              />
              <button
                onClick={sending ? stopAll : handleSend}
                disabled={!sending && !input.trim() && images.length === 0}
                className={`p-2.5 text-white rounded-xl transition-colors shrink-0 ${
                  sending
                    ? 'bg-red-500 hover:bg-red-400'
                    : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title={sending ? 'Stop all' : 'Send'}
              >
                {sending ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
