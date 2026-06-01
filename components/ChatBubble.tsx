'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import AgentAvatar from './AgentAvatar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  agentImage?: string;
  timestamp: number;
  isError?: boolean;
}

interface ChatBubbleProps {
  message: Message;
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);

  const language = className?.replace('language-', '') || '';

  const extractText = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node && typeof node === 'object' && 'props' in node) {
      return extractText((node as { props: { children?: React.ReactNode } }).props.children);
    }
    return '';
  };

  const handleCopy = async () => {
    const text = extractText(children);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between bg-black/40 rounded-t-lg px-3 py-1.5 border-b border-white/5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span className="text-green-400">Tersalin</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>Salin</span>
            </>
          )}
        </button>
      </div>
      <pre className="bg-black/30 rounded-b-lg p-4 overflow-x-auto text-xs leading-relaxed !mt-0">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-white/10 text-indigo-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
      {children}
    </code>
  );
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 animate-fade-in-up ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && message.agentName && (
        <AgentAvatar name={message.agentName} color={message.agentColor || '#6b7280'} imageUrl={message.agentImage} />
      )}

      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {!isUser && message.agentName && (
          <div className="text-xs text-gray-400 mb-1 ml-1">{message.agentName}</div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-tr-md'
              : message.isError
                ? 'bg-red-500/10 border border-red-500/20 text-red-200 rounded-tl-md'
                : 'bg-white/10 text-gray-100 rounded-tl-md'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <div className="prose prose-invert prose-sm max-w-none
              [&_p]:my-1.5
              [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5
              [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
              [&_li]:my-0.5
              [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-400 [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-gray-400 [&_blockquote]:italic
              [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm
              [&_h1_h2_h3]:font-semibold [&_h1_h2_h3]:mt-4 [&_h1_h2_h3]:mb-2
              [&_hr]:border-white/10 [&_hr]:my-3
              [&_a]:text-indigo-400 [&_a]:underline
              [&_strong]:font-semibold [&_strong]:text-white
              [&_em]:italic
              [&_table]:w-full [&_table]:text-xs
              [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-white/5
              [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1
            ">
              <ReactMarkdown
                components={{
                  pre: ({ children, ...props }) => {
                    const child = children as { props?: { className?: string; children?: React.ReactNode } };
                    const className = child?.props?.className || '';
                    return <CodeBlock className={className}>{child?.props?.children || children}</CodeBlock>;
                  },
                  code: ({ className, children, ...props }) => {
                    // Inline code (no language- prefix)
                    if (!className) {
                      return <InlineCode>{children}</InlineCode>;
                    }
                    // Block code - handled by pre component
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="text-gray-500 italic">...</span>
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
