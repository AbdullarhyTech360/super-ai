import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, Plus, Search, Menu, X, Paperclip, Mic, MicOff, Bot, User, Settings, CircleHelp, LogOut, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useAuth } from '@/hooks/useAuth';
import MarkdownMessage from '@/components/MarkdownMessage';

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
  createdAt: Date;
  updatedAt: Date;
}

type ConversationSort = 'last-used' | 'name' | 'created';

const Chat = () => {
  const activeConversationStorageKey = 'active_conversation_id';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [conversationSort, setConversationSort] = useState<ConversationSort>('last-used');
  const [newMessage, setNewMessage] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const isInitialActiveConversation = useRef(true);
  const streamQueueRef = useRef<string[]>([]);
  const streamDisplayTextRef = useRef('');
  const streamConversationIdRef = useRef<string | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const streamDoneRef = useRef(false);
  const streamRevealTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const { logout, authenticatedFetch } = useAuth();
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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

  useEffect(() => () => {
    if (streamRevealTimerRef.current) {
      window.clearInterval(streamRevealTimerRef.current);
    }
  }, []);

  // Add a logic to load conversations from the backend when the component mounts
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await authenticatedFetch('http://localhost:8000/api/conversations',{
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch conversations');
        const data = await response.json();
        const loadedConversations = (data.conversations ?? []).map((conversation: any) => ({
          id: conversation.id,
          title: conversation.title,
          createdAt: new Date(conversation.created_at ?? conversation.updated_at),
          updatedAt: new Date(conversation.updated_at),
          messages: (conversation.messages ?? []).map((message: any) => ({
            id: message.id,
            text: message.text,
            sender: message.sender,
            timestamp: new Date(message.created_at),
          })),
        }));
        setConversations(loadedConversations);

        const savedConversationId = localStorage.getItem(activeConversationStorageKey);
        if (savedConversationId && loadedConversations.some(
          conversation => conversation.id === savedConversationId
        )) {
          setActiveConversation(savedConversationId);
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    };

    fetchConversations();
  }, [authenticatedFetch]);

  useEffect(() => {
    if (isInitialActiveConversation.current) {
      isInitialActiveConversation.current = false;
      return;
    }

    if (activeConversation) {
      localStorage.setItem(activeConversationStorageKey, activeConversation);
    } else {
      localStorage.removeItem(activeConversationStorageKey);
    }
  }, [activeConversation]);

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
      authenticatedFetch(`http://localhost:8000/api/conversations/${conversationToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      }).catch(error => console.error('Error deleting conversation:', error));
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

  const enqueueStreamText = (text: string) => {
    streamQueueRef.current.push(...(text.match(/\S+\s*/g) ?? [text]));

    if (streamRevealTimerRef.current) return;

    streamRevealTimerRef.current = window.setInterval(() => {
      const nextWord = streamQueueRef.current.shift();
      if (!nextWord) {
        if (streamDoneRef.current) {
          window.clearInterval(streamRevealTimerRef.current!);
          streamRevealTimerRef.current = null;
          setIsTyping(false);
        }
        return;
      }

      streamDisplayTextRef.current += nextWord;
      const conversationId = streamConversationIdRef.current;
      const messageId = streamMessageIdRef.current;
      if (!conversationId || !messageId) return;

      setIsTyping(false);
      setConversations(prev => prev.map(conv => {
        if (conv.id !== conversationId) return conv;

        const hasMessage = conv.messages.some(message => message.id === messageId);
        return {
          ...conv,
          messages: hasMessage
            ? conv.messages.map(message =>
                message.id === messageId
                  ? { ...message, text: streamDisplayTextRef.current }
                  : message
              )
            : [...conv.messages, {
                id: messageId,
                text: streamDisplayTextRef.current,
                sender: 'ai',
                timestamp: new Date(),
              }],
          updatedAt: new Date(),
        };
      }));
    }, 45);
  };

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim()) return;

    const localConversationId = activeConversation ?? Date.now().toString();
    
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
        id: localConversationId,
        title: 'Generating title...',
        messages: [message],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv.id);
    }

    setNewMessage('');
    setIsTyping(true);
    
    // use an api call to get the AI response instead of a simulated response
    (async () => {
      let responseConversationId = activeConversation ?? localConversationId;
      streamQueueRef.current = [];
      streamDisplayTextRef.current = '';
      streamConversationIdRef.current = responseConversationId;
      streamMessageIdRef.current = `ai-${Date.now()}`;
      streamDoneRef.current = false;
      try {
        const accessToken = localStorage.getItem('access_token');
        const response = await authenticatedFetch('http://localhost:8000/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            input: message.text,
            conversation_id: activeConversation,
            is_new: !activeConversation, // If there's no active conversation, it's a new one
          }),
        });

        if (!response.ok || !response.body) throw new Error('Failed to get a response');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bufferedText = '';
        let streamFinished = false;

        while (!streamFinished) {
          const { value, done } = await reader.read();
          bufferedText += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = bufferedText.split('\n');
          bufferedText = events.pop() ?? '';

          for (const eventText of events) {
            if (!eventText.trim()) continue;
            const event = JSON.parse(eventText);
            if (event.type === 'start') {
              responseConversationId = event.conversation_id;
              streamConversationIdRef.current = responseConversationId;
              setActiveConversation(responseConversationId);
              setConversations(prev => prev.map(conv =>
                conv.id === localConversationId
                  ? {
                      ...conv,
                      id: responseConversationId,
                      ...(event.title ? { title: event.title } : {}),
                    }
                  : conv
              ));
            } else if (event.type === 'title') {
              setConversations(prev => prev.map(conv =>
                conv.id === responseConversationId || conv.id === localConversationId
                  ? { ...conv, title: event.title }
                  : conv
              ));
            } else if (event.type === 'chunk') {
              enqueueStreamText(event.text);
            } else if (event.type === 'done') {
              streamFinished = true;
              streamDoneRef.current = true;
            }
          }

          if (done) streamFinished = true;
        }

        if (bufferedText.trim()) {
          const event = JSON.parse(bufferedText);
          if (event.type === 'chunk') {
            enqueueStreamText(event.text);
          } else if (event.type === 'done') {
            streamDoneRef.current = true;
          }
        }

        if (!streamQueueRef.current.length && !streamDisplayTextRef.current) {
          setIsTyping(false);
        }
      } catch (error) {
        console.error('Error fetching AI response:', error);
        streamQueueRef.current = [];
        streamDoneRef.current = true;
        setIsTyping(false);
        toast({
          title: 'Error',
          description: 'Failed to get a response from the AI. Please check your connection or try again later.',
        });
        return;
      }
    })();
  }, [newMessage, activeConversation, authenticatedFetch]);

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
  const filteredConversations = conversations
    .filter(conv => conv.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((first, second) => {
      if (conversationSort === 'name') {
        return first.title.localeCompare(second.title);
      }

      const firstDate = conversationSort === 'created' ? first.createdAt : first.updatedAt;
      const secondDate = conversationSort === 'created' ? second.createdAt : second.updatedAt;
      return secondDate.getTime() - firstDate.getTime();
    });

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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full mt-2 justify-start gap-2 text-muted-foreground hover:text-foreground">
                  <ListFilter className="w-4 h-4" />
                  Sort: {conversationSort === 'last-used' ? 'Last used' : conversationSort === 'name' ? 'Name' : 'Created'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Arrange conversations</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={conversationSort}
                  onValueChange={(value) => setConversationSort(value as ConversationSort)}
                >
                  <DropdownMenuRadioItem value="last-used">Last used</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="created">Time created</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
          <nav className="flex items-center gap-1" aria-label="Workspace navigation">
            <Link to="/chat">
              <Button variant="ghost" size="sm" className="text-primary" title="Chat">
                <Bot className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Chat</span>
              </Button>
            </Link>
            <Link to="/profile">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" title="Profile">
                <User className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Profile</span>
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" title="Settings">
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </Link>
            <Link to="/help">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" title="Help">
                <CircleHelp className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Help</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
              title="Log out"
            >
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </nav>
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
                        {message.sender === 'ai' ? (
                          <MarkdownMessage content={message.text} />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                            {message.text}
                          </p>
                        )}
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
            <div className="flex items-end gap-2 p-2 bg-card/50 backdrop-blur-sm rounded-2xl border border-border shadow-modern hover:shadow-elegant smooth-transition w-full">
              <div className="relative flex-1 min-w-0">
                <Textarea
                  ref={textareaRef}
                  placeholder="Message Super AI... (Enter to send, Shift+Enter for new line)"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  aria-label="Message Super AI"
                  className="w-full min-h-[96px] max-h-60 resize-none overflow-y-auto rounded-xl border border-border/60 bg-muted/30 px-11 py-3 pb-12 text-foreground placeholder:text-muted-foreground leading-relaxed shadow-sm transition-colors focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                  rows={3}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute bottom-2 left-2 z-10 h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                  aria-label="Attach a file"
                  title="Attach a file"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                {!newMessage.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsVoiceRecording(!isVoiceRecording)}
                    className={cn(
                      "absolute bottom-2 right-2 z-10 h-8 w-8 p-0 transition-all duration-200",
                      isVoiceRecording
                        ? "text-destructive hover:text-destructive/80 animate-pulse"
                        : "text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                    )}
                    aria-label={isVoiceRecording ? 'Stop voice recording' : 'Start voice recording'}
                    title={isVoiceRecording ? 'Stop voice recording' : 'Start voice recording'}
                  >
                    {isVoiceRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                {newMessage.trim() && (
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
