package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"

	"github.com/SaiNageswarS/agent-boot/schema"
	"github.com/SaiNageswarS/go-api-boot/logger"
	pb "github.com/SaiNageswarS/medicine-rag/proto/generated"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

//go:embed views/*.html
var viewsFS embed.FS

//go:embed static/*.js static/*.css
var staticFS embed.FS

type PageHandler struct {
	templates   map[string]*template.Template
	loginClient pb.LoginClient
	agentClient schema.AgentClient
}

func ProvidePageHandler(conn *grpc.ClientConn) *PageHandler {
	handler := &PageHandler{
		templates:   make(map[string]*template.Template),
		loginClient: pb.NewLoginClient(conn),
		agentClient: schema.NewAgentClient(conn),
	}
	handler.loadTemplates()
	return handler
}

func (h *PageHandler) loadTemplates() {
	// Load templates from embedded files
	loginTemplate, err := viewsFS.ReadFile("views/login.html")
	if err != nil {
		logger.Error("Failed to read login template", zap.Error(err))
		return
	}

	chatTemplate, err := viewsFS.ReadFile("views/chat.html")
	if err != nil {
		logger.Error("Failed to read chat template", zap.Error(err))
		return
	}

	h.templates["login"], err = template.New("login").Parse(string(loginTemplate))
	if err != nil {
		logger.Error("Failed to parse login template", zap.Error(err))
	}

	h.templates["chat"], err = template.New("chat").Parse(string(chatTemplate))
	if err != nil {
		logger.Error("Failed to parse chat template", zap.Error(err))
	}

	logger.Info("Embedded templates loaded successfully")
}

