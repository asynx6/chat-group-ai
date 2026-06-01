interface AgentAvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md';
}

export default function AgentAvatar({ name, color, size = 'md' }: AgentAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {name[0].toUpperCase()}
    </div>
  );
}
