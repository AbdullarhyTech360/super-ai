import { useCallback, useEffect, useState } from 'react';
import { User, Mail, Award, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import SidebarShell from '@/components/SidebarShell';
import { useAuth } from '@/hooks/useAuth';
import { resolveAssetUrl, API_BASE_URL } from '@/lib/api';

interface ProfileConversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ProfileStats {
  conversations: number;
  user_messages: number;
  month_user_messages: number;
}

const Profile = () => {
  const { authenticatedFetch, user, refreshUser } = useAuth();
  const [stats, setStats] = useState<ProfileStats>({
    conversations: 0,
    user_messages: 0,
    month_user_messages: 0,
  });
  const [recentConversations, setRecentConversations] = useState<ProfileConversation[]>([]);
  const [isLoading, setIsLoading] = useState(() => !user);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      };
      // Stats are aggregated server-side and the activity list is capped at
      // three rows, so this page no longer downloads every message it owns.
      // The profile itself comes from the shared session, which is already in
      // flight from the shell — refreshUser() reuses that request.
      const [statsResponse, recentResponse] = await Promise.all([
        authenticatedFetch(`${API_BASE_URL}/api/stats`, { headers }),
        authenticatedFetch(`${API_BASE_URL}/api/conversations?limit=3`, { headers }),
        refreshUser(),
      ]);

      if (!statsResponse.ok || !recentResponse.ok) {
        throw new Error('Unable to load profile data');
      }

      const [statsData, recentData] = await Promise.all([
        statsResponse.json(),
        recentResponse.json(),
      ]);
      setStats(statsData);
      setRecentConversations(recentData.conversations ?? []);
    } catch (error) {
      console.error('Error loading profile:', error);
      setLoadError('Unable to load your profile right now.');
    } finally {
      setIsLoading(false);
    }
  }, [authenticatedFetch, refreshUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const displayName = user?.full_name || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(namePart => namePart[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const formatActivityDate = (date: string) => new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  if (isLoading) {
    return (
      <SidebarShell title="Profile" subtitle="Your profile and activity">
        <div className="p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-6" role="status" aria-label="Loading profile">
            <Skeleton className="h-44 w-full rounded-lg" />
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-56 w-full rounded-lg" />
              <Skeleton className="h-56 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </SidebarShell>
    );
  }

  if (loadError || !user) {
    return (
      <SidebarShell title="Profile" subtitle="Your profile and activity">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground">{loadError || 'Profile unavailable.'}</p>
          <Button variant="outline" size="sm" onClick={() => void loadProfile()}>
            Try again
          </Button>
        </div>
      </SidebarShell>
    );
  }

  return (
    <SidebarShell title="Profile" subtitle="Your profile and activity">
      <div className="p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Profile Header */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative">
                  <Avatar className="w-24 h-24 sm:w-32 sm:h-32">
                    {user.avatar_url && <AvatarImage src={resolveAssetUrl(user.avatar_url) ?? ''} alt={displayName} />}
                    <AvatarFallback 
                      style={{ background: 'var(--gradient-primary)' }}
                      className="text-white text-2xl sm:text-3xl"
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 break-words">{displayName}</h1>
                  
                  <div className="flex flex-wrap justify-center sm:justify-start gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 min-w-0">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span className="break-all">{user.email}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6 md:grid-cols-2">
            {/* Statistics */}
            <Card className="min-w-0">
              <CardHeader className="min-w-0">
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                  <Award className="w-5 h-5" />
                  Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-muted-foreground">Total Conversations</span>
                  <Badge variant="secondary" className="shrink-0 font-bold">
                    {stats.conversations.toLocaleString()}
                  </Badge>
                </div>
                <Separator />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-muted-foreground">Messages Sent</span>
                  <Badge variant="secondary" className="shrink-0 font-bold">
                    {stats.user_messages.toLocaleString()}
                  </Badge>
                </div>
                <Separator />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-muted-foreground">This Month</span>
                  <Badge
                    className="shrink-0 text-primary-foreground font-bold"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    {stats.month_user_messages.toLocaleString()} messages
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card className="min-w-0">
              <CardHeader className="min-w-0">
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                  <User className="w-5 h-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate min-w-0">Account ID: {user.id}</span>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="break-all">{user.email}</span>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="min-w-0">
              <CardHeader className="min-w-0">
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentConversations.length > 0 ? recentConversations.map(conversation => (
                  <div key={conversation.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-sm truncate flex-1">{conversation.title}</span>
                    <span className="text-xs text-muted-foreground">{formatActivityDate(conversation.updated_at)}</span>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No conversation activity yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SidebarShell>
  );
};

export default Profile;