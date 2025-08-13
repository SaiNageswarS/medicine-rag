// src/types/index.ts
export interface AuthState {
  isAuthenticated: boolean
  token: string | null
  user: string | null
}

export interface LoginCredentials {
  email: string
  password: string
  tenant: string
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Component Props Types
export interface ChatPageProps {
  onLogout: () => void
}

// Streaming Types (duplicated here for consistency)
export interface StreamingAgentResponse {
  searchQueries: string[]
  searchResults: any[]
  answer: string
  status: string
  isComplete: boolean
  error?: string
  finalStatus?: string
  totalResultsSent?: number
  totalQueriesSent?: number
}

export interface StreamingProgress {
  stage: 'starting' | 'processing_input' | 'searching' | 'processing_results' | 'generating_answer' | 'complete' | 'error'
  progress: number
  message: string
  estimatedQueries?: number
  estimatedResults?: number
}

export interface AuthResponse {
  jwt: string
  userType?: string
}