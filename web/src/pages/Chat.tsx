import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Search, X, Paperclip, Mic, Pencil, Copy, Check, ListFilter, SquarePen, FileText, ListChecks, Trash2, Smile, Pause, Play, MessageSquareDashed, MoreHorizontal } from 'lucide-react';
import EmojiPicker, { type EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { API_BASE_URL } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import MarkdownMessage from '@/components/MarkdownMessage';
import AppLogo from '@/components/AppLogo';
import AiBanner from '@/components/AiBanner';
import SidebarShell from '@/components/SidebarShell';
import { CHAT_THEMES, getChatTheme, type ChatTheme } from '@/lib/chatThemes';
import { Checkbox } from '@/components/ui/checkbox';
import { isNotificationsEnabled, playNotificationSound, tryNotify } from '@/lib/notifications';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  attachments?: Attachment[];
}

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  url: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  isTemporary?: boolean;
}

interface MessageDto {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  created_at: string;
  attachments?: Attachment[];
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

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ACCEPTED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'text/x-typescript',
  'text/x-python',
];

const isAcceptedFile = (file: File) =>
  ACCEPTED_FILE_TYPES.includes(file.type) ||
  file.type.startsWith('text/') ||
  file.type === '';

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const formatVoiceTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  const win = window as SpeechRecognitionWindow;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
};

