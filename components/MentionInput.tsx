'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface Agent {
  id: string;
  name: string;
  color: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  agents: Agent[];
 }

export default function MentionInput({ value, onChange, onSend, agents }: MentionInputProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [value]);

  // Check for @mention trigger
  useEffect(() => {
    const cursorPos = textareaRef.current?.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);

    if (match) {
      setMentionFilter(match[1].toLowerCase());
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  }, [value]);

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter)
  );

  const insertMention = (agentName: string) => {
    const cursorPos = textareaRef.current?.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const newBefore = textBeforeCursor.replace(/@\w*$/, `@${agentName} `);
    onChange(newBefore + textAfterCursor);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredAgents.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex]?.name || '');
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... Use @ to mention an AI agent"
        rows={1}
        className="w-full bg-transparent px-1 py-2 text-sm text-white resize-none focus:outline-none placeholder-gray-500"
      />

      {showMentions && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] rounded-2xl shadow-2xl overflow-hidden z-50 ring-1 ring-white/10">
          {filteredAgents.map((agent, i) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => insertMention(agent.name)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors ${
                i === mentionIndex ? 'bg-white/10' : ''
              }`}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: agent.color }}
              >
                {agent.name[0]}
              </span>
              <span className="text-white">{agent.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
