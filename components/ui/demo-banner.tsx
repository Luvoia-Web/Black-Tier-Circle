'use client';

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;
  return (
    <div style={{
      background: 'rgba(109, 40, 217, 0.12)',
      backdropFilter: 'blur(8px)',
      color: 'rgb(196, 181, 253)',
      borderBottom: '1px solid rgba(139, 92, 246, 0.25)',
      textAlign: 'center' as const,
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: 500,
      letterSpacing: '0.01em',
      zIndex: 9999,
      position: 'relative' as const,
    }}>
      🔓 Demo Mode Active — You have full platform access for evaluation. In production, admin features are restricted to the platform admin only.
    </div>
  );
}
