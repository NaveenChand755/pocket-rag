/**
 * Core type definitions for PocketRAG
 */

// Search result types
export interface SearchResult {
  content: string;
  distance: number;
  filename: string;
}

export interface FTSResult {
  content: string;
  filename: string;
  rank: number;
}

export interface RankedResult {
  content: string;
  score: number;
  filename?: string;
}

// Search modes
export type SearchMode = "vector" | "fts" | "hybrid";

// AI Provider types
export type EmbedProvider = "ollama" | "openai";
export type ChatProvider = "ollama" | "openai" | "anthropic";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// API response types
export interface AskResponse {
  answer: string;
  sources: SourceInfo[];
  provider: string;
  searchMode?: SearchMode;
  timing?: {
    search: string;
    llm: string;
    total: string;
  };
}

export interface SourceInfo {
  filename: string;
  content: string;
  relevance: string;
}

export interface StatsResponse {
  documents: number;
  chunks: number;
}

export interface LearnResponse {
  success: boolean;
  file: string;
  chunks: number;
  duration: string;
  error?: string;
}

// Ingestion types
export interface IngestResult {
  success: boolean;
  fileName: string;
  chunks: number;
  duration: number;
  error?: string;
}

export interface FileBuffer {
  buffer: Buffer;
  name: string;
}

// Database types
export interface DBDocument {
  id?: number;
  content: string;
  filename: string;
}

export interface DBStats {
  doc_count: number;
  chunk_count: number;
}

// MCP types
export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Ollama API types
export interface OllamaChatResponse {
  message: { content: string };
}

export interface OllamaEmbedResponse {
  embedding: number[];
}
