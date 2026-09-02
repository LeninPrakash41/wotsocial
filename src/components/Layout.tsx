import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../auth';
import { LogOut, LayoutDashboard, Settings, PenTool, Calendar, BarChart3, Menu, X, ChevronLeft, ChevronRight, Briefcase, User, Plug, Bot, Layers, Bookmark, Film, Folder, Megaphone, Instagram, MessageSquare, Cpu, UserCheck, Image, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';
import { BrandSelector } from './BrandSelector';

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  const handleLogout = async () => {
    auth.logout();
    navigate('/');
  };

  const navGroups = [
    {
      category: 'CORE STUDIO',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Agent Studio', path: '/agents', icon: Bot },
        { name: 'Brands Hub', path: '/brands', icon: Briefcase },
        { name: 'Brand Strategy', path: '/brand-strategy', icon: Layers },
        { name: 'Content Studio', path: '/generate', icon: PenTool },
        { name: 'AI Video Studio', path: '/video-studio', icon: Film },
        { name: 'Poster Studio', path: '/poster-studio', icon: Image },
        { name: 'Blog Studio', path: '/blog-studio', icon: FileText },
      ]
    },
    {
      category: 'GROWTH & MARKETING',
      items: [
        { name: 'Meta Ads Manager', path: '/meta-ads', icon: Megaphone },
        { name: 'Lead Management CRM', path: '/leads', icon: UserCheck },
        { name: 'Instagram Studio', path: '/instagram-marketing', icon: Instagram },
        { name: 'WhatsApp Business', path: '/whatsapp-marketing', icon: MessageSquare },
      ]
    },
    {
      category: 'CONNECTORS & AI',
      items: [
        { name: 'Claude MCP Connector', path: '/mcp-connector', icon: Cpu },
        { name: 'Integrations & APIs', path: '/integrations', icon: Plug },
      ]
    },
    {
      category: 'ASSETS & SCHEDULER',
      items: [
        { name: 'Media Vault', path: '/media-library', icon: Folder },
        { name: 'Trends Vault', path: '/trends-vault', icon: Bookmark },
        { name: 'Content Schedule', path: '/schedule', icon: Calendar },
        { name: 'Analytics', path: '/analytics', icon: BarChart3 },
      ]
    },
    {
      category: 'SETTINGS',
      items: [
        { name: 'Profile & Security', path: '/profile', icon: User },
      ]
    }
  ];

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas flex flex-col md:h-screen md:flex-row md:overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden bg-surface border-b border-line px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-ink rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="font-bold text-lg tracking-tight">WotSocial</span>
        </Link>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-ink-3 hover:text-ink transition-colors"
          aria-label="Toggle Menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-ink/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 bg-surface border-r border-line flex flex-col z-50 transition-all duration-300 ease-in-out",
        // Mobile states
        isMobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full w-64",
        // Desktop states
        "md:relative md:translate-x-0",
        isDesktopCollapsed ? "md:w-20" : "md:w-64"
      )}>
        <div className={cn(
          "p-6 border-b border-line flex items-center justify-between",
          isDesktopCollapsed ? "md:px-4" : "md:px-6"
        )}>
          <Link to="/dashboard" className={cn(
            "flex items-center gap-2 transition-all duration-300",
            isDesktopCollapsed && "md:justify-center md:w-full"
          )}>
            <div className="w-8 h-8 bg-ink rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <span className={cn(
              "font-bold text-xl tracking-tight transition-opacity duration-300",
              isDesktopCollapsed ? "md:hidden" : "md:block",
              "block" // always block on mobile
            )}>
              WotSocial
            </span>
          </Link>
          
          {/* Desktop Collapse Toggle */}
          <button 
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-sunk text-ink-4 hover:text-ink transition-colors"
            title={isDesktopCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isDesktopCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              {!isDesktopCollapsed && (
                <div className="px-3 text-[10px] font-bold tracking-wider uppercase text-ink-4 mb-1">
                  {group.category}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={isDesktopCollapsed ? item.name : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
                      isActive 
                        ? "bg-ink text-white shadow-sm" 
                        : "text-ink-3 hover:bg-sunk hover:text-ink",
                      isDesktopCollapsed && "md:justify-center md:px-0"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className={cn(
                      "transition-opacity duration-300 truncate",
                      isDesktopCollapsed ? "md:hidden" : "md:inline",
                      "inline" // always show on mobile
                    )}>
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-line">
          <button
            onClick={handleLogout}
            title={isDesktopCollapsed ? "Sign Out" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-ink-3 hover:bg-sunk hover:text-ink transition-colors",
              isDesktopCollapsed && "md:justify-center md:px-0"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={cn(
              "transition-opacity duration-300",
              isDesktopCollapsed ? "md:hidden" : "md:block",
              "block"
            )}>
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-surface border-b border-line px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-3 hidden sm:inline">Active Brand Workspace</span>
          </div>
          <div className="flex items-center gap-3">
            <BrandSelector />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