// LoginPageHandler serves the login page
func (h *PageHandler) LoginPageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		// Check if already authenticated
		if h.isAuthenticated(r) {
			http.Redirect(w, r, "/chat", http.StatusFound)
			return
		}

		data := struct {
			Error  string
			Email  string
			Tenant string
		}{
			Tenant: "default", // Default tenant
		}

		w.Header().Set("Content-Type", "text/html")
		if err := h.templates["login"].Execute(w, data); err != nil {
			logger.Error("Failed to execute login template", zap.Error(err))
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}

	if r.Method == "POST" {
		h.handleLogin(w, r)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

// ChatPageHandler serves the chat page
func (h *PageHandler) ChatPageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check authentication
	if !h.isAuthenticated(r) {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}

	// Extract user info from token (simplified)
	user := h.getUserFromToken(r)

	data := struct {
		User      string
		SessionId string
	}{
		User:      user,
		SessionId: h.generateSessionId(),
	}

	w.Header().Set("Content-Type", "text/html")
	if err := h.templates["chat"].Execute(w, data); err != nil {
		logger.Error("Failed to execute chat template", zap.Error(err))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// RootHandler redirects to appropriate page
func (h *PageHandler) RootHandler(w http.ResponseWriter, r *http.Request) {
	if h.isAuthenticated(r) {
		http.Redirect(w, r, "/chat", http.StatusFound)
	} else {
		http.Redirect(w, r, "/login", http.StatusFound)
	}
}

// LogoutHandler handles logout
func (h *PageHandler) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	// Clear the authentication cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, "/login", http.StatusFound)
}

func (h *PageHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	tenant := strings.TrimSpace(r.FormValue("tenant"))
	email := strings.TrimSpace(r.FormValue("email"))
	password := r.FormValue("password")

	data := struct {
		Error  string
		Email  string
		Tenant string
	}{
		Email:  email,
		Tenant: tenant,
	}

	if tenant == "" || email == "" || password == "" {
		data.Error = "All fields are required"
		w.Header().Set("Content-Type", "text/html")
		h.templates["login"].Execute(w, data)
		return
	}

	// Call the actual gRPC login service
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	loginReq := &pb.LoginRequest{
		Email:    email,
		Password: password,
		Tenant:   tenant,
	}

	resp, err := h.loginClient.Login(ctx, loginReq)
	if err != nil {
		logger.Error("gRPC login failed", zap.Error(err))
		data.Error = "Invalid credentials or server error"
		w.Header().Set("Content-Type", "text/html")
		h.templates["login"].Execute(w, data)
		return
	}

	// Set authentication cookie with the JWT token
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    resp.Jwt,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	// Set user info cookies for UI purposes
	http.SetCookie(w, &http.Cookie{
		Name:     "user_email",
		Value:    email,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: false, // Allow JS access for UI
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     "user_tenant",
		Value:    tenant,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: false, // Allow JS access for UI
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     "user_type",
		Value:    resp.UserType,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: false, // Allow JS access for UI
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	logger.Info("User logged in successfully", zap.String("email", email), zap.String("tenant", tenant))
	http.Redirect(w, r, "/chat", http.StatusFound)
}

func (h *PageHandler) isAuthenticated(r *http.Request) bool {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return false
	}

	// Here you would validate the JWT token
	// For now, just check if cookie exists and is not empty
	return cookie.Value != ""
}

func (h *PageHandler) getUserFromToken(r *http.Request) string {
	// Try to get user email from cookie
	emailCookie, err := r.Cookie("user_email")
	if err == nil && emailCookie.Value != "" {
		parts := strings.Split(emailCookie.Value, "@")
		if len(parts) > 0 {
			return parts[0]
		}
		return emailCookie.Value
	}

	// Fallback to extracting from auth token (simplified)
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return "Unknown"
	}

	// Extract user from demo token format: demo_jwt_tenant_email_timestamp
	if strings.HasPrefix(cookie.Value, "demo_jwt_") {
		parts := strings.Split(cookie.Value, "_")
		if len(parts) >= 4 {
			return parts[3] // email part
		}
	}

	return "User"
}

func (h *PageHandler) generateSessionId() string {
	// Generate a simple session ID using timestamp
	return fmt.Sprintf("session_%d", time.Now().UnixNano())
}

// StaticHandler serves embedded static files
func (h *PageHandler) StaticHandler(w http.ResponseWriter, r *http.Request) {
	// Remove /static prefix from the path
	path := strings.TrimPrefix(r.URL.Path, "/static/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	// Try to read the file from embedded FS
	content, err := staticFS.ReadFile("static/" + path)
	if err != nil {
		logger.Error("Static file not found", zap.String("path", path), zap.Error(err))
		http.NotFound(w, r)
		return
	}

	// Set content type based on file extension
	contentType := "text/plain"
	if strings.HasSuffix(path, ".js") {
		contentType = "application/javascript"
	} else if strings.HasSuffix(path, ".css") {
		contentType = "text/css"
	} else if strings.HasSuffix(path, ".html") {
		contentType = "text/html"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
	w.Write(content)
}

// AgentStreamHandler handles streaming agent requests
func (h *PageHandler) AgentStreamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check authentication
	if !h.isAuthenticated(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var reqData struct {
		Text      string `json:"text"`
		SessionId string `json:"sessionId"`
		Model     string `json:"model"`
	}

	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if reqData.Text == "" {
		http.Error(w, "Text is required", http.StatusBadRequest)
		return
	}

	// Set up Server-Sent Events
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Get auth token for gRPC call
	authToken := h.getAuthToken(r)

	// Create context with auth metadata
	ctx := context.Background()
	if authToken != "" {
		// Add authentication metadata with Bearer token for gRPC
		md := metadata.New(map[string]string{
			"authorization": "Bearer " + authToken,
		})
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	// Create agent request using the real schema
	agentReq := &schema.GenerateAnswerRequest{
		Question:      reqData.Text,
		SessionId:     reqData.SessionId,
		MaxIterations: 3,
		Metadata: map[string]string{
			"model":     reqData.Model,
			"sessionId": reqData.SessionId,
		},
	}

	// Call the streaming gRPC service
	stream, err := h.agentClient.Execute(ctx, agentReq)
	if err != nil {
		logger.Error("Failed to call agent service", zap.Error(err))
		http.Error(w, "Failed to start agent stream", http.StatusInternalServerError)
		return
	}

	// Stream the response
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Send initial connection event
	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"Stream started"}`)
	flusher.Flush()

	for {
		chunk, err := stream.Recv()
		if err != nil {
			if err.Error() == "EOF" {
				// Stream ended normally
				fmt.Fprintf(w, "data: %s\n\n", `{"type":"end","message":"Stream completed"}`)
				flusher.Flush()
				break
			}
			logger.Error("Stream error", zap.Error(err))
			fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf(`{"type":"error","message":"%s"}`, err.Error()))
			flusher.Flush()
			break
		}

		// Convert chunk to JSON and send as SSE
		chunkData, _ := json.Marshal(map[string]interface{}{
			"type":  "chunk",
			"chunk": chunk,
		})

		fmt.Fprintf(w, "data: %s\n\n", string(chunkData))
		flusher.Flush()

		// Check if client disconnected
		select {
		case <-r.Context().Done():
			logger.Info("Client disconnected from stream")
			return
		default:
		}
	}
}

func (h *PageHandler) getAuthToken(r *http.Request) string {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		return ""
	}
	return cookie.Value
}
