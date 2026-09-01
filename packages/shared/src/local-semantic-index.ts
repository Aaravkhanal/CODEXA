/**
  * 🔒 CODEXA Local Semantic Indexer
  * 
  * 100% Local-Only Guarantee: All tokenization, vector building, TF-IDF calculation,
  * and semantic search queries operate exclusively on your local device.
  * No code contents or embeddings are sent to any external server or network.
  */

export interface IndexDocument {
  path: string;
  tokens: Map<string, number>;
  totalTokens: number;
}

export interface SemanticSearchResult {
  path: string;
  score: number;
  snippet?: string;
}

export class LocalSemanticIndex {
  private documents = new Map<string, IndexDocument>();
  private documentFrequency = new Map<string, number>();

  /** Tokenize raw code text into normalized sub-words, identifiers, and terms */
  public tokenize(text: string): string[] {
    // Split camelCase, PascalCase, snake_case, and non-alphanumeric separators
    const words = text
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9_]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    return words;
  }

  /** Add or update a file in the local semantic index */
  public addDocument(path: string, content: string): void {
    const tokens = this.tokenize(content);
    const tokenMap = new Map<string, number>();

    for (const term of tokens) {
      tokenMap.set(term, (tokenMap.get(term) || 0) + 1);
    }

    // Update document frequency
    const previousDoc = this.documents.get(path);
    if (previousDoc) {
      for (const term of previousDoc.tokens.keys()) {
        const count = this.documentFrequency.get(term) || 1;
        if (count <= 1) this.documentFrequency.delete(term);
        else this.documentFrequency.set(term, count - 1);
      }
    }

    for (const term of tokenMap.keys()) {
      this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
    }

    this.documents.set(path, {
      path,
      tokens: tokenMap,
      totalTokens: tokens.length,
    });
  }

  /** Remove a file from the index */
  public removeDocument(path: string): void {
    const doc = this.documents.get(path);
    if (!doc) return;
    for (const term of doc.tokens.keys()) {
      const count = this.documentFrequency.get(term) || 1;
      if (count <= 1) this.documentFrequency.delete(term);
      else this.documentFrequency.set(term, count - 1);
    }
    this.documents.delete(path);
  }

  /** Query the local index using TF-IDF term vector similarity */
  public search(query: string, limit: number = 10): SemanticSearchResult[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0 || this.documents.size === 0) return [];

    const N = this.documents.size;
    const scores: { path: string; score: number }[] = [];

    for (const [path, doc] of this.documents.entries()) {
      let score = 0;
      for (const term of queryTokens) {
        const tf = (doc.tokens.get(term) || 0) / (doc.totalTokens || 1);
        const df = this.documentFrequency.get(term) || 0;
        if (tf > 0 && df > 0) {
          const idf = Math.log(1 + N / df);
          score += tf * idf;
        }
      }
      if (score > 0) {
        scores.push({ path, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit);
  }

  /** Reset index */
  public clear(): void {
    this.documents.clear();
    this.documentFrequency.clear();
  }

  /** Get index stats */
  public getStats(): { totalFiles: number; totalUniqueTerms: number } {
    return {
      totalFiles: this.documents.size,
      totalUniqueTerms: this.documentFrequency.size,
    };
  }
}
