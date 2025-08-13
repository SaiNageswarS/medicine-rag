'use client'

// src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react'
import type { AuthState } from '@/types'
import { clientApiService, LoginCredentials, AuthResponse } from '@/services/client-api-service'

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    user: null
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        const user = localStorage.getItem('auth_user')
        if (token) {
          setAuthState({
            isAuthenticated: true,
            token,
            user: user
          })
        }
      } catch (error) {
        console.error('Auth initialization failed:', error)
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    try {
      const authResponse: AuthResponse = await clientApiService.login(credentials)
      const token = authResponse.jwt
      
      if (!token) {
        throw new Error('No token received from server')
      }

      const user = credentials.email.split('@')[0]

      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_user', user)
      
      // Note: We don't need to update state here since page will reload
    } catch (error) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      
      if (error instanceof Error) {
        throw new Error(`Login failed: ${error.message}`)
      } else {
        throw new Error('Login failed: Network or server error')
      }
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    
    setAuthState({
      isAuthenticated: false,
      token: null,
      user: null
    })
  }, [])

  return {
    ...authState,
    isLoading,
    login,
    logout
  }
}