'use client';

import { Lottie } from 'lottie-react';

type LottieName =
  | 'success-checkmark'
  | 'loading-spinner'
  | 'empty-box'
  | 'notification-bell'
  | 'wallet'
  | 'rocket'
  | 'confetti';

type LottiePlayerProps = {
  readonly name: LottieName;
  readonly loop?: boolean;
  readonly className?: string;
};

/**
 * Plays a public Lottie file. The player only mounts where it is used.
 */
export function LottiePlayer({ name, loop = true, className = 'h-16 w-16' }: LottiePlayerProps): JSX.Element {
  return <Lottie src={`/lottie/${name}.json`} loop={loop} autoplay className={className} />;
}
