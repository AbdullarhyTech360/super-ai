import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Sparkles, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/hooks/useAuth';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleStartChatting = () => {
    if (isAuthenticated) {
      navigate('/chat');
    } else {
      navigate('/signup');
    }
  };
  const features = [
    {
      icon: <Sparkles className="w-8 h-8 text-blue-600" />,
      title: "AI-Powered Conversations",
      description: "Experience intelligent chat with advanced AI that understands context and provides meaningful responses."
    },
    {
      icon: <Shield className="w-8 h-8 text-purple-600" />,
      title: "Secure & Private",
      description: "Your conversations are encrypted and protected with enterprise-grade security measures."
    },
    {
      icon: <Zap className="w-8 h-8 text-green-600" />,
      title: "Lightning Fast",
      description: "Real-time messaging with instant responses and seamless synchronization across devices."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent/20"
         style={{ backgroundImage: 'var(--gradient-hero)' }}>
      <Navbar />
      
      {/* Hero Section */}
      <section className="pt-24 pb-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
              Welcome to{' '}
              <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                Super AI
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              The next generation of intelligent conversation. Connect, chat, and explore the future of AI-powered communication.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={handleStartChatting} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                <MessageCircle className="w-5 h-5 mr-2" />
                Start Chatting
              </Button>
              <Link to="/login">
                <Button variant="outline" size="lg" className="px-8 py-3 text-lg border-2 border-border hover:bg-accent hover:text-accent-foreground font-semibold transition-all duration-300">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Hero Image Placeholder */}
          <div className="mt-16 animate-fade-in">
            <div className="relative mx-auto max-w-4xl">
              <div className="bg-gradient-to-r from-muted/50 to-accent/50 rounded-2xl p-8 shadow-xl border border-border/50">
                <div className="bg-card rounded-xl p-6 shadow-lg border border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-primary/20 rounded w-1/2 ml-auto"></div>
                    <div className="h-4 bg-muted rounded w-2/3"></div>
                    <div className="h-4 bg-purple-500/20 rounded w-3/5 ml-auto"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Why Choose Super AI?
            </h2>
            <p className="text-lg text-muted-foreground">
              Discover the features that make our chat platform extraordinary
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 border border-border/50 hover:border-primary/30 shadow-md bg-card/80 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="flex justify-center mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-card-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-primary to-purple-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-purple-600/90"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Experience the Future of Chat?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Join thousands of users already enjoying Super AI conversations
          </p>
          <Button onClick={handleStartChatting} size="lg" variant="secondary" className="px-8 py-3 text-lg bg-white text-primary hover:bg-white/90 font-semibold shadow-lg">
            Get Started Now
          </Button>
        </div>
      </section>

      {/* Additional Features Section */}
      <section className="py-16 px-4 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">End-to-End Encryption</h3>
              <p className="text-sm text-muted-foreground">Your conversations are always private and secure</p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Real-time Sync</h3>
              <p className="text-sm text-muted-foreground">Seamless experience across all your devices</p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Smart Suggestions</h3>
              <p className="text-sm text-muted-foreground">AI-powered conversation assistance</p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Multi-platform</h3>
              <p className="text-sm text-muted-foreground">Available on web, mobile, and desktop</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
