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
  Loader2,
  ClipboardCheck,
  Menu,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Mercados', href: '/markets', icon: Store },
  { label: 'Inventário', href: '/inventory', icon: Package },
  { label: 'Importar', href: '/uploads', icon: UploadCloud },
  { label: 'Alertas', href: '/alerts', icon: AlertTriangle },
  { label: 'Painel de Decisões', href: '/decisoes', icon: ClipboardCheck },
  { label: 'Logs WhatsApp', href: '/logs', icon: History },
];

type SidebarContentProps = {
  pathname: string;
  isLoggingOut: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
};

function Brand() {
  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-icon">
        <AlertTriangle size={18} color="white" />
      </div>
      <span>SmartMarket</span>
    </div>
  );
}

function AccountBadge() {
  return (
    <div className="account-badge">
      <span>Admin: GoldTech</span>
      <div>GT</div>
    </div>
  );
}

function SidebarContent({ pathname, isLoggingOut, onLogout, onNavigate }: SidebarContentProps) {
  return (
    <>
      <Brand />

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={isActive ? 'active' : undefined}
              onClick={onNavigate}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <Link href="/settings" title="Configurações" aria-label="Configurações" onClick={onNavigate}>
          <Settings size={18} />
          Configurações
        </Link>
        <button onClick={onLogout} disabled={isLoggingOut} title="Sair" aria-label="Sair">
          {isLoggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
          {isLoggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsMobileMenuOpen(false);
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="dashboard-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <SidebarContent pathname={pathname} isLoggingOut={isLoggingOut} onLogout={handleLogout} />
      </aside>

      {isMobileMenuOpen && (
        <div className="mobile-drawer-layer">
          <button
            type="button"
            className="mobile-drawer-overlay"
            aria-label="Fechar menu"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="mobile-drawer" aria-label="Menu móvel">
            <div className="mobile-drawer-header">
              <Brand />
              <button
                type="button"
                className="mobile-icon-button"
                aria-label="Fechar menu"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <SidebarContent
              pathname={pathname}
              isLoggingOut={isLoggingOut}
              onLogout={handleLogout}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </aside>
        </div>
      )}

      <main className="main-content">
        <header className="mobile-topbar">
          <button
            type="button"
            className="mobile-icon-button"
            aria-label="Abrir menu"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={20} />
          </button>
          <span>SmartMarket</span>
          <AccountBadge />
        </header>

        <header className="desktop-account-header">
          <AccountBadge />
        </header>

        {children}
      </main>
    </div>
  );
}
