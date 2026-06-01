'use client';

import ReactMarkdown from 'react-markdown';
import AgentAvatar from './AgentAvatar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  timestamp: number;
}

interface ChatBubbleProps {
  message: Message;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 animate-fade-in-up ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && message.agentName && (
        <AgentAvatar name={message.agentName} color={message.agentColor || '#6b7280'} />
      )}

      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {!isUser && message.agentName && (
          <div className="text-xs text-gray-400 mb-1 ml-1">{message.agentName}</div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-tr-md'
              : 'bg-white/10 text-gray-100 rounded-tl-md'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:bg-black/20 [&_code]:px-1 [&_code]:rounded [&_ul]:list-disc [&_ol]:list-decimal [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-gray-400">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
          U
        </div>
      )}
    </div>
  );
}
