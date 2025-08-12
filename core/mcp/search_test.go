package mcp

import (
	"context"
	"testing"

	"github.com/SaiNageswarS/agent-boot/schema"
	"github.com/SaiNageswarS/go-api-boot/dotenv"
	"github.com/SaiNageswarS/go-api-boot/embed"
	"github.com/SaiNageswarS/go-api-boot/odm"
	"github.com/SaiNageswarS/go-collection-boot/linq"
	"github.com/SaiNageswarS/medicine-rag/core/db"
	"github.com/stretchr/testify/assert"
)

func TestSearch(t *testing.T) {
	dotenv.LoadEnv("../.env")

	mongoClient := odm.ProvideMongoClient()
	embedder := embed.ProvideJinaAIEmbeddingClient()

	testTenant := "devinderhealthcare"
	chunkRepository := odm.CollectionOf[db.ChunkModel](mongoClient, testTenant)
	vectorRepository := odm.CollectionOf[db.ChunkAnnModel](mongoClient, testTenant)

	testQuery := "homeopathic remedies fear of death anxiety treatment"

	t.Run("TestHybridSearch", func(t *testing.T) {
		expectedChunkPrefixes := []string{"1544328200c1", "9a24dcec7d80"}

		searchTool := NewSearchTool(chunkRepository, vectorRepository, embedder)
		ctx := context.Background()
		resultsChan := searchTool.Run(ctx, []string{testQuery})

		// Collect all results from the channel
		var searchResults []*schema.ToolResultChunk
		for result := range resultsChan {
			if result.Error != "" {
				t.Fatalf("Search returned error: %s", result.Error)
			}
			searchResults = append(searchResults, result)
		}

		assert.NotEmpty(t, searchResults, "Search should return results")

		// Extract chunk IDs from sentences in the results
		chunkIds, err := linq.Pipe2(
			linq.FromSlice(t.Context(), searchResults),

			linq.Select(func(result *schema.ToolResultChunk) string {
				return result.Id
			}),

			linq.ToSlice[string](),
		)

		assert.NoError(t, err, "Should not error while extracting chunk IDs")

		for _, expectedChunkId := range expectedChunkPrefixes {
			assert.Contains(t, chunkIds, expectedChunkId, "Expected chunk ID should be present in search results")
		}
	})
}
