import Image from 'next/image';
import { cn, initials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-24 w-24 text-3xl',
};

const pxSizes = { sm: 32, md: 40, lg: 56, xl: 96 };

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const dimension = pxSizes[size];

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={dimension}
        height={dimension}
        className={cn('shrink-0 rounded-full object-cover', sizes[size], className)}
        unoptimized
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-elevated font-semibold text-muted ring-1 ring-border',
        sizes[size],
        className,
      )}
    >
      {initials(name) || '?'}
    </div>
  );
}
