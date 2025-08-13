'use client'

import LoginPage from './components/LoginPage'
import ChatPage from './components/ChatPage'
import { useAuth } from '@/hooks/useAuth'

export default function Home() {
  const { isAuthenticated, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <>
      {!isAuthenticated ? (
        <LoginPage />
      ) : (
        <ChatPage onLogout={logout} />
      )}
    </>
  )
}