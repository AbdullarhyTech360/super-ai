import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, CircleHelp, Info, LogOut, MessageSquare, Moon, Monitor, Palette, PanelLeft, PanelLeftClose, PanelLeftOpen, Settings, Sun, User } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { resolveAssetUrl } from '@/lib/api';
import { API_BASE_URL } from '@/lib/api';
import AppLogo from './AppLogo';
import AboutDeveloper from './AboutDeveloper';

interface SidebarShellProps {
  sidebarHeaderExtra?: ReactNode;
  sidebarContent?: ReactNode;
  sidebarRailContent?: ReactNode;
  themeExtras?: ReactNode;
  themeLabel?: string;
  hideProfileNav?: boolean;
  title?: ReactNode;
  subtitle?: string;
  scrollable?: boolean;
  children: ReactNode;
}

const NAV_ITEMS = [
  { path: '/chat', label: 'Chat', icon: MessageSquare },
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/help', label: 'Help', icon: CircleHelp },
];

const SidebarShell = ({
  sidebarHeaderExtra,
  sidebarContent,
  sidebarRailContent,
  themeExtras,
  themeLabel,
  hideProfileNav,
  title,
  subtitle,
  scrollable = true,
  children,
}: SidebarShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, authenticatedFetch } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{ full_name: string; email: string; avatar_url?: string | null } | null>(null);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const handleThemeChange = (checked: boolean) => setTheme(checked ? 'dark' : 'light');

  const userInitials = (userInfo?.full_name ?? 'User')
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const userAvatarSrc = resolveAssetUrl(userInfo?.avatar_url);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch user info');
        const data = (await response.json()) as { full_name: string; email: string; avatar_url?: string | null };
        setUserInfo(data);
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    fetchUserInfo();
  }, [authenticatedFetch]);

  const isActive = (path: string) => location.pathname === path;

  const navItems = NAV_ITEMS.filter(item => !(hideProfileNav && item.path === '/profile'));
  const defaultThemeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
  const displayThemeLabel = themeLabel ?? defaultThemeLabel;

  return (
    <div className="h-screen flex bg-background overflow-hidden w-full">
      {/* Mobile overlay */}
      {isSidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 bg-card/95 backdrop-blur-md border-r border-border transition-all duration-300 ease-in-out shadow-elegant",
        isMobile && (isSidebarOpen ? "translate-x-0" : "-translate-x-full"),
        isSidebarOpen ? "w-80" : "w-16"
      )}>
        {/* Expanded sidebar */}
        <div className={cn(
          "absolute inset-0 flex flex-col overflow-hidden",
          !isSidebarOpen && "hidden"
        )}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border bg-gradient-hover shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AppLogo size={26} />
                <h2 className="text-lg font-semibold gradient-text">Super AI</h2>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSidebarOpen(false)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:bg-hover-accent hover:text-foreground fast-transition"
                    aria-label="Collapse sidebar"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar</TooltipContent>
              </Tooltip>
            </div>
            <Separator className="my-3" />

            {sidebarHeaderExtra}
          </div>

          {/* Dynamic sidebar content */}
          {sidebarContent ? (
            <ScrollArea className="flex-1">
              <div className="p-4">{sidebarContent}</div>
            </ScrollArea>
          ) : (
            <div className="flex-1" />
          )}

          {/* Sidebar Footer */}
          <div className="border-t border-border p-3 space-y-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground fast-transition"
                >
                  <Palette className="w-4 h-4" />
                  Theme
                  <span className="ml-auto text-xs font-medium">
                    {displayThemeLabel}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 max-h-[70vh] overflow-y-auto">
                {themeExtras}
                {themeExtras && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  Mode
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as 'dark' | 'light' | 'system')}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="w-4 h-4 mr-2" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="w-4 h-4 mr-2" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="w-4 h-4 mr-2" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator />
            {navItems.map(item => (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full justify-start gap-2 text-muted-foreground hover:text-foreground fast-transition",
                  isActive(item.path) && "text-primary"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAboutDialogOpen(true)}
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground fast-transition"
            >
              <Info className="w-4 h-4" />
              About the Developer
            </Button>
          </div>
        </div>

        {/* Collapsed sidebar (icon rail) */}
        <div className={cn(
          "absolute inset-0 flex flex-col items-center py-4",
          isSidebarOpen && "hidden"
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(true)}
                className="h-9 w-9 p-0 text-muted-foreground hover:bg-hover-accent hover:text-foreground fast-transition"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>

          {sidebarRailContent}

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleThemeChange(!isDark)}
                className="h-9 w-9 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground fast-transition"
                aria-label="Toggle dark mode"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isDark ? 'Light mode' : 'Dark mode'}</TooltipContent>
          </Tooltip>

          {NAV_ITEMS.slice(2).map(item => (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(item.path)}
                  className="h-9 w-9 p-0 mt-1 text-muted-foreground hover:bg-hover-muted hover:text-foreground fast-transition"
                  aria-label={item.label}
                >
                  <item.icon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAboutDialogOpen(true)}
                className="h-9 w-9 p-0 mt-1 text-muted-foreground hover:bg-hover-muted hover:text-foreground fast-transition"
                aria-label="About the Developer"
              >
                <Info className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">About the Developer</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
      <div className={cn(
        "flex flex-col h-screen flex-1 min-w-0 transition-all duration-300 ease-in-out overflow-hidden",
        isMobile ? "ml-0" : isSidebarOpen ? "md:ml-80" : "md:ml-16"
      )}>
        {/* Header */}
        <div className="bg-background/95 backdrop-blur-md border-b border-border px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(true)}
                className="h-9 w-9 p-0 flex-shrink-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground md:hidden"
                aria-label="Open navigation menu"
                title="Open navigation menu"
              >
                <PanelLeft className="w-5 h-5" />
              </Button>
            )}
            <div className="min-w-0">
              {title == null ? (
                <h1 className="text-lg font-semibold text-foreground truncate max-w-[50vw]">Super AI</h1>
              ) : typeof title === 'string' ? (
                <h1 className="text-lg font-semibold text-foreground truncate max-w-[50vw]">{title}</h1>
              ) : (
                title
              )}
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <nav className="flex items-center flex-shrink-0 gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                  title="Theme"
                  aria-label="Theme"
                >
                  <Palette className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 max-h-[70vh] overflow-y-auto">
                {themeExtras}
                {themeExtras && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  Mode
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as 'dark' | 'light' | 'system')}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="w-4 h-4 mr-2" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="w-4 h-4 mr-2" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="w-4 h-4 mr-2" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 p-0 rounded-full"
                  title="Account"
                  aria-label="Account"
                >
                  <Avatar className="h-8 w-8">
                    {userAvatarSrc && <AvatarImage src={userAvatarSrc} alt={userInfo?.full_name ?? 'User'} />}
                    <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white text-xs font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-2 flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {userAvatarSrc && <AvatarImage src={userAvatarSrc} alt={userInfo?.full_name ?? 'User'} />}
                    <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white text-sm font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{userInfo?.full_name || 'User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{userInfo?.email || '—'}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="w-4 h-4 mr-2" />
                  View profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        {/* Page content */}
        {scrollable ? (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full bg-transparent overflow-x-hidden">
              {children}
            </ScrollArea>
          </div>
        ) : children}
      </div>

      {/* About Developer Dialog */}
      <AboutDeveloper open={aboutDialogOpen} onOpenChange={setAboutDialogOpen} />
    </div>
  );
};

export default SidebarShell;