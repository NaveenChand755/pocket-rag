#!/bin/bash
# Test script for PocketRAG MCP server

echo "🧪 Testing PocketRAG MCP Server"
echo "================================"

# Test 1: List tools
echo -e "\n📋 Test 1: Listing available tools..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run -i --rm \
  -v pocket-rag-data:/data \
  -e DB_PATH=/data/pocket-rag.sqlite \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  pocket-rag bun run src/mcp.ts 2>/dev/null | \
  tail -1 | jq -r '.result.tools[].name'

# Test 2: Get knowledge base stats
echo -e "\n📊 Test 2: Getting knowledge base stats..."
cat <<EOF | docker run -i --rm \
  -v pocket-rag-data:/data \
  -e DB_PATH=/data/pocket-rag.sqlite \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  pocket-rag bun run src/mcp.ts 2>/dev/null | tail -1 | jq -r '.result.content[0].text'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_knowledge_base_stats","arguments":{}}}
EOF

# Test 3: List documents
echo -e "\n📂 Test 3: Listing indexed documents..."
cat <<EOF | docker run -i --rm \
  -v pocket-rag-data:/data \
  -e DB_PATH=/data/pocket-rag.sqlite \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  pocket-rag bun run src/mcp.ts 2>/dev/null | tail -1 | jq -r '.result.content[0].text'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_documents","arguments":{}}}
EOF

# Test 4: Search knowledge base
echo -e "\n🔍 Test 4: Searching for 'Rama' in hybrid mode..."
cat <<EOF | docker run -i --rm \
  -v pocket-rag-data:/data \
  -e DB_PATH=/data/pocket-rag.sqlite \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  pocket-rag bun run src/mcp.ts 2>/dev/null | tail -1 | jq -r '.result.content[0].text' | head -20
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_knowledge_base","arguments":{"query":"Rama","mode":"hybrid"}}}
EOF

echo -e "\n✅ MCP Server Tests Complete!"
