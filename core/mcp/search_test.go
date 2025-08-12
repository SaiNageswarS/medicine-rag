package mcp

import (
	"context"
	"strings"
	"testing"

	"github.com/SaiNageswarS/agent-boot/schema"
	"github.com/SaiNageswarS/go-api-boot/dotenv"
	"github.com/SaiNageswarS/go-api-boot/embed"
	"github.com/SaiNageswarS/go-api-boot/odm"
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
		for _, result := range searchResults {
			// For each result, we need to find the corresponding chunks to get their IDs
			// Since the new API returns sentences, we'll need to validate based on content
			// and attribution instead of chunk IDs directly

			// Validate that we have content and attribution
			assert.NotEmpty(t, result.Sentences, "Result should have sentences")
			assert.NotEmpty(t, result.Attribution, "Result should have attribution")
			assert.NotEmpty(t, result.Title, "Result should have title")
		}

		// Since the API has changed and we no longer get chunk IDs directly,
		// we'll validate that we get meaningful results instead
		assert.True(t, len(searchResults) > 0, "Should get search results")

		// Validate that results contain expected content patterns
		hasRelevantContent := false
		for _, result := range searchResults {
			for _, sentence := range result.Sentences {
				if strings.Contains(strings.ToLower(sentence), "homeopathic") ||
					strings.Contains(strings.ToLower(sentence), "anxiety") ||
					strings.Contains(strings.ToLower(sentence), "fear") ||
					strings.Contains(strings.ToLower(sentence), "death") {
					hasRelevantContent = true
					break
				}
			}
			if hasRelevantContent {
				break
			}
		}

		assert.True(t, hasRelevantContent, "Results should contain content relevant to the search query")
	})
}
