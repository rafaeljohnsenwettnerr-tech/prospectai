import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Target, LayoutDashboard, Settings, Zap } from "lucide-react";
import PerplexityAttribution from "./PerplexityAttribution";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useHashLocation();

  const navItems = [
    { href: "/", icon: Settings, label: "Oppsett" },
    { href: "/dashboard", icon: LayoutDashboard, label: "Leads" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer group" data-testid="logo">
              {/* Logo SVG */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="ProspectAI logo">
                <rect width="28" height="28" rx="6" fill="hsl(196 80% 48%)" />
                <circle cx="14" cy="10" r="4" fill="white" opacity="0.9"/>
                <path d="M6 22 Q14 14 22 22" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <circle cx="8" cy="22" r="1.5" fill="white" opacity="0.7"/>
                <circle cx="14" cy="19" r="1.5" fill="white"/>
                <circle cx="20" cy="22" r="1.5" fill="white" opacity="0.7"/>
              </svg>
              <span className="font-bold text-base tracking-tight">
                Prospect<span className="text-primary">AI</span>
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}>
                <div
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                    location === href
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </div>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 text-center text-xs text-muted-foreground">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
