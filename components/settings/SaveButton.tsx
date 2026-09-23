/**
 * @file components/settings/SaveButton.tsx
 *
 * Save action with a loading label.
 */

type SaveButtonProps = {
  readonly busy?: boolean;
  readonly children: React.ReactNode;
  readonly onClick: () => void;
};

export function SaveButton({ busy = false, children, onClick }: SaveButtonProps): JSX.Element {
  return (
    <button type="button" className="btc-btn-primary mt-4" disabled={busy} onClick={onClick}>
      {busy ? 'Saving…' : children}
    </button>
  );
}
