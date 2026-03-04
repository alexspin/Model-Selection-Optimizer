import type { ModelCapability, ModelTier } from "../types/index.js";

export interface ClassificationDefinition {
  name: string;
  description: string;
  examples: string[];
  suggestedTier: ModelTier;
  requiredCapabilities: ModelCapability[];
  expectedOutputScale: "short" | "medium" | "long";
}

export const defaultClassifications: ClassificationDefinition[] = [
  {
    name: "simple-question",
    description: "Quick factual answers, conversions, definitions, or basic lookups",
    examples: [
      "What's the capital of France?",
      "Convert 50 miles to kilometers",
      "What does HTTP 404 mean?",
      "How many bytes in a megabyte?",
      "What year was Python created?",
      "Define polymorphism",
      "What's the difference between TCP and UDP?",
      "What time zone is Tokyo in?",
    ],
    suggestedTier: "budget",
    requiredCapabilities: ["text-generation"],
    expectedOutputScale: "short",
  },
  {
    name: "code-generation",
    description: "Writing new code, creating functions, building components or features",
    examples: [
      "Write a TypeScript function that validates email addresses",
      "Create a React component for a login form",
      "Build a REST API endpoint for user registration",
      "Implement a binary search tree in Python",
      "Write a SQL query that joins users and orders tables",
      "Create a bash script that backs up a database",
      "Generate a GitHub Actions workflow for CI/CD",
      "Write unit tests for this authentication module",
    ],
    suggestedTier: "mid",
    requiredCapabilities: ["code-generation"],
    expectedOutputScale: "long",
  },
  {
    name: "code-debugging",
    description: "Finding and fixing bugs, reading errors, troubleshooting existing code",
    examples: [
      "Why does this throw a null reference error?",
      "Fix the off-by-one error in this loop",
      "I'm getting a segmentation fault when I run this",
      "This function returns undefined instead of the expected value",
      "Help me debug this race condition",
      "Why is my API returning 500 instead of the data?",
      "The tests pass locally but fail in CI, what could cause that?",
      "This regex isn't matching what I expect it to",
    ],
    suggestedTier: "mid",
    requiredCapabilities: ["code-generation", "reasoning"],
    expectedOutputScale: "medium",
  },
  {
    name: "deep-reasoning",
    description: "Complex multi-step analysis, architecture decisions, trade-off evaluation",
    examples: [
      "Compare the trade-offs between microservices and monolithic architecture",
      "Walk me through the implications of this database schema design",
      "Analyze why this algorithm has O(n squared) complexity and suggest improvements",
      "Evaluate the pros and cons of using GraphQL versus REST for our mobile app",
      "What are the security implications of storing tokens in localStorage?",
      "Design a system that handles 10 million concurrent WebSocket connections",
      "Break down the CAP theorem and explain which trade-off fits our use case",
      "Step by step, explain how this distributed consensus algorithm works",
    ],
    suggestedTier: "frontier",
    requiredCapabilities: ["reasoning"],
    expectedOutputScale: "long",
  },
  {
    name: "creative-writing",
    description: "Stories, marketing copy, emails, blog posts, content generation",
    examples: [
      "Write a blog post about the future of AI in healthcare",
      "Draft a professional email declining a job offer",
      "Create a product description for a smart water bottle",
      "Write a short story about a robot learning to paint",
      "Help me write an engaging introduction for my conference talk",
      "Compose a press release for our new product launch",
      "Write social media copy for our summer campaign",
      "Draft a cover letter for a senior engineering position",
    ],
    suggestedTier: "mid",
    requiredCapabilities: ["creative-writing"],
    expectedOutputScale: "long",
  },
  {
    name: "summarization",
    description: "Condensing long text, extracting key points, creating overviews",
    examples: [
      "Summarize this article in three bullet points",
      "Give me the key takeaways from this meeting transcript",
      "TL;DR this research paper",
      "What are the main points of this legal document?",
      "Condense this 10-page report into one paragraph",
      "Recap what we discussed in the last five messages",
      "Extract the action items from this email thread",
      "Distill the main arguments from this essay",
    ],
    suggestedTier: "budget",
    requiredCapabilities: ["summarization"],
    expectedOutputScale: "medium",
  },
  {
    name: "data-analysis",
    description: "Working with numbers, tables, statistics, datasets, calculations",
    examples: [
      "Calculate the average growth rate from this quarterly data",
      "What trends do you see in these sales metrics?",
      "Parse this CSV and find the top 10 customers by revenue",
      "Create a pivot table from this dataset",
      "What's the statistical significance of these A/B test results?",
      "Analyze this JSON data and identify anomalies",
      "Compute the standard deviation for each column",
      "Build a chart showing monthly active users over time",
    ],
    suggestedTier: "mid",
    requiredCapabilities: ["data-analysis"],
    expectedOutputScale: "medium",
  },
  {
    name: "translation",
    description: "Language translation, localization, multilingual tasks",
    examples: [
      "Translate this paragraph to Spanish",
      "How do you say 'good morning' in Japanese?",
      "Localize these UI strings for the French market",
      "Translate this error message from German to English",
      "Convert this technical documentation to Mandarin Chinese",
      "What's the Korean equivalent of this English idiom?",
      "Translate this API response message into Portuguese",
      "Help me write this greeting in Arabic",
    ],
    suggestedTier: "mid",
    requiredCapabilities: ["translation"],
    expectedOutputScale: "medium",
  },
  {
    name: "tool-use",
    description: "Requests that should trigger tools, function calls, or external actions",
    examples: [
      "Search the web for the latest Node.js release",
      "Create a new file called config.yaml",
      "Run the test suite and show me the results",
      "Check the current price of Bitcoin",
      "Send a notification to the team Slack channel",
      "Query the database for all users created this month",
      "Fetch the weather forecast for San Francisco",
      "Deploy this application to production",
    ],
    suggestedTier: "mid",
    requiredCapabilities: ["function-calling"],
    expectedOutputScale: "short",
  },
  {
    name: "conversation",
    description: "Casual chat, follow-ups, acknowledgments, context-dependent replies",
    examples: [
      "Thanks, that worked!",
      "Can you elaborate on that last point?",
      "Try again but make it shorter",
      "That's not quite what I meant",
      "Hello, how are you?",
      "Got it, what should I do next?",
      "Interesting, tell me more",
      "Okay let's move on to the next step",
    ],
    suggestedTier: "budget",
    requiredCapabilities: ["text-generation"],
    expectedOutputScale: "short",
  },
];

export function loadClassifications(
  custom?: ClassificationDefinition[]
): ClassificationDefinition[] {
  if (custom && custom.length > 0) {
    return custom;
  }
  return defaultClassifications;
}

export function mergeClassifications(
  base: ClassificationDefinition[],
  overrides: ClassificationDefinition[]
): ClassificationDefinition[] {
  const merged = new Map<string, ClassificationDefinition>();
  for (const c of base) {
    merged.set(c.name, c);
  }
  for (const c of overrides) {
    merged.set(c.name, c);
  }
  return Array.from(merged.values());
}
