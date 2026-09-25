/**
 * Shared motion tokens. Components read these so springs stay consistent.
 */

export const SPRING = {
  gentle: { type: 'spring' as const, stiffness: 100, damping: 20 },
  bouncy: { type: 'spring' as const, stiffness: 300, damping: 20 },
  stiff: { type: 'spring' as const, stiffness: 400, damping: 30 },
  slow: { type: 'spring' as const, stiffness: 60, damping: 20 },
};

export const FADE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: SPRING.gentle,
};

export const FADE_IN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

export const SLIDE_RIGHT = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
  transition: SPRING.gentle,
};

export const SLIDE_LEFT = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: SPRING.gentle,
};

export const SCALE_IN = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: SPRING.bouncy,
};

export const STAGGER_CHILDREN = {
  animate: { transition: { staggerChildren: 0.07 } },
};

export const STAGGER_FAST = {
  animate: { transition: { staggerChildren: 0.04 } },
};

export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const },
};
