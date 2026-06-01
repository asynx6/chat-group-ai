'use client';

import { useState, useEffect } from 'react';

interface Personality {
  id: string;
  label: string;
  description: string;
}

interface Props {
  value: string;
  onChange: (personalityId: string, prompt: string) => void;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export default function PersonalityPicker({ value, onChange, apiKey, baseUrl, model }: Props) {
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');

  useEffect(() => {
    fetch('/api/personalities')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPersonalities(data);
      })
      .catch(() => {});
  }, []);

  const selected = personalities.find((p) => p.id === value);

  const handleGenerate = async () => {
    if (!newLabel.trim() || !apiKey) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel,
          apiKey,
          baseUrl: baseUrl || 'https://api.openai.com/v1',
          model: model || 'gpt-4o',
        }),
      });
      const data = await res.json();
      if (data.id) {
        setPersonalities((prev) => [...prev, data]);
        onChange(data.id, data.description);
        setNewLabel('');
      }
    } catch (err) {
      console.error('Failed to generate personality:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-200">Personality</label>

      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
        {personalities.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id, p.description)}
            className={`text-left p-3 rounded-lg border transition-all ${
              value === p.id
                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <div className="font-medium text-sm text-white">{p.label}</div>
            <div className="text-xs text-gray-400 mt-1 line-clamp-2">{p.description}</div>
          </button>
        ))}
      </div>

      {value && (
        <div className="mt-3">
          <label className="block text-xs text-gray-400 mb-1">Custom prompt override:</label>
          <textarea
            value={customPrompt || selected?.description || ''}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              onChange(value, e.target.value);
            }}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Custom personality prompt..."
          />
        </div>
      )}

      <div className="border-t border-white/10 pt-3">
        <div className="text-xs text-gray-400 mb-2">Generate new personality with AI:</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Ngelawak, Puitis..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !newLabel.trim() || !apiKey}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? '...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
