/** AI Chat conversation types for persistence. */

import type { AIMessageContent } from './ai';

/** A single message in a conversation. */
export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: AIMessageContent;
  /** Timestamp when this message was created. */
  timestamp?: string;
}

/** A saved conversation. */
export interface Conversation {
  id: string;
  /** Display title, derived from first user message. */
  title: string;
  messages: ChatHistoryMessage[];
  createdAt: string;
  updatedAt: string;
}

/** The full conversations data file. */
export interface ConversationsData {
  conversations: Conversation[];
}
