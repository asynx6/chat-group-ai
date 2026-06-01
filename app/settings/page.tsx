'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PersonalityPicker from '@/components/PersonalityPicker';

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

const PRESET_COLORS = ['#a78bfa', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#fb923c', '#f87171', '#a3e635'];

function loadApiKeys(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('ai_api_keys') || '{}');
  } catch {
    return {};
  }
}

function saveApiKeys(keys: Record<string, string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ai_api_keys', JSON.stringify(keys));
}

export default function SettingsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState({
    name: '',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    supportsVision: false,
    personalityId: '',
    personalityPrompt: '',
    color: '#a78bfa',
    profileLink: '',
  });

  useEffect(() => {
    setApiKeys(loadApiKeys());
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const resetForm = () => {
    setForm({
      name: '',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      supportsVision: false,
      personalityId: '',
      personalityPrompt: '',
      color: '#a78bfa',
      profileLink: '',
    });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const method = editingId ? 'PUT' : 'POST';
    const body = editingId ? { ...form, id: editingId } : form;

    try {
      const res = await fetch('/api/agents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Save API key to localStorage
        if (form.apiKey) {
          const newKeys = { ...apiKeys, [form.name]: form.apiKey };
          setApiKeys(newKeys);
          saveApiKeys(newKeys);
        }
        await fetchAgents();
        resetForm();
      }
    } catch (err) {
      console.error('Failed to save agent:', err);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      model: agent.model,
      baseUrl: agent.baseUrl,
      apiKey: apiKeys[agent.name] || '',
      supportsVision: agent.supportsVision,
      personalityId: agent.personalityId,
      personalityPrompt: agent.personalityPrompt,
      color: agent.color,
      profileLink: agent.profileLink || '',
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch('/api/agents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      await fetchAgents();
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </Link>
          AI Agent Settings
        </h1>

        {/* Agent List */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-300">Your AI Agents</h2>
          {loading ? (
            <div className="text-gray-400 text-sm">Loading...</div>
          ) : agents.length === 0 ? (
            <div className="text-gray-500 text-sm bg-white/5 rounded-lg p-6 text-center border border-white/5">
              No agents yet. Add one below to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-4"
                >
                  {agent.profileLink ? (
                    <img
                      src={agent.profileLink}
                      alt={agent.name}
                      className="w-10 h-10 rounded-full object-cover ring-1 ring-white/20"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white">{agent.name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {agent.model} · {agent.personalityId || 'No personality'}
                      {agent.supportsVision && ' · Vision'}
                      {agent.muted && ' · Muted'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleEdit(agent)}
                    className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: agent.id, name: agent.name })}
                    className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Form */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-300">
            {editingId ? 'Edit Agent' : 'Add New Agent'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Claude, GPT, Gemini"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Model</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. gpt-4o, claude-sonnet-4-20250514, gemini-2.0-flash"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Base URL</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">API Key</label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Profile Image URL */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">
                  Profile Image URL <span className="text-gray-500 font-normal">— opsional</span>
                </label>
                <input
                  type="url"
                  value={form.profileLink}
                  onChange={(e) => setForm({ ...form, profileLink: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Avatar Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        form.color === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Vision Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supportsVision"
                  checked={form.supportsVision}
                  onChange={(e) => setForm({ ...form, supportsVision: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="supportsVision" className="text-sm text-gray-200">
                  Supports Vision (image upload)
                </label>
              </div>
            </div>

            {/* Personality Picker */}
            <PersonalityPicker
              value={form.personalityId}
              onChange={(personalityId, prompt) =>
                setForm({ ...form, personalityId, personalityPrompt: prompt })
              }
              apiKey={form.apiKey}
              baseUrl={form.baseUrl}
              model={form.model}
            />

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
              >
                {editingId ? 'Update Agent' : 'Add Agent'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2.5 bg-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
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
                <h3 className="text-white font-semibold text-sm">Hapus Agent</h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  Yakin hapus <span className="text-white font-medium">&quot;{deleteTarget.name}&quot;</span>? Data tidak bisa dikembalikan.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
