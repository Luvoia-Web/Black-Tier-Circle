/**
 * @file components/ai/AIOrb.tsx
 *
 * Spinning gradient orb used as the assistant avatar and welcome mark.
 *
 * @module Components
 */

type AIOrbProps = {
  readonly size?: number;
  readonly thinking?: boolean;
  readonly rings?: boolean;
};

/**
 * Decorative gradient orb. Hidden from assistive tech.
 */
export function AIOrb({ size = 36, thinking = false, rings = false }: AIOrbProps): JSX.Element {
  return (
    <span className={`ai-orb${thinking ? ' is-thinking' : ''}${rings ? ' has-rings' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      {rings ? (
        <>
          <span className="ai-orb-ring" />
          <span className="ai-orb-ring" />
          <span className="ai-orb-ring" />
        </>
      ) : null}
      <span className="ai-orb-core">AI</span>
    </span>
  );
}
