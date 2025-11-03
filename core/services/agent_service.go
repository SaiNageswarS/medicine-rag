package services

import (
	"context"

	"github.com/SaiNageswarS/agent-boot/agentboot"
	"github.com/SaiNageswarS/agent-boot/llm"
	"github.com/SaiNageswarS/agent-boot/memory"
	"github.com/SaiNageswarS/agent-boot/schema"
	"github.com/SaiNageswarS/go-api-boot/auth"
	"github.com/SaiNageswarS/go-api-boot/embed"
	"github.com/SaiNageswarS/go-api-boot/odm"
	"github.com/SaiNageswarS/medicine-rag/core/db"
	"github.com/SaiNageswarS/medicine-rag/core/mcp"
	"github.com/ollama/ollama/api"
	"google.golang.org/grpc"
)

type AgentService struct {
	schema.UnimplementedAgentServer
	mongo    odm.MongoClient
	embedder embed.Embedder
}

func ProvideAgentService(mongo odm.MongoClient, embedder embed.Embedder) *AgentService {
	return &AgentService{
		mongo:    mongo,
		embedder: embedder,
	}
}

func (s *AgentService) Execute(req *schema.GenerateAnswerRequest, stream grpc.ServerStreamingServer[schema.AgentStreamChunk]) error {
	ctx := stream.Context()
	_, tenant := auth.GetUserIdAndTenant(ctx)

	chunkRepository := odm.CollectionOf[db.ChunkModel](s.mongo, tenant)
	vectorRepository := odm.CollectionOf[db.ChunkAnnModel](s.mongo, tenant)

	conversationRepo := odm.CollectionOf[memory.Conversation](s.mongo, tenant)

	search := mcp.NewSearchTool(chunkRepository, vectorRepository, s.embedder)

	mcp := agentboot.NewMCPToolBuilder("medicine-rag", "Search and retrieve medical information and remedies from the database for the user query.").
		StringParam("query", "Search Query to perform search", true).
		WithHandler(func(ctx context.Context, params api.ToolCallFunctionArguments) <-chan *schema.ToolResultChunk {
			query := params["query"].(string)
			return search.Run(ctx, query)
		}).
		Summarize(true).
		Build()

	agent := agentboot.NewAgentBuilder().
		WithMiniModel(llm.NewAnthropicClient("claude-3-5-haiku-20241022")).
		WithBigModel(llm.NewAnthropicClient("claude-3-5-haiku-20241022")).
		WithToolSelector(llm.NewGroqClient("openai/gpt-oss-20b")).
		WithSystemPrompt("You are an assistant for Qualified Homeopathic Physicians. You are provided with medicine-rag tool to query medical knowledge database. Use ONLY INFORMATION from medicine-rag to answer the User Query.").
		AddTool(mcp).
		WithConversationManager(conversationRepo, 5).
		Build()

	streamReporter := &agentboot.GrpcProgressReporter{Stream: stream}
	_, err := agent.Execute(ctx, streamReporter, req)
	return err
}