const Chat = () => {
  const activeConversationStorageKey = 'active_conversation_id';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [conversationSort, setConversationSort] = useState<ConversationSort>('last-used');
  const [newMessage, setNewMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceStatusRef = useRef<'idle' | 'recording' | 'paused'>('idle');
  const voiceTranscriptRef = useRef('');
  const voiceTimerRef = useRef<number | null>(null);
  const voiceLevelRef = useRef(0);
  const pauseRequestedRef = useRef(false);
  const cleaningUpVoiceRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceRafRef = useRef<number | null>(null);
  const { theme } = useTheme();
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingTemporary, setPendingTemporary] = useState(false);
  const [userInfo, setUserInfo] = useState<{ full_name: string; email: string } | null>(null);
  const [chatTheme, setChatTheme] = useState<ChatTheme>(
    () => getChatTheme(localStorage.getItem('chatTheme'))
  );
  const isInitialActiveConversation = useRef(true);
  const conversationsRef = useRef<Conversation[]>(conversations);
  const streamQueueRef = useRef<string[]>([]);
  const streamDisplayTextRef = useRef('');
  const streamConversationIdRef = useRef<string | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const streamDoneRef = useRef(false);
  const streamRevealTimerRef = useRef<number | null>(null);
  const voiceActionsRef = useRef<{
    start: () => void;
    pause: () => void;
    resume: () => void;
  }>({ start: () => {}, pause: () => {}, resume: () => {} });
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

  const dropTemporaryConversations = (exceptId?: string) => {
    setConversations(prev => {
      for (const conv of prev) {
        if (conv.isTemporary && conv.id !== exceptId) {
          conv.messages.forEach(message => message.attachments?.forEach(attachment => URL.revokeObjectURL(attachment.url)));
        }
      }
      return prev.filter(conv => !(conv.isTemporary && conv.id !== exceptId));
    });
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setNewMessage('');
    pendingAttachments.forEach(attachment => URL.revokeObjectURL(attachment.url));
    setPendingAttachments([]);
    setPendingTemporary(false);
    dropTemporaryConversations();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleTemporaryChat = () => {
    handleNewChat();
    setPendingTemporary(true);
    toast({
      title: 'Temporary chat',
      description: "This conversation won't be saved and can't be retrieved after you close it.",
    });
  };

  const handleSelectConversation = (id: string) => {
    setPendingTemporary(false);
    dropTemporaryConversations(id);
    setActiveConversation(id);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    const rejected = files.filter(file => !isAcceptedFile(file));
    const oversized = files.filter(file => isAcceptedFile(file) && file.size > MAX_FILE_SIZE);
    const accepted = files.filter(file => isAcceptedFile(file) && file.size <= MAX_FILE_SIZE);

    if (rejected.length) {
      toast({
        title: 'File type not supported',
        description: `${rejected.map(file => file.name).join(', ')}. Images, PDFs, docs, and text files are allowed.`,
      });
    }
    if (oversized.length) {
      toast({
        title: 'File too large',
        description: `${oversized.map(file => file.name).join(', ')} is larger than 25 MB.`,
      });
    }

    if (!accepted.length) return;

    setPendingAttachments(prev => [
      ...prev,
      ...accepted.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const target = prev.find(attachment => attachment.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(attachment => attachment.id !== id);
    });
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? newMessage.length;
    const end = textarea?.selectionEnd ?? newMessage.length;
    setNewMessage(prev => prev.slice(0, start) + emojiData.emoji + prev.slice(end));
    if (textarea) {
      const position = start + emojiData.emoji.length;
      textarea.setSelectionRange(position, position);
    }
  };

  const setVoiceState = (status: 'idle' | 'recording' | 'paused') => {
    voiceStatusRef.current = status;
    setVoiceStatus(status);
  };

  const computeVoiceLevel = () => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const delta = (buffer[i] - 128) / 128;
      sum += delta * delta;
    }
    return Math.min(1, Math.sqrt(sum / buffer.length));
  };

  const stopVoiceMeter = () => {
    if (voiceRafRef.current !== null) {
      window.cancelAnimationFrame(voiceRafRef.current);
      voiceRafRef.current = null;
    }
  };

  const startVoiceMeter = () => {
    stopVoiceMeter();
    const tick = () => {
      if (voiceStatusRef.current === 'paused') return;
      let level = computeVoiceLevel();
      if (level === null) {
        level = 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(Date.now() / 180));
      }
      const smoothed = voiceLevelRef.current * 0.6 + level * 0.4;
      voiceLevelRef.current = smoothed;
      setVoiceLevel(smoothed);
      voiceRafRef.current = window.requestAnimationFrame(tick);
    };
    voiceRafRef.current = window.requestAnimationFrame(tick);
  };

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const startVoiceTimer = () => {
    stopVoiceTimer();
    setVoiceSeconds(0);
    voiceTimerRef.current = window.setInterval(() => {
      setVoiceSeconds(seconds => seconds + 1);
    }, 1000);
  };

  const cleanupVoiceSession = () => {
    if (cleaningUpVoiceRef.current) return;
    cleaningUpVoiceRef.current = true;
    setVoiceState('idle');
    setVoiceSeconds(0);
    setVoiceLevel(0);
    voiceLevelRef.current = 0;
    pauseRequestedRef.current = false;
    stopVoiceTimer();
    stopVoiceMeter();
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    recognitionRef.current = null;
    const stream = micStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    const context = audioCtxRef.current;
    if (context) {
      void context.close().catch(() => { /* ignore */ });
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    cleaningUpVoiceRef.current = false;
  };

  const startVoiceRecording = async () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast({
        title: 'Voice input not supported',
        description: 'Your browser does not support speech recognition. Try Chrome or Microsoft Edge.',
      });
      return;
    }

    voiceTranscriptRef.current = '';
    setVoiceTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioContext;
      analyserRef.current = analyser;
    } catch {
      micStreamRef.current = null;
      analyserRef.current = null;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let segment = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          segment += event.results[i][0].transcript;
        }
      }
      const cleaned = segment.trim();
      if (cleaned) {
        voiceTranscriptRef.current = (voiceTranscriptRef.current + ' ' + cleaned).trim();
        setVoiceTranscript(voiceTranscriptRef.current);
      }
    };

    recognition.onend = () => {
      if (voiceStatusRef.current === 'paused') return;
      if (voiceStatusRef.current === 'recording' && !pauseRequestedRef.current) {
        cleanupVoiceSession();
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast({
          title: 'Microphone access denied',
          description: 'Allow microphone access in your browser to use voice input.',
        });
      }
      cleanupVoiceSession();
    };

    recognitionRef.current = recognition;
    setVoiceState('recording');
    startVoiceTimer();
    startVoiceMeter();

    try {
      recognition.start();
    } catch {
      toast({
        title: 'Voice input unavailable',
        description: 'Could not start the microphone, or you are already using it elsewhere.',
      });
      cleanupVoiceSession();
    }
  };

  const pauseVoiceRecording = () => {
    if (voiceStatusRef.current !== 'recording') return;
    pauseRequestedRef.current = true;
    setVoiceState('paused');
    stopVoiceTimer();
    stopVoiceMeter();
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  };

  const resumeVoiceRecording = () => {
    if (voiceStatusRef.current !== 'paused') return;
    pauseRequestedRef.current = false;
    setVoiceState('recording');
    startVoiceTimer();
    startVoiceMeter();
    window.setTimeout(() => {
      try {
        recognitionRef.current?.start();
      } catch {
        toast({
          title: 'Voice input unavailable',
          description: 'Could not resume recording. Please try again.',
        });
        cleanupVoiceSession();
      }
    }, 150);
  };

  const sendVoiceRecording = () => {
    const transcript = voiceTranscriptRef.current.trim();
    cleanupVoiceSession();
    if (!transcript) {
      toast({
        title: 'No speech detected',
        description: 'Nothing was captured. Try recording again.',
      });
      return;
    }
    handleSendMessage(transcript);
  };

  const discardVoiceRecording = () => {
    cleanupVoiceSession();
  };

  useEffect(() => {
    voiceActionsRef.current = {
      start: startVoiceRecording,
      pause: pauseVoiceRecording,
      resume: resumeVoiceRecording,
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      const hasModalOpen =
        !!document.querySelector('[role="dialog"], [role="alertdialog"]');

      if (event.key === '/') {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && !isEditable && !hasModalOpen) {
          event.preventDefault();
          textareaRef.current?.focus();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === 'm' || event.key === 'M')) {
        event.preventDefault();
        const status = voiceStatusRef.current;
        if (status === 'idle') {
          voiceActionsRef.current.start();
        } else if (status === 'recording') {
          voiceActionsRef.current.pause();
        } else {
          voiceActionsRef.current.resume();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        if (voiceStatusRef.current === 'idle') {
          setEmojiOpen(open => !open);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setEmojiOpen]);

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
    if (voiceRafRef.current !== null) {
      window.cancelAnimationFrame(voiceRafRef.current);
    }
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
    }
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => { /* ignore */ });
    }
  }, []);

  // Add a logic to load conversations from the backend when the component mounts
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/conversations`,{
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
            attachments: message.attachments ?? [],
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
        const response = await authenticatedFetch(`${API_BASE_URL}/api/me`, {
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

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

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

  const toggleMultiSelect = (enabled: boolean) => {
    setIsMultiSelect(enabled);
    if (!enabled) {
      setSelectedConversationIds(new Set());
    }
  };

  const toggleConversationSelect = (id: string) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const confirmDelete = () => {
    if (isMultiSelect && selectedConversationIds.size > 0) {
      const ids = Array.from(selectedConversationIds);
      const count = ids.length;
      authenticatedFetch(`${API_BASE_URL}/api/conversations/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ conversation_ids: ids }),
      })
        .then(async (response) => {
          if (!response.ok) {
            let detail = 'Failed to delete the selected chats.';
            try {
              const error = await response.json();
              if (error?.detail) detail = typeof error.detail === 'string' ? error.detail : detail;
            } catch { /* keep default message */ }
            throw new Error(detail);
          }
        })
        .catch(error => {
          console.error('Error deleting conversations:', error);
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to delete the selected chats.',
          });
        });
      setConversations(prev => prev.filter(conv => !selectedConversationIds.has(conv.id)));
      if (activeConversation && selectedConversationIds.has(activeConversation)) {
        setActiveConversation(null);
      }
      toast({
        title: `${count} chats deleted`,
        description: 'The selected chats and their uploaded media files have been permanently deleted.',
      });
    } else if (conversationToDelete) {
      const conversationTitle = conversations.find(conv => conv.id === conversationToDelete)?.title || 'Conversation';
      authenticatedFetch(`${API_BASE_URL}/api/conversations/${conversationToDelete}`, {
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
        description: `"${conversationTitle}" and its uploaded media files have been permanently deleted.`,
      });
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
    if (isMultiSelect) {
      setSelectedConversationIds(new Set());
      setIsMultiSelect(false);
    }
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

    authenticatedFetch(`${API_BASE_URL}/api/conversations/${id}`, {
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
    const sentAttachments = pendingAttachments;
    if (!text && sentAttachments.length === 0) return;

    const localConversationId = activeConversation ?? Date.now().toString();

    const isTemporaryChat = activeConversation
      ? (conversationsRef.current.find(conv => conv.id === activeConversation)?.isTemporary ?? false)
      : pendingTemporary;

    const sendingHistory = conversationsRef.current
      .find(conv => conv.id === activeConversation)
      ?.messages.map(m => ({ sender: m.sender, text: m.text })) ?? [];

    const message: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
      attachments: sentAttachments.map(attachment => ({
        id: attachment.id,
        filename: attachment.name,
        mime_type: attachment.mimeType,
        size: attachment.size,
        url: attachment.url,
      })),
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
        updatedAt: new Date(),
        isTemporary: pendingTemporary
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv.id);
      setPendingTemporary(false);
    }

    setNewMessage('');
    setPendingAttachments([]);
    setIsTyping(true);

    // use an api call to get the AI response instead of a simulated response
    (async () => {
      let responseConversationId = activeConversation ?? localConversationId;
      streamQueueRef.current = [];
      streamDisplayTextRef.current = '';
      streamConversationIdRef.current = responseConversationId;
      streamMessageIdRef.current = `ai-${Date.now()}`;
      streamDoneRef.current = false;
      let notificationTitle = conversationsRef.current.find(conv => conv.id === (activeConversation ?? localConversationId))?.title || 'Super AI';

      const onStreamDone = () => {
        if (isNotificationsEnabled() && document.visibilityState === 'hidden') {
          tryNotify(notificationTitle, streamDisplayTextRef.current.trim().slice(0, 140));
        }
        playNotificationSound();
      };

      try {
        const accessToken = localStorage.getItem('access_token');
        const formData = new FormData();
        formData.append('input', text);
        formData.append('is_new', String(!activeConversation));
        formData.append('persist', String(!isTemporaryChat));
        if (isTemporaryChat && sendingHistory.length > 0) {
          formData.append('history', JSON.stringify(sendingHistory));
        }
        if (activeConversation) {
          formData.append('conversation_id', activeConversation);
        }
        sentAttachments.forEach(attachment => formData.append('files', attachment.file));

        const response = await authenticatedFetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          body: formData,
        });

        if (!response.ok) {
          let detail = 'Failed to get a response from the AI. Please check your connection or try again later.';
          try {
            const error = await response.json();
            if (error?.detail) {
              detail = typeof error.detail === 'string' ? error.detail : 'Failed to process the request.';
            }
          } catch { /* keep default message */ }
          throw new Error(detail);
        }
        if (!response.body) throw new Error('Failed to get a response');

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
                      messages: event.attachments?.length
                        ? (() => {
                            const messages = [...conv.messages];
                            const lastIndex = messages.length - 1;
                            if (lastIndex >= 0 && messages[lastIndex].sender === 'user') {
                              messages[lastIndex] = { ...messages[lastIndex], attachments: event.attachments };
                            }
                            return messages;
                          })()
                        : conv.messages,
                      ...(event.title ? { title: event.title } : {}),
                    }
                  : conv
              ));
              sentAttachments.forEach(attachment => URL.revokeObjectURL(attachment.url));
            } else if (event.type === 'title') {
              notificationTitle = event.title;
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
              onStreamDone();
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
            onStreamDone();
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
        const description = error instanceof Error
          ? error.message
          : 'Failed to get a response from the AI. Please check your connection or try again later.';
        toast({ title: 'Error', description });
        return;
      }
    })();
  }, [newMessage, activeConversation, pendingAttachments, pendingTemporary, authenticatedFetch, toast]);

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

  const visibleConversationIds = filteredConversations.map(conv => conv.id);
  const allVisibleConversationsSelected = visibleConversationIds.length > 0
    && visibleConversationIds.every(id => selectedConversationIds.has(id));
  const someVisibleConversationsSelected = visibleConversationIds.some(id => selectedConversationIds.has(id));

  const handleSelectAllToggle = (checked: boolean | 'indeterminate') => {
    const shouldSelectAll = checked === true || checked === 'indeterminate';
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (shouldSelectAll) {
        visibleConversationIds.forEach(id => next.add(id));
      } else {
        visibleConversationIds.forEach(id => next.delete(id));
      }
      return next;
    });
  };

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
          <div className="flex items-center gap-2">
            <Button
              onClick={handleNewChat}
              className="flex-1 mb-1 smooth-transition hover:shadow-glow"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTemporaryChat}
                  className="h-9 w-9 p-0 mb-1 text-muted-foreground hover:text-foreground smooth-transition"
                  aria-label="Start a temporary chat"
                >
                  <MessageSquareDashed className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Start a temporary chat — it won't be saved and can't be retrieved after you close it.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-muted/30 border-border fast-transition focus:shadow-glow"
            />
          </div>

          {isMultiSelect ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">
                  {selectedConversationIds.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMultiSelect(false)}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground fast-transition"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={allVisibleConversationsSelected
                      ? true
                      : someVisibleConversationsSelected ? 'indeterminate' : false}
                    onCheckedChange={handleSelectAllToggle}
                  />
                  Select all
                </label>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedConversationIds.size === 0}
                  onClick={() => setDeleteDialogOpen(true)}
                  className="flex-1 smooth-transition"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete ({selectedConversationIds.size})
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleMultiSelect(true)}
                className="flex-1 justify-center gap-2 text-muted-foreground hover:text-foreground fast-transition"
                title="Select multiple chats to delete at once"
              >
                <ListChecks className="w-4 h-4" />
                Select
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex-1 justify-center gap-2 text-muted-foreground hover:text-foreground fast-transition">
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
          )}
        </>
      }
      sidebarContent={
        <div className="space-y-2">
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => isMultiSelect
                ? toggleConversationSelect(conversation.id)
                : handleSelectConversation(conversation.id)}
              className={cn(
                "p-3 rounded-lg cursor-pointer transition-all duration-200 group hover:shadow-modern smooth-transition flex items-center gap-2",
                isMultiSelect
                  ? selectedConversationIds.has(conversation.id)
                    ? "bg-accent text-accent-foreground shadow-modern border border-border/50"
                    : "hover:bg-hover-muted text-foreground"
                  : activeConversation === conversation.id
                    ? "bg-accent text-accent-foreground shadow-modern border border-border/50"
                    : "hover:bg-hover-muted text-foreground"
              )}
            >
              {isMultiSelect && (
                <Checkbox
                  checked={selectedConversationIds.has(conversation.id)}
                  onCheckedChange={() => toggleConversationSelect(conversation.id)}
                  className="flex-shrink-0"
                  aria-label={`Select ${conversation.title}`}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {conversation.isTemporary && (
                      <MessageSquareDashed className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-label="Temporary chat" />
                    )}
                    <h3 className="font-medium text-sm truncate">{conversation.title}</h3>
                  </div>
                  {!isMultiSelect && (
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-hover-muted fast-transition"
                            aria-label={`Options for ${conversation.title}`}
                            title="Chat options"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameClick(conversation.id, conversation.title);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(conversation.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete chat
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
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
        <>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Chat theme
          </DropdownMenuLabel>
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
        </>
      }
    >
      {/* Messages Area */}
      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ background: chatTheme.areaBg }}
      >
        <ScrollArea className="h-full p-4 bg-transparent overflow-x-hidden">
        {currentConversation?.isTemporary && (
          <div className="max-w-4xl mx-auto w-full mb-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-sm text-foreground">
              <MessageSquareDashed className="w-4 h-4 text-primary flex-shrink-0" />
              <span>Temporary chat — this conversation won't be saved and can't be retrieved after you close it.</span>
            </div>
          </div>
        )}
        {currentConversation?.messages.length ? (
          <div className="max-w-4xl mx-auto w-full">
            {currentConversation.messages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "message-enter w-full group",
                    index === 0 ? "mt-0" : "mt-6"
                  )}
                >
                  <div className={cn(
                    "max-w-[80%] md:max-w-[70%] w-fit min-w-0 relative",
                    message.sender === 'user' ? "ml-auto" : "mr-auto"
                  )}>
                    {message.sender === 'user' ? (
                      <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 text-sm text-left shadow-glow min-w-0">
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {message.attachments.map(attachment => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 px-2.5 py-1.5 text-xs transition-colors max-w-[240px]"
                                title={attachment.filename}
                              >
                                {attachment.mime_type.startsWith('image/') ? (
                                  <img
                                    src={attachment.url}
                                    alt={attachment.filename}
                                    className="w-9 h-9 rounded object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <FileText className="w-4 h-4 flex-shrink-0" />
                                )}
                                <span className="truncate">{attachment.filename}</span>
                                <span className="text-primary-foreground/70 flex-shrink-0">
                                  {formatFileSize(attachment.size)}
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {message.text}
                        </p>
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
                    ) : (
                      <div className="bg-card border border-border/60 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-card-foreground text-left shadow-md min-w-0">
                        <AiBanner />
                        <MarkdownMessage content={message.text} />
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
                    )}
                  </div>
                </div>
              ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="max-w-[80%] md:max-w-[70%] w-fit min-w-0 mr-auto animate-slide-in mt-6">
                <div className="bg-card border border-border/60 rounded-2xl rounded-bl-md px-4 py-3 shadow-md">
                  <AiBanner />
                  <div className="flex items-center gap-1.5 px-1 pt-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" />
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce-subtle" style={{ animationDelay: '300ms' }} />
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
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="p-2 bg-card/50 backdrop-blur-sm rounded-2xl border border-border shadow-modern hover:shadow-elegant smooth-transition w-full">
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-2">
                {pendingAttachments.map(attachment => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2 py-1.5 text-xs max-w-[260px]"
                  >
                    {attachment.mimeType.startsWith('image/') ? (
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate">{attachment.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">
                      {formatFileSize(attachment.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="h-5 w-5 p-0 ml-0.5 text-muted-foreground hover:text-destructive hover:bg-transparent"
                      aria-label={`Remove ${attachment.name}`}
                      title="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {voiceStatus !== 'idle' ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardVoiceRecording}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive fast-transition"
                aria-label="Delete recording"
                title="Delete recording"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <div className="flex items-end gap-[3px] h-7" aria-hidden="true">
                  {Array.from({ length: 22 }).map((_, index) => {
                    const wave = 0.25 + 0.75 * Math.abs(Math.sin(voiceLevel * Math.PI * 2 + index * 0.45));
                    const height = Math.max(0.08, voiceLevel * wave);
                    return (
                      <span
                        key={index}
                        className="w-[3px] rounded-full transition-all duration-75"
                        style={{
                          height: `${height * 100}%`,
                          background: voiceStatus === 'paused' ? 'var(--muted-foreground)' : 'var(--destructive)',
                          opacity: voiceStatus === 'paused' ? 0.4 : 0.9,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                  {formatVoiceTime(voiceSeconds)}
                </span>
                <span className="text-xs truncate text-muted-foreground min-w-0">
                  {voiceStatus === 'paused'
                    ? 'Paused'
                    : voiceTranscript
                      ? voiceTranscript
                      : 'Listening...'}
                </span>
              </div>
              {voiceStatus === 'recording' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={pauseVoiceRecording}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground fast-transition"
                  aria-label="Pause recording"
                  title="Pause recording"
                >
                  <Pause className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resumeVoiceRecording}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground fast-transition"
                  aria-label="Resume recording"
                  title="Resume recording"
                >
                  <Play className="w-4 h-4" />
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={!voiceTranscript.trim()}
                onClick={sendVoiceRecording}
                className="h-8 w-8 p-0 smooth-transition hover:shadow-glow disabled:opacity-50"
                style={{ background: 'var(--gradient-primary)' }}
                aria-label="Send recording"
                title="Send recording"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="relative flex-1 min-w-0">
                <Textarea
                  ref={textareaRef}
                  placeholder="type your message here..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  aria-label="Message Super AI"
                  className="w-full min-h-11 max-h-60 resize-none overflow-y-auto rounded-xl border border-border/60 bg-muted/30 pl-11 pr-[76px] py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground leading-relaxed shadow-sm transition-colors focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                  rows={1}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 left-2 z-10 h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                  aria-label="Attach a file"
                  title="Attach a file"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute bottom-2 right-10 z-10 h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                      aria-label="Insert emoji"
                      title="Insert emoji (Ctrl+Shift+E)"
                    >
                      <Smile className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="top"
                    sideOffset={8}
                    onFocusOutside={(event) => event.preventDefault()}
                    className="w-auto border-border/60 p-0 shadow-modern overflow-hidden"
                  >
                    <EmojiPicker
                      height={380}
                      width={Math.min(320, window.innerWidth - 24)}
                      lazyLoadEmojis
                      theme={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                      onEmojiClick={handleEmojiClick}
                    />
                  </PopoverContent>
                </Popover>

                {!newMessage.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={startVoiceRecording}
                    className="absolute bottom-2 right-2 z-10 h-8 w-8 p-0 text-muted-foreground hover:bg-hover-muted hover:text-foreground"
                    aria-label="Start voice recording"
                    title="Start voice recording (Ctrl+M)"
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {(newMessage.trim() || pendingAttachments.length > 0) && (
                  <Button
                    onClick={() => handleSendMessage()}
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
          )}
          </div>

          <div className="mt-2 text-xs text-muted-foreground text-center">
            Enter to send · Shift+Enter for a new line · / focuses input · Ctrl+M voice · Ctrl+Shift+E emoji
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isMultiSelect && selectedConversationIds.size > 0
                ? `Delete ${selectedConversationIds.size} Chats?`
                : 'Delete Chat?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isMultiSelect && selectedConversationIds.size > 0
                ? `Are you sure you want to delete ${selectedConversationIds.size} conversations? All messages and any uploaded media files in them will be permanently deleted and cannot be recovered.`
                : 'Are you sure you want to delete this conversation? All messages and any uploaded media files will be permanently deleted and cannot be recovered.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isMultiSelect && selectedConversationIds.size > 0
                ? `Delete ${selectedConversationIds.size} Chats`
                : 'Delete Chat'}
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