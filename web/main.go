package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Get gRPC server address from environment variable
	grpcAddr := os.Getenv("GRPC_ADDR")
	if grpcAddr == "" {
		grpcAddr = "localhost:50051" // Default to core service address
	}

	// Create gRPC connection
	conn, err := grpc.NewClient(grpcAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		logger.Fatal("Failed to connect to gRPC server", zap.Error(err))
	}
	defer conn.Close()

	// Create page handler with gRPC connection
	pageHandler := ProvidePageHandler(conn)

	// Set up HTTP routes
	mux := http.NewServeMux()

	// Page routes
	mux.HandleFunc("/", pageHandler.RootHandler)
	mux.HandleFunc("/login", pageHandler.LoginPageHandler)
	mux.HandleFunc("/chat", pageHandler.ChatPageHandler)
	mux.HandleFunc("/logout", pageHandler.LogoutHandler)

	// Static files
	mux.HandleFunc("/static/", pageHandler.StaticHandler)

	// API routes for AJAX calls
	mux.HandleFunc("/api/agent/stream", pageHandler.AgentStreamHandler)

	// Create HTTP server
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Start server in a goroutine
	go func() {
		logger.Info("Starting web server", zap.String("port", port), zap.String("grpc_addr", grpcAddr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Create a context with timeout for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown the server
	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exiting")
}
