
import { useState } from 'react';
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

const Settings = () => {
  const [settings, setSettings] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    notifications: true,
    soundEnabled: true,
    darkMode: false,
    language: 'en',
    autoSave: true
  });

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    console.log('Saving settings:', settings);
    // TODO: Implement actual save logic
  };

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
                       {settings.name.split(' ').map(n => n[0]).join('')}
                     </AvatarFallback>
                   </Avatar>
                   <Button variant="outline" className="w-full sm:w-auto">Change Avatar</Button>
                 </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={settings.name}
                      onChange={(e) => handleSettingChange('name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={settings.email}
                      onChange={(e) => handleSettingChange('email', e.target.value)}
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
                    checked={settings.darkMode}
                    onCheckedChange={(checked) => handleSettingChange('darkMode', checked)}
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
                 <Button variant="outline" className="w-full justify-start text-sm sm:text-base">
                   Change Password
                 </Button>
                 <Button variant="outline" className="w-full justify-start text-sm sm:text-base">
                   Two-Factor Authentication
                 </Button>
                 <Button variant="outline" className="w-full justify-start text-sm sm:text-base">
                   Download My Data
                 </Button>
               </CardContent>
            </Card>

            {/* Account Actions */}
            <Card>
              <CardContent className="pt-6">
                <Button variant="destructive" className="w-full justify-center">
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
