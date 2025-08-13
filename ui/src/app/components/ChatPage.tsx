'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Send, ChevronDown, ChevronUp, Search, Database, LogOut, ExternalLink, Zap, AlertTriangle, CheckCircle, XCircle, Menu, RotateCcw, Bot, Cpu, Settings } from 'lucide-react'
import type { ChatPageProps } from '@/types'
import ReactMarkdown from 'react-markdown'
import { StreamingAgentResponse, StreamingProgress, clientApiService, ToolResult } from '@/services/client-api-service'

interface Message {
  id: number
  type: 'user' | 'assistant'
  content: string
  timestamp: string
  model?: string
  streamingResponse?: StreamingAgentResponse
  isStreaming?: boolean
  hasError?: boolean
}

interface ExpandedTools {
  [key: string]: boolean
}

// Generate a unique session ID
const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Model options - DeepSeek as default (first in array)
const MODEL_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek', icon: Cpu, description: 'Fast and efficient responses' },
  { value: 'claude', label: 'Claude', icon: Bot, description: 'Advanced reasoning and analysis' }
]

export default function ChatPage({ onLogout }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('deepseek') // Changed default to deepseek
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [streamingProgress, setStreamingProgress] = useState<StreamingProgress | null>(null)
  const [expandedTools, setExpandedTools] = useState<ExpandedTools>({})
  const [currentStreamingId, setCurrentStreamingId] = useState<number | null>(null)
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false)
  const [showModelSelector, setShowModelSelector] = useState<boolean>(false)
  
  // Session management
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId())
  const [sessionMessageCount, setSessionMessageCount] = useState<number>(0)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Debug session info
  useEffect(() => {
    console.log('Session ID:', sessionId, 'Message count:', sessionMessageCount, 'Model:', selectedModel)
  }, [sessionId, sessionMessageCount, selectedModel])

  const startNewSession = (): void => {
    const newSessionId = generateSessionId()
    console.log('Starting new session:', newSessionId, 'with model:', selectedModel)
    
    setSessionId(newSessionId)
    setSessionMessageCount(0)
    setMessages([])
    setInputText('')
    setIsLoading(false)
    setStreamingProgress(null)
    setCurrentStreamingId(null)
    setExpandedTools({})
  }

  const getModelInfo = (modelValue: string) => {
    return MODEL_OPTIONS.find(model => model.value === modelValue) || MODEL_OPTIONS[0]
  }

  const handleSendMessage = async (): Promise<void> => {
    if (!inputText.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now(),
      type: 'user',
      content: inputText,
      timestamp: new Date().toISOString(),
      model: selectedModel
    }

    const assistantMessageId = Date.now() + 1
    const assistantMessage: Message = {
      id: assistantMessageId,
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      model: selectedModel,
      isStreaming: true,
      streamingResponse: {
        toolResults: [],
        answer: '',
        status: '',
        isComplete: false
      }
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setCurrentStreamingId(assistantMessageId)
    
    const currentQuery = inputText
    const currentSessionId = sessionId
    const currentModel = selectedModel
    setInputText('')
    setIsLoading(true)
    setSessionMessageCount(prev => prev + 1)

    console.log('Sending message with session ID:', currentSessionId, 'Model:', currentModel, 'Message count:', sessionMessageCount + 1)

    try {
      const finalResponse = await clientApiService.callAgentStreaming(
        currentQuery,
        currentSessionId,
        currentModel, // Pass selected model to the service
        // Progress callback
        (progress: StreamingProgress) => {
          setStreamingProgress(progress)
        },
        // Chunk callback - updates the message in real-time
        (partialResponse: Partial<StreamingAgentResponse>) => {
          setMessages(prev => prev.map(msg => {
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                content: partialResponse.answer || msg.content,
                streamingResponse: {
                  ...msg.streamingResponse!,
                  ...partialResponse
                }
              }
            }
            return msg
          }))
        }
      )

      // Update final message
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            content: finalResponse.answer || getErrorMessage(finalResponse),
            isStreaming: false,
            hasError: !!finalResponse.error,
            streamingResponse: finalResponse
          }
        }
        return msg
      }))

    } catch (error) {
      console.error('Streaming failed:', error)
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
            isStreaming: false,
            hasError: true
          }
        }
        return msg
      }))
    } finally {
      setIsLoading(false)
      setStreamingProgress(null)
      setCurrentStreamingId(null)
    }
  }

  // Updated getErrorMessage function - removed not_relevant case
  const getErrorMessage = (response: StreamingAgentResponse): string => {
    if (response.error) return `Error: ${response.error}`
    if (!response.answer) return 'No response generated.'
    return response.answer
  }

  const CitationBadge: React.FC<{ index: number }> = ({ index }) => (
    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 rounded ml-1">
      [{index + 1}]
    </span>
  )

  const toggleToolExpansion = (messageId: number, toolType: string): void => {
    const key = `${messageId}-${toolType}`
    setExpandedTools(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Updated getStatusIcon function - removed not_relevant case
  const getStatusIcon = (response: StreamingAgentResponse) => {
    if (!response) return null
    
    if (response.error) {
      return <XCircle className="w-4 h-4 text-red-500" />
    }
    
    if (response.finalStatus === 'success') {
      return <CheckCircle className="w-4 h-4 text-green-500" />
    }
    
    // Removed not_relevant case - fall back to warning for other statuses
    return <AlertTriangle className="w-4 h-4 text-orange-500" />
  }

  const ModelBadge: React.FC<{ model: string; size?: 'sm' | 'base' }> = ({ model, size = 'sm' }) => {
    const modelInfo = getModelInfo(model)
    const Icon = modelInfo.icon
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        model === 'claude' 
          ? 'bg-purple-100 text-purple-800' 
          : 'bg-orange-100 text-orange-800'
      } ${size === 'base' ? 'text-sm px-3 py-1.5' : ''}`}>
        <Icon className={`${size === 'base' ? 'w-4 h-4' : 'w-3 h-3'}`} />
        {modelInfo.label}
      </span>
    )
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Agent Boot</h1>
                <div className="text-xs text-gray-500">AI-Powered Knowledge Assistant</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Desktop model selector */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowModelSelector(!showModelSelector)}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Select Model"
              >
                {React.createElement(getModelInfo(selectedModel).icon, { className: "w-4 h-4" })}
                <span className="hidden lg:inline">{getModelInfo(selectedModel).label}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showModelSelector && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <div className="p-2">
                    {MODEL_OPTIONS.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => {
                          setSelectedModel(model.value)
                          setShowModelSelector(false)
                        }}
                        disabled={isLoading}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left disabled:opacity-50 ${
                          selectedModel === model.value 
                            ? 'bg-blue-50 text-blue-900 border border-blue-200' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <model.icon className="w-5 h-5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">{model.label}</div>
                          <div className="text-xs text-gray-500 truncate">{model.description}</div>
                        </div>
                        {selectedModel === model.value && (
                          <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* New session button */}
            <button
              onClick={startNewSession}
              disabled={isLoading}
              className="hidden sm:flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              title="Start New Session"
            >
              <RotateCcw className="w-4 h-4" />
              New Session
            </button>

            {/* Mobile menu button */}
            <button
              className="sm:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              title="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop logout button */}
            <button
              onClick={onLogout}
              className="hidden sm:flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {showMobileMenu && (
          <div className="sm:hidden mt-3 pt-3 border-t border-gray-200 space-y-2">
            {/* Mobile model selector */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 px-3">Select Model:</div>
              <div className="space-y-1">
                {MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.value}
                    onClick={() => {
                      setSelectedModel(model.value)
                      setShowMobileMenu(false)
                    }}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left disabled:opacity-50 ${
                      selectedModel === model.value 
                        ? 'bg-blue-50 text-blue-900 border border-blue-200' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <model.icon className="w-5 h-5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{model.label}</div>
                      <div className="text-xs text-gray-500 truncate">{model.description}</div>
                    </div>
                    {selectedModel === model.value && (
                      <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="border-t border-gray-200 pt-2 space-y-2">
              <button
                onClick={() => {
                  startNewSession()
                  setShowMobileMenu(false)
                }}
                disabled={isLoading}
                className="flex items-center gap-2 w-full px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                New Session
              </button>
              <button
                onClick={() => {
                  onLogout()
                  setShowMobileMenu(false)
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Session Info */}
        <div className="hidden sm:block mt-2">
          <div className="text-xs text-gray-500 truncate">
            Session ID: <span className="font-mono">{sessionId}</span>
          </div>
        </div>
      </div>

      {/* Close model selector when clicking outside */}
      {showModelSelector && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowModelSelector(false)}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Agent Boot</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                Ask me anything about your knowledge base. I'll search through your documents and provide detailed, cited answers.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="text-sm text-gray-500">Current model:</span>
                <ModelBadge model={selectedModel} size="base" />
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`w-full ${message.type === 'user' ? 'flex justify-end' : ''}`}>
                {message.type === 'user' ? (
                  <div className="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-[80%]">
                    <div className="flex items-center gap-2 text-xs opacity-80 mb-1">
                      <span>You</span>
                      <ModelBadge model={message.model || selectedModel} />
                    </div>
                    <div className="leading-relaxed break-words">{message.content}</div>
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    {/* Streaming progress indicator */}
                    {message.isStreaming && streamingProgress && currentStreamingId === message.id && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-sm text-blue-800 mb-2">
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <span className="font-medium">{streamingProgress.message}</span>
                        </div>
                        <div className="w-full bg-blue-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${streamingProgress.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Tool Results */}
                    {message.streamingResponse && message.streamingResponse.toolResults.length > 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                        <div>
                          <button
                            onClick={() => toggleToolExpansion(message.id, 'tools')}
                            className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors flex items-center justify-between text-left border-b border-gray-200"
                          >
                            <div className="flex items-center gap-2">
                              <Settings className="w-4 h-4 text-gray-600" />
                              <span className="font-medium text-gray-900">
                                Tool Results ({message.streamingResponse.toolResults.length})
                              </span>
                            </div>
                            {expandedTools[`${message.id}-tools`] ? 
                              <ChevronUp className="w-4 h-4 text-gray-600" /> : 
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            }
                          </button>
                          {expandedTools[`${message.id}-tools`] && (
                            <div className="p-4 space-y-3">
                              {message.streamingResponse.toolResults.map((result: ToolResult, index: number) => (
                                <div key={result.id || index} className="bg-white rounded border p-3">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1">
                                      <h4 className="font-medium text-gray-900 text-sm">{result.title || result.toolName}</h4>
                                      {result.toolName && result.title !== result.toolName && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          Tool: {result.toolName}
                                        </div>
                                      )}
                                    </div>
                                    <CitationBadge index={index} />
                                  </div>
                                  
                                  {result.error && (
                                    <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 rounded">
                                      <span className="font-medium">Error:</span> {result.error}
                                    </div>
                                  )}
                                  
                                  <div className="space-y-1 overflow-hidden">
                                    {result.sentences && result.sentences.map((sentence: string, sentenceIndex: number) => (
                                      <p key={sentenceIndex} className="text-sm text-gray-700 leading-relaxed break-words overflow-wrap-anywhere">
                                        {sentence}
                                      </p>
                                    ))}
                                  </div>
                                  
                                  {result.attribution && (
                                    <div className="text-xs text-gray-500 mt-2 border-t pt-2 overflow-hidden">
                                      <span className="font-medium">Source:</span>
                                      <span className="ml-1 break-all overflow-wrap-anywhere">{result.attribution}</span>
                                    </div>
                                  )}
                                  
                                  {result.metadata && Object.keys(result.metadata).length > 0 && (
                                    <div className="text-xs text-gray-500 mt-2 border-t pt-2">
                                      <span className="font-medium">Metadata:</span>
                                      <div className="grid grid-cols-2 gap-1 mt-1">
                                        {Object.entries(result.metadata).map(([key, value]) => (
                                          <div key={key} className="truncate">
                                            <span className="font-medium">{key}:</span> {value}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Status and Statistics */}
                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">Status: <span className="font-medium">{message.streamingResponse.status}</span></span>
                            {message.streamingResponse.isComplete && (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                {getStatusIcon(message.streamingResponse)}
                                <span className="text-green-600 font-medium">
                                  {message.streamingResponse.finalStatus}
                                </span>
                              </span>
                            )}
                          </div>
                          {message.streamingResponse.toolsUsed && message.streamingResponse.toolsUsed.length > 0 && (
                            <div className="mt-1">
                              Tools used: {message.streamingResponse.toolsUsed.join(', ')} • 
                              Results: {message.streamingResponse.toolResults.length}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Assistant Response with Markdown */}
                    <div className={`bg-white rounded-lg px-3 sm:px-4 py-3 border w-full ${
                      message.hasError ? 'border-red-200 bg-red-50' : 'border-gray-200'
                    }`}>
                      {message.content ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className={`leading-relaxed mb-3 last:mb-0 break-words ${message.hasError ? 'text-red-900' : 'text-gray-900'}`}>{children}</p>,
                              h1: ({ children }) => <h1 className={`text-xl font-semibold mb-3 break-words ${message.hasError ? 'text-red-900' : 'text-gray-900'}`}>{children}</h1>,
                              h2: ({ children }) => <h2 className={`text-lg font-semibold mb-2 break-words ${message.hasError ? 'text-red-900' : 'text-gray-900'}`}>{children}</h2>,
                              h3: ({ children }) => <h3 className={`text-base font-semibold mb-2 break-words ${message.hasError ? 'text-red-900' : 'text-gray-900'}`}>{children}</h3>,
                              ul: ({ children }) => <ul className={`list-disc pl-4 mb-3 ${message.hasError ? 'text-red-900' : 'text-gray-900'}`}>{children}</ul>,
                              ol: ({ children }) => <ol className={`list-decimal pl-4 mb-3 ${message.hasError ? 'text-red-900' : 'text-gray-900'}`}>{children}</ol>,
                              li: ({ children }) => <li className="mb-1">{children}</li>,
                              code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                              pre: ({ children }) => <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm">{children}</pre>,
                              blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-3">{children}</blockquote>,
                              a: ({ href, children }) => <a href={href} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">{children}</a>
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-500">
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm">Generating response...</span>
                        </div>
                      )}
                      
                      {/* Model badge for assistant messages */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                        <ModelBadge model={message.model || selectedModel} />
                        <span className="text-xs text-gray-400">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask me anything about your knowledge base..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[50px] max-h-32"
                  rows={1}
                  disabled={isLoading}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isLoading}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            
            {/* Input hints */}
            <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
              <span>Press Enter to send, Shift+Enter for new line</span>
              <span>Session: {sessionMessageCount} messages</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}