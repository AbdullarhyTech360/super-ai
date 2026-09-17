import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Bell, Shield, Palette, Globe, LogOut, Save, Camera, Loader2, Download, KeyRound, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SidebarShell from '@/components/SidebarShell';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL, resolveAssetUrl } from '@/lib/api';
import { getPreferences, savePreferences, type Preferences } from '@/lib/preferences';
import { requestNotificationPermission } from '@/lib/notifications';

interface CurrentUser {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
}

interface SettingsState {
  name: string;
  email: string;
  avatarUrl: string | null;
  notifications: boolean;
  soundEnabled: boolean;
  language: string;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/heic'];
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

const Settings = () => {
  const { authenticatedFetch, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsState>({
    name: '',
    email: '',
    avatarUrl: null,
    notifications: true,
    soundEnabled: true,
    language: 'en',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isDownloadingData, setIsDownloadingData] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/me`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        if (!response.ok) throw new Error('Unable to load account settings');

        const user: CurrentUser = await response.json();
        const prefs = getPreferences();
        setSettings({
          name: user.full_name,
          email: user.email,
          avatarUrl: user.avatar_url ?? null,
          notifications: prefs.notifications,
          soundEnabled: prefs.soundEnabled,
          language: prefs.language,
        });
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

  const updatePreferences = (next: SettingsState): Preferences => ({
    notifications: next.notifications,
    soundEnabled: next.soundEnabled,
    language: next.language,
  });

  const handleNotificationToggle = async (checked: boolean) => {
    if (checked) {
      const permission = await requestNotificationPermission();
      if (permission === 'unsupported') {
        toast({
          title: 'Notifications not supported',
          description: 'Your browser does not support push notifications.',
          variant: 'destructive',
        });
        handleSettingChange('notifications', false);
        return;
      }
      if (permission === 'denied') {
        toast({
          title: 'Notifications are blocked',
          description: 'Enable notifications for this site in your browser settings to receive alerts.',
          variant: 'destructive',
        });
        handleSettingChange('notifications', false);
        return;
      }
    }
    handleSettingChange('notifications', checked);
    if (checked) {
      toast({ title: 'Notifications enabled', description: 'You will be alerted when the AI finishes responding.' });
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast({
        title: 'Image type not supported',
        description: 'Use a JPEG, PNG, WebP, GIF, SVG, BMP, or HEIC image.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast({
        title: 'Image too large',
        description: 'Please choose an image smaller than 25 MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await authenticatedFetch(`${API_BASE_URL}/api/me/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let detail = 'Failed to update your profile picture.';
        try {
          const error = await response.json();
          if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
        } catch { /* keep default message */ }
        throw new Error(detail);
      }

      const result = await response.json();
      setSettings(prev => ({ ...prev, avatarUrl: result.avatar_url }));
      toast({ title: 'Profile picture updated', description: 'Your new profile picture is now active.' });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to update your profile picture.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setIsSavingProfile(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ full_name: settings.name }),
      });

      if (!response.ok) {
        let detail = 'Failed to save your settings.';
        try {
          const error = await response.json();
          if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
        } catch { /* keep default message */ }
        throw new Error(detail);
      }

      const updated = await response.json();
      savePreferences(updatePreferences(settings));
      setSettings(prev => ({ ...prev, name: updated.full_name }));
      toast({ title: 'Settings saved', description: 'Your profile and preferences have been saved.' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save your settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      if (!response.ok) {
        let detail = 'Failed to change your password.';
        try {
          const error = await response.json();
          if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
        } catch { /* keep default message */ }
        throw new Error(detail);
      }

      setPasswordDialogOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({ title: 'Password changed', description: 'Your password has been updated successfully.' });
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError(error instanceof Error ? error.message : 'Failed to change your password.');
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const closePasswordDialog = () => {
    if (isSubmittingPassword) return;
    setPasswordDialogOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setShowPasswords(false);
  };

  const handleDownloadData = async () => {
    setIsDownloadingData(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/export`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to export your data.');

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `super-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: 'Data exported', description: 'Your data has been downloaded as a JSON file.' });
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: 'Export failed',
        description: 'Failed to export your data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingData(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/me`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (!response.ok) {
        let detail = 'Failed to delete your account.';
        try {
          const error = await response.json();
          if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
        } catch { /* keep default message */ }
        throw new Error(detail);
      }

      logout();
      navigate('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete your account. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const avatarSrc = resolveAssetUrl(settings.avatarUrl);
  const initials = settings.name
    .split(' ')
    .filter(Boolean)
    .map(namePart => namePart[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (isLoading) {
    return (
      <SidebarShell title="Settings">
        <div className="text-center text-muted-foreground py-12">Loading settings...</div>
      </SidebarShell>
    );
  }

  if (loadError) {
    return (
      <SidebarShell title="Settings">
        <div className="text-center text-muted-foreground py-12">{loadError}</div>
      </SidebarShell>
    );
  }

  return (
    <SidebarShell title="Settings" subtitle="Manage your account and application preferences">
      <div className="p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-4 sm:gap-6">
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
                   <div className="relative">
                     <Avatar className="w-16 h-16">
                       {avatarSrc && <AvatarImage src={avatarSrc} alt="Profile picture" />}
                       <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white text-xl">
                         {initials}
                       </AvatarFallback>
                     </Avatar>
                     <Button
                       type="button"
                       variant="outline"
                       size="icon"
                       onClick={() => avatarInputRef.current?.click()}
                       disabled={isUploadingAvatar}
                       className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border-border shadow-sm hover:bg-hover-accent"
                       aria-label="Change profile picture"
                       title="Change profile picture"
                     >
                       {isUploadingAvatar ? (
                         <Loader2 className="w-3.5 h-3.5 animate-spin" />
                       ) : (
                         <Camera className="w-3.5 h-3.5" />
                       )}
                     </Button>
                     <input
                       ref={avatarInputRef}
                       type="file"
                       accept={ACCEPTED_IMAGE_TYPES.join(',')}
                       className="hidden"
                       onChange={handleAvatarChange}
                       aria-hidden
                     />
                   </div>
                   <p className="text-sm text-muted-foreground text-center sm:text-left">
                     Click the camera icon to change your profile picture.
                   </p>
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
                     <p className="text-sm text-muted-foreground">Receive a notification when the AI finishes responding</p>
                   </div>
                  <Switch
                    id="notifications"
                    checked={settings.notifications}
                    onCheckedChange={handleNotificationToggle}
                  />
                </div>

                <Separator />

                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                   <div className="flex-1">
                     <Label htmlFor="sound" className="text-base">Sound Effects</Label>
                     <p className="text-sm text-muted-foreground">Play a sound when the AI finishes responding</p>
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
                 <Button
                   variant="outline"
                   className="w-full justify-start text-sm sm:text-base"
                   onClick={() => setPasswordDialogOpen(true)}
                 >
                   <KeyRound className="w-4 h-4 mr-2" />
                   Change Password
                 </Button>
                 <Button
                   variant="outline"
                   onClick={handleDownloadData}
                   disabled={isDownloadingData}
                   className="w-full justify-start text-sm sm:text-base"
                 >
                   {isDownloadingData ? (
                     <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                   ) : (
                     <Download className="w-4 h-4 mr-2" />
                   )}
                   Download My Data
                 </Button>
                 <Button variant="outline" disabled className="w-full justify-start text-sm sm:text-base">
                   Two-Factor Authentication
                   <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
                 </Button>
               </CardContent>
            </Card>

            {/* Account Actions */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="destructive" onClick={handleSignOut} className="w-full justify-center">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteDialogOpen(true)}
                    className="w-full justify-center text-destructive border-destructive/50 hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-center sm:justify-end">
              <Button
                onClick={handleSave}
                disabled={isSavingProfile}
                className="w-full sm:w-auto text-primary-foreground hover:opacity-90"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {isSavingProfile ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={closePasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and a new password for your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswords(prev => !prev)}
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {showPasswords ? 'Hide' : 'Show'} passwords
              </Button>
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closePasswordDialog} disabled={isSubmittingPassword}>
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isSubmittingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="text-primary-foreground"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {isSubmittingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will permanently delete your account, all conversations, attachments,
              uploads, and preferences. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeletingAccount}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeletingAccount}>
              {isDeletingAccount && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete My Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarShell>
  );
};

export default Settings;