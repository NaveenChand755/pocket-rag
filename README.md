# 🧠 PocketRAG

<div align="center">

**100% Local RAG for Claude Desktop**

A self-hosted, privacy-first RAG server that runs entirely on your machine.

Index your PDFs, code, and docs into a portable SQLite database — then give Claude instant access via MCP.

[Quick Start](#-quick-start-5-minutes) • [Why Local RAG?](#-why-local-rag) • [Troubleshooting](#-troubleshooting)

</div>

> 🔒 **Privacy First:** Unlike Claude's built-in Memory feature, PocketRAG keeps everything local. Your documents, embeddings, and searches never leave your machine when using Ollama. You own the data, you control the infrastructure.

---

## ⚡ Why Local RAG?

Claude Desktop has built-in features like file uploads and Memory, but PocketRAG gives you something different:

**🔒 100% Local & Private**
- All data stays on your machine
- No uploads to Anthropic servers (when using Ollama)
- Your documents never leave your infrastructure
- Full control over embeddings and storage

**📚 Document-Centric Knowledge Base**
- Index entire PDF libraries, codebases, and documentation
- Persistent across all conversations
- Advanced hybrid search (semantic + keyword)
- No token limits on indexed content

**🔧 Self-Hosted & Customizable**
- Run your own embedding models (Ollama/OpenAI)
- Portable SQLite database you can backup/share
- REST API for automation and scripting
- Open source — modify and extend as needed

### Comparison Table

| Feature              | 📎 File Upload         | 🧠 Claude Memory       | ⚡ PocketRAG (Local RAG)      |
| -------------------- | ---------------------- | ---------------------- | ----------------------------- |
| **Privacy**          | Sent to Anthropic      | Sent to Anthropic      | **100% local (Ollama)**       |
| **Persistence**      | Per-conversation       | Cross-conversation     | **Permanent + portable**      |
| **Document Control** | Auto-managed           | Auto-managed           | **Full control (SQLite)**     |
| **Search Type**      | Basic full-text        | Relevance-based recall | **Hybrid (Vector + FTS5)**    |
| **Scale**            | ~10 files/conversation | Memory snapshots       | **Thousands of documents**    |
| **Cross-document**   | No                     | Yes                    | **Yes — unified search**      |
| **Offline**          | No                     | No                     | **Yes (with Ollama)**         |
| **API Access**       | No                     | No                     | **Yes — REST API**            |
| **Customizable**     | No                     | No                     | **Yes — open source**         |

**When to use PocketRAG:**
- You need **privacy** and want documents to stay local
- You're indexing **large document collections** (100+ PDFs, codebases)
- You want **full control** over your knowledge base
- You need **offline access** to your RAG system
- You want to **programmatically query** via REST API


### Visual Comparison

```

┌─────────────────────────────────────────────────────────────────┐
│ PocketRAG (Local RAG) ✅                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Your Computer ONLY                                            │
│  ┌──────────────┐      MCP       ┌──────────────┐             │
│  │ Claude Desktop│◀──────────────▶│ PocketRAG    │             │
│  └──────────────┘   (stdio)      │  ├─ Ollama   │             │
│                                   │  ├─ SQLite   │             │
│                                   │  └─ Search   │             │
│                                   └──────────────┘             │
│  🔒 Everything stays local - You own the data                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

**100% Local Processing:** All embeddings, searches, and storage happen on your machine. Your documents never touch external servers when using Ollama.

PocketRAG uses **Reciprocal Rank Fusion (RRF)** to combine semantic understanding with exact keyword matching for superior retrieval.

```mermaid
graph TB
    subgraph "📥 INGESTION MODE (API)"
        PDF[📄 Your Local PDFs] --> API[PocketRAG API<br/>localhost:3000]
        API --> Embed[Local Embeddings<br/>Ollama/OpenAI]
        Embed --> DB1[(📦 SQLite Database<br/>Vector + FTS5<br/>Your Machine)]
    end

    subgraph "🔍 QUERY MODE (MCP)"
        Claude[🧠 Claude Desktop] --> MCP[MCP Protocol<br/>stdio]
        MCP --> Search[Local Hybrid Search<br/>Vector + Keyword]
        Search --> DB2[(📦 SQLite Database<br/>Your Machine)]
        DB2 --> Results[Search Results]
        Results --> Claude
    end

    style DB1 fill:#90EE90
    style DB2 fill:#90EE90
    style Embed fill:#87CEEB
    style Search fill:#87CEEB
```

**Privacy Guarantee:** With Ollama, everything stays local — embeddings, database, searches. Claude only receives the search results you explicitly query.

---

## 📋 Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Ollama](https://ollama.ai/download) (**Recommended** for 100% local operation)

**One-time Setup:** Pull the embedding model (tiny ~200MB, no GPU required):

```bash
ollama pull nomic-embed-text
```

> 💡 **Optional:** You can use OpenAI embeddings instead, but this sends document chunks to OpenAI's API. See [Advanced Configuration](#️-advanced-configuration) for details.

---

## 🚀 Quick Start (5 Minutes)

### 1. Build & Start (Ingestion Mode)

We start the container in **API mode** to "teach" it your documents.

````bash
# 1. Clone & Build
git clone https://github.com/naveenchand/pocket-rag.git
cd pocket-rag
docker-compose up --build -d

# 2. Start the server
docker-compose up -d

# Check it's running
curl http://localhost:3000
> 🐧 **Linux Users:** Update `docker-compose.yml` to use `OLLAMA_URL=http://localhost:11434` and add `network_mode: host`.

---

### 2. Feed Your Knowledge

Upload your legacy code, PDF contracts, or documentation.

```bash
# Upload a PDF
curl -X POST "http://localhost:3000/learn" -F "file=@./manual.pdf"

# Check stats (See how many chunks are indexed)
curl http://localhost:3000/stats

# Test a search query manually
curl "http://localhost:3000/ask?q=summary&mode=hybrid"
````

---

### 3. Connect to Claude (Memory Mode)

> ⚠️ **CRITICAL:** Stop the ingestion container. SQLite allows only one writer at a time.

```bash
docker stop pocket-rag-api && docker rm pocket-rag-api
```

**Add to Claude Config:**

| Platform    | Config Path                                                       |
| ----------- | ----------------------------------------------------------------- |
| **macOS**   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json`                     |

**macOS Example:**

```json
{
  "mcpServers": {
    "pocket-rag": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "/Users/YOUR_USERNAME/pocket-rag-data:/data",
        "-e",
        "DB_PATH=/data/pocket-rag.sqlite",
        "-e",
        "OLLAMA_URL=http://host.docker.internal:11434",
        "pocket-rag",
        "bun",
        "run",
        "src/mcp.ts"
      ]
    }
  }
}
```

**Windows Example:**

```json
{
  "mcpServers": {
    "pocket-rag": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "C:/Users/YOUR_USERNAME/pocket-rag-data:/data",
        "-e",
        "DB_PATH=/data/pocket-rag.sqlite",
        "-e",
        "OLLAMA_URL=http://host.docker.internal:11434",
        "pocket-rag",
        "bun",
        "run",
        "src/mcp.ts"
      ]
    }
  }
}
```

**Linux Example:**

```json
{
  "mcpServers": {
    "pocket-rag": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--network",
        "host",
        "-v",
        "/home/YOUR_USERNAME/pocket-rag-data:/data",
        "-e",
        "DB_PATH=/data/pocket-rag.sqlite",
        "-e",
        "OLLAMA_URL=http://localhost:11434",
        "pocket-rag",
        "bun",
        "run",
        "src/mcp.ts"
      ]
    }
  }
}
```

> 💡 Replace `/Users/YOUR_USERNAME/...` with your actual absolute path. Run `whoami` to find your username.

---

### 4. Use It

**Restart Claude Desktop.** Look for the 🔌 icon.

Try asking:

> _"Search the knowledge base for 'Project Titan' and list the key deliverables."_

---

## ⚙️ Advanced Configuration

### Privacy vs. Quality Trade-offs

**Default (Recommended): 100% Local with Ollama**
- ✅ All processing happens on your machine
- ✅ Documents never leave your infrastructure
- ✅ No API costs
- ✅ Works offline
- ⚠️ Slightly lower embedding quality than OpenAI

**Optional: OpenAI for Better Embeddings**
- ✅ Higher quality vector embeddings
- ✅ Better semantic search accuracy
- ⚠️ **Sends document chunks to OpenAI API**
- ⚠️ API costs (~$0.0001 per 1K tokens)
- ⚠️ Requires internet connection

### Environment Variables

| Variable         | Default                             | Description                              |
| ---------------- | ----------------------------------- | ---------------------------------------- |
| `DB_PATH`        | `/data/pocket-rag.sqlite`           | Internal DB path                         |
| `EMBED_PROVIDER` | `ollama`                            | Options: `ollama`, `openai`              |
| `CHAT_PROVIDER`  | `ollama`                            | Options: `ollama`, `openai`, `anthropic` |
| `OLLAMA_URL`     | `http://host.docker.internal:11434` | URL for Ollama                           |
| `OPENAI_API_KEY` | -                                   | Required if provider is `openai`         |

**Example: Running with OpenAI**

```bash
docker run -d \
--name pocket-rag-api \
-p 3000:3000 \
-v ~/pocket-rag-data:/data \
-e DB_PATH=/data/pocket-rag.sqlite \
-e EMBED_PROVIDER=openai \
-e CHAT_PROVIDER=openai \
-e OPENAI_API_KEY=sk-proj-... \
pocket-rag
```

---

## 🛠️ MCP Tools

PocketRAG exposes these tools to Claude:

| Tool                       | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `search_knowledge_base`    | Hybrid search (vector + FTS) across all documents |
| `get_knowledge_base_stats` | Get document and chunk counts                     |
| `list_documents`           | List all uploaded documents                       |

---

## ❓ Troubleshooting

### "Database is locked"

**Cause:** You left the API container running while trying to use Claude.

**Fix:** Run `docker stop pocket-rag-api`.

---

### "Connection Refused" (Linux)

**Cause:** Docker on Linux cannot reach `host.docker.internal`.

**Fix:** Use `--network host` and `localhost` in your URL.

---

### "File not found" (Claude)

**Cause:** The volume path in your JSON config is wrong.

**Fix:** Use the absolute path (e.g., `/Users/alex/pocket-rag-data`) not `~`.

---

## 📦 Tech Stack

**Local-First Architecture:**
- **Runtime:** [Bun](https://bun.sh) — Fast TypeScript runtime
- **Framework:** [Elysia](https://elysiajs.com) — Lightweight HTTP server
- **Database:** SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) + FTS5 — Portable, single-file database with vector search
- **Protocol:** [Model Context Protocol (MCP)](https://modelcontextprotocol.io) — Anthropic's standard for tool integration
- **Embeddings:** [Ollama](https://ollama.ai) (local) or OpenAI (cloud)
- **LLM (Optional):** Ollama (local) / OpenAI / Anthropic (for answer generation via REST API)

**Key Design Choices:**
- ✅ SQLite for portability (backup = copy one file)
- ✅ Docker for consistent deployment
- ✅ Ollama for offline operation
- ✅ MCP for native Claude Desktop integration
- ✅ Hybrid search (RRF) for better retrieval than vector-only

---

## 🤝 Contributing

PocketRAG is open source! Contributions welcome:
- 🐛 Bug reports and fixes
- ✨ Feature requests and implementations
- 📖 Documentation improvements
- 🧪 Test coverage

---

## 📄 License

MIT License — Free for personal and commercial use.
