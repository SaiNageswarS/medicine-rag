// runs on server-side
// src/lib/server-grpc-client.ts (Session Support Update)
import * as grpc from '@grpc/grpc-js';

// Import pre-generated types and services (ts-proto)
import { 
  AgentClient,
  GenerateAnswerRequest,
  AgentStreamChunk
} from '../generated/agent';
import { 
  LoginClient,
  LoginRequest, 
  SignUpRequest, 
  AuthResponse 
} from '../generated/login';

// Configuration
const GRPC_HOST = process.env.GRPC_HOST || 'localhost:50051';
const GRPC_TIMEOUT = parseInt(process.env.GRPC_TIMEOUT || '30000'); // 30 seconds
const GRPC_KEEPALIVE_TIME = parseInt(process.env.GRPC_KEEPALIVE_TIME || '30000'); // 30 seconds
const GRPC_KEEPALIVE_TIMEOUT = parseInt(process.env.GRPC_KEEPALIVE_TIMEOUT || '5000'); // 5 seconds

console.log('Server gRPC Client Configuration (Session Support):', {
  grpcHost: GRPC_HOST,
  timeout: GRPC_TIMEOUT,
  keepaliveTime: GRPC_KEEPALIVE_TIME,
  environment: process.env.NODE_ENV,
  timestamp: new Date().toISOString()
});

// Create optimized gRPC credentials and options
const credentials = grpc.credentials.createInsecure();
const channelOptions: grpc.ChannelOptions = {
  'grpc.keepalive_time_ms': GRPC_KEEPALIVE_TIME,
  'grpc.keepalive_timeout_ms': GRPC_KEEPALIVE_TIMEOUT,
  'grpc.http2.max_pings_without_data': 0,
  'grpc.http2.min_time_between_pings_ms': 10000,
  'grpc.http2.min_ping_interval_without_data_ms': 300000,
  'grpc.max_receive_message_length': 20 * 1024 * 1024, // 20MB
  'grpc.max_send_message_length': 20 * 1024 * 1024, // 20MB
};

// Connection pool for reusing clients
const clientPool = new Map<string, { client: any; lastUsed: number }>();
const POOL_MAX_IDLE_TIME = 5 * 60 * 1000; // 5 minutes

// Clean up idle connections
setInterval(() => {
  const now = Date.now();
  for (const [key, { client, lastUsed }] of clientPool.entries()) {
    if (now - lastUsed > POOL_MAX_IDLE_TIME) {
      client.close();
      clientPool.delete(key);
      console.log(`Cleaned up idle gRPC client: ${key}`);
    }
  }
}, 60000); // Check every minute

// Authentication interceptor with better error handling
const createAuthInterceptor = (token: string): grpc.Interceptor => {
  return (options, nextCall) => {
    return new grpc.InterceptingCall(nextCall(options), {
      start(metadata, listener, next) {
        metadata.set('authorization', `Bearer ${token}`);
        metadata.set('user-agent', 'agent-boot-ui/1.0');
        next(metadata, {
          ...listener,
          onReceiveMetadata: (metadata, next) => {
            // Log response metadata for debugging
            console.log('gRPC Response Metadata:', metadata.getMap());
            next(metadata);
          }
        });
      }
    });
  };
};

// Optimized client factory with connection pooling
const getOrCreateClient = <T>(
  ClientClass: new (address: string, credentials: grpc.ChannelCredentials, options?: object) => T,
  serviceName: string,
  token?: string
): T => {
  const cacheKey = `${serviceName}-${token || 'no-token'}`;
  const cached = clientPool.get(cacheKey);
  
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  
  const options = {
    ...channelOptions,
    interceptors: token ? [createAuthInterceptor(token)] : []
  };
  
  const client = new ClientClass(GRPC_HOST, credentials, options);
  
  clientPool.set(cacheKey, {
    client,
    lastUsed: Date.now()
  });
  
  console.log(`Created new gRPC client: ${cacheKey}`);
  return client;
};

export interface AgentInputData {
  text: string;
  sessionId: string; // Add session ID support
  model: string; 
}

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
  email: string;
  password: string;
  tenant: string;
}

export interface AuthResponseData {
  jwt: string;
  userType?: string;
}

