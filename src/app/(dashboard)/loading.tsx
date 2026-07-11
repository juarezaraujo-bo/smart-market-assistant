'use client';

import React from 'react';

export default function LoadingDashboard() {
  return (
    <div style={{ padding: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div style={{ width: '300px', height: '40px', background: 'var(--bg-muted)', borderRadius: '8px' }} className="skeleton"></div>
        <div style={{ width: '150px', height: '40px', background: 'var(--bg-muted)', borderRadius: '8px' }} className="skeleton"></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '40px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: '140px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} className="skeleton"></div>
        ))}
      </div>

      <div style={{ height: '300px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} className="skeleton"></div>

      <style jsx>{`
        .skeleton {
          position: relative;
          overflow: hidden;
          background-color: var(--bg-muted);
        }
        .skeleton::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.03), transparent);
          animation: loading 1.5s infinite;
        }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
