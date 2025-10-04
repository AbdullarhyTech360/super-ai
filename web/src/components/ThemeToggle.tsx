import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={toggleTheme}
      className="w-9 h-9"
    >
{theme === 'dark' ? (
  <Sun className="h-4 w-4" />
) : theme === 'light' ? (
  <Moon className="h-4 w-4" />
) : (
  <Monitor className="h-4 w-4" />
)}
    </Button>
  );
};

export default ThemeToggle;