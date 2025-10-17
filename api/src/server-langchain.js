import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Import our custom services
import { ragService } from './services/rag/ragService.js';
import { conversationService } from './services/conversationService.js';

// Import query handlers
import { handleRAGQuery, handleFullTranscriptQuery } from './services/rag/queryHandlers.js';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const app = express();

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 5001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

// Validate required environment variables
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is required. Get your free API key at https://aistudio.google.com/app/apikey');
  process.exit(1);
}

console.log('🚀 Starting DeepScribe Chat with LangChain + RAG + HyDE');
console.log('🧠 Using Google Gemini 2.5 Flash Lite API');
console.log('🎯 HyDE (Hypothetical Document Embeddings) enabled for enhanced retrieval');

// Initialize Gemini model with LangChain
const model = new ChatGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
  model: "gemini-2.5-flash-lite", 
  temperature: 0.1,
  maxOutputTokens: 1000,
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting
if (process.env.NODE_ENV === 'production') {
  const rateLimit = (await import('express-rate-limit')).default;
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Read text file from data directory
 */
function readTextFile(filename) {
  try {
    const filePath = path.join(process.cwd(), '..', 'data', filename);
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    console.error(`Error reading ${filename}:`, error.message);
    return null;
  }
}

/**
 * Parse patient information from text
 */
function parsePatientInfo(patientInfoText) {
  if (!patientInfoText) return null;
  
  const info = {};
  const lines = patientInfoText.split('\n');
  
  lines.forEach(line => {
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      if (key && value) {
        info[key.trim().toLowerCase().replace(/\s+/g, '_')] = value;
      }
    }
  });
  
  return info;
}

// ============================================================================
// DATA LOADING
// ============================================================================

