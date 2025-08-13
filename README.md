# 🚀 Medicine-RAG

**A production-ready medical knowledge base powered by intelligent document processing and semantic search, built with agent-boot framework.**

Medicine-RAG combines the performance of Go with the AI capabilities of Python, delivering a seamless AI-powered medical search experience. Built on the powerful [go-api-boot](https://github.com/SaiNageswarS/go-api-boot) and [agent-boot](https://github.com/SaiNageswarS/agent-boot) frameworks for type-safe, enterprise-grade applications.

[![Go](https://img.shields.io/badge/Go-1.24+-00ADD8?style=for-the-badge&logo=go)](https://golang.org/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python)](https://python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-000000?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Vector%20Search-47A248?style=for-the-badge&logo=mongodb)](https://mongodb.com/)
[![Azure](https://img.shields.io/badge/Azure-Blob%20Storage-0078D4?style=for-the-badge&logo=microsoft-azure)](https://azure.microsoft.com/)

##  Features

- **Blazing Fast**: Go-powered backend with gRPC services for maximum performance
- **Smart Processing**: Python-based ML pipeline for document understanding and chunking
- **Hybrid Search**: Advanced RRF (Reciprocal Rank Fusion) combining vector and text search
- **Real-time Streaming**: Live AI responses through gRPC streaming with agent-boot
- **Production Performance**: Temporal workflows for scalable document processing
- **Multi-tenant**: Secure, isolated environments per tenant
- **Modern UI**: Next.js web interface with real-time streaming
- **AI-Powered**: Integrated Ollama and Claude support for intelligent responses
- **Cloud Native**: Azure Blob Storage + MongoDB with auto-scaling
- **Intelligent Search**: Advanced section grouping and windowed chunking

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js UI    │───▶│   medicine-rag   │───▶│   pySideCar     │
│  (Web Frontend) │    │   (Go Backend)   │    │ (Python ML/NLP) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌────────────────────────────────────────┐
                       │         **go-api-boot**          │
                       │(gRPC streaming,           │
                       │  MongoDB ODM, Temporal, Azure)        │
                       └────────────────────────────────────────┘

```

### 🎯 The Perfect Fusion

**Go Backend (`core`)**
- High-performance gRPC services with agent-boot
- Temporal workers for document processing orchestration  
- Hybrid RRF search with vector & text capabilities
- JWT authentication & multi-tenancy
- Powered by [go-api-boot](https://github.com/SaiNageswarS/go-api-boot) and [agent-boot](https://github.com/SaiNageswarS/agent-boot)

**Python ML Pipeline (`pySideCar`)**
- PDF → Markdown conversion using pymupdf4llm
- Intelligent windowed chunking with sentence boundaries
- Temporal activities for scalable processing

**Next.js Frontend (`ui`)**
- Modern React-based web interface
- Real-time streaming with gRPC-Web
- TypeScript with automatic protobuf generation

Since medicine-rag is built with go-api-boot, it serves gRPC (HTTP/2) and gRPC-Web (HTTP/1.1) out of the box.

## Real-time Streaming with agent-boot
### Live AI Agent Responses

Medicine-RAG delivers real-time streaming responses through agent-boot's integrated streaming infrastructure. Watch as your queries are processed live:

- Query Processing → Instant feedback
- Search Execution → Live search results streaming  
- AI Analysis → Real-time answer generation
- Complete Response → Fully cited, intelligent answers

### Streaming Architecture Deep Dive

```go
// agent_service.go - Powered by agent-boot

func (s *AgentService) Execute(req *schema.GenerateAnswerRequest, stream grpc.ServerStreamingServer[schema.AgentStreamChunk]) error {
    ctx := stream.Context()
    _, tenant := auth.GetUserIdAndTenant(ctx)

    // Initialize search tool with hybrid RRF capabilities
    search := mcp.NewSearchTool(chunkRepository, vectorRepository, s.embedder)

    // Create MCP tool with agent-boot builder
    mcp := agentboot.NewMCPToolBuilder("medicine-rag", "Search and retrieve medical information").
        StringSliceParam("query", "Search Query", true).
        WithHandler(func(ctx context.Context, params api.ToolCallFunctionArguments) <-chan *schema.ToolResultChunk {
            query := params["query"].(string)
            return search.Run(ctx, query)
        }).
        Build()

    // Build agent with Ollama models
    agent := agentboot.NewAgentBuilder().
        WithMiniModel(llm.NewOllamaClient("llama3.2:3b")).
        WithBigModel(llm.NewOllamaClient("deepseek-r1:14b")).
        WithSystemPrompt("You are an assistant for Qualified Homeopathic Physicians...").
        AddTool(mcp).
        Build()

    // Execute with streaming reporter
    streamReporter := &agentboot.GrpcProgressReporter{Stream: stream}
    _, err := agent.Execute(ctx, streamReporter, req)
    return err
}
```

Since Medicine-RAG is built with go-api-boot and agent-boot, it provides enterprise-grade streaming capabilities out of the box.

## AI-Powered Intelligence

### Advanced Hybrid Search with RRF

Medicine-RAG uses sophisticated Reciprocal Rank Fusion (RRF) for optimal search results:

```go
// From search.go - Advanced RRF implementation
const (
    rrfK               = 60  // "dampening" constant from the RRF paper
    textSearchWeight   = 1.0 // per-engine weights
    vectorSearchWeight = 1.0
    vecK               = 20  // hits to keep from vector search
    textK              = 20  // hits to keep from text search
    maxChunks          = 20
)

// RRF_score(d) = Σ_e  w_e / (k + rank_e(d))
func (s *SearchTool) hybridSearch(ctx context.Context, query string) <-chan async.Result[[]*db.ChunkModel] {
    // Fire parallel searches
    textTask := s.chunkRepository.TermSearch(ctx, query, ...)
    vecTask := s.vectorRepository.VectorSearch(ctx, embedding, ...)
    
    // Convert results to rank maps
    textRanks, cache := collectTextSearchRanks(textTask)
    vecRanks := collectVectorSearchRanks(vecTask)
    
    // Apply RRF fusion
    combined := make(map[string]float64)
    for id, r := range textRanks {
        combined[id] = textSearchWeight / float64(rrfK+r)
    }
    for id, r := range vecRanks {
        combined[id] += vectorSearchWeight / float64(rrfK+r)
    }
    
    return topK(combined, maxChunks)
}
```

### Intelligent Section Grouping

Advanced algorithm groups related chunks by section with adjacency bonuses:

```go
// GroupBySectionWithRank - Smart section consolidation
func GroupBySectionWithRank(chunks []*db.ChunkModel) [][]*db.ChunkModel {
    const (
        W              = 1.0  // base weight
        AdjacencyBonus = 0.15 // bonus for adjacent windows
        Lambda         = 0.10 // diminishing returns factor
    )
    
    // Score sections based on chunk ranks and adjacency
    for i, ch := range chunks {
        rank := i + 1
        w := W / math.Pow(float64(rank), P)
        
        section.score += w
        if hasAdjacentWindow(ch) {
            section.score += AdjacencyBonus * w
        }
    }
    
    // Apply diminishing returns for multiple chunks
    if section.count > 1 {
        section.score /= (1 + Lambda*float64(section.count-1))
    }
}
```

### Multi-Tenant Architecture
Medicine-RAG provides complete tenant isolation across all layers:

#### Database Level
```go
// From auth interceptor - automatic tenant extraction
_, tenant := auth.GetUserIdAndTenant(ctx)

// Each tenant gets isolated collections
chunkCollection := odm.CollectionOf[db.ChunkModel](s.mongo, tenant)
```

#### Storage Level
```go
// From activities - tenant-specific blob containers
func (s *Activities) InitTenant(ctx context.Context, tenant string) error {
    // Each tenant gets its own Azure Blob Container
    if err := s.az.EnsureBucket(ctx, tenant); err != nil {
        return err
    }
}
```

#### Processing Level
```python
# From pySideCar - tenant-aware document processing
async def convert_pdf_to_md(self, tenant: str, pdf_file_name: str) -> str:
    pdf_file_path = self._azure_storage.download_file(tenant, pdf_file_name)
    # Process within tenant context
```

## Powered by agent-boot
Medicine-RAG leverages [SaiNageswarS/agent-boot](https://github.com/SaiNageswarS/agent-boot) and [SaiNageswarS/go-api-boot](https://github.com/SaiNageswarS/go-api-boot) for enterprise-grade development:

### Type-Safe Development
```go
// from main.go - Clean dependency injection
boot, err := server.New().
    GRPCPort(":50051").
    HTTPPort(":8081").
    Provide(ccfgg).                    // Config injection
    Provide(&ccfgg.BootConfig).        // Boot configuration
    ProvideFunc(cloud.ProvideAzure).   // Azure client
    ProvideFunc(embed.ProvideJinaAIEmbeddingClient). // Embeddings
    ProvideFunc(odm.ProvideMongoClient). // Database
    
    // Temporal workflow registration
    WithTemporal(ccfgg.TemporalGoTaskQueue, &temporalClient.Options{
        HostPort: ccfgg.TemporalHostPort,
    }).
    RegisterTemporalActivity(activities.ProvideActivities).
    RegisterTemporalWorkflow(workflows.ChunkMarkdownWorkflow).
    RegisterTemporalWorkflow(workflows.InitTenantWorkflow).
    RegisterTemporalWorkflow(workflows.PdfHandlerWorkflow).
    RegisterTemporalWorkflow(workflows.EmbedChunksWorkflow).
    
    // gRPC service registration with streaming optimization
    ApplySettings(getStreamingOptimizations()).
    RegisterService(server.Adapt(pb.RegisterLoginServer), services.ProvideLoginService).
    RegisterService(server.Adapt(schema.RegisterAgentServer), services.ProvideAgentService).
    Build()
```

### Enterprise Features
- Automatic gRPC/HTTP servers with streaming optimizations
- MongoDB ODM with vector and text search capabilities  
- Azure Cloud Integration for storage and secrets
- JWT Authentication with tenant isolation
- Temporal Workflows for reliable document processing
- Configuration Management with environment support
- Structured Logging with correlation IDs
- Agent-boot integration for AI tool orchestration

### Developer Experience
The entire application wiring happens in clean, type-safe code with compile-time dependency validation.

## 🚀 Quick Start

### Prerequisites

- Go 1.24+
- Python 3.12+
- Node.js 18+ (for UI)
- MongoDB with Vector Search
- Azure Blob Storage
- Temporal.io cluster
- Ollama (for local models)

### 1. Clone & Setup

```bash
git clone https://github.com/SaiNageswarS/medicine-rag
cd medicine-rag

# Setup Go backend
cd core
go mod download
```

### 2. Environment Configuration

```bash
# .env file
MONGODB_URI=mongodb://localhost:27017
AZURE_STORAGE_ACCOUNT=your_account
AZURE_STORAGE_KEY=your_key
TEMPORAL_HOST_PORT=localhost:7233
JINA_API_KEY=your_key
JWT_SECRET_KEY=your_secret
```

### 3. Configuration Setup

Update `config.ini` with your settings:

```ini
[dev]
temporal_host_port = localhost:7233
temporal_go_task_queue = search-core
temporal_py_task_queue = searchCorePySideCar
azure_storage_account = your_account
sign_up_allowed = true
ollama_model = deepseek-r1:14b
ollama_mini_model = llama3.2:3b
```

### 4. Start the Backend

```bash
cd core
go run main.go
```

### 5. Launch Python ML Worker

```bash
cd pySideCar
source pyEnv/bin/activate  # Use existing virtual environment
python main.py
```

### 6. Start the Web UI

```bash
cd ui
npm install
npm run dev
```

The application will be available at:
- Backend: `http://localhost:8081` (HTTP) and `:50051` (gRPC)
- Frontend: `http://localhost:3000`

## 📖 Usage

### Document Processing

Upload a PDF through the web interface or API to trigger the complete processing pipeline:

```bash
# Upload document via API
curl -X POST http://localhost:8081/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@medical_paper.pdf" \
  -F "tenant=healthcare"
```

The system automatically:
1. **Converts** PDF → Markdown using pymupdf4llm
2. **Chunks** into logical sections with metadata
3. **Windows** sections into overlapping chunks
4. **Embeds** using Jina AI embeddings
5. **Indexes** for hybrid RRF search

### Querying via Web Interface

Open `http://localhost:3000` and ask medical questions:

> "What are the latest treatments for Type 2 diabetes?"

The agent will:
- Process your query with Ollama models
- Search the knowledge base using hybrid RRF
- Return relevant information with citations
- Stream results in real-time

### Direct API Access

```bash
# Agent execution endpoint
curl -X POST http://localhost:50051/agent.Agent/Execute \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "diabetes treatment options",
    "maxIterations": 3
  }'
```

## 🔧 Configuration

### Backend Config (`config.ini`)

```ini
[dev]
temporal_host_port = localhost:7233
temporal_go_task_queue = search-core
temporal_py_task_queue = searchCorePySideCar
azure_storage_account = agentboot
sign_up_allowed = true
claude_version = claude-3-5-sonnet-20241022
claude_mini = claude-3-5-haiku-20241022
ollama_model = deepseek-r1:14b
ollama_mini_model = llama3.2:3b
title_gen_model = deepseek-r1:14b
```

### Python Sidecar Configuration

```python
# Chunking parameters in window_chunker.py
WINDOW_SIZE = 700      # Max tokens per chunk
STRIDE = 600          # Overlap between chunks
MIN_SECTION_BYTES = 4000  # Minimum section size

# Processing activities
@activity.defn(name="convert_pdf_to_md")
@activity.defn(name="window_section_chunks")
```

### Frontend Configuration (`ui/package.json`)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "npm run generate-grpc && next build",
    "generate-grpc": "npm run clean-generated && npm run generate-tsproto"
  }
}
```

## 🔒 Security & Multi-tenancy

- **JWT Authentication**: Secure API access
- **Tenant Isolation**: Complete data separation
- **Azure Integration**: Enterprise-grade security
- **Input Validation**: Comprehensive request sanitization

## 🛠️ Development

### Project Structure

```
medicine-rag/
├── core/                    # Go backend services
│   ├── main.go             # Application entry point
│   ├── services/           # gRPC service implementations  
│   ├── workers/            # Temporal activities & workflows
│   ├── db/                 # MongoDB models & collections
│   ├── mcp/                # Search tool implementation
│   └── appconfig/          # Configuration management
├── pySideCar/              # Python ML pipeline
│   ├── main.py             # Python worker entry point
│   ├── workers/            # Document processing activities
│   └── pyEnv/              # Virtual environment
├── ui/                     # Next.js web interface
│   ├── src/app/           # Next.js app router
│   ├── src/generated/     # Auto-generated protobuf types
│   └── package.json       # Frontend dependencies
├── proto/                  # Protocol buffer definitions
│   ├── agent.proto         # Agent service definitions
│   └── login.proto         # Authentication
└── config.ini              # Shared configuration
```

### Adding New Features

1. **Backend Service**: Add to `core/services/`
2. **Temporal Workflow**: Implement in `core/workers/workflows/`
3. **Python Activity**: Add to `pySideCar/workers/`
4. **Frontend Component**: Create in `ui/src/app/`
5. **Protocol**: Define in `proto/` and regenerate

### Running Tests

```bash
# Go backend tests
cd core && go test ./...

# Python tests  
cd pySideCar && python -m pytest

# Frontend tests
cd ui && npm test
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[agent-boot](https://github.com/SaiNageswarS/agent-boot)**: The fantastic AI agent framework powering our intelligent responses
- **[go-api-boot](https://github.com/SaiNageswarS/go-api-boot)**: The powerful Go framework powering our backend
- **Temporal.io**: Workflow orchestration
- **Ollama**: Local LLM inference
- **Jina AI**: Vector embeddings
- **Next.js**: Modern React framework

---

**Built with ❤️ for the AI-powered future**