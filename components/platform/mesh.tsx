/**
 * @file components/platform/mesh.tsx
 *
 * Fixed warm background. It does not scroll and never sits above content.
 * A route change moves the gradients once.
 */

'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const SPOTS = [
  { x: '10%', y: '0%', x2: '86%' },
  { x: '72%', y: '8%', x2: '18%' },
  { x: '28%', y: '18%', x2: '80%' },
] as const;

function spotIndex(pathname: string): number {
  let hash = 0;
  for (let index = 0; index < pathname.length; index += 1) {
    hash = (hash + pathname.charCodeAt(index) * (index + 1)) % SPOTS.length;
  }
  return hash;
}

export function PlatformMesh(): JSX.Element {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const spot = SPOTS[spotIndex(pathname)] ?? SPOTS[0];
    node.style.setProperty('--mesh-x', spot.x);
    node.style.setProperty('--mesh-y', spot.y);
    node.style.setProperty('--mesh-x2', spot.x2);
  }, [pathname]);

  return <div ref={ref} className="platform-mesh" aria-hidden="true" />;
}
