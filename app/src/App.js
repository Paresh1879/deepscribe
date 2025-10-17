import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import TranscriptViewer from './components/TranscriptViewer';
import Header from './components/Header';
import { motion } from 'framer-motion';
import './styles/components.css';
import './styles/App.css';

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [highlightData, setHighlightData] = useState(null);

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/chat/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create chat session');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigateToTranscript = (highlightData) => {
    setHighlightData(highlightData);
    setActiveTab('transcript');
  };


  if (isLoading) {
    return (
      <div className="loading-container">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="loading-spinner"
        >
          <div className="spinner"></div>
          <p>Initializing DeepScribe Chat...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={initializeSession} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <motion.main 
        className="main-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {activeTab === 'chat' && (
          <ChatInterface 
            sessionId={sessionId}
            onNavigateToTranscript={handleNavigateToTranscript}
          />
        )}
        
        {activeTab === 'transcript' && (
          <TranscriptViewer highlightData={highlightData} />
        )}

      </motion.main>
    </div>
  );
}

export default App;
