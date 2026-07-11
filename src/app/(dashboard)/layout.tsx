'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Store, 
  Package, 
  UploadCloud, 
  AlertTriangle, 
  History, 
  LogOut,
  Settings,
  Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Mercados', href: '/markets', icon: Store },
  { label: 'Inventário', href: '/inventory', icon: Package },
  { label: 'Importar', href: '/uploads', icon: UploadCloud },
  { label: 'Alertas', href: '/alerts', icon: AlertTriangle },
  { label: 'Logs WhatsApp', href: '/logs', icon: History },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div style={{ display: 'flex' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px', padding: '0 8px' }}>
          <div style={{ width: '32px', height: '32px', background: 'var(--primary)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={18} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '18px' }}>SmartMarket</span>
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                  background: isActive ? 'var(--bg-muted)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '4px',
                  transition: 'all 0.2s'
                }}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <Link 
            href="/settings" 
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px' }}
          >
            <Settings size={18} />
            Configurações
          </Link>
          <button 
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', color: 'var(--danger)', background: 'none', border: 'none', fontSize: '14px', width: '100%', cursor: 'pointer' }}
          >
            {isLoggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            {isLoggingOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Admin: GoldTech</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}>
              GT
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
