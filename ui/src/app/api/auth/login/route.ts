// runs on server-side
// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { serverLoginService } from '@/lib/server-grpc-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { email, password, tenant } = body;
    
    // Validate required fields
    if (!email || !password || !tenant) {
      return NextResponse.json(
        { error: 'Email, password, and tenant are required' },
        { status: 400 }
      );
    }
    
    console.log('Server-side login attempt:', {
      email,
      tenant,
      timestamp: new Date().toISOString()
    });
    
    // Call server-side gRPC service
    const authResponse = await serverLoginService.login({
      email,
      password,
      tenant
    });
    
    console.log('Server-side login successful for:', email);
    
    return NextResponse.json({
      success: true,
      data: {
        jwt: authResponse.jwt,
        userType: authResponse.userType
      }
    });
    
  } catch (error) {
    console.error('Server-side login error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      },
      { status: 401 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'Login API is running',
    timestamp: new Date().toISOString() 
  });
}