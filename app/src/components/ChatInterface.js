import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

import { Send, User, Bot, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

// API helper functions
const api = {
  async getPatientInfo() {
    const response = await axios.get('/api/sample-data');
    return response.data.patientInfo;
  },
  
  async sendMessage(sessionId, message) {
    const response = await axios.post('/api/chat/message', {
      sessionId,
      message
    });
    return response.data;
  },

  async getConversationHistory(sessionId) {
    const response = await axios.get(`/api/chat/session/${sessionId}/history`);
    return response.data.messages;
  }
};

const ChatInterface = ({ sessionId, onNavigateToTranscript }) => {
  // State management
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [patientInfo, setPatientInfo] = useState(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Suggested questions
  const suggestedQuestions = [
    "What medications were prescribed?",
    "What are the main symptoms?",
    "Is there a follow-up plan?"
  ];
  
  // Refs
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Utility functions
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadConversationHistory = useCallback(async (sessionId) => {
    try {
      console.log(`📖 Loading conversation history for session: ${sessionId}`);
      const history = await api.getConversationHistory(sessionId);
      
      if (history && history.length > 0) {
        console.log(`📖 Loaded ${history.length} messages from history`);
        setMessages(history);
        // Scroll to bottom after loading history
        setTimeout(() => scrollToBottom(), 100);
      } else {
        console.log('📖 No conversation history found');
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading conversation history:', error);
      setMessages([]);
    }
  }, [scrollToBottom]);

  const scrollToTop = useCallback(() => {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      
      // Show scroll to top button if scrolled down more than 200px
      setShowScrollToTop(scrollTop > 200);
      
      // Only auto-scroll to bottom for new messages, not during manual scrolling
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      
      // Store scroll position to detect if user is manually scrolling up
      if (!isNearBottom) {
        // User has scrolled up manually, disable auto-scroll
        setUserScrolledUp(true);
      } else if (isNearBottom) {
        // User is at bottom, re-enable auto-scroll
        setUserScrolledUp(false);
      }
    }
  }, []);

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Effects
  useEffect(() => {
    // Only auto-scroll to bottom if user hasn't manually scrolled up
    if (!userScrolledUp) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, userScrolledUp]);

  useEffect(() => {
    const initializeChat = async () => {
      inputRef.current?.focus();
      try {
        const patientData = await api.getPatientInfo();
        setPatientInfo(patientData);
        
        // Load conversation history if sessionId exists
        if (sessionId) {
          await loadConversationHistory(sessionId);
        }
      } catch (error) {
        console.error('Error fetching patient info:', error);
      }
    };
    
    initializeChat();
  }, [sessionId, loadConversationHistory]); // Add sessionId and loadConversationHistory dependencies

  // Add scroll event listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Event handlers
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    // Update UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);
    
    // Reset scroll state when user sends a message
    setUserScrolledUp(false);

    try {
      const response = await api.sendMessage(sessionId, userMessage.content);
      
      // Update messages with the response
      setMessages(prev => [...prev, response.message]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message');
      console.error('Error sending message:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestedQuestion = async (question) => {
    if (isLoading) return; // Prevent multiple submissions
    
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: question,
      timestamp: new Date()
    };

    // Update UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);
    
    // Reset scroll state when user sends a message
    setUserScrolledUp(false);

    try {
      const response = await api.sendMessage(sessionId, question);
      
      // Update messages with the response
      setMessages(prev => [...prev, response.message]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message');
      console.error('Error sending message:', err);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="chat-container">
      {/* Patient Information Header - Always Visible */}
      {patientInfo && (
        <div className="patient-info-header">
          <div className="patient-info">
            <h4>📋 Patient Information</h4>
            <p><strong>Patient:</strong> {patientInfo.name}</p>
            <p><strong>Doctor:</strong> Dr. Samantha Lee (Primary Care)</p>
            <p><strong>Visit Date:</strong> {patientInfo.visit_date}</p>
            <p><strong>Chief Complaint:</strong> {patientInfo.chief_complaint}</p>
          </div>
        </div>
      )}

      <div className="chat-messages" ref={messagesContainerRef}>
        {/* Welcome message - always visible at the top */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="welcome-message"
        >
          <div className="message assistant">
            <div className="message-avatar">
              <Bot size={20} />
            </div>
            <div className="message-content">
              <h3>Welcome to DeepScribe Clinical Chat!</h3>
              <p><strong>Ask me a Question!</strong></p>
              
              <div className="suggested-questions">
                <p className="suggested-questions-title">💡 Suggested questions:</p>
                <div className="suggested-questions-grid">
                  {suggestedQuestions.map((question, index) => (
                    <button
                      key={index}
                      className="suggested-question"
                      onClick={() => handleSuggestedQuestion(question)}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`message ${message.type}`}
            >
              <div className="message-avatar">
                {message.type === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              <div className="message-content">
                {message.type === 'assistant' ? (
                  <div className="assistant-message-wrapper">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                    {message.highlightingData && message.highlightingData.length > 0 && (
                      <div className="message-highlight-bubble">
                        <button 
                          className="highlight-arrow-button"
                          onClick={() => {
                            if (onNavigateToTranscript) {
                              onNavigateToTranscript(message.highlightingData[0]);
                            }
                          }}
                          title="Show in Transcript"
                        >
                          <div className="highlight-arrow"></div>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  message.content
                )}
                <div className="message-time">
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="message assistant"
          >
            <div className="message-avatar">
              <Bot size={20} />
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <div className="typing-dots">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
                <span>Analyzing transcript...</span>
              </div>
            </div>
          </motion.div>
        )}


        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="error-message"
          >
            <div className="message assistant">
              <div className="message-avatar">
                <Bot size={20} />
              </div>
              <div className="message-content" style={{ background: '#ffe6e6', color: '#d63031' }}>
                <strong>Error:</strong> {error}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll Controls */}
      {messages.length > 3 && (
        <div className="scroll-controls">
          {showScrollToTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToTop}
              className="scroll-button scroll-to-top"
              title="Scroll to top"
            >
              <ChevronUp size={20} />
            </motion.button>
          )}
          
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={scrollToBottom}
            className="scroll-button scroll-to-bottom"
            title="Scroll to bottom"
          >
            <ChevronDown size={20} />
          </motion.button>
        </div>
      )}

      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="chat-input-form">
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about the patient ..."
            className="chat-input"
            rows="1"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="send-button"
          >
            <Send size={20} />
          </button>
        </form>
      </div>

    </div>
  );
};

export default ChatInterface;
