/**
 * HyDE (Hypothetical Document Embeddings) Service
 * Improves RAG retrieval by generating hypothetical answers and using them for better semantic search
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { embeddingService } from './embeddingService.js';

class HyDEService {
  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-2.5-flash-lite",
      temperature: 0.3,
      maxOutputTokens: 500,
    });
  }

  /**
   * Generate hypothetical answer with Chain of Thought reasoning
   */
  async generateHypotheticalAnswer(query, context = '') {
    try {
      console.log(`🧠 HyDE: Generating hypothetical answer for: "${query}"`);
      
      const promptTemplate = PromptTemplate.fromTemplate(`
You are a clinical AI assistant. Generate a hypothetical answer that would be found in a medical transcript or SOAP note for the given question.

CHAIN OF THOUGHT REASONING:
1. Analyze the question type and clinical domain
2. Consider what information would typically be found in a patient transcript
3. Generate a realistic hypothetical answer based on medical knowledge
4. Ensure the answer sounds like it came from actual clinical documentation

CONTEXT (if available):
{context}

USER QUESTION:
{question}

INSTRUCTIONS:
- Generate a realistic hypothetical answer that would appear in a medical transcript
- Use clinical language and terminology
- Include specific details that would help with semantic search
- Make it sound like actual clinical documentation
- Keep it concise but informative (2-3 sentences)
- Do not mention this is hypothetical

HYPOTHETICAL ANSWER:`);

      const chain = RunnableSequence.from([
        promptTemplate,
        this.model,
        new StringOutputParser(),
      ]);

      const hypotheticalAnswer = await chain.invoke({
        question: query,
        context: context
      });

      console.log(`✅ HyDE: Generated hypothetical answer: "${hypotheticalAnswer.substring(0, 100)}..."`);
      return hypotheticalAnswer.trim();

    } catch (error) {
      console.error('Error generating hypothetical answer:', error);
      // Fallback to original query if HyDE fails
      return query;
    }
  }

  /**
   * Enhanced search using HyDE approach
   */
  async searchWithHyDE(sessionId, query, chunks, k = 4) {
    try {
      // Step 1: Generate hypothetical answer with Chain of Thought
      const hypotheticalAnswer = await this.generateHypotheticalAnswer(query);
      
      // Step 2: Get embeddings for both original query and hypothetical answer
      const [queryEmbedding, hypoEmbedding] = await Promise.all([
        embeddingService.embedQuery(query),
        embeddingService.embedQuery(hypotheticalAnswer)
      ]);

      // Step 3: Calculate similarity scores for both embeddings
      const results = [];
      
      for (const chunk of chunks) {
        const embedding = JSON.parse(chunk.embedding);
        
        // Calculate similarity with original query
        const querySimilarity = embeddingService.cosineSimilarity(queryEmbedding, embedding);
        
        // Calculate similarity with hypothetical answer
        const hypoSimilarity = embeddingService.cosineSimilarity(hypoEmbedding, embedding);
        
        // Combine scores (weight hypothetical answer more heavily)
        const combinedScore = (querySimilarity * 0.3) + (hypoSimilarity * 0.7);
        
        results.push({
          text: chunk.content,
          querySimilarity: querySimilarity,
          hypoSimilarity: hypoSimilarity,
          similarity: combinedScore, // Use combined score as main similarity
          metadata: chunk.metadata,
          relevanceScore: this.calculateHyDERelevanceScore(query, hypotheticalAnswer, chunk.content, combinedScore)
        });
      }

      // Step 4: Filter and sort results
      const filteredResults = results
        .filter(result => result.similarity > 0.25) // Slightly lower threshold due to HyDE enhancement
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, k);

      console.log(`🎯 HyDE: Found ${filteredResults.length} relevant chunks using enhanced retrieval`);
      
      // Log the reasoning for debugging
      if (filteredResults.length > 0) {
        console.log(`📊 HyDE Debug - Query: "${query}"`);
        console.log(`📊 HyDE Debug - Hypothetical: "${hypotheticalAnswer.substring(0, 80)}..."`);
        console.log(`📊 HyDE Debug - Best match similarity: ${filteredResults[0].similarity.toFixed(3)}`);
      }
      
      return filteredResults;

    } catch (error) {
      console.error('Error in HyDE search:', error);
      // Fallback to regular similarity search
      return this.fallbackSearch(query, chunks, k);
    }
  }

  /**
   * Calculate enhanced relevance score for HyDE results
   */
  calculateHyDERelevanceScore(query, hypotheticalAnswer, text, similarity) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const hypoWords = hypotheticalAnswer.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    
    // Keyword matching from both query and hypothetical answer
    let keywordScore = 0;
    const allKeywords = [...queryWords, ...hypoWords];
    
    for (const keyword of allKeywords) {
      if (keyword.length > 2 && textLower.includes(keyword)) {
        keywordScore += 1;
      }
    }
    
    // Normalize keyword score
    const normalizedKeywordScore = Math.min(keywordScore / allKeywords.length, 1);
    
    // Combine similarity with keyword matching
    const relevanceScore = (similarity * 0.7) + (normalizedKeywordScore * 0.3);
    
    return relevanceScore;
  }

  /**
   * Fallback search if HyDE fails
   */
  async fallbackSearch(query, chunks, k) {
    console.log('⚠️ HyDE failed, using fallback search');
    
    const queryEmbedding = await embeddingService.embedQuery(query);
    const results = [];
    
    for (const chunk of chunks) {
      const embedding = JSON.parse(chunk.embedding);
      const similarity = embeddingService.cosineSimilarity(queryEmbedding, embedding);
      
      results.push({
        text: chunk.content,
        similarity: similarity,
        metadata: chunk.metadata,
        relevanceScore: similarity
      });
    }
    
    return results
      .filter(result => result.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  /**
   * Generate Chain of Thought reasoning for complex queries
   */
  async generateChainOfThought(query, context = '') {
    try {
      const promptTemplate = PromptTemplate.fromTemplate(`
You are a clinical AI assistant. Analyze this question and provide step-by-step reasoning for what information should be retrieved.

CHAIN OF THOUGHT ANALYSIS:
1. Question Classification: What type of clinical question is this?
2. Information Needs: What specific information would answer this question?
3. Search Strategy: What terms or concepts should be searched for?
4. Expected Content: What would a good answer look like?

CONTEXT (if available):
{context}

USER QUESTION:
{question}

Provide your step-by-step reasoning:

REASONING:`);

      const chain = RunnableSequence.from([
        promptTemplate,
        this.model,
        new StringOutputParser(),
      ]);

      const reasoning = await chain.invoke({
        question: query,
        context: context
      });

      return reasoning.trim();

    } catch (error) {
      console.error('Error generating chain of thought:', error);
      return `Analyzing question: "${query}"`;
    }
  }

  /**
   * Enhanced HyDE with Chain of Thought reasoning
   */
  async searchWithHyDEAndCoT(sessionId, query, chunks, context = '', k = 4) {
    try {
      console.log(`🧠 HyDE + CoT: Processing query with enhanced reasoning`);
      
      // Step 1: Generate Chain of Thought reasoning
      const reasoning = await this.generateChainOfThought(query, context);
      console.log(`💭 CoT Reasoning: ${reasoning.substring(0, 100)}...`);
      
      // Step 2: Generate hypothetical answer with reasoning context
      const hypotheticalAnswer = await this.generateHypotheticalAnswer(query, reasoning);
      
      // Step 3: Perform HyDE search
      const results = await this.searchWithHyDE(sessionId, query, chunks, k);
      
      // Step 4: Add reasoning to results for debugging
      results.forEach(result => {
        result.reasoning = reasoning;
        result.hypotheticalAnswer = hypotheticalAnswer;
      });
      
      return results;

    } catch (error) {
      console.error('Error in HyDE + CoT search:', error);
      return this.fallbackSearch(query, chunks, k);
    }
  }
}

export const hydeService = new HyDEService();
