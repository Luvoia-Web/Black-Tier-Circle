'use client';

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;
  return (
    <div style={{
      background: 'rgba(109, 40, 217, 0.2)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      textAlign: 'center',
      padding: '10px 16px',
      fontSize: '13px',
      fontWeight: 500,
      letterSpacing: '0.01em',
      zIndex: 9999,
      position: 'relative',
    }}>
      🔓 Demo Mode Active — You have full platform access for evaluation. In production, admin features are restricted to the platform admin only.
    </div>
  );
}
