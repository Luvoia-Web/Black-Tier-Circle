'use client';

import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';

const Spline = lazy(() => import('@splinetool/react-spline'));

type SplineSceneProps = {
  readonly url: string;
  readonly fallback: ReactNode;
  readonly className?: string;
};

/**
 * Loads a Spline scene after it enters the viewport.
 * The fallback stays visible until the scene reports it is ready.
 */
export function SplineScene({ url, fallback, className }: SplineSceneProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (node === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={`pointer-events-none ${className ?? ''}`}>
      {visible ? (
        <Suspense fallback={fallback}>
          <SplineBoundary fallback={fallback}>
            <SplineLoader url={url} fallback={fallback} />
          </SplineBoundary>
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}

function SplineLoader({ url, fallback }: { readonly url: string; readonly fallback: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  return (
    <div className="relative h-full w-full">
      <Spline scene={url} onLoad={() => setReady(true)} style={{ width: '100%', height: '100%' }} />
      {ready ? null : <div className="absolute inset-0">{fallback}</div>}
    </div>
  );
}

class SplineBoundary extends Component<
  { readonly children: ReactNode; readonly fallback: ReactNode },
  { readonly hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
