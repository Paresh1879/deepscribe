/**
 * Query Handlers for RAG and Full Transcript Processing
 * Contains the core logic for handling different types of queries
 */

import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

/**
 * Handle query with RAG (for long transcripts)
 */
export async function handleRAGQuery(sessionId, question, model, ragService, conversationService) {
  try {
    // Get context for HyDE enhancement
    const recentHistory = await conversationService.getRecentContext(sessionId, 5);
    const contextSummary = await getConversationSummary(sessionId, conversationService);
    
    // Combine context for HyDE
    const contextForHyDE = `${contextSummary}\n\nRecent conversation: ${formatChatHistory(recentHistory)}`;
    
    // Use HyDE-enhanced search
    const relevantChunks = await ragService.searchRelevantChunks(sessionId, question, 4, contextForHyDE);
    if (relevantChunks.length === 0) {
      return {
        answer: "I couldn't find relevant information in the transcript to answer your question. Please clarify or ask about a different aspect of the patient's case.",
        highlightingData: []
      };
    }

    // Get highlighting data for the relevant chunks using LLM-based keyword extraction
    const highlightingData = await ragService.getHighlightingData(sessionId, relevantChunks, question);

    const promptTemplate = PromptTemplate.fromTemplate(`
SYSTEM ROLE:
You are a clinical AI assistant helping healthcare providers by analyzing patient transcripts and conversation context. You are speaking to a healthcare provider about a patient's case, so always maintain third-person perspective when discussing the patient.

PATIENT CONTEXT (retrieved via semantic search):
{context}

CONVERSATION SUMMARY:
{summary}

RECENT CONVERSATION (last 5 turns):
{chat_history}


USER QUESTION:
{question}

REASONING INSTRUCTIONS:
1. Resolve pronouns and vague references to the most likely referent.
2. Identify whether the user is asking about symptoms, causes, medications, side effects, or complications.
3. Infer intent if question is short or ambiguous.
4. Prioritize recent conversation and context over older data.
5. If information is missing, say "This specific information is not mentioned in the transcript."

ANSWER GUIDELINES:
- Distinguish between symptoms, side effects, and other clinical observations.
- Be concise, specific, and clinically appropriate.
- Do not mention transcripts, prompts, or RAG mechanics.
- Use context to resolve ambiguity naturally.
- MAINTAIN CONSISTENT PERSPECTIVE: Always refer to the patient in third person ("The patient..." or "John...") when discussing medical information from the transcript. Never switch to second person ("your", "you") unless directly addressing the healthcare provider.

Answer:`);

    const chain = RunnableSequence.from([
      promptTemplate,
      model,
      new StringOutputParser(),
    ]);

    const answer = await chain.invoke({
      context: relevantChunks.map((c,i)=> `[Chunk ${i+1}] ${c.text}`).join('\n\n---\n\n'),
      summary: contextSummary,
      chat_history: formatChatHistory(recentHistory),
      question
    });

    return {
      answer,
      highlightingData
    };

  } catch (error) {
    console.error('Error in RAG query:', error);
    throw error;
  }
}

/**
 * Handle query with full transcript (for short transcripts)
 */
export async function handleFullTranscriptQuery(sessionId, question, model, conversationService, sampleData) {
  try {
    const recentHistory = await conversationService.getRecentContext(sessionId, 5);
    const contextSummary = await getConversationSummary(sessionId, conversationService);

    // For full transcript queries, we'll create highlighting data using LLM-based keyword extraction
    const highlightingData = await createFullTranscriptHighlighting(sampleData.transcript, question);

    const promptTemplate = PromptTemplate.fromTemplate(`
SYSTEM ROLE:
You are a clinical AI assistant supporting healthcare providers by analyzing patient transcripts and SOAP notes. You are speaking to a healthcare provider about a patient's case, so always maintain third-person perspective when discussing the patient.

PATIENT CONTEXT (full transcript):
{transcript}

SOAP NOTE:
{soap_note}

CONVERSATION SUMMARY:
{summary}

RECENT CONVERSATION (last 5 turns):
{chat_history}


USER QUESTION:
{question}

REASONING INSTRUCTIONS:
1. Resolve pronouns and vague references (e.g., "it", "this", "they").
2. Determine if the question is about symptoms, causes, medications, side effects, or complications.
3. Infer intent if question is short or ambiguous.
4. Prioritize recent 3-5 messages.
5. If data is missing, respond "This specific information is not mentioned in the transcript."

ANSWER GUIDELINES:
- Clearly differentiate between disease symptoms and medication side effects.
- Be concise, specific, and clinically appropriate.
- Use context and conversation flow to resolve ambiguity.
- Do not reference transcripts, prompts, or RAG mechanics in your answer.
- MAINTAIN CONSISTENT PERSPECTIVE: Always refer to the patient in third person ("The patient..." or "John...") when discussing medical information from the transcript. Never switch to second person ("your", "you") unless directly addressing the healthcare provider.

Answer:`);

    const chain = RunnableSequence.from([
      promptTemplate,
      model,
      new StringOutputParser(),
    ]);

    const answer = await chain.invoke({
      transcript: sampleData.transcript,
      soap_note: sampleData.soapNote || 'No SOAP note available',
      summary: contextSummary,
      chat_history: formatChatHistory(recentHistory),
      question
    });

    return {
      answer,
      highlightingData
    };

  } catch (error) {
    console.error('Error in full transcript query:', error);
    throw error;
  }
}

