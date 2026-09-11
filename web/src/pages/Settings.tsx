
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Bell, Shield, Palette, Globe, LogOut, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/use-toast';

interface CurrentUser {
  id: string;
  full_name: string;
  email: string;
}

interface SettingsState {
  name: string;
  email: string;
  notifications: boolean;
  soundEnabled: boolean;
  language: string;
  autoSave: boolean;
}

const Settings = () => {
  const { authenticatedFetch, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsState>({
    name: '',
    email: '',
    notifications: true,
    soundEnabled: true,
    language: 'en',
    autoSave: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await authenticatedFetch('http://localhost:8000/api/me', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        if (!response.ok) throw new Error('Unable to load account settings');

        const user: CurrentUser = await response.json();
        setSettings(prev => ({
          ...prev,
          name: user.full_name,
          email: user.email,
          notifications: localStorage.getItem('notifications_enabled') !== 'false',
          soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
          language: localStorage.getItem('language') || 'en',
          autoSave: localStorage.getItem('auto_save_conversations') !== 'false',
        }));
      } catch (error) {
        console.error('Error loading settings:', error);
        setLoadError('Unable to load your settings right now.');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [authenticatedFetch]);

  const handleSettingChange = <Key extends keyof SettingsState>(key: Key, value: SettingsState[Key]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    localStorage.setItem('notifications_enabled', String(settings.notifications));
    localStorage.setItem('sound_enabled', String(settings.soundEnabled));
    localStorage.setItem('language', settings.language);
    localStorage.setItem('auto_save_conversations', String(settings.autoSave));
    toast({ title: 'Settings saved', description: 'Your application preferences have been saved.' });
  };

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  const initials = settings.name
    .split(' ')
    .filter(Boolean)
    .map(namePart => namePart[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center text-muted-foreground">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-20 pb-8 px-2 sm:px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 sm:mb-8 px-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Settings</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Manage your account and application preferences</p>
          </div>

          <div className="grid gap-4 sm:gap-6 px-2">
            {/* Profile Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Profile Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex flex-col sm:flex-row items-center gap-4">
                   <Avatar className="w-16 h-16">
                     <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white text-xl">
                       {initials}
                     </AvatarFallback>
                   </Avatar>
                 </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={settings.name}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={settings.email}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                   <div className="flex-1">
                     <Label htmlFor="notifications" className="text-base">Push Notifications</Label>
                     <p className="text-sm text-muted-foreground">Receive notifications for new messages</p>
                   </div>
                  <Switch
                    id="notifications"
                    checked={settings.notifications}
                    onCheckedChange={(checked) => handleSettingChange('notifications', checked)}
                  />
                </div>
                
                <Separator />
                
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                   <div className="flex-1">
                     <Label htmlFor="sound" className="text-base">Sound Effects</Label>
                     <p className="text-sm text-muted-foreground">Play sounds for message notifications</p>
                   </div>
                  <Switch
                    id="sound"
                    checked={settings.soundEnabled}
                    onCheckedChange={(checked) => handleSettingChange('soundEnabled', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Appearance Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Appearance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                   <div className="flex-1">
                     <Label htmlFor="darkMode" className="text-base">Dark Mode</Label>
                     <p className="text-sm text-muted-foreground">Switch to dark theme</p>
                   </div>
                  <Switch
                    id="darkMode"
                    checked={theme === 'dark'}
                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                  />
                </div>
              </CardContent>
            </Card>

            {/* General Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  General
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={settings.language} onValueChange={(value) => handleSettingChange('language', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Separator />
                
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                   <div className="flex-1">
                     <Label htmlFor="autoSave" className="text-base">Auto-save Conversations</Label>
                     <p className="text-sm text-muted-foreground">Automatically save your chat history</p>
                   </div>
                  <Switch
                    id="autoSave"
                    checked={settings.autoSave}
                    onCheckedChange={(checked) => handleSettingChange('autoSave', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security
                </CardTitle>
              </CardHeader>
               <CardContent className="space-y-3 sm:space-y-4">
                 <Button variant="outline" disabled className="w-full justify-start text-sm sm:text-base">
                   Change Password
                 </Button>
                 <Button variant="outline" disabled className="w-full justify-start text-sm sm:text-base">
                   Two-Factor Authentication
                 </Button>
                 <Button variant="outline" disabled className="w-full justify-start text-sm sm:text-base">
                   Download My Data
                 </Button>
               </CardContent>
            </Card>

            {/* Account Actions */}
            <Card>
              <CardContent className="pt-6">
                <Button variant="destructive" onClick={handleSignOut} className="w-full justify-center">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-center sm:justify-end">
              <Button 
                onClick={handleSave} 
                className="w-full sm:w-auto text-primary-foreground hover:opacity-90"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
