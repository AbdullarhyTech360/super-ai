import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Search, X, Paperclip, Mic, MicOff, Pencil, Copy, Check, ListFilter, SquarePen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import AppLogo from '@/components/AppLogo';
import SidebarShell from '@/components/SidebarShell';
import { CHAT_THEMES, getChatTheme, type ChatTheme } from '@/lib/chatThemes';

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

interface MessageDto {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  created_at: string;
}

interface ConversationDto {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: MessageDto[];
}

type ConversationSort = 'last-used' | 'name' | 'created';

const suggestionPrompts = [
  'Help me brainstorm creative ideas',
  'Explain complex topics simply',
  'Write and edit content professionally',
];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [userInfo, setUserInfo] = useState<{ full_name: string; email: string } | null>(null);
  const [chatTheme, setChatTheme] = useState<ChatTheme>(
    () => getChatTheme(localStorage.getItem('chatTheme'))
  );
  const isInitialActiveConversation = useRef(true);
  const streamQueueRef = useRef<string[]>([]);
  const streamDisplayTextRef = useRef('');
  const streamConversationIdRef = useRef<string | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const streamDoneRef = useRef(false);
  const streamRevealTimerRef = useRef<number | null>(null);
  const { authenticatedFetch } = useAuth();
  const { toast } = useToast();

  const handleChatThemeChange = (id: string) => {
    const next = getChatTheme(id);
    setChatTheme(next);
    localStorage.setItem('chatTheme', next.id);
  };

  const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
      toast({
        title: 'Message copied',
        description: 'The message is ready to paste.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Your browser did not allow clipboard access.',
      });
    }
  }, [toast]);

  const handleNewChat = () => {
    setActiveConversation(null);
    setNewMessage('');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newMessage]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
        const data = (await response.json()) as { conversations?: ConversationDto[] };
        const loadedConversations = (data.conversations ?? []).map((conversation: ConversationDto) => ({
          id: conversation.id,
          title: conversation.title,
          createdAt: new Date(conversation.created_at ?? conversation.updated_at),
          updatedAt: new Date(conversation.updated_at),
          messages: (conversation.messages ?? []).map((message: MessageDto) => ({
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
    const fetchUserInfo = async () => {
      try {
        const response = await authenticatedFetch('http://localhost:8000/api/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch user info');
        const data = (await response.json()) as { full_name: string; email: string };
        setUserInfo(data);
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    fetchUserInfo();
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

  const handleDeleteClick = (id: string) => {
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

  const handleRenameClick = (id: string, title: string) => {
    setConversationToRename(id);
    setRenameTitle(title);
    setRenameDialogOpen(true);
  };

  const renameConversation = (id: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    authenticatedFetch(`http://localhost:8000/api/conversations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ title: trimmedTitle }),
    }).catch(error => console.error('Error renaming conversation:', error));
    setConversations(prev => prev.map(conv =>
      conv.id === id
        ? { ...conv, title: trimmedTitle, updatedAt: new Date() }
        : conv
    ));
    toast({
      title: "Chat renamed",
      description: `Conversation renamed to "${trimmedTitle}".`,
    });
  };

  const confirmRename = () => {
    if (conversationToRename) {
      renameConversation(conversationToRename, renameTitle);
    }
    setRenameDialogOpen(false);
    setConversationToRename(null);
  };

  const startEditingTitle = () => {
    if (!currentConversation) return;
    setEditingTitle(currentConversation.title);
    setIsEditingTitle(true);
  };

  const saveTitleEdit = () => {
    if (!currentConversation) return;
    const trimmedTitle = editingTitle.trim();
    setIsEditingTitle(false);
    if (trimmedTitle && trimmedTitle !== currentConversation.title) {
      renameConversation(currentConversation.id, trimmedTitle);
    }
  };

  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setEditingTitle('');
  };

  const cancelRename = () => {
    setRenameDialogOpen(false);
    setConversationToRename(null);
  };

  const enqueueStreamText = (text: string) => {
    streamQueueRef.current.push(...(text.match(/\s*\S+\s*/g) ?? [text]));

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

  const handleSendMessage = useCallback((overrideText?: string) => {
    const text = (overrideText ?? newMessage).trim();
    if (!text) return;

    const localConversationId = activeConversation ?? Date.now().toString();

    const message: Message = {
      id: Date.now().toString(),
      text,
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
            input: text,
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
  }, [newMessage, activeConversation, authenticatedFetch, toast]);

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
  const currentTitle = currentConversation?.title || 'Super AI';
  const firstName = (userInfo?.full_name ?? '').split(' ')[0] || 'there';
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
    <SidebarShell
      scrollable={false}
      subtitle="Always here to help"
      hideProfileNav
      themeLabel={chatTheme.id === 'default' ? 'Default' : chatTheme.label}
      title={
        isEditingTitle && currentConversation ? (
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={saveTitleEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveTitleEdit();
              } else if (e.key === 'Escape') {
                cancelTitleEdit();
              }
            }}
            autoFocus
            onFocus={(e) => e.target.select()}
            aria-label="Edit conversation title"
            className="h-7 w-full max-w-xs px-2 py-0 text-lg font-semibold text-foreground bg-card border-border"
          />
        ) : (
          <button
            type="button"
            onClick={startEditingTitle}
            disabled={!currentConversation}
            className="flex items-center gap-1.5 group/title max-w-full"
            title={currentConversation ? 'Click to rename' : undefined}
            aria-label={currentConversation ? 'Rename conversation' : undefined}
          >
            <h1 className="text-lg font-semibold text-foreground truncate max-w-[50vw]">
              {currentTitle}
            </h1>
            {currentConversation && (
              <Pencil className="w-3.5 h-3.5 text-muted-foreground/0 group-hover/title:text-muted-foreground transition-colors flex-shrink-0" />
            )}
          </button>
        )
      }
      sidebarHeaderExtra={
        <>
          <Button
            onClick={handleNewChat}
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
        </>
      }
      sidebarContent={
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm truncate">{conversation.title}</h3>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameClick(conversation.id, conversation.title);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-muted-foreground hover:text-foreground fast-transition"
                      title="Rename chat"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(conversation.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-muted-foreground hover:text-foreground fast-transition"
                      title="Delete chat"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDate(conversation.updatedAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      }
      sidebarRailContent={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:bg-hover-muted hover:text-foreground fast-transition mt-1"
              aria-label="New chat"
            >
              <SquarePen className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New chat</TooltipContent>
        </Tooltip>
      }
      themeExtras={
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Chat theme</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuRadioGroup
              value={chatTheme.id}
              onValueChange={handleChatThemeChange}
            >
              {CHAT_THEMES.map((sel) => (
                <DropdownMenuRadioItem key={sel.id} value={sel.id}>
                  <span className="flex -space-x-1 mr-2">
                    <span
                      className="w-4 h-4 rounded-full border border-border/40"
                      style={{ background: sel.swatchUser }}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-border/40"
                      style={{ background: sel.swatchAi }}
                    />
                  </span>
                  {sel.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      }
    >
      {/* Messages Area */}
      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ background: chatTheme.areaBg }}
      >
        <ScrollArea className="h-full p-4 bg-transparent overflow-x-hidden">
        {currentConversation?.messages.length ? (
          <div className="max-w-4xl mx-auto w-full">
            {currentConversation.messages.map((message, index) => {
              const showHeader = index === 0 || currentConversation.messages[index - 1].sender !== message.sender;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "message-enter w-full group",
                    showHeader ? "mt-6" : "mt-1.5",
                    index === 0 && "mt-0"
                  )}
                >
                  <div className={cn(
                    "max-w-[80%] md:max-w-[70%] w-fit min-w-0",
                    message.sender === 'user' ? "ml-auto" : "mr-auto"
                  )}>
                    {showHeader && (
                      <div className={cn(
                        "mb-1.5 text-xs",
                        message.sender === 'user' ? "text-right" : "text-left"
                      )}>
                        <span className={cn(
                          "font-semibold",
                          message.sender === 'user' ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {message.sender === 'user' ? 'You' : 'Super AI'}
                        </span>
                        <span className="text-muted-foreground">{' · '}
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "px-4 py-3 rounded-2xl relative border min-w-0",
                        message.sender === 'user'
                          ? "rounded-tr-md"
                          : "rounded-tl-md"
                      )}
                      style={{
                        background: message.sender === 'user' ? chatTheme.userBg : chatTheme.aiBg,
                        borderColor: message.sender === 'user' ? chatTheme.userBorder : chatTheme.aiBorder,
                        color: message.sender === 'user' ? chatTheme.userText : chatTheme.aiText,
                      }}
                    >
                      {message.sender === 'ai' ? (
                        <MarkdownMessage content={message.text} />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {message.text}
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyMessage(message.id, message.text)}
                        className="absolute -bottom-3 right-1 h-6 w-6 p-0 rounded-full bg-background border border-border/70 text-muted-foreground shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity fast-transition hover:bg-background hover:text-foreground"
                        aria-label="Copy message"
                        title="Copy message"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="max-w-[80%] md:max-w-[70%] w-fit min-w-0 mr-auto animate-slide-in mt-6">
                <div className="mb-1.5 text-xs text-left">
                  <span className="font-semibold text-muted-foreground">Super AI</span>
                  <span className="text-muted-foreground">{' · '}typing</span>
                </div>
                <div
                  className="px-4 py-3 rounded-2xl rounded-tl-md border"
                  style={{ background: chatTheme.aiBg, borderColor: chatTheme.aiBorder }}
                >
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
                <AppLogo size={96} className="mx-auto mb-6 animate-bounce" />
              </div>
              <h2 className="text-4xl font-bold gradient-text mb-4">
                {getGreeting()}, {firstName}!
              </h2>
              <p className="text-muted-foreground mb-8 text-lg">
                What's on your mind today?
              </p>
              <div className="grid grid-cols-1 gap-4 text-sm">
                {suggestionPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    disabled={isTyping}
                    className="p-4 rounded-xl bg-card/50 backdrop-blur-sm hover:bg-card/80 cursor-pointer smooth-transition hover:shadow-modern border border-border/50 text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
      </div>

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
                className="w-full min-h-[52px] max-h-60 resize-none overflow-y-auto rounded-xl border border-border/60 bg-muted/30 px-11 py-3 text-foreground placeholder:text-muted-foreground leading-relaxed shadow-sm transition-colors focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                rows={1}
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
            Enter to send · Shift+Enter for a new line
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

      {/* Rename Dialog */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Give this conversation a new name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="Conversation title"
            className="w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmRename();
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelRename}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRename}>Rename</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarShell>
  );
};

export default Chat;