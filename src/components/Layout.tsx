import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../auth';
import { LogOut, LayoutDashboard, Settings, PenTool, Calendar, BarChart3, Menu, X, ChevronLeft, ChevronRight, Briefcase, User, Plug, Bot, Layers, Bookmark, Film } from 'lucide-react';
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

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Agent Studio', path: '/agents', icon: Bot },
    { name: 'Brands', path: '/brands', icon: Briefcase },
    { name: 'Brand Strategy Hub', path: '/brand-strategy', icon: Layers },
    { name: 'Content Generator', path: '/generate', icon: PenTool },
    { name: 'AI Video Studio', path: '/video-studio', icon: Film },
    { name: 'Trends Vault', path: '/trends-vault', icon: Bookmark },
    { name: 'Scheduler', path: '/schedule', icon: Calendar },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Integrations', path: '/integrations', icon: Plug },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="font-bold text-lg tracking-tight">WotSocial</span>
        </Link>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-600 hover:text-black transition-colors"
          aria-label="Toggle Menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 bg-white border-r border-gray-200 flex flex-col z-50 transition-all duration-300 ease-in-out",
        // Mobile states
        isMobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full w-64",
        // Desktop states
        "md:relative md:translate-x-0",
        isDesktopCollapsed ? "md:w-20" : "md:w-64"
      )}>
        <div className={cn(
          "p-6 border-b border-gray-100 flex items-center justify-between",
          isDesktopCollapsed ? "md:px-4" : "md:px-6"
        )}>
          <Link to="/dashboard" className={cn(
            "flex items-center gap-2 transition-all duration-300",
            isDesktopCollapsed && "md:justify-center md:w-full"
          )}>
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shrink-0">
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
            className="hidden md:flex p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors"
            title={isDesktopCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isDesktopCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={isDesktopCollapsed ? item.name : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-gray-100 text-black" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-black",
                  isDesktopCollapsed && "md:justify-center md:px-0"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className={cn(
                  "transition-opacity duration-300",
                  isDesktopCollapsed ? "md:hidden" : "md:block",
                  "block" // always block on mobile
                )}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            title={isDesktopCollapsed ? "Sign Out" : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-black transition-colors",
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
        <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 hidden sm:inline">Active Brand Workspace</span>
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
