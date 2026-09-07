
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, CircleHelp, LogOut, MessageCircle, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '@/hooks/useAuth';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-foreground">
            <MessageCircle className="w-8 h-8 text-primary" />
            Super AI
          </Link>
          {isAuthenticated && (
            <nav className="flex items-center gap-1" aria-label="Workspace navigation">
              <Link to="/chat">
                <Button
                  variant="ghost"
                  size="sm"
                  className={isActive('/chat') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                  title="Chat"
                >
                  <Bot className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Chat</span>
                </Button>
              </Link>
              <Link to="/profile">
                <Button
                  variant="ghost"
                  size="sm"
                  className={isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                  title="Profile"
                >
                  <User className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Profile</span>
                </Button>
              </Link>
              <Link to="/settings">
                <Button
                  variant="ghost"
                  size="sm"
                  className={isActive('/settings') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                  title="Settings"
                >
                  <Settings className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>
              </Link>
              <Link to="/help">
                <Button
                  variant="ghost"
                  size="sm"
                  className={isActive('/help') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                  title="Help"
                >
                  <CircleHelp className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Help</span>
                </Button>
              </Link>
            </nav>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout(); navigate('/'); }}
                className="text-muted-foreground hover:text-destructive"
                title="Log out"
              >
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    <User className="w-4 h-4 mr-2" />
                    Login
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" style={{ background: 'var(--gradient-primary)' }} className="text-primary-foreground hover:opacity-90">
                    Sign Up
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
