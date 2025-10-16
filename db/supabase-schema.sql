-- DeepScribe Supabase Database Schema

-- RAG Sessions Table
CREATE TABLE IF NOT EXISTS rag_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  transcript TEXT NOT NULL,
  soap_note TEXT,
  chunk_count INTEGER,
  total_length INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RAG Chunks Table (for storing vector embeddings)
CREATE TABLE IF NOT EXISTS rag_chunks (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES rag_sessions(session_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding TEXT NOT NULL, -- JSON string of the embedding vector
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation Sessions Table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0
);

-- Conversation Messages Table  
CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES conversation_sessions(session_id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rag_sessions_session_id ON rag_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_session_id ON rag_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_session_id ON conversation_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_id ON conversation_messages(session_id);
