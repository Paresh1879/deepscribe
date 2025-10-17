import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { embeddingService } from './embeddingService.js';
import { hydeService } from './hydeService.js';
import { createClient } from '@supabase/supabase-js';

class RAGService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    this.useHyDE = true; // Enable HyDE by default
    
    // Constants for better maintainability
    this.CONSTANTS = {
      CHUNK_SIZE: 800,
      CHUNK_OVERLAP: 100,
      SIMILARITY_THRESHOLD: 0.3,
      HYDE_THRESHOLD: 0.25,
      DEFAULT_K: 4,
      RAG_THRESHOLD: 2000
    };
  }

  /**
   * Create vector store for a transcript
   */
  async createVectorStore(sessionId, transcript, soapNote = '') {
    try {
      console.log(`Creating vector store for session ${sessionId}...`);

      // Combine transcript and SOAP note for better context
      const combinedText = `${transcript}\n\n--- SOAP NOTE ---\n\n${soapNote}`;

      // Split text into chunks with medical-aware separators
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.CONSTANTS.CHUNK_SIZE,
        chunkOverlap: this.CONSTANTS.CHUNK_OVERLAP,
        separators: [
          "\n\n--- SOAP NOTE ---\n\n",
          "\n\n", 
          "\n", 
          ". ", 
          "! ", 
          "? ", 
          " ", 
          ""
        ],
      });

      const chunks = await textSplitter.splitText(combinedText);
      console.log(`Created ${chunks.length} chunks`);

      // Create documents with metadata
      const documents = chunks.map((chunk, index) => {
        const isSoapNote = chunk.includes('--- SOAP NOTE ---') || 
                          chunk.toLowerCase().includes('subjective:') ||
                          chunk.toLowerCase().includes('objective:') ||
                          chunk.toLowerCase().includes('assessment:') ||
                          chunk.toLowerCase().includes('plan:');

        return new Document({
          pageContent: chunk,
          metadata: { 
            chunkIndex: index,
            sessionId: sessionId,
            type: isSoapNote ? 'soap_note' : 'transcript',
            length: chunk.length
          }
        });
      });

      // Get embeddings for documents
      const texts = documents.map(doc => doc.pageContent);
      const embeddings = await embeddingService.embedTexts(texts);

      // Create custom vector store with embeddings
      const vectorStore = {
        documents: documents,
        embeddings: embeddings,
        similaritySearchWithScore: async (query, k) => {
          const queryEmbedding = await embeddingService.embedQuery(query);
          const results = [];
          
          for (let i = 0; i < documents.length; i++) {
            const similarity = embeddingService.cosineSimilarity(queryEmbedding, embeddings[i]);
            results.push([documents[i], similarity]);
          }
          
          return results
            .sort(([,a], [,b]) => b - a)
            .slice(0, k);
        }
      };

      // Store session data in Supabase
      const { error: sessionError } = await this.supabase
        .from('rag_sessions')
        .insert({
          session_id: sessionId,
          transcript: transcript,
          soap_note: soapNote,
          chunk_count: chunks.length,
          total_length: combinedText.length,
          created_at: new Date().toISOString()
        });

      if (sessionError) {
        console.error('Error storing RAG session:', sessionError);
        throw sessionError;
      }

      // Store chunks in Supabase
      const chunksData = documents.map((doc, index) => ({
        session_id: sessionId,
        chunk_index: index,
        content: doc.pageContent,
        metadata: doc.metadata,
        embedding: JSON.stringify(embeddings[index])
      }));

      const { error: chunksError } = await this.supabase
        .from('rag_chunks')
        .insert(chunksData);

      if (chunksError) {
        console.error('Error storing RAG chunks:', chunksError);
        throw chunksError;
      }

      return {
        success: true,
        chunkCount: chunks.length,
        totalLength: combinedText.length
      };
    } catch (error) {
      console.error('Error creating vector store:', error);
      throw error;
    }
  }

  /**
   * Search for relevant chunks with HyDE-enhanced similarity scoring
   */
  async searchRelevantChunks(sessionId, query, k = this.CONSTANTS.DEFAULT_K, context = '') {
    try {
      // Get all chunks for this session
      const { data: chunks, error } = await this.supabase
        .from('rag_chunks')
        .select('*')
        .eq('session_id', sessionId)
        .order('chunk_index');

      if (error) {
        console.error('Error fetching chunks:', error);
        throw error;
      }

      if (!chunks || chunks.length === 0) {
        throw new Error('Session not found or no chunks available');
      }

      console.log(`🔍 RAG: Searching ${chunks.length} chunks for query: "${query}"`);

      // Use HyDE if enabled and query is complex enough
      if (this.useHyDE && this.shouldUseHyDE(query)) {
        console.log('🎯 Using HyDE-enhanced search');
        return await hydeService.searchWithHyDEAndCoT(sessionId, query, chunks, context, k);
      } else {
        console.log('📊 Using standard similarity search');
        return await this.standardSearch(query, chunks, k);
      }

    } catch (error) {
      console.error('Error searching chunks:', error);
      throw error;
    }
  }

  /**
   * Use LLM to find exact matching text for highlighting
   */
  async findExactMatchingText(fullTranscript, question) {
    try {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      
      const llm = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-2.5-flash-lite',
        temperature: 0.1
      });

      const prompt = `
Given this medical question and transcript, find the EXACT text that directly answers the question.

Question: "${question}"
Transcript: "${fullTranscript}"

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
      console.error('Error finding exact matching text with LLM:', error);
      return [];
    }
  }

  /**
   * Get highlighting data using LLM to find exact matching text
   */
  async getHighlightingData(sessionId, relevantChunks, question = '') {
    try {
      if (!question) {
        return [];
      }

      // Get the full transcript
      const { data: sessionData } = await this.supabase
        .from('rag_sessions')
        .select('transcript')
        .eq('session_id', sessionId)
        .single();

      if (!sessionData || !sessionData.transcript) {
        return [];
      }

      const fullTranscript = sessionData.transcript;
      
      // Use LLM to find exact matching sentences
      const matchingSentences = await this.findExactMatchingText(fullTranscript, question);
      
      if (matchingSentences.length === 0) {
        return [];
      }

      const highlightingData = [];

      for (const sentence of matchingSentences) {
        const startIndex = fullTranscript.indexOf(sentence);
        
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
      console.error('Error getting highlighting data:', error);
      return [];
    }
  }

  /**
   * Determine if HyDE should be used for this query
   */
  shouldUseHyDE(query) {
    // Use HyDE for complex queries, questions, or ambiguous terms
    const complexPatterns = [
      /\?$/, // Questions
      /\b(what|how|why|when|where|which|who)\b/i, // Question words
      /\b(cause|reason|effect|side effect|complication|treatment|diagnosis)\b/i, // Medical terms
      /\b(symptom|condition|disease|illness|problem|issue)\b/i, // Clinical terms
      /^.{1,3}$/, // Very short queries (likely ambiguous)
    ];
    
    return complexPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Standard similarity search (fallback)
   */
  async standardSearch(query, chunks, k) {
    const queryEmbedding = await embeddingService.embedQuery(query);
    const results = [];

    for (const chunk of chunks) {
      const embedding = JSON.parse(chunk.embedding);
      const similarity = embeddingService.cosineSimilarity(queryEmbedding, embedding);
      
      results.push({
        text: chunk.content,
        similarity: similarity,
        metadata: chunk.metadata,
        relevanceScore: this.calculateRelevanceScore(query, chunk.content, similarity)
      });
    }

    const filteredResults = results
      .filter(result => result.similarity > this.CONSTANTS.SIMILARITY_THRESHOLD)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, k);

    console.log(`📊 Standard search: Found ${filteredResults.length} relevant chunks`);
    return filteredResults;
  }

  /**
   * Calculate enhanced relevance score
   */
  calculateRelevanceScore(query, text, similarity) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase();
    
    // Count exact word matches
    const exactMatches = queryWords.filter(word => 
      textWords.includes(word)
    ).length;
    
    // Boost score for medical terms
    const medicalTerms = [
      'symptom', 'pain', 'medication', 'diagnosis', 'treatment',
      'patient', 'doctor', 'history', 'examination', 'assessment'
    ];
    
    const medicalMatches = queryWords.filter(word =>
      medicalTerms.some(term => term.includes(word) || word.includes(term))
    ).length;
    
    // Combine similarity with keyword matching
    const keywordBonus = (exactMatches / queryWords.length) * 0.2;
    const medicalBonus = (medicalMatches / queryWords.length) * 0.3;
    
    return similarity + keywordBonus + medicalBonus;
  }

  /**
   * Get vector store for a session (returns null since we're using Supabase)
   */
  getVectorStore(sessionId) {
    return null; // Not needed with Supabase storage
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    try {
      // Delete chunks first (foreign key constraint)
      await this.supabase
        .from('rag_chunks')
        .delete()
        .eq('session_id', sessionId);

      // Delete session
      const { error } = await this.supabase
        .from('rag_sessions')
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
   * Get session info
   */
  async getSessionInfo(sessionId) {
    try {
      const { data, error } = await this.supabase
        .from('rag_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Session not found
        }
        throw error;
      }

      return {
        chunkCount: data.chunk_count,
        totalLength: data.total_length,
        createdAt: new Date(data.created_at),
        useRAG: true
      };
    } catch (error) {
      console.error('Error getting session info:', error);
      throw error;
    }
  }

  /**
   * Check if session should use RAG
   */
  shouldUseRAG(textLength) {
    return textLength > this.CONSTANTS.RAG_THRESHOLD;
  }

  /**
   * Get embedding service status
   */
  getEmbeddingStatus() {
    return embeddingService.getStatus();
  }
}

export const ragService = new RAGService();

