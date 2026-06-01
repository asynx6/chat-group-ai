interface AgentAvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md';
  imageUrl?: string;
}

export default function AgentAvatar({ name, color, size = 'md', imageUrl }: AgentAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover shrink-0 ring-1 ring-white/20`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {name[0].toUpperCase()}
    </div>
  );
}