/**
 * Get conversation summary for better context understanding
 */
async function getConversationSummary(sessionId, conversationService) {
  try {
    const history = await conversationService.getHistory(sessionId);
    
    if (!history || history.length === 0) {
      return 'No previous conversation.';
    }
    
    // Create a summary of the conversation topic and key points
    const messages = history.slice(-6); // Last 3 exchanges
    const topics = [];
    const keyPoints = [];
    
    messages.forEach(msg => {
      const content = msg.content.toLowerCase();
      
      // Identify topics
      if (content.includes('symptom') || content.includes('pain') || content.includes('cough')) {
        if (!topics.includes('symptoms')) topics.push('symptoms');
      }
      if (content.includes('medication') || content.includes('prescription') || content.includes('drug')) {
        if (!topics.includes('medications')) topics.push('medications');
      }
      if (content.includes('cause') || content.includes('reason')) {
        if (!topics.includes('causes')) topics.push('causes');
      }
      if (content.includes('side effect') || content.includes('issue') || content.includes('problem')) {
        if (!topics.includes('complications')) topics.push('complications');
      }
    });
    
    // Create a natural summary
    let summary = 'Recent conversation topics: ';
    if (topics.length > 0) {
      summary += topics.join(', ') + '.';
    } else {
      summary += 'general medical discussion.';
    }
    
    // Add key context if available
    const lastUserMessage = messages.filter(msg => msg._getType() === 'human').pop();
    if (lastUserMessage) {
      summary += ` Last question was about: "${lastUserMessage.content.substring(0, 50)}..."`;
    }
    
    return summary;
    
  } catch (error) {
    console.error('Error creating conversation summary:', error);
    return 'Unable to summarize conversation context.';
  }
}

/**
 * Use LLM to find exact matching sentences for highlighting
 */
async function findExactMatchingSentences(question, transcript) {
  try {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    
    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1
    });

    const prompt = `
Given this medical question and transcript, find the EXACT sentences that directly answer the question.

Question: "${question}"
Transcript: "${transcript}"

Find 1-2 sentences from the transcript that most directly answer this specific question. Return ONLY the exact sentence text as it appears in the transcript, one per line. Do not modify or explain:

Exact sentence 1
Exact sentence 2
`;

    const response = await llm.invoke(prompt);
    let content = response.content;
    
    // Clean the response - remove any formatting
    if (content.includes('```')) {
      content = content.split('```')[1].split('```')[0].trim();
    }
    
    const sentences = content.split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 10 && !s.toLowerCase().includes('sentence'))
      .slice(0, 2);
    
    return sentences;
  } catch (error) {
    console.error('Error finding exact matching sentences with LLM:', error);
    return [];
  }
}

/**
 * Create highlighting data for full transcript queries using LLM
 */
async function createFullTranscriptHighlighting(transcript, question) {
  if (!transcript || !question) {
    return [];
  }

  try {
    // Use LLM to find exact matching sentences
    const matchingSentences = await findExactMatchingSentences(question, transcript);
    
    const highlightingData = [];
    
    for (const sentence of matchingSentences) {
      const startIndex = transcript.indexOf(sentence);
      if (startIndex !== -1) {
        highlightingData.push({
          chunkIndex: 0,
          text: sentence,
          startIndex: startIndex,
          endIndex: startIndex + sentence.length,
          similarity: 1.0,
          type: 'transcript',
          relevanceScore: 1.0,
          matchedKeywords: []
        });
      }
    }

    return highlightingData;
      
  } catch (error) {
    console.error('Error in LLM-based highlighting:', error);
    return [];
  }
}

/**
 * Format chat history for prompt
 */
function formatChatHistory(history) {
  if (!history || history.length === 0) {
    return 'No previous conversation.';
  }
  
  let formatted = 'CONVERSATION CONTEXT:\n';
  formatted += history
    .map(msg => {
      const role = msg._getType() === 'human' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n');
  
  formatted += '\n\nIMPORTANT: Use this conversation history to understand context. If the current question is short or unclear, refer to this history to understand what the user is asking about.';
  
  return formatted;
}

