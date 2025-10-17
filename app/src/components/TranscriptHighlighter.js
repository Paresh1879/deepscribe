import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Eye, X } from 'lucide-react';
import axios from 'axios';

const TranscriptHighlighter = ({ highlightingData, transcript, onHighlightClick, onNavigateToTranscript }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [transcriptData, setTranscriptData] = useState(null);

  useEffect(() => {
    if (highlightingData && highlightingData.length > 0) {
      setIsVisible(true);
      
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [highlightingData]);

  useEffect(() => {
    fetchTranscriptData();
  }, []);

  const fetchTranscriptData = async () => {
    try {
      const response = await axios.get('/api/sample-data');
      setTranscriptData(response.data);
    } catch (error) {
      console.error('Error fetching transcript data:', error);
    }
  };

  const handleHighlightClick = () => {
    if (onNavigateToTranscript && highlightingData && highlightingData.length > 0) {
      // Pass the top highlight data to the transcript viewer
      onNavigateToTranscript(highlightingData[0]);
    }
    setIsVisible(false);
  };

  const closeHighlights = () => {
    setIsVisible(false);
  };

  const renderTopHighlightBubble = () => {
    if (!highlightingData || highlightingData.length === 0) return null;
    
    const topHighlight = highlightingData[0];
    const relevanceColor = topHighlight.relevanceScore > 0.7 ? '#10b981' : 
                          topHighlight.relevanceScore > 0.4 ? '#f59e0b' : '#ef4444';
    
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -20 }}
        className="highlight-bubble"
        style={{
          '--relevance-color': relevanceColor
        }}
        onClick={handleHighlightClick}
      >
        <div className="highlight-bubble-content">
          <div className="highlight-bubble-header">
            <MapPin size={14} />
            <span className="highlight-relevance">
              {Math.round(topHighlight.relevanceScore * 100)}% match
            </span>
          </div>
          <div className="highlight-bubble-text">
            {topHighlight.text.substring(0, 120)}
            {topHighlight.text.length > 120 && '...'}
          </div>
          <div className="highlight-bubble-type">
            {topHighlight.type === 'soap_note' ? 'SOAP Note' : 'Transcript'}
          </div>
        </div>
        <div className="highlight-bubble-arrow"></div>
      </motion.div>
    );
  };


  if (!highlightingData || highlightingData.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="transcript-highlighter"
        >
          <div className="highlighter-header">
            <div className="highlighter-title">
              <Eye size={16} />
              <span>See in Transcript</span>
            </div>
            <button onClick={closeHighlights} className="close-highlighter">
              <X size={16} />
            </button>
          </div>
          
          <div className="highlight-bubbles-container">
            {renderTopHighlightBubble()}
          </div>
          
          <div className="highlighter-footer">
            <span className="highlighter-hint">
              Click to view highlighted section in transcript
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TranscriptHighlighter;