// Embedded sample data for Vercel deployment
const sampleData = {
  transcript: `Simulated Transcript

Date: October 15, 2025
Provider: Dr. Samantha Lee (Internal Medicine / Primary Care)
Patient: John Davis, 47 y/o male


Dr. Lee: Good morning, John. It's good to see you again. I reviewed your chart, and I saw you've been dealing with that persistent cough and fatigue. How are things going this week?

Patient: Morning, Doctor. It's been rough, honestly. The cough hasn't improved much, and the fatigue seems worse. I'm also starting to feel some tightness in my chest, especially at night.

Dr. Lee: I'm sorry to hear that. Let's get into the details. When did this cough first start?

Patient: About three weeks ago. It started as just a little tickle in my throat, but it's gotten progressively worse. Now it's this dry, hacking cough that just won't quit.

Dr. Lee: And you mentioned it's worse at night?

Patient: Yes, definitely. I'm waking up multiple times because of it. My wife says I'm keeping her up too. It's really affecting my sleep.

Dr. Lee: I understand that's frustrating. Are you bringing up any phlegm or mucus when you cough?

Patient: Sometimes, but it's usually clear. Not much of it though.

Dr. Lee: Any fever, chills, or body aches?

Patient: No, no fever. I did feel a bit achy a few days ago, but that's gone now.

Dr. Lee: How about your breathing? Any shortness of breath?

Patient: Yeah, actually. When I go up stairs or walk quickly, I get winded more easily than usual. It's not terrible, but I notice it.

Dr. Lee: Any chest pain or tightness?

Patient: The tightness I mentioned, especially at night. It's not really pain, more like pressure.

Dr. Lee: Have you had any recent travel or been around anyone who's been sick?

Patient: No, not really. I work from home mostly, and my wife and kids have been healthy.

Dr. Lee: What have you tried so far for the cough?

Patient: I've been taking some over-the-counter cough syrup, but it doesn't seem to help much. Maybe a little bit at first, but the effect wears off quickly.

Dr. Lee: Any other medications you're taking regularly?

Patient: Just my blood pressure medication - lisinopril. I've been on that for about two years.

Dr. Lee: Good to know. Let me listen to your lungs and check your vitals.

[Physical examination]

Dr. Lee: Your vitals look good - blood pressure is well controlled, heart rate is normal, no fever. Your lungs sound clear when I listen, which is reassuring. No wheezing or crackles.

Patient: That's good to hear. So what do you think is causing this?

Dr. Lee: Based on what you're describing, there are a few possibilities. The fact that it's worse at night and you're feeling some chest tightness could point to a few things. One possibility is postnasal drip - sometimes allergies or sinus issues can cause a persistent cough. Another possibility is something called GERD, or acid reflux, which can cause coughing, especially when lying down.

Patient: I don't think I have acid reflux. I don't get heartburn or anything like that.

Dr. Lee: Sometimes GERD can be "silent" - you might not feel the typical heartburn symptoms, but it can still cause coughing. The fact that it's worse when you're lying down is a clue.

Patient: Hmm, I hadn't thought of that.

Dr. Lee: I'd like to order a chest X-ray to make sure there's nothing going on in your lungs that we need to address. I'll also get some basic blood work to check for any signs of infection or inflammation.

Patient: Okay, that sounds reasonable.

Dr. Lee: In the meantime, I'm going to start you on a nasal spray that might help if this is related to postnasal drip. I also want you to try sleeping with your head elevated - you can use an extra pillow or prop up the head of your bed slightly. And try to avoid eating large meals close to bedtime.

Patient: I can do that. How long should I expect this to take to get better?

Dr. Lee: If it's postnasal drip or GERD-related, you should start seeing improvement within a week or so. If it's something else, the tests will help us figure out the next steps. I'd like to see you back in two weeks to see how you're doing.

Patient: Sounds good. Thank you, Doctor.

Dr. Lee: You're welcome. In the meantime, if you develop any fever, if the cough gets significantly worse, or if you have any trouble breathing, don't hesitate to call or come in sooner.

Patient: I will. Thanks again.`,

  soapNote: `Subjective:

47 y/o male with a persistent dry cough for 3 weeks, worse at night. Occasional clear mucus. No fever or chest pain. Mild shortness of breath on exertion. No recent travel or sick contacts. Tried OTC cough syrup with minimal relief.

Objective:

Vitals stable. Lungs clear to auscultation. No wheezing or crackles. No signs of acute distress.

Assessment:

Likely postnasal drip vs GERD. Rule out lower respiratory infection or other causes with chest X-ray and labs.

Plan:

Order chest X-ray and CBC.

Start nasal spray.

Recommend head elevation during sleep and avoiding late meals.

Follow up in 2 weeks.

Monitor for worsening symptoms.`,

  patientInfo: {
    name: "John Davis",
    age: "47",
    occupation: "Unknown",
    visit_date: "October 15, 2025",
    chief_complaint: "Persistent cough for about three weeks"
  }
};

console.log('✅ Sample data loaded successfully');

// ============================================================================
// API ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    langchain: 'enabled',
    rag: 'enabled',
    hyde: 'enabled',
    version: '2.1.0'
  });
});

