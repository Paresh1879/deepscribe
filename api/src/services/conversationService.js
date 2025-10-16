import { BufferMemory } from "langchain/memory";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { createClient } from '@supabase/supabase-js';

class ConversationService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
  }

  /**
   * Create conversation memory for a session
   */
  async createMemory(sessionId) {
    try {
      // Check if session already exists
      const { data: existingSession } = await this.supabase
        .from('conversation_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (!existingSession) {
        // Create session record in Supabase
        const { error } = await this.supabase
          .from('conversation_sessions')
          .insert({
            session_id: sessionId,
            created_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            message_count: 0
          });

        if (error) {
          console.error('Error creating conversation session:', error);
          throw error;
        }
      }

      const memory = new BufferMemory({
        memoryKey: "chat_history",
        returnMessages: true,
        chatHistory: new ChatMessageHistory(),
        inputKey: "question",
        outputKey: "answer",
      });

      return memory;
    } catch (error) {
      console.error('Error creating memory:', error);
      throw error;
    }
  }

  /**
   * Get memory for a session
   */
  getMemory(sessionId) {
    // For Supabase, we'll create a new memory and populate it from the database
    const memory = new BufferMemory({
      memoryKey: "chat_history",
      returnMessages: true,
      chatHistory: new ChatMessageHistory(),
      inputKey: "question",
      outputKey: "answer",
    });
    return memory;
  }

  /**
   * Add interaction to memory
   */
  async addInteraction(sessionId, question, answer) {
    try {
      // Store messages in Supabase
      const messages = [
        {
          session_id: sessionId,
          role: 'user',
          content: question,
          created_at: new Date().toISOString()
        },
        {
          session_id: sessionId,
          role: 'assistant',
          content: answer,
          created_at: new Date().toISOString()
        }
      ];

      const { data: insertData, error: messagesError } = await this.supabase
        .from('conversation_messages')
        .insert(messages)
        .select();

      if (messagesError) {
        console.error('Error storing messages:', messagesError);
        throw messagesError;
      }
      
      console.log(`💾 Stored ${insertData?.length || 0} messages for session ${sessionId}`);

      // Update session stats
      const { error: updateError } = await this.supabase
        .from('conversation_sessions')
        .update({
          last_activity: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      if (updateError) {
        console.error('Error updating session:', updateError);
        throw updateError;
      }

      console.log(`Added interaction to session ${sessionId}`);
    } catch (error) {
      console.error('Error adding interaction:', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(sessionId) {
    try {
      const { data: messages, error } = await this.supabase
        .from('conversation_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching conversation history:', error);
        throw error;
      }

      if (!messages || messages.length === 0) {
        console.log(`📖 No messages found for session ${sessionId}`);
        return [];
      }

      // Convert to LangChain message format
      const history = messages.map(msg => {
        if (msg.role === 'user') {
          return new HumanMessage(msg.content);
        } else {
          return new AIMessage(msg.content);
        }
      });

      console.log(`📖 Retrieved ${history.length} messages from database for session ${sessionId}`);
      return history;
    } catch (error) {
      console.error('Error getting history:', error);
      throw error;
    }
  }

  /**
   * Get recent conversation context (last N exchanges)
   */
  async getRecentContext(sessionId, maxExchanges = 3) {
    const history = await this.getHistory(sessionId);
    if (!history || history.length === 0) {
      return [];
    }

    // Return last N exchanges (each exchange = 2 messages: human + AI)
    const maxMessages = maxExchanges * 2;
    return history.slice(-maxMessages);
  }


  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    try {
      // Delete messages first (foreign key constraint)
      await this.supabase
        .from('conversation_messages')
        .delete()
        .eq('session_id', sessionId);

      // Delete session
      const { error } = await this.supabase
        .from('conversation_sessions')
        .delete()
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error deleting session:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  /**
   * Clean up old sessions (older than 1 hour)
   */
  async cleanupOldSessions() {
    try {
      const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();

      // Delete old sessions and their messages
      const { error } = await this.supabase
        .from('conversation_sessions')
        .delete()
        .lt('last_activity', oneHourAgo);

      if (error) {
        console.error('Error cleaning up sessions:', error);
        throw error;
      }

      console.log('Cleaned up old conversation sessions');
      return true;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      throw error;
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000)).toISOString();

      const { data: sessions, error } = await this.supabase
        .from('conversation_sessions')
        .select('*')
        .gte('last_activity', fiveMinutesAgo);

      if (error) {
        console.error('Error fetching active sessions:', error);
        throw error;
      }

      return sessions.map(session => ({
        sessionId: session.session_id,
        totalMessages: session.message_count,
        totalExchanges: session.message_count / 2,
        lastActivity: new Date(session.last_activity),
        createdAt: new Date(session.created_at),
        isActive: true
      }));
    } catch (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }
  }

  /**
   * Analyze conversation for session info
   */
  analyzeConversation(sessionId) {
    // This method is called from server-langchain.js but not implemented
    // Return basic info for now
    return {
      sessionId,
      hasHistory: true,
      messageCount: 0 // This would need to be fetched from DB in a real implementation
    };
  }
}

export const conversationService = new ConversationService();
