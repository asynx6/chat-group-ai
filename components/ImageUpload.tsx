'use client';

import { useRef, useState } from 'react';

interface ImageUploadProps {
  onUpload: (file: File, base64: string, hash: string) => void;
  disabled?: boolean;
}

async function computeSHA256(dataUrl: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(dataUrl);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function ImageUpload({ onUpload, disabled }: ImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const hash = await computeSHA256(dataUrl);
      setPreview(dataUrl);
      onUpload(file, base64, hash);
    };
    reader.readAsDataURL(file);
  };

  const clearPreview = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
        title="Upload image"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />

      {preview && (
        <div className="relative">
          <img src={preview} alt="Preview" className="w-10 h-10 rounded-lg object-cover" />
          <button
            onClick={clearPreview}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px]"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
