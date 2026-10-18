import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { getInitials } from '../../lib/initials.js';

// Initials backgrounds; each pairs with white text at ≥ 4.5:1 contrast.
const INITIALS_COLORS = ['#592E83', '#1F5F8B', '#1E6B52', '#8A3B12', '#8E2A5C', '#4A4E69'];

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-24 text-2xl',
};

function colorFor(seed) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return INITIALS_COLORS[hash % INITIALS_COLORS.length];
}

/**
 * @param {{ name: string, src?: string | null, size?: keyof SIZES, online?: boolean, className?: string }} props
 */
export function Avatar({ name, src, size = 'md', online = false, className }) {
  // Remember which URL failed, so a new photo (new URL) is tried again.
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && failedSrc !== src;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {showImage ? (
        <img
          src={src}
          alt=""
          onError={() => setFailedSrc(src)}
          className={cn('rounded-full object-cover', SIZES[size])}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ backgroundColor: colorFor(name) }}
          className={cn(
            'inline-flex items-center justify-center rounded-full font-semibold text-white',
            SIZES[size],
          )}
        >
          {getInitials(name)}
        </span>
      )}
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-surface bg-success">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}