export class ServerLoginService {
  async login(credentials: LoginCredentials): Promise<AuthResponseData> {
    return new Promise((resolve, reject) => {
      const client = getOrCreateClient(LoginClient, 'Login');
      
      const request: LoginRequest = {
        email: credentials.email,
        password: credentials.password,
        tenant: credentials.tenant
      };
      
      const deadline = new Date();
      deadline.setTime(deadline.getTime() + GRPC_TIMEOUT);
      
      client.login(request, (error: grpc.ServiceError | null, response?: AuthResponse) => {
        if (error) {
          console.error('Server gRPC login error:', {
            code: error.code,
            message: error.message,
            details: error.details
          });
          reject(new Error(`Login failed: ${error.message}`));
          return;
        }
        
        if (!response) {
          reject(new Error('No response received from login service'));
          return;
        }
        
        console.log('Server gRPC login successful');
        resolve({
          jwt: response.jwt,
          userType: response.userType
        });
      });
    });
  }

  async signUp(credentials: LoginCredentials): Promise<AuthResponseData> {
    return new Promise((resolve, reject) => {
      const client = getOrCreateClient(LoginClient, 'Login');
      
      const request: SignUpRequest = {
        email: credentials.email,
        password: credentials.password,
        tenant: credentials.tenant
      };
      
      const deadline = new Date();
      deadline.setTime(deadline.getTime() + GRPC_TIMEOUT);
      
      client.signUp(request, (error: grpc.ServiceError | null, response?: AuthResponse) => {
        if (error) {
          console.error('Server gRPC signup error:', {
            code: error.code,
            message: error.message,
            details: error.details
          });
          reject(new Error(`Signup failed: ${error.message}`));
          return;
        }
        
        if (!response) {
          reject(new Error('No response received from signup service'));
          return;
        }
        
        console.log('Server gRPC signup successful');
        resolve({
          jwt: response.jwt,
          userType: response.userType
        });
      });
    });
  }
}

