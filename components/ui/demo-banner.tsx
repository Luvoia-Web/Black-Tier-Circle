'use client';

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;
  return (
    <div style={{
      background: 'rgba(220, 38, 38, 0.15)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      borderBottom: '1px solid rgba(220, 38, 38, 0.4)',
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
