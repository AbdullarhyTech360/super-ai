import { useState } from 'react';
import { Search, HelpCircle, Book, MessageCircle, Mail, Phone, FileText, Video, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/Navbar';

const Help = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const faqs = [
    {
      question: "How do I start a new conversation?",
      answer: "Click the 'New Chat' button in the sidebar or use the '+' icon in the chat interface. You can then type your message and press Enter to start chatting with our AI assistant."
    },
    {
      question: "Can I save my conversations?",
      answer: "Yes! All your conversations are automatically saved. You can enable auto-save in Settings > General > Auto-save Conversations to ensure nothing is lost."
    },
    {
      question: "How do I change my profile settings?",
      answer: "Go to Settings from the navigation menu, then select 'Profile Settings' to update your name, email, avatar, and other personal information."
    },
    {
      question: "Is my data secure?",
      answer: "Absolutely. We use end-to-end encryption for all conversations and follow industry-standard security practices to protect your data."
    },
    {
      question: "Can I use voice messages?",
      answer: "Yes! Click the microphone icon in the chat input to record voice messages. The AI can understand and respond to voice inputs."
    },
    {
      question: "How do I enable dark mode?",
      answer: "Go to Settings > Appearance and toggle the 'Dark Mode' switch to enable the dark theme."
    }
  ];

  const supportOptions = [
    {
      title: "Live Chat Support",
      description: "Get instant help from our support team",
      icon: MessageCircle,
      action: "Start Chat",
      available: true
    },
    {
      title: "Email Support",
      description: "Send us a detailed message about your issue",
      icon: Mail,
      action: "Send Email",
      available: true
    },
    {
      title: "Phone Support",
      description: "Speak directly with our support specialists",
      icon: Phone,
      action: "Call Now",
      available: false
    },
    {
      title: "Documentation",
      description: "Browse our comprehensive guides and tutorials",
      icon: Book,
      action: "View Docs",
      available: true
    }
  ];

  const quickLinks = [
    { title: "Getting Started Guide", icon: FileText },
    { title: "Video Tutorials", icon: Video },
    { title: "Community Forum", icon: Users },
    { title: "Feature Requests", icon: HelpCircle }
  ];

  const filteredFaqs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-20 pb-8 px-2 sm:px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How can we help you?
            </h1>
            <p className="text-muted-foreground mb-6">
              Find answers to common questions or get in touch with our support team
            </p>
            
            {/* Search */}
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {quickLinks.map((link, index) => (
              <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="flex flex-col items-center p-4 text-center">
                  <link.icon className="w-8 h-8 text-primary mb-2" />
                  <span className="text-sm font-medium">{link.title}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* FAQ Section */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Frequently Asked Questions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {filteredFaqs.map((faq, index) => (
                      <AccordionItem key={index} value={`item-${index}`}>
                        <AccordionTrigger className="text-left">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                  
                  {filteredFaqs.length === 0 && searchQuery && (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        No results found for "{searchQuery}". Try a different search term.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Support Options */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Contact Support</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {supportOptions.map((option, index) => (
                    <div 
                      key={index}
                      className={`p-4 rounded-lg border ${
                        option.available 
                          ? 'border-border hover:border-primary/30 cursor-pointer' 
                          : 'border-muted bg-muted/30'
                      } transition-colors`}
                    >
                      <div className="flex items-start gap-3">
                        <option.icon className={`w-5 h-5 mt-1 ${
                          option.available ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-medium ${
                              option.available ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                              {option.title}
                            </h3>
                            {!option.available && (
                              <Badge variant="secondary" className="text-xs">
                                Coming Soon
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {option.description}
                          </p>
                          <Button 
                            size="sm" 
                            disabled={!option.available}
                            className={option.available ? "w-full" : "w-full"}
                            variant={option.available ? "default" : "secondary"}
                            style={option.available ? { background: 'var(--gradient-primary)' } : undefined}
                          >
                            {option.action}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Quick Tips */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Quick Tips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <span>Use keyboard shortcuts: Enter to send, Shift+Enter for new line</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <span>Type "/" to access quick commands and templates</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <span>Enable notifications to never miss important updates</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;