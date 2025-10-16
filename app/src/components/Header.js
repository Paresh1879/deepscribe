import React from 'react';
import { MessageSquare, FileText } from 'lucide-react';

const Header = ({ activeTab, setActiveTab }) => {
  return (
    <header className="header">
      <div className="header-content">
        <div>
          <h1>DeepScribe Clinical Chat</h1>
          <p className="header-subtitle">
            Interactive analysis of patient transcripts and SOAP notes
          </p>
        </div>
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={16} style={{ marginRight: '8px' }} />
            Chat Interface
          </button>
          <button
            className={`tab-button ${activeTab === 'transcript' ? 'active' : ''}`}
            onClick={() => setActiveTab('transcript')}
          >
            <FileText size={16} style={{ marginRight: '8px' }} />
            View Transcript
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
