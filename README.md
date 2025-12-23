# 🧠 PocketRAG

<div align="center">

**Give Claude Desktop Long-Term Memory in 30 Seconds.**

A local RAG server built on the Anthropic Stack (Bun + MCP).

Index your PDFs, code, and docs into a single portable SQLite file — then let Claude search it.

[Quick Start](#-quick-start-5-minutes) • [Why PocketRAG?](#-why-pocketrag) • [Troubleshooting](#-troubleshooting)

</div>

---

## ⚡ Why PocketRAG?

You can upload files to Claude, but:

- **They're per-conversation** — upload again next time
- **Context limits** — can't fit 100 PDFs in one chat
- **Basic search** — no semantic understanding across documents

PocketRAG creates a **persistent, searchable knowledge base**. Index once, query forever.

**Two ways to use it:**

1. 🔌 **MCP Server** — Connect to Claude Desktop for AI-powered search
2. 🌐 **REST API** — Use standalone with any app, script, or LLM

| Feature         | 📎 Claude File Upload     | ⚡ PocketRAG                  |
| --------------- | ------------------------- | ----------------------------- |
| **Persistence** | Per-conversation          | Permanent                     |
| **Scale**       | ~10 files / context limit | Thousands of documents        |
| **Search**      | Full-text in single file  | Hybrid (Vector + FTS5)        |
| **Privacy**     | Sent to Anthropic         | 100% local (Ollama)           |
| **Cross-doc**   | No                        | Yes — search all docs at once |
| **Standalone**  | No                        | Yes — REST API included       |

---

## 🏗️ Architecture

PocketRAG uses **Reciprocal Rank Fusion (RRF)** to combine semantic understanding with exact keyword matching.

```
┌─────────────────────────────────────────────────────────────────┐
│ INGESTION MODE │
├─────────────────────────────────────────────────────────────────┤
│ │
│ 📄 Your PDFs ──► PocketRAG API ──► Ollama/OpenAI │
│ │ │ │
│ │ (Embeddings) │
│ ▼ ▼ │
│ SQLite DB ◄──── Vector + FTS5 │
│ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ MEMORY MODE │
├─────────────────────────────────────────────────────────────────┤
│ │
│ 🧠 Claude Desktop ──► MCP Protocol ──► PocketRAG │
│ ▲ │ │
│ │ (Hybrid Search) │
│ │ ▼ │
│ └──────────── Context ◄──────── SQLite DB │
│ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Ollama](https://ollama.ai/download) (Required for local privacy mode)

**One-time Setup:** Pull the embedding model. It is tiny (~200MB) and does not require a GPU.

```bash
ollama pull nomic-embed-text
```

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

You can swap Ollama for OpenAI if you want higher quality vectors at the cost of privacy.

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

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** [Elysia](https://elysiajs.com)
- **Database:** SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) + FTS5
- **Protocol:** [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- **AI Providers:** Ollama, OpenAI, Anthropic

---

## 📄 License

MIT License.
