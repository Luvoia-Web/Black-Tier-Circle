'use client';

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;
  return (
    <div style={{
      background: 'linear-gradient(90deg, #6d28d9, #4f46e5)',
      color: '#fff',
      textAlign: 'center',
      padding: '10px 16px',
      fontSize: '13px',
      fontWeight: 500,
      letterSpacing: '0.01em',
      zIndex: 9999,
      position: 'relative',
    }}>
      🔓 Demo Mode Active — You have full platform access for evaluation. In production, owner features are restricted to the platform owner only.
    </div>
  );
}
