/**
 * Embedding Service with Fallback Options
 * Handles both paid Google embeddings and free local embeddings
 */

class EmbeddingService {
  constructor() {
    this.googleEmbeddings = null;
    this.useLocalEmbeddings = false;
    this.quotaExceeded = false;
    
    // Initialize Google embeddings if API key is available
    this.initializeGoogleEmbeddings();
  }

  async initializeGoogleEmbeddings() {
    try {
      const { GoogleGenerativeAIEmbeddings } = await import("@langchain/google-genai");
      
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        this.googleEmbeddings = new GoogleGenerativeAIEmbeddings({
          apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
          model: "text-embedding-004", // Use 'model' instead of 'modelName'
        });
        console.log('✅ Google Embeddings initialized');
      } else {
        console.log('⚠️ No Google API key found, using local embeddings');
        this.useLocalEmbeddings = true;
      }
    } catch (error) {
      console.log('⚠️ Google Embeddings not available, using local embeddings');
      this.useLocalEmbeddings = true;
    }
  }

  /**
   * Get embeddings with automatic fallback
   */
  async embedTexts(texts) {
    // Try Google embeddings first (if available and quota not exceeded)
    if (this.googleEmbeddings && !this.quotaExceeded && !this.useLocalEmbeddings) {
      try {
        console.log('🧠 Using Google Embeddings...');
        const embeddings = await this.googleEmbeddings.embedDocuments(texts);
        return embeddings;
      } catch (error) {
        if (error.status === 429) {
          console.log('⚠️ Google Embeddings quota exceeded, switching to local embeddings');
          this.quotaExceeded = true;
        } else {
          console.log('⚠️ Google Embeddings error, switching to local embeddings:', error.message);
        }
        this.useLocalEmbeddings = true;
      }
    }

    // Fallback to local embeddings
    console.log('🏠 Using Local Text Similarity...');
    return this.getLocalEmbeddings(texts);
  }

  /**
   * Get embedding for a single query
   */
  async embedQuery(query) {
    const embeddings = await this.embedTexts([query]);
    return embeddings[0];
  }

  /**
   * Local text-based similarity (no API calls needed)
   */
  getLocalEmbeddings(texts) {
    // Return normalized vectors based on text features
    return texts.map(text => this.textToVector(text));
  }

  /**
   * Convert text to a normalized vector for similarity comparison
   */
  textToVector(text) {
    const textLower = text.toLowerCase();
    
    // Extract features
    const features = {
      // Word frequency features
      ...this.getWordFrequencyFeatures(textLower),
      
      // Medical term features
      ...this.getMedicalTermFeatures(textLower),
      
      // Structural features
      ...this.getStructuralFeatures(textLower),
      
      // Semantic features
      ...this.getSemanticFeatures(textLower)
    };

    // Convert to vector and normalize
    const vector = Object.values(features);
    
    // Ensure we have a meaningful vector
    if (vector.length === 0 || vector.every(v => v === 0)) {
      // Fallback: simple word-based features
      return this.getSimpleWordVector(textLower);
    }
    
    return this.normalizeVector(vector);
  }

  /**
   * Simple word-based vector as fallback
   */
  getSimpleWordVector(text) {
    const words = text.split(/\s+/).filter(word => word.length > 2);
    const wordSet = new Set(words);
    
    // Create a simple feature vector based on word presence
    const commonWords = [
      'patient', 'doctor', 'medical', 'symptom', 'pain', 'cough', 'fever',
      'medication', 'treatment', 'diagnosis', 'examination', 'blood', 'pressure',
      'heart', 'rate', 'temperature', 'history', 'physical', 'assessment', 'plan'
    ];
    
    const vector = commonWords.map(word => wordSet.has(word) ? 1 : 0);
    
    // Add some additional features
    vector.push(words.length / 50); // Normalized word count
    vector.push((text.match(/\d+/g) || []).length / 10); // Number count
    vector.push((text.match(/[A-Z]/g) || []).length / text.length); // Capital ratio
    
    return this.normalizeVector(vector);
  }

  /**
   * Extract word frequency features
   */
  getWordFrequencyFeatures(text) {
    const words = text.split(/\s+/).filter(word => word.length > 2);
    const wordFreq = {};
    
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Top frequent words as features
    const topWords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);

    const features = {};
    topWords.forEach(word => {
      features[`word_${word}`] = wordFreq[word] / words.length;
    });

    return features;
  }

  /**
   * Extract medical term features
   */
  getMedicalTermFeatures(text) {
    const medicalTerms = {
      // Symptoms
      pain: ['pain', 'ache', 'hurt', 'sore', 'discomfort'],
      cough: ['cough', 'coughing', 'hack'],
      fever: ['fever', 'temperature', 'hot', 'warm'],
      fatigue: ['fatigue', 'tired', 'exhausted', 'weak'],
      
      // Medications
      medication: ['medication', 'medicine', 'drug', 'prescription', 'pill'],
      dosage: ['dosage', 'dose', 'mg', 'milligram'],
      
      // Body systems
      cardiovascular: ['heart', 'blood pressure', 'pulse', 'cardiac'],
      respiratory: ['lung', 'breath', 'chest', 'respiratory'],
      neurological: ['head', 'brain', 'nerve', 'neurological'],
      
      // Medical procedures
      examination: ['exam', 'examination', 'check', 'assess'],
      diagnosis: ['diagnosis', 'diagnose', 'condition', 'disease'],
      treatment: ['treatment', 'therapy', 'cure', 'heal']
    };

    const features = {};
    Object.entries(medicalTerms).forEach(([category, terms]) => {
      const matches = terms.filter(term => text.includes(term)).length;
      features[`medical_${category}`] = matches / terms.length;
    });

    return features;
  }

  /**
   * Extract structural features
   */
  getStructuralFeatures(text) {
    return {
      length: Math.min(text.length / 1000, 1), // Normalized length
      sentences: (text.match(/[.!?]+/g) || []).length / 10,
      questions: (text.match(/\?/g) || []).length / 5,
      numbers: (text.match(/\d+/g) || []).length / 10,
      capitals: (text.match(/[A-Z]/g) || []).length / text.length,
      punctuation: (text.match(/[^\w\s]/g) || []).length / text.length
    };
  }

  /**
   * Extract semantic features
   */
  getSemanticFeatures(text) {
    const semanticPatterns = {
      // Temporal
      temporal: ['today', 'yesterday', 'week', 'month', 'year', 'ago', 'since'],
      
      // Negation
      negation: ['no', 'not', 'never', 'none', 'denies', 'negative'],
      
      // Intensity
      intensity: ['severe', 'mild', 'moderate', 'extreme', 'slight', 'significant'],
      
      // Certainty
      certainty: ['definitely', 'probably', 'maybe', 'possibly', 'likely', 'unlikely']
    };

    const features = {};
    Object.entries(semanticPatterns).forEach(([category, patterns]) => {
      const matches = patterns.filter(pattern => text.includes(pattern)).length;
      features[`semantic_${category}`] = matches / patterns.length;
    });

    return features;
  }

  /**
   * Normalize vector to unit length
   */
  normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      googleEmbeddings: !!this.googleEmbeddings,
      useLocalEmbeddings: this.useLocalEmbeddings,
      quotaExceeded: this.quotaExceeded,
      provider: this.useLocalEmbeddings ? 'local' : 'google'
    };
  }
}

export const embeddingService = new EmbeddingService();
