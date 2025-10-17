import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, User, FileText, Stethoscope } from 'lucide-react';
import { motion } from 'framer-motion';

// API helper
const api = {
  async getSampleData() {
    const response = await axios.get('/api/sample-data');
    return response.data;
  }
};

const TranscriptViewer = ({ highlightData }) => {
  const [sampleData, setSampleData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getSampleData();
      setSampleData(data);
    } catch (err) {
      setError('Failed to load transcript data');
      console.error('Error fetching sample data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderHighlightedText = (text, highlightData) => {
    if (!highlightData || !text) {
      return text;
    }

    const { startIndex, endIndex } = highlightData;
    
    if (startIndex === -1 || endIndex === -1) {
      return text;
    }

    const beforeText = text.substring(0, startIndex);
    const highlightedText = text.substring(startIndex, endIndex);
    const afterText = text.substring(endIndex);

    return (
      <>
        {beforeText}
        <span className="transcript-highlighted">{highlightedText}</span>
        {afterText}
      </>
    );
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (highlightData && sampleData) {
      // Scroll to the highlighted section after a short delay to ensure DOM is ready
      setTimeout(() => {
        const highlightedElement = document.querySelector('.transcript-highlighted');
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }, 500);
    }
  }, [highlightData, sampleData]);

  if (isLoading) {
    return (
      <div className="transcript-container">
        <div className="transcript-header">
          <h2>Loading Transcript...</h2>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transcript-container">
        <div className="transcript-header">
          <h2>Error</h2>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>{error}</p>
          <button onClick={fetchData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!sampleData) {
    return (
      <div className="transcript-container">
        <div className="transcript-header">
          <h2>No Data Available</h2>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>Unable to load transcript data. Please try refreshing the page.</p>
          <button onClick={fetchData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="transcript-container"
    >
      <div className="transcript-header">
        <h2>
          <Stethoscope size={24} style={{ marginRight: '10px' }} />
          Clinical Documentation
        </h2>
        <p>Patient Transcript and SOAP Note Analysis</p>
      </div>

      <div className="transcript-content">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="patient-info"
        >
          <h3>
            <User size={20} style={{ marginRight: '8px' }} />
            Patient Information
          </h3>
          <p><strong>Name:</strong> {sampleData.patientInfo?.name || 'Unknown'}</p>
          <p><strong>Age:</strong> {sampleData.patientInfo?.age || 'Unknown'} years old</p>
          <p><strong>Occupation:</strong> {sampleData.patientInfo?.occupation || 'Unknown'}</p>
          <p>
            <Calendar size={16} style={{ marginRight: '5px' }} />
            <strong>Visit Date:</strong> {sampleData.patientInfo?.visitDate || 'Unknown'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="transcript-section"
        >
          <h3>
            <FileText size={20} style={{ marginRight: '8px' }} />
            Patient-Provider Conversation Transcript
          </h3>
          <div className="transcript-text">
            {renderHighlightedText(sampleData.transcript || 'No transcript available', highlightData)}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="transcript-section"
        >
          <h3>
            <Stethoscope size={20} style={{ marginRight: '8px' }} />
            SOAP Note
          </h3>
          <div className="soap-note">
            {sampleData.soapNote ? (
              <>
                <div className="soap-section">
                  <div className="soap-section-header">SUBJECTIVE</div>
                  <div className="soap-section-content">
                    {sampleData.soapNote.includes('OBJECTIVE:') 
                      ? sampleData.soapNote.split('OBJECTIVE:')[0].replace('SUBJECTIVE:', '').trim()
                      : sampleData.soapNote.includes('Subjective:')
                      ? sampleData.soapNote.split('Objective:')[0].replace('Subjective:', '').trim()
                      : 'No subjective information available'
                    }
                  </div>
                </div>
                
                <div className="soap-section">
                  <div className="soap-section-header">OBJECTIVE</div>
                  <div className="soap-section-content">
                    {sampleData.soapNote.includes('OBJECTIVE:') && sampleData.soapNote.includes('ASSESSMENT:')
                      ? sampleData.soapNote.split('OBJECTIVE:')[1].split('ASSESSMENT:')[0].trim()
                      : sampleData.soapNote.includes('Objective:') && sampleData.soapNote.includes('Assessment:')
                      ? sampleData.soapNote.split('Objective:')[1].split('Assessment:')[0].trim()
                      : 'No objective information available'
                    }
                  </div>
                </div>
                
                <div className="soap-section">
                  <div className="soap-section-header">ASSESSMENT</div>
                  <div className="soap-section-content">
                    {sampleData.soapNote.includes('ASSESSMENT:') && sampleData.soapNote.includes('PLAN:')
                      ? sampleData.soapNote.split('ASSESSMENT:')[1].split('PLAN:')[0].trim()
                      : sampleData.soapNote.includes('Assessment:') && sampleData.soapNote.includes('Plan:')
                      ? sampleData.soapNote.split('Assessment:')[1].split('Plan:')[0].trim()
                      : 'No assessment information available'
                    }
                  </div>
                </div>
                
                <div className="soap-section">
                  <div className="soap-section-header">PLAN</div>
                  <div className="soap-section-content">
                    {sampleData.soapNote.includes('PLAN:')
                      ? sampleData.soapNote.split('PLAN:')[1].trim()
                      : sampleData.soapNote.includes('Plan:')
                      ? sampleData.soapNote.split('Plan:')[1].trim()
                      : 'No plan information available'
                    }
                  </div>
                </div>
              </>
            ) : (
              <div className="soap-section">
                <div className="soap-section-header">SOAP Note</div>
                <div className="soap-section-content">
                  No SOAP note available
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={{ 
            marginTop: '30px', 
            padding: '20px', 
            background: '#f8f9fa', 
            borderRadius: '10px',
            textAlign: 'center'
          }}
        >
          <h4 style={{ color: '#667eea', marginBottom: '10px' }}>
            Ready to analyze this documentation?
          </h4>
          <p style={{ color: '#666', margin: 0 }}>
            Switch to the Chat Interface tab to ask questions about this clinical encounter.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default TranscriptViewer;
