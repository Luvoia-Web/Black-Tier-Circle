'use client';

import { useState, type ReactNode } from 'react';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { MagneticButton } from '@/components/motion/MagneticButton';

type SaveButtonProps = {
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
};

export function SaveButton({ busy = false, children, onClick }: SaveButtonProps): JSX.Element {
  const [saved, setSaved] = useState(false);

  return (
    <MagneticButton
      className="btc-btn-primary mt-4 gap-2"
      disabled={busy}
      onClick={() => {
        setSaved(true);
        onClick();
      }}
    >
      {busy ? <LottiePlayer name="loading-spinner" loop className="h-4 w-4" /> : null}
      {!busy && saved ? <LottiePlayer name="success-checkmark" loop={false} className="h-5 w-5" /> : null}
      {busy ? 'Saving…' : children}
    </MagneticButton>
  );
}