// HyDE configuration endpoint
app.post('/api/config/hyde', (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean value' });
    }
    
    ragService.useHyDE = enabled;
    
    res.json({
      success: true,
      hyde_enabled: ragService.useHyDE,
      message: `HyDE ${enabled ? 'enabled' : 'disabled'} successfully`
    });
    
  } catch (error) {
    console.error('Error configuring HyDE:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get HyDE status
app.get('/api/config/hyde', (req, res) => {
  res.json({
    hyde_enabled: ragService.useHyDE,
    features: {
      hypothetical_answer_generation: true,
      chain_of_thought_reasoning: true,
      enhanced_similarity_search: true,
      context_aware_retrieval: true
    }
  });
});

// Get sample data
app.get('/api/sample-data', (req, res) => {
  res.json(sampleData);
});

// Create new chat session
app.post('/api/chat/session', async (req, res) => {
  try {
    const sessionId = uuidv4();
    
    // Quality analysis removed - keeping only ambiguity detection
    
    // Determine if we should use RAG
    const useRAG = ragService.shouldUseRAG(sampleData.transcript.length);
    
    // Create conversation memory
    await conversationService.createMemory(sessionId);
    
    // Create vector store if using RAG
    let ragInfo = null;
    if (useRAG) {
      console.log(`Creating RAG for transcript (${sampleData.transcript.length} chars)`);
      ragInfo = await ragService.createVectorStore(
        sessionId, 
        sampleData.transcript, 
        sampleData.soapNote
      );
      console.log(`✅ Vector store created with ${ragInfo.chunkCount} chunks`);
    }
    
    res.json({
      sessionId,
      useRAG,
      transcriptLength: sampleData.transcript.length,
      ragInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send message and get AI response
app.post('/api/chat/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }
    
    console.log(`📝 Processing message for session ${sessionId}: "${message}"`);
    
    // Get conversation history for context
    const history = await conversationService.getHistory(sessionId);
    console.log(`📚 Conversation history length: ${history ? history.length : 0}`);
    if (history && history.length > 0) {
      console.log(`📚 Last few messages:`, history.slice(-4).map(msg => `${msg._getType()}: ${msg.content.substring(0, 50)}...`));
    }
    
    // Ambiguity detection removed - handled by RAG + HyDE system
    
    let aiResponse;
    let highlightingData = [];
    let responseMetadata = {
      useRAG: false
    };
    
    // Check if session uses RAG
    const sessionInfo = await ragService.getSessionInfo(sessionId);
    const useRAG = sessionInfo && sessionInfo.useRAG;

    if (useRAG) {
      // Use RAG for response
      const ragResponse = await handleRAGQuery(sessionId, message, model, ragService, conversationService);
      aiResponse = ragResponse.answer;
      highlightingData = ragResponse.highlightingData || [];
      responseMetadata.useRAG = true;
    } else {
      // Use full transcript for response
      const fullTranscriptResponse = await handleFullTranscriptQuery(sessionId, message, model, conversationService, sampleData);
      aiResponse = fullTranscriptResponse.answer;
      highlightingData = fullTranscriptResponse.highlightingData || [];
    }
    
    // Save interaction to conversation memory
    await conversationService.addInteraction(sessionId, message, aiResponse, highlightingData);
    
    res.json({
      message: {
        id: Date.now(),
        type: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        highlightingData: highlightingData
      },
      metadata: responseMetadata,
      sessionInfo: sessionInfo || { useRAG: false }
    });
    
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation history
app.get('/api/chat/session/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await conversationService.getHistory(sessionId);
    
    if (!history) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const formattedHistory = history.map((msg, index) => ({
      id: index,
      type: msg._getType() === 'human' ? 'user' : 'assistant',
      content: msg.content,
      highlightingData: msg.highlightingData || null,
      timestamp: new Date() // Note: LangChain doesn't store timestamps by default
    }));
    
    res.json({ messages: formattedHistory });
    
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session info
app.get('/api/chat/session/:sessionId/info', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const ragInfo = ragService.getSessionInfo(sessionId);
    const conversationInfo = conversationService.analyzeConversation(sessionId);
    
    if (!ragInfo && !conversationInfo) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
      sessionId,
      rag: ragInfo,
      conversation: conversationInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching session info:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Export the app for Vercel
export default app;

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  // Cleanup old sessions every 5 minutes
  setInterval(() => {
    conversationService.cleanupOldSessions();
  }, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`🚀 DeepScribe Chat Server running on port ${PORT}`);
    console.log(`📚 LangChain + RAG enabled`);
    console.log(`🧠 Using Gemini 2.5 Flash Lite`);
    console.log(`📊 Transcript length: ${sampleData.transcript.length} characters`);
    console.log(`🔍 RAG threshold: ${ragService.shouldUseRAG(sampleData.transcript.length) ? 'Enabled' : 'Disabled'}`);
  });
}
