'use client'

// src/services/client-api-service.ts - Updated for new proto structure with ToolResultChunk
export interface ToolResult {
  sentences: string[]
  attribution: string
  title: string
  metadata: { [key: string]: string }
  toolName: string
  error?: string
  id: string
}

export interface StreamingAgentResponse {
  toolResults: ToolResult[]
  answer: string
  status: string
  isComplete: boolean
  error?: string
  finalStatus?: string
  tokensUsed?: number
  processingTime?: number
  toolsUsed?: string[]
}

export interface StreamingProgress {
  stage: 'tool_execution_starting' | 'tool_execution_failed' | 'tool_execution_completed' | 'answer_generation_starting' | 'answer_generation_failed' | 'answer_generation_completed' | 'complete' | 'error'
  progress: number
  message: string
  estimatedSteps?: number
}

export interface LoginCredentials {
  email: string
  password: string
  tenant: string
}

export interface AuthResponse {
  jwt: string
  userType?: string
}

export class ClientApiService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      console.log('Client-side API login request:', {
        email: credentials.email,
        tenant: credentials.tenant,
        timestamp: new Date().toISOString()
      });

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Login failed');
      }

      console.log('Client-side API login successful');
      return data.data;
    } catch (error) {
      console.error('Client-side API login error:', error);
      throw error;
    }
  }

  async signUp(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      console.log('Client-side API signup request:', {
        email: credentials.email,
        tenant: credentials.tenant,
        timestamp: new Date().toISOString()
      });

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Signup failed');
      }

      console.log('Client-side API signup successful');
      return data.data;
    } catch (error) {
      console.error('Client-side API signup error:', error);
      throw error;
    }
  }

  async callAgentStreaming(
    text: string,
    sessionId: string,
    model: string, // Add model parameter
    onProgress: (progress: StreamingProgress) => void,
    onChunk: (response: Partial<StreamingAgentResponse>) => void
  ): Promise<StreamingAgentResponse> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('Starting streaming request:', {
        text: text.substring(0, 100) + '...',
        sessionId,
        model,
        timestamp: new Date().toISOString()
      });

      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ 
          text,
          sessionId,
          model // Include model in request body
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Streaming request failed');
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let finalResponse: StreamingAgentResponse = {
        toolResults: [],
        answer: '',
        status: '',
        isComplete: false
      };

      let streamCompleted = false;
      let buffer = '';

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (!streamCompleted) {
            console.warn('Stream timeout detected');
            reader.cancel();
            reject(new Error('Stream timeout'));
          }
        }, 120000); // 2 minute timeout

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                console.log('Stream completed');
                streamCompleted = true;
                clearTimeout(timeoutId);
                resolve(finalResponse);
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const eventData = JSON.parse(line.slice(6));
                    
                    if (eventData.type === 'connected') {
                      console.log('Stream connected');
                    } else if (eventData.type === 'heartbeat') {
                      // Silent heartbeat
                    } else if (eventData.type === 'progress') {
                      onProgress(eventData.data);
                    } else if (eventData.type === 'chunk') {
                      finalResponse = { ...finalResponse, ...eventData.data };
                      onChunk(eventData.data);
                    } else if (eventData.type === 'final') {
                      finalResponse = eventData.data;
                      streamCompleted = true;
                      clearTimeout(timeoutId);
                      resolve(finalResponse);
                      return;
                    } else if (eventData.type === 'complete') {
                      streamCompleted = true;
                      clearTimeout(timeoutId);
                      resolve(finalResponse);
                      return;
                    } else if (eventData.type === 'error') {
                      console.error('Stream error:', eventData.data);
                      streamCompleted = true;
                      clearTimeout(timeoutId);
                      throw new Error(eventData.data.error);
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse streaming data:', parseError);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Stream processing error:', error);
            streamCompleted = true;
            clearTimeout(timeoutId);
            reject(error);
          }
        };

        processStream();
      });

    } catch (error) {
      console.error('API streaming error:', error);
      throw error;
    }
  }
}

export const clientApiService = new ClientApiService();

export const checkClientApiHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'GET',
    });
    
    return response.ok;
  } catch (error) {
    console.warn('Client API health check failed:', error);
    return false;
  }
};