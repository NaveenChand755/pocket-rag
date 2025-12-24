type ChatProvider = "openai" | "anthropic" | "ollama";
type EmbedProvider = "openai" | "ollama";

interface OllamaConfig {
  baseUrl: string;
  embedModel: string;
  chatModel: string;
}

interface OpenAIConfig {
  chatModel: string;
  embedModel: string;
}

interface AnthropicConfig {
  chatModel: string;
}

interface ChunkingConfig {
  size: number;
  overlap: number;
  batchSize: number;
}

interface Config {
  chatProvider: ChatProvider;
  embedProvider: EmbedProvider;
  keys: {
    openai?: string;
    anthropic?: string;
  };
  openai: OpenAIConfig;
  anthropic: AnthropicConfig;
  ollama: OllamaConfig;
  chunking: ChunkingConfig;
  vectorDim: number;
}

const getEnv = (key: string, fallback: string): string =>
  process.env[key] || fallback;

const getEnvNumber = (key: string, fallback: number): number => {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
};

const EMBED_MODEL_DIMENSIONS: Record<string, number> = {
  // OpenAI
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  // Ollama
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
  "snowflake-arctic-embed": 1024,
};

const getVectorDimension = (provider: EmbedProvider, model: string): number => {
  if (EMBED_MODEL_DIMENSIONS[model]) {
    return EMBED_MODEL_DIMENSIONS[model];
  }
  return provider === "openai" ? 1536 : 768;
};

const chatProvider = getEnv("CHAT_PROVIDER", "ollama") as ChatProvider;
const embedProvider = getEnv("EMBED_PROVIDER", "ollama") as EmbedProvider;

const ollamaEmbedModel = getEnv("OLLAMA_EMBED_MODEL", "mxbai-embed-large");
const openaiEmbedModel = getEnv("OPENAI_EMBED_MODEL", "text-embedding-3-small");
const activeEmbedModel =
  embedProvider === "openai" ? openaiEmbedModel : ollamaEmbedModel;

const vectorDim = getEnvNumber(
  "VECTOR_DIM",
  getVectorDimension(embedProvider, activeEmbedModel)
);

export const ENV: Config = {
  chatProvider,
  embedProvider,
  keys: {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    chatModel: getEnv("OPENAI_CHAT_MODEL", "gpt-4o"),
    embedModel: openaiEmbedModel,
  },
  anthropic: {
    chatModel: getEnv("ANTHROPIC_CHAT_MODEL", "claude-sonnet-4-20250514"),
  },
  ollama: {
    baseUrl: getEnv("OLLAMA_URL", "http://localhost:11434"),
    embedModel: ollamaEmbedModel,
    chatModel: getEnv("OLLAMA_CHAT_MODEL", "llama3.2"),
  },
  chunking: {
    size: getEnvNumber("CHUNK_SIZE", 1024),
    overlap: getEnvNumber("CHUNK_OVERLAP", 256),
    batchSize: getEnvNumber("CHUNK_BATCH_SIZE", 50),
  },
  vectorDim,
};

export const VECTOR_DIM = ENV.vectorDim;

console.log(`
┌──────────────────────────────────────────────────┐
│ 🚀 PocketRAG Initialized │
├──────────────────────────────────────────────────┤
│ 🧠 Chat Model: ${ENV.ollama.chatModel.padEnd(28)}│
│ 💾 Embed Model: ${ENV.ollama.embedModel.padEnd(28)}│
│ 📐 Vector Dim: ${String(ENV.vectorDim).padEnd(28)}│
└──────────────────────────────────────────────────┘
`);
