# DeepScribe Clinical Chat Interface

An intelligent chat interface that allows healthcare providers to ask questions about patient transcripts and SOAP notes. The AI maintains conversation context and provides clinically-aware responses using **LangChain**, **RAG (Retrieval-Augmented Generation)**, and **HyDE (Hypothetical Document Embeddings)**.

## What It Does

- **Chat with Medical Data**: Ask questions about patient transcripts and SOAP notes
- **Context-Aware AI**: Remembers conversation history and resolves ambiguous questions
- **Smart Retrieval**: Uses LangChain + RAG + HyDE to find relevant information even with vague queries like "cause?" or "side effects?"

## How It Works

**LangChain** orchestrates the AI workflow, **RAG** retrieves relevant transcript chunks, **HyDE** enhances search by generating hypothetical answers, and **Supabase** stores conversation history and vector embeddings for persistent context.

**Example Flow**: "What are the side effects?" → HyDE generates hypothetical answer → RAG finds similar chunks → LangChain combines context → Gemini responds → Supabase saves conversation history for future context matching.

## Project Structure
```
deepscribe_coding_challenge/
├── api/                        # Node.js backend
│   ├── src/
│   │   ├── server-langchain.js # Main server
│   │   └── services/
│   │       ├── rag/            # RAG services
│   │       │   ├── ragService.js
│   │       │   ├── hydeService.js
│   │       │   ├── embeddingService.js
│   │       │   └── queryHandlers.js
│   │       └── conversationService.js
│   └── .env
├── app/                        # React frontend
├── db/                         # Database schema
└── data/                       # Sample medical data
```

## Setup

### Prerequisites
- Node.js (v16+)
- Google Gemini API key

### Installation

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd deepscribe_coding_challenge
   npm run install:all
   ```

2. **Configure environment**
   ```bash
   # Create .env file in api/ directory
   export GEMINI_API_KEY="your_api_key_here" 
   export SUPABASE_URL="your_supabase_url" 
   export SUPABASE_KEY="your_supabase_key" 
   ```

3. **Run the application**
   ```bash
   npm run dev:full
   ```

## Usage

1. Open http://localhost:3001
2. Ask questions about the medical transcript:
   - "What are the main symptoms?"
   - "How long have the symptoms been going on?"
   - "What medications were prescribed?"
   - "What tests were ordered?"

## Using Your Own Data

Edit the files in `data/` directory:
- `transcript.txt` - Patient-provider conversation
- `soap-note.txt` - SOAP note documentation
- `patient-info.txt` - Patient demographics

## API Endpoints

### Core Chat Endpoints
- `POST /api/chat/session` - Create new chat session
- `POST /api/chat/message` - Send message and get AI response
- `GET /api/chat/session/:sessionId/history` - Get conversation history
- `GET /api/chat/session/:sessionId/info` - Get session information

### Configuration Endpoints
- `POST /api/config/hyde` - Enable/disable HyDE (Hypothetical Document Embeddings)
- `GET /api/config/hyde` - Get HyDE configuration status

### Data & Health Endpoints
- `GET /api/sample-data` - Get current medical data (transcript, SOAP note, patient info)
- `GET /api/health` - Health check with system status

## Technologies

- **Backend**: Node.js, Express, LangChain, Google Gemini Flash
- **Frontend**: React, Framer Motion
- **Database**: Supabase (PostgreSQL)
- **AI**: RAG + HyDE for enhanced retrieval

## Future Improvements

• **Multi-Color Transcript Highlighting**: Different colors for medications, symptoms, tests, and diagnoses.
• **Dynamic File Upload**: Support for PDF, DOCX, audio files with real-time transcription and OCR processing
• **Enhanced AI with Medical Knowledge Base**: Integration with clinical guidelines, evidence-based responses with citations, and clinical decision support
• **Multi-Modal AI Processing**: Process text, images, and audio together for comprehensive medical analysis. Analyze medical images, interpret lab results, and extract insights from patient photos or diagnostic scans
• **Reinforcement Learning**: Self-improving AI that learns from user feedback, corrects diagnostic errors, and optimizes treatment recommendations through continuous learning from clinical outcomes

---

For DeepScribe's clinical documentation challenge.
