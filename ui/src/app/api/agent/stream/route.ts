// runs on server-side
// src/app/api/agent/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { serverAgentService, StreamingProgress, StreamingAgentResponse } from '@/lib/server-grpc-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, sessionId, model } = body;
    
    // Get authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }
    
    if (!text) {
      return NextResponse.json(
        { error: 'Text input is required' },
        { status: 400 }
      );
    }

    // Use default session ID if not provided
    const effectiveSessionId = sessionId || `default_${Date.now()}`;

    // Use Claude as default model (changed from deepseek)
    const effectiveModel = model || 'Claude';

    console.log('Server-side agent streaming request:', {
      text: text.substring(0, 100) + '...',
      sessionId: effectiveSessionId,
      model: effectiveModel,
      hasToken: !!token,
      timestamp: new Date().toISOString()
    });
    
    // Create a readable stream for server-sent events
    const encoder = new TextEncoder();
    
    const customReadable = new ReadableStream({
      start(controller) {
        // Send initial connection confirmation
        const connectionData = JSON.stringify({
          type: 'connected',
          data: {
            sessionId: effectiveSessionId,
            model: effectiveModel,
            timestamp: new Date().toISOString()
          }
        });
        controller.enqueue(encoder.encode(`data: ${connectionData}\n\n`));
        
        // Progress callback
        const onProgress = (progress: StreamingProgress) => {
          const progressData = JSON.stringify({
            type: 'progress',
            data: progress
          });
          controller.enqueue(encoder.encode(`data: ${progressData}\n\n`));
        };
        
        // Chunk callback
        const onChunk = (response: Partial<StreamingAgentResponse>) => {
          const chunkData = JSON.stringify({
            type: 'chunk',
            data: response
          });
          controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
        };
        
        // Start the streaming call with session ID and model
        serverAgentService.callAgentStreaming(
          { 
            text,
            sessionId: effectiveSessionId,
            model: effectiveModel // Pass model to gRPC service
          },
          token,
          onProgress,
          onChunk
        ).then((finalResponse) => {
          // Send final response
          const finalData = JSON.stringify({
            type: 'final',
            data: finalResponse
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          
          // Close the stream
          controller.close();
          
          console.log('Server-side agent streaming completed successfully:', {
            sessionId: effectiveSessionId,
            model: effectiveModel,
            answerLength: finalResponse.answer?.length || 0,
            status: finalResponse.finalStatus
          });
        }).catch((error) => {
          console.error('Server-side agent streaming error:', {
            sessionId: effectiveSessionId,
            model: effectiveModel,
            error: error.message
          });
          
          // Send error
          const errorData = JSON.stringify({
            type: 'error',
            data: {
              error: error instanceof Error ? error.message : 'Streaming failed',
              model: effectiveModel
            }
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          
          // Close the stream
          controller.close();
        });
      }
    });
    
    return new NextResponse(customReadable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Model-Used': effectiveModel, // Include model in response headers
        'X-Session-Id': effectiveSessionId,
      },
    });
    
  } catch (error) {
    console.error('Server-side agent streaming setup error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Streaming setup failed'
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}