import React, { useState, useRef, useEffect } from 'react'
import { Send, X, MessageCircle, Loader } from 'lucide-react'

interface Message {
  role: 'user' | 'ai'
  content: string
  timestamp: Date
}

export default function ChatBox() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('devlink_chat_history')
      if (saved) {
        setMessages(JSON.parse(saved).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })))
      }
    } catch (e) {
      console.log('Could not load chat history')
    }
  }, [])

  // Save chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('devlink_chat_history', JSON.stringify(messages))
    } catch (e) {
      console.log('Could not save chat history')
    }
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input, timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const aiMessage: Message = { 
          role: 'ai', 
          content: data.reply,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, aiMessage])
      } else {
        setError(data.error || 'Failed to get response')
        const errorMessage: Message = {
          role: 'ai',
          content: `Sorry, I encountered an error: ${data.error || 'Unknown error'}. Please try again.`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (err) {
      console.error('Chat error:', err)
      setError('Connection error. Please try again.')
      const errorMessage: Message = {
        role: 'ai',
        content: 'Sorry, I encountered a connection error. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    if (window.confirm('Clear chat history?')) {
      setMessages([])
      setError(null)
    }
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-200 flex items-center justify-center z-40 border-2 border-blue-400"
        title="Chat with DevLink AI"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[32rem] bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col z-40 border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
            <div>
              <h3 className="font-bold text-lg">DevLink AI</h3>
              <p className="text-xs text-blue-100">Always here to help</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="hover:bg-blue-700 p-1 rounded transition"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-3">
                  <MessageCircle className="text-blue-600 dark:text-blue-400" size={32} />
                </div>
                <p className="text-gray-900 dark:text-white font-semibold text-sm">Welcome to DevLink AI!</p>
                <p className="text-gray-600 dark:text-gray-400 text-xs mt-2 max-w-xs">
                  Ask me anything about DevLink, programming, learning paths, or get help with your mentoring journey.
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-4 py-3 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none shadow-md'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none shadow-sm'
                    }`}>
                      <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-xs mt-1 ${
                        msg.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-200 dark:bg-gray-700 px-4 py-3 rounded-lg rounded-bl-none">
                      <div className="flex gap-1 items-center">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs rounded">
              {error}
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Ask me anything..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm transition"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                title="Send message"
              >
                {loading ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition"
              >
                Clear history
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
