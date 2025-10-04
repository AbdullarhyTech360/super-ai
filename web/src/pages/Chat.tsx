import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Search, Menu, X, Paperclip, Mic, MicOff, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: Date;
}

const Chat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, isTyping]);

  const formatDate = (date: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (messageDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleDeleteClick = (id: string, title: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      const conversationTitle = conversations.find(conv => conv.id === conversationToDelete)?.title || 'Conversation';
      setConversations(prev => prev.filter(conv => conv.id !== conversationToDelete));
      if (activeConversation === conversationToDelete) {
        setActiveConversation(null);
      }
      toast({
        title: "Chat deleted",
        description: `"${conversationTitle}" has been deleted successfully.`,
      });
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;
    
    const message: Message = {
      id: Date.now().toString(),
      text: newMessage,
      sender: 'user',
      timestamp: new Date()
    };

    if (activeConversation) {
      setConversations(prev => prev.map(conv => 
        conv.id === activeConversation 
          ? { ...conv, messages: [...conv.messages, message], updatedAt: new Date() }
          : conv
      ));
    } else {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: newMessage.slice(0, 30) + (newMessage.length > 30 ? '...' : ''),
        messages: [message],
        updatedAt: new Date()
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv.id);
    }

    setNewMessage('');
    setIsTyping(true);
    
    // Simulate AI response with typing indicator
    setTimeout(() => {
      setIsTyping(false);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm a demo AI assistant. This is a simulated response to your message: \"" + message.text + "\"",
        sender: 'ai',
        timestamp: new Date()
      };
      
      if (activeConversation) {
        setConversations(prev => prev.map(conv => 
          conv.id === activeConversation 
            ? { ...conv, messages: [...conv.messages, aiMessage], updatedAt: new Date() }
            : conv
        ));
      } else {
        setConversations(prev => prev.map((conv, index) => 
          index === 0 
            ? { ...conv, messages: [...conv.messages, aiMessage], updatedAt: new Date() }
            : conv
        ));
      }
    }, 2000);
  }, [newMessage, activeConversation]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const currentConversation = conversations.find(conv => conv.id === activeConversation);
  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        isSidebarOpen ? "w-80" : "w-0",
        isMobile && !isSidebarOpen && "hidden"
      )}>
        <div className={cn("flex flex-col h-full overflow-hidden", !isSidebarOpen && "opacity-0")}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border bg-gradient-hover">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold gradient-text">Super AI</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(false)}
                className="text-foreground hover:bg-hover-accent lg:hidden fast-transition"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <Button 
              onClick={() => setActiveConversation(null)}
              className="w-full mb-4 smooth-transition hover:shadow-glow"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-muted/30 border-border fast-transition focus:shadow-glow"
              />
            </div>
          </div>

          {/* Conversation List */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => setActiveConversation(conversation.id)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-all duration-200 group hover:shadow-modern smooth-transition",
                    activeConversation === conversation.id 
                      ? "bg-accent text-accent-foreground shadow-modern border border-border/50" 
                      : "hover:bg-hover-muted text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8 flex-shrink-0 avatar-glow">
                      <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white text-xs">
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm truncate">{conversation.title}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(conversation.id, conversation.title);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-muted-foreground hover:text-foreground fast-transition"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(conversation.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={cn(
        "flex flex-col h-screen flex-1 min-w-0 transition-all duration-300 ease-in-out overflow-hidden",
        isSidebarOpen && !isMobile ? "lg:ml-80" : "ml-0"
      )}>
        {/* Header */}
        <div className="bg-background/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between shadow-elegant">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hover:bg-hover-accent fast-transition"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <Avatar className="w-8 h-8 avatar-glow">
              <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white">
                <Bot className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {currentConversation?.title || 'Super AI'}
              </h1>
              <p className="text-xs text-muted-foreground">Always here to help</p>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4 bg-background overflow-x-hidden">
          {currentConversation?.messages.length ? (
            <div className="max-w-4xl mx-auto space-y-4 w-full">
              {currentConversation.messages.map((message, index) => {
                const showAvatar = index === 0 || currentConversation.messages[index - 1].sender !== message.sender;
                const isLastInGroup = index === currentConversation.messages.length - 1 || 
                  currentConversation.messages[index + 1]?.sender !== message.sender;
                
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3 message-enter w-full",
                      message.sender === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.sender === 'ai' && showAvatar && (
                      <Avatar className="w-8 h-8 flex-shrink-0 avatar-glow mt-1">
                        <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white">
                          <Bot className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {message.sender === 'ai' && !showAvatar && (
                      <div className="w-8 h-8 flex-shrink-0" />
                    )}
                    
                    <div className={cn(
                      "max-w-[75%] md:max-w-[65%] group",
                      message.sender === 'user' ? "ml-auto" : "mr-auto"
                    )}>
                      <div className={cn(
                        "px-4 py-3 rounded-2xl smooth-transition hover:shadow-modern relative",
                        message.sender === 'user' 
                          ? "bg-primary text-primary-foreground rounded-br-md" 
                          : "bg-card/50 backdrop-blur-sm border border-border/50 rounded-bl-md shadow-sm",
                        !showAvatar && message.sender === 'user' && "rounded-br-2xl",
                        !showAvatar && message.sender === 'ai' && "rounded-bl-2xl"
                      )}>
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {message.text}
                        </p>
                        {isLastInGroup && (
                          <div className={cn(
                            "mt-2 text-xs opacity-70 flex",
                            message.sender === 'user' ? "justify-end" : "justify-start"
                          )}>
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {message.sender === 'user' && showAvatar && (
                      <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
                        <AvatarFallback className="bg-secondary text-secondary-foreground">
                          <User className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {message.sender === 'user' && !showAvatar && (
                      <div className="w-8 h-8 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
              
              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex gap-3 justify-start animate-slide-in">
                  <Avatar className="w-8 h-8 flex-shrink-0 avatar-glow mt-1">
                    <AvatarFallback style={{ background: 'var(--gradient-primary)' }} className="text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="max-w-[75%] md:max-w-[65%]">
                    <div className="px-4 py-3 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 rounded-bl-md shadow-sm">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md mx-auto p-8">
                <div className="mb-8">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center shadow-elegant animate-bounce"
                       style={{ background: 'var(--gradient-primary)' }}>
                    <Bot className="w-12 h-12 text-white" />
                  </div>
                </div>
                <h2 className="text-4xl font-bold gradient-text mb-4">
                  Welcome! 👋
                </h2>
                <p className="text-muted-foreground mb-8 text-lg">
                  What's on your mind today?
                </p>
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm hover:bg-card/80 cursor-pointer smooth-transition hover:shadow-modern border border-border/50">
                    "Help me brainstorm creative ideas"
                  </div>
                  <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm hover:bg-card/80 cursor-pointer smooth-transition hover:shadow-modern border border-border/50">
                    "Explain complex topics simply"
                  </div>
                  <div className="p-4 rounded-xl bg-card/50 backdrop-blur-sm hover:bg-card/80 cursor-pointer smooth-transition hover:shadow-modern border border-border/50">
                    "Write and edit content professionally"
                  </div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t border-border bg-background/95 backdrop-blur-md shadow-elegant">
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-end gap-3 p-3 bg-card/50 backdrop-blur-sm rounded-2xl border border-border shadow-modern hover:shadow-elegant smooth-transition w-full">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-hover-muted fast-transition flex-shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              
              <div className="flex-1 min-w-0">
                <Textarea
                  ref={textareaRef}
                  placeholder="Message Super AI... (Enter to send, Shift+Enter for new line)"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full min-h-[24px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0 text-foreground placeholder:text-muted-foreground leading-relaxed p-0"
                  rows={1}
                />
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {!newMessage.trim() ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsVoiceRecording(!isVoiceRecording)}
                    className={cn(
                      "transition-all duration-200 h-8 w-8 p-0",
                      isVoiceRecording 
                        ? "text-destructive hover:text-destructive/80 animate-pulse" 
                        : "text-muted-foreground hover:text-foreground hover:bg-hover-muted"
                    )}
                  >
                    {isVoiceRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                ) : (
                  <Button
                    onClick={handleSendMessage}
                    disabled={isTyping}
                    size="sm"
                    className="h-8 w-8 p-0 smooth-transition hover:shadow-glow hover:scale-105 disabled:opacity-50"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            
            <div className="mt-2 text-xs text-muted-foreground text-center">
              <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to send • 
              <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono mx-1">Shift + Enter</kbd> for new line • 
              <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">⌘ + Enter</kbd> to send
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone and all messages will be permanently lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Chat;
