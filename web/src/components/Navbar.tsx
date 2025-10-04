
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Settings, LogOut, User } from 'lucide-react';
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
          {/* Authenticated Navigation */}
          {isAuthenticated && (
            <div className="hidden md:flex items-center gap-6">
              <Link 
                to="/chat" 
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive('/chat') ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                Chat
              </Link>
              <Link 
                to="/settings" 
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive('/settings') ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                Settings
              </Link>
              <Link 
                to="/profile" 
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive('/profile') ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                Profile
              </Link>
              <Link 
                to="/help" 
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive('/help') ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                Help
              </Link>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout(); navigate('/'); }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
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
