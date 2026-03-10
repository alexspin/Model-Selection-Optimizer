import { pipeline } from "@huggingface/transformers";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const categories: Record<string, string[]> = {
  simple: [
    "What's the weather today?",
    "Set a timer for 10 minutes",
    "List all files in the /src directory",
  ],
  coding: [
    "Write a TypeScript function that validates email addresses",
    "Create a React component for a paginated data table",
    "Implement binary search in Python",
  ],
  creative: [
    "Write a short story about a robot learning to paint",
    "Compose a haiku about the ocean at sunset",
    "Draft a product launch announcement",
  ],
};

const testPrompts = [
  "explain quantum physics simply",
  "write a Python function to sort a list",
  "compose a poem about autumn",
  "what time is it in Tokyo?",
  "debug this React useEffect hook",
  "write a fantasy story opening",
  "how do I install npm packages?",
  "create a REST API with Express",
  "write marketing copy for a SaaS product",
];

async function embed(pipe: any, text: string): Promise<number[]> {
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

async function runModel(modelName: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`MODEL: ${modelName}`);
  console.log(`${"=".repeat(60)}`);
  
  const start = Date.now();
  const pipe = await pipeline("feature-extraction", modelName, { dtype: "fp32" });
  console.log(`Load time: ${Date.now() - start}ms`);

  const categoryPrototypes: Record<string, number[]> = {};
  for (const [cat, examples] of Object.entries(categories)) {
    const embeddings = await Promise.all(examples.map(e => embed(pipe, e)));
    const dim = embeddings[0].length;
    const proto = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) proto[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) proto[i] /= embeddings.length;
    categoryPrototypes[cat] = proto;
  }

  console.log(`\nEmbedding dim: ${categoryPrototypes.simple.length}`);
  console.log(`\n${"Prompt".padEnd(45)} ${"simple".padEnd(10)} ${"coding".padEnd(10)} ${"creative".padEnd(10)} → WINNER`);
  console.log("-".repeat(90));

  for (const prompt of testPrompts) {
    const t0 = Date.now();
    const emb = await embed(pipe, prompt);
    const latency = Date.now() - t0;

    const scores: Record<string, number> = {};
    for (const [cat, proto] of Object.entries(categoryPrototypes)) {
      scores[cat] = cosineSimilarity(emb, proto);
    }

    const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    console.log(
      `${prompt.padEnd(45)} ${scores.simple.toFixed(4).padEnd(10)} ${scores.coding.toFixed(4).padEnd(10)} ${scores.creative.toFixed(4).padEnd(10)} → ${winner} (${latency}ms)`
    );
  }
}

async function main() {
  await runModel("Xenova/all-MiniLM-L6-v2");
  await runModel("Xenova/bge-small-en-v1.5");
}

main().catch(console.error);