// Updated Agent streaming service with new proto structure
export class ServerAgentService {
  async callAgentStreaming(
    input: AgentInputData,
    token: string,
    onProgress: (progress: StreamingProgress) => void,
    onChunk: (response: Partial<StreamingAgentResponse>) => void
  ): Promise<StreamingAgentResponse> {
    return new Promise((resolve, reject) => {
      const client = getOrCreateClient(AgentClient, 'Agent', token);
      
      let response: StreamingAgentResponse = {
        toolResults: [],
        answer: '',
        status: 'starting',
        isComplete: false
      };
      
      let answerBuffer = '';
      let streamStartTime = Date.now();
      let chunksReceived = 0;
      
      try {
        console.log('Starting agent streaming with new proto structure:', {
          text: input.text.substring(0, 100),
          sessionId: input.sessionId,
          model: input.model,
          timestamp: new Date().toISOString()
        });
        
        onProgress({
          stage: 'tool_execution_starting',
          progress: 0,
          message: 'Connecting to agent...'
        });
        
        const request: GenerateAnswerRequest = {
          question: input.text,
          maxIterations: 3,
          metadata: {
            sessionId: input.sessionId,
            model: input.model
          }
        };
        
        const deadline = new Date();
        deadline.setTime(deadline.getTime() + GRPC_TIMEOUT * 10); // Longer timeout for streaming
        
        const call = client.execute(request, { deadline });
        
        call.on('data', (chunk: AgentStreamChunk) => {
          chunksReceived++;
          const chunkTime = Date.now() - streamStartTime;
          
          // Handle progress updates
          if (chunk.progressUpdateChunk) {
            const stageMap: { [key: number]: StreamingProgress['stage'] } = {
              0: 'tool_execution_starting',
              1: 'tool_execution_failed',
              2: 'tool_execution_completed',
              3: 'answer_generation_starting',
              4: 'answer_generation_failed',
              5: 'answer_generation_completed'
            };
            
            const stage = stageMap[chunk.progressUpdateChunk.stage] || 'tool_execution_starting';
            const progress = Math.min(100, (chunksReceived / (chunk.progressUpdateChunk.estimatedSteps || 10)) * 100);
            
            onProgress({
              stage,
              progress,
              message: chunk.progressUpdateChunk.message,
              estimatedSteps: chunk.progressUpdateChunk.estimatedSteps
            });
          }
          
          // Handle tool result chunks
          if (chunk.toolResultChunk) {
            const toolResult: ToolResult = {
              sentences: chunk.toolResultChunk.sentences || [],
              attribution: chunk.toolResultChunk.attribution || '',
              title: chunk.toolResultChunk.title || '',
              metadata: chunk.toolResultChunk.metadata || {},
              toolName: chunk.toolResultChunk.toolName || '',
              error: chunk.toolResultChunk.error || undefined,
              id: chunk.toolResultChunk.id || ''
            };
            
            response.toolResults = [...response.toolResults, toolResult];
            response.status = 'processing_tools';
            
            onProgress({
              stage: 'tool_execution_completed',
              progress: 60,
              message: `Tool ${toolResult.toolName} completed`
            });
          }
          
          // Handle answer chunks
          if (chunk.answer) {
            const newContent = chunk.answer.content || '';
            answerBuffer += newContent;
            response.answer = answerBuffer;
            response.status = 'generating_answer';
            
            onProgress({
              stage: 'answer_generation_starting',
              progress: 80,
              message: 'Generating answer...'
            });
          }
          
          // Handle completion
          if (chunk.complete) {
            response.isComplete = true;
            response.finalStatus = chunk.complete.finalStatus;
            response.tokensUsed = chunk.complete.tokenUsed;
            response.processingTime = chunk.complete.processingTime;
            response.toolsUsed = chunk.complete.toolsUsed || [];
            response.status = 'complete';
            
            onProgress({
              stage: 'answer_generation_completed',
              progress: 100,
              message: 'Stream complete'
            });
          }
          
          // Handle errors
          if (chunk.error) {
            response.error = chunk.error.errorMessage;
            response.status = 'error';
            
            onProgress({
              stage: 'tool_execution_failed',
              progress: 100,
              message: `Error: ${chunk.error.errorMessage}`
            });
          }
          
          console.log(`Session ${input.sessionId} - Chunk ${chunksReceived} (${chunkTime}ms):`, {
            hasProgress: !!chunk.progressUpdateChunk,
            hasToolResult: !!chunk.toolResultChunk,
            hasAnswer: !!chunk.answer,
            hasComplete: !!chunk.complete,
            hasError: !!chunk.error,
            timestamp: new Date().toISOString()
          });
          
          // Send partial response update
          onChunk({ ...response });
        });
        
        call.on('end', () => {
          const totalTime = Date.now() - streamStartTime;
          console.log('Agent streaming completed:', {
            sessionId: input.sessionId,
            chunksReceived,
            totalTime: `${totalTime}ms`,
            avgChunkTime: `${Math.round(totalTime / chunksReceived)}ms`,
            finalAnswerLength: response.answer.length,
            toolResultsCount: response.toolResults.length
          });
          
          resolve(response);
        });
        
        call.on('error', (error: grpc.ServiceError) => {
          const totalTime = Date.now() - streamStartTime;
          console.error('Agent streaming failed:', {
            sessionId: input.sessionId,
            error: error.message,
            code: error.code,
            details: error.details,
            totalTime: `${totalTime}ms`,
            chunksReceived
          });
          reject(new Error(`Streaming failed: ${error.message}`));
        });
        
      } catch (error) {
        console.error('Agent streaming setup failed:', {
          sessionId: input.sessionId,
          error
        });
        reject(error);
      }
    });
  }
}

// Export service instances
export const serverLoginService = new ServerLoginService();
export const serverAgentService = new ServerAgentService();

export const checkServerGrpcHealth = async (): Promise<boolean> => {
  try {
    const client = getOrCreateClient(LoginClient, 'Login');
    
    return new Promise((resolve) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      
      client.waitForReady(deadline, (error?: Error) => {
        if (error) {
          console.warn('Server gRPC health check failed:', {
            message: error.message,
            host: GRPC_HOST
          });
          resolve(false);
        } else {
          console.log('Server gRPC health check passed:', {
            host: GRPC_HOST,
            poolSize: clientPool.size
          });
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.warn('Server gRPC health check error:', error);
    return false;
  }
};

export const shutdownGrpcClients = (): void => {
  console.log('Shutting down gRPC clients...');
  for (const [key, { client }] of clientPool.entries()) {
    try {
      client.close();
      console.log(`Closed gRPC client: ${key}`);
    } catch (error) {
      console.warn(`Error closing gRPC client ${key}:`, error);
    }
  }
  clientPool.clear();
};