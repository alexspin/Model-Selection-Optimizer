import type { ClassificationDefinition } from "../config/classifications.js";

export interface ClassificationResult {
  name: string;
  confidence: number;
  definition: ClassificationDefinition;
}

export interface SemanticClassifierConfig {
  modelName: string;
  topK: number;
  confidenceThreshold: number;
}

const DEFAULT_CONFIG: SemanticClassifierConfig = {
  modelName: "Xenova/all-MiniLM-L6-v2",
  topK: 3,
  confidenceThreshold: 0.3,
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SemanticClassifier {
  private config: SemanticClassifierConfig;
  private classifications: ClassificationDefinition[];
  private categoryEmbeddings: Map<string, number[][]> = new Map();
  private categoryPrototypes: Map<string, number[]> = new Map();
  private pipeline: any = null;
  private initialized = false;

  constructor(
    classifications: ClassificationDefinition[],
    config?: Partial<SemanticClassifierConfig>
  ) {
    this.classifications = classifications;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(`[SemanticClassifier] Loading model: ${this.config.modelName}...`);
    const { pipeline } = await import("@huggingface/transformers");
    this.pipeline = await pipeline("feature-extraction", this.config.modelName, {
      dtype: "fp32",
    });
    console.log(`[SemanticClassifier] Model loaded`);

    console.log(`[SemanticClassifier] Building category embeddings for ${this.classifications.length} categories...`);
    for (const classification of this.classifications) {
      const embeddings: number[][] = [];
      for (const example of classification.examples) {
        const embedding = await this.embed(example);
        embeddings.push(embedding);
      }
      this.categoryEmbeddings.set(classification.name, embeddings);

      const prototype = this.computePrototype(embeddings);
      this.categoryPrototypes.set(classification.name, prototype);
    }

    this.initialized = true;
    console.log(`[SemanticClassifier] Ready — ${this.categoryPrototypes.size} categories indexed`);
  }

  async classify(text: string): Promise<ClassificationResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const embedding = await this.embed(text);
    const scores: ClassificationResult[] = [];

    for (const classification of this.classifications) {
      const prototype = this.categoryPrototypes.get(classification.name);
      if (!prototype) continue;

      const prototypeSim = cosineSimilarity(embedding, prototype);

      const exampleEmbeddings = this.categoryEmbeddings.get(classification.name);
      let maxExampleSim = 0;
      if (exampleEmbeddings) {
        for (const exEmb of exampleEmbeddings) {
          const sim = cosineSimilarity(embedding, exEmb);
          if (sim > maxExampleSim) maxExampleSim = sim;
        }
      }

      const confidence = prototypeSim * 0.4 + maxExampleSim * 0.6;

      scores.push({
        name: classification.name,
        confidence,
        definition: classification,
      });
    }

    scores.sort((a, b) => b.confidence - a.confidence);

    return scores.slice(0, this.config.topK);
  }

  async classifyWithThreshold(text: string): Promise<ClassificationResult[]> {
    const results = await this.classify(text);
    return results.filter((r) => r.confidence >= this.config.confidenceThreshold);
  }

  async addClassification(classification: ClassificationDefinition): Promise<void> {
    this.classifications.push(classification);

    if (this.initialized) {
      const embeddings: number[][] = [];
      for (const example of classification.examples) {
        const embedding = await this.embed(example);
        embeddings.push(embedding);
      }
      this.categoryEmbeddings.set(classification.name, embeddings);
      this.categoryPrototypes.set(classification.name, this.computePrototype(embeddings));
    }
  }

  async addExample(categoryName: string, example: string): Promise<void> {
    const classification = this.classifications.find((c) => c.name === categoryName);
    if (!classification) {
      throw new Error(`Category '${categoryName}' not found`);
    }
    classification.examples.push(example);

    if (this.initialized) {
      const embedding = await this.embed(example);
      const existing = this.categoryEmbeddings.get(categoryName) || [];
      existing.push(embedding);
      this.categoryEmbeddings.set(categoryName, existing);
      this.categoryPrototypes.set(categoryName, this.computePrototype(existing));
    }
  }

  getCategories(): string[] {
    return this.classifications.map((c) => c.name);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async embed(text: string): Promise<number[]> {
    const output = await this.pipeline(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  }

  private computePrototype(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    const dim = embeddings[0].length;
    const prototype = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        prototype[i] += emb[i];
      }
    }
    const norm = Math.sqrt(prototype.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < dim; i++) {
      prototype[i] /= norm;
    }
    return prototype;
  }
}
