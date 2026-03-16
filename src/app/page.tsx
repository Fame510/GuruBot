'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Send, Bot, User, Mic, MicOff, Volume2, VolumeX, Trash2, Share2, Copy, Check, 
  ImageIcon, Video, Music, Download, Square, RefreshCw, ChevronDown, Layers, 
  Swords, Settings, Save, MessageSquare, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'

type ModeType = 'chat' | 'image' | 'video' | 'audio'
type ChatModeType = 'single' | 'stack' | 'vs'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  type: 'text' | 'image' | 'video' | 'audio'
  mediaUrl?: string
  error?: boolean
  model?: string
  modelName?: string
  chain?: { model: string; modelName: string; response: string }[]
  vsResults?: { model: string; modelName: string; response: string }[]
}

interface Model {
  id: string
  name: string
  provider: string
  context: number
}

// Make URLs clickable
const renderContent = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) => 
    part.match(urlRegex) 
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-red-300 underline hover:text-red-200 break-all">{part}</a> 
      : part
  )
}

export default function GuruChat() {
  // Messages with persistent storage
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ModeType>('chat')
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  // Model selection
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('deepseek/deepseek-chat')
  const [chatMode, setChatMode] = useState<ChatModeType>('single')
  const [stackModels, setStackModels] = useState<string[]>(['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'])
  const [vsModels, setVsModels] = useState<string[]>(['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'])
  
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('guru-chat-messages')
    if (saved) {
      try {
        setMessages(JSON.parse(saved))
      } catch {}
    }
    
    // Load saved model preference
    const savedModel = localStorage.getItem('guru-chat-model')
    if (savedModel) setSelectedModel(savedModel)
  }, [])

  // Save messages to localStorage when changed
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('guru-chat-messages', JSON.stringify(messages))
    }
  }, [messages])

  // Save model preference
  useEffect(() => {
    localStorage.setItem('guru-chat-model', selectedModel)
  }, [selectedModel])

  // Fetch available models
  useEffect(() => {
    fetch('/api/chat')
      .then(res => res.json())
      .then(data => {
        if (data.models) setModels(data.models)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis
    }
    return () => synthRef.current?.cancel()
  }, [])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Voice Input
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error('Voice input not supported')
      return
    }
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = false
    recognitionRef.current.interimResults = false
    recognitionRef.current.lang = 'en-US'
    recognitionRef.current.onstart = () => setIsListening(true)
    recognitionRef.current.onresult = (e: any) => {
      setInput(e.results[0][0].transcript)
      setIsListening(false)
    }
    recognitionRef.current.onerror = () => {
      setIsListening(false)
      toast.error('Could not understand')
    }
    recognitionRef.current.onend = () => setIsListening(false)
    recognitionRef.current.start()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  // Voice Output with recording capability
  const speak = useCallback((text: string, record = false) => {
    if (!synthRef.current) return
    synthRef.current.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''))
    utterance.rate = 1
    
    if (record) {
      // Use MediaRecorder to capture audio
      try {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          mediaRecorderRef.current = new MediaRecorder(stream)
          audioChunksRef.current = []
          
          mediaRecorderRef.current.ondataavailable = (e) => {
            audioChunksRef.current.push(e.data)
          }
          
          mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
            const url = URL.createObjectURL(blob)
            downloadFile(url, `guru-speech-${Date.now()}.webm`)
            stream.getTracks().forEach(t => t.stop())
          }
          
          mediaRecorderRef.current.start()
          
          utterance.onend = () => {
            setIsSpeaking(false)
            mediaRecorderRef.current?.stop()
          }
          
          synthRef.current.speak(utterance)
          setIsSpeaking(true)
        }).catch(() => {
          toast.error('Could not access microphone for recording')
          synthRef.current.speak(utterance)
        })
      } catch {
        synthRef.current.speak(utterance)
      }
    } else {
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      synthRef.current.speak(utterance)
    }
  }, [])

  const stopSpeaking = () => {
    synthRef.current?.cancel()
    setIsSpeaking(false)
  }

  // Utilities
  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('Copied!')
  }

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const downloadMedia = async (url: string, filename: string) => {
    try {
      toast.info('Downloading...')
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      downloadFile(blobUrl, filename)
      toast.success('Downloaded!')
    } catch {
      // Try direct download
      downloadFile(url, filename)
    }
  }

  const shareChat = async () => {
    if (messages.length === 0) return toast.error('No messages to share')
    
    const text = '🧙 Guru Chat Conversation\n\n' + 
      messages.map(m => `${m.role === 'user' ? '👤 You' : '🤖 Guru'}: ${m.content}`).join('\n\n')
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Guru Chat', text })
      } catch {
        await navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard!')
      }
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    }
  }

  const exportChat = () => {
    if (messages.length === 0) return toast.error('No messages to export')
    
    const data = {
      exportedAt: new Date().toISOString(),
      messages: messages
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadFile(URL.createObjectURL(blob), `guru-chat-export-${Date.now()}.json`)
    toast.success('Chat exported!')
  }

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem('guru-chat-messages')
    stopSpeaking()
    toast.success('Chat cleared')
  }

  const stopGeneration = () => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
    toast.success('Stopped')
  }

  // Send Message
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userText = input.trim()
    setInput('')
    setIsLoading(true)
    abortControllerRef.current = new AbortController()

    const userMsg: Message = { 
      id: `u-${Date.now()}`, 
      role: 'user', 
      content: userText, 
      type: 'text' 
    }
    
    setMessages(prev => [...prev, userMsg])

    try {
      // Audio mode - use browser TTS with recording
      if (mode === 'audio') {
        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `🔊 Speaking: "${userText.slice(0, 50)}${userText.length > 50 ? '...' : ''}"`,
          type: 'audio',
          mediaUrl: 'browser-tts'
        }
        setMessages(prev => [...prev, assistantMsg])
        speak(userText)
        setIsLoading(false)
        return
      }

      // Image mode
      if (mode === 'image') {
        const res = await fetch('/api/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userText }),
          signal: abortControllerRef.current.signal
        })
        
        const data = await res.json()
        
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Image generation failed')
        }
        
        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `🖼️ Generated image for: "${userText.slice(0, 50)}"`,
          type: 'image',
          mediaUrl: data.imageUrl
        }
        
        setMessages(prev => [...prev, assistantMsg])
        setIsLoading(false)
        return
      }

      // Video mode - async with polling
      if (mode === 'video') {
        // Start video generation
        const res = await fetch('/api/generate/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userText }),
          signal: abortControllerRef.current.signal
        })
        
        const data = await res.json()
        
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Video generation failed')
        }
        
        const taskId = data.taskId
        const tempMsgId = `a-${Date.now()}`
        
        // Add placeholder message
        setMessages(prev => [...prev, {
          id: tempMsgId,
          role: 'assistant',
          content: `🎬 Generating video: "${userText.slice(0, 50)}"\n\n⏳ This takes 1-2 minutes...`,
          type: 'video',
          mediaUrl: ''
        }])
        
        setIsLoading(false)
        
        // Poll for video completion
        const pollForVideo = async () => {
          const maxPolls = 60 // 5 minutes max
          for (let i = 0; i < maxPolls; i++) {
            await new Promise(r => setTimeout(r, 5000))
            
            try {
              const statusRes = await fetch(`/api/generate/video?taskId=${taskId}`)
              const statusData = await statusRes.json()
              
              if (statusData.status === 'SUCCESS' && statusData.videoUrl) {
                setMessages(prev => prev.map(m => 
                  m.id === tempMsgId 
                    ? { ...m, content: `🎬 Video ready: "${userText.slice(0, 50)}"`, mediaUrl: statusData.videoUrl }
                    : m
                ))
                toast.success('Video ready!')
                return
              }
              
              if (statusData.status === 'FAIL') {
                setMessages(prev => prev.map(m => 
                  m.id === tempMsgId 
                    ? { ...m, content: `❌ Video generation failed`, error: true }
                    : m
                ))
                return
              }
              
              // Update progress
              setMessages(prev => prev.map(m => 
                m.id === tempMsgId 
                  ? { ...m, content: `🎬 Generating video: "${userText.slice(0, 50)}"\n\n⏳ Processing... (${i + 1}/${maxPolls})` }
                  : m
              ))
            } catch {
              // Continue polling on error
            }
          }
          
          // Timeout
          setMessages(prev => prev.map(m => 
            m.id === tempMsgId 
              ? { ...m, content: `⏱️ Video taking too long. Task ID: ${taskId}`, error: true }
              : m
          ))
        }
        
        pollForVideo()
        return
      }

      // Chat mode with memory
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          messages: messages.slice(-20).map(m => ({
            role: m.role,
            content: m.content
          })),
          model: selectedModel,
          models: chatMode === 'single' ? [selectedModel] : chatMode === 'stack' ? stackModels : vsModels,
          mode: chatMode
        }),
        signal: abortControllerRef.current.signal
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Request failed')
      }

      // Handle different response modes
      let assistantContent = data.response
      let assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        type: 'text',
        model: data.model,
        modelName: data.modelName
      }

      if (chatMode === 'vs' && data.results) {
        assistantContent = data.responses
        assistantMsg.content = assistantContent
        assistantMsg.vsResults = data.results
      } else if (chatMode === 'stack' && data.chain) {
        assistantMsg.chain = data.chain
      }

      setMessages(prev => [...prev, assistantMsg])
      
      if (speechEnabled) {
        speak(assistantContent)
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return
      
      const errorMsg = err.message || 'Error'
      setMessages(prev => [...prev, { 
        id: `a-${Date.now()}`, role: 'assistant', 
        content: `❌ ${errorMsg}`, 
        type: 'text', error: true 
      }])
      toast.error(errorMsg)
    }

    setIsLoading(false)
  }

  const renderMessage = (msg: Message) => {
    if (msg.type === 'image' && msg.mediaUrl) {
      return (
        <div className="space-y-2">
          <img 
            src={msg.mediaUrl} 
            alt="Generated" 
            className="rounded-lg max-w-full max-h-80 w-auto"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/logo.svg'
            }}
          />
        </div>
      )
    }
    
    if (msg.type === 'video' && msg.mediaUrl) {
      return (
        <div className="space-y-2">
          <video 
            src={msg.mediaUrl} 
            controls 
            className="rounded-lg max-w-full max-h-80 w-auto"
            poster="/logo.svg"
          >
            Your browser does not support video.
          </video>
          <p className="text-xs text-zinc-500">⏳ If video doesn't load, wait 30-60 seconds and refresh</p>
        </div>
      )
    }
    
    if (msg.type === 'audio' && msg.mediaUrl === 'browser-tts') {
      return (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap">{renderContent(msg.content)}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => speak(msg.content.replace('🔊 Speaking: ', '').replace('"', ''), true)}>
              <Save className="w-3 h-3 mr-1" /> Save Audio
            </Button>
          </div>
        </div>
      )
    }
    
    if (msg.type === 'audio' && msg.mediaUrl) {
      return <audio src={msg.mediaUrl} controls className="w-full max-w-md" />
    }
    
    // VS Mode display
    if (msg.vsResults && msg.vsResults.length > 0) {
      return (
        <div className="space-y-4">
          {msg.vsResults.map((result, i) => (
            <div key={i} className="p-3 rounded-lg bg-zinc-700/50 border border-zinc-600">
              <div className="flex items-center gap-2 mb-2">
                <Swords className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">{result.modelName}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{renderContent(result.response)}</p>
            </div>
          ))}
        </div>
      )
    }
    
    // Stack Mode display
    if (msg.chain && msg.chain.length > 0) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
            <Layers className="w-3 h-3" />
            <span>Processed through {msg.chain.length} models</span>
          </div>
          <p className="whitespace-pre-wrap">{renderContent(msg.content)}</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-400">View processing chain</summary>
            <div className="mt-2 space-y-2 pl-2 border-l-2 border-zinc-700">
              {msg.chain.map((step, i) => (
                <div key={i} className="text-zinc-500">
                  <span className="text-red-400">{step.modelName}:</span> {step.response.slice(0, 100)}...
                </div>
              ))}
            </div>
          </details>
        </div>
      )
    }
    
    return <p className="whitespace-pre-wrap">{renderContent(msg.content)}</p>
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col">
      {/* Header */}
      <header className="bg-zinc-800 border-b border-zinc-700 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Guru Chat</h1>
              <p className="text-zinc-500 text-xs flex items-center gap-2">
                {mode === 'chat' && (
                  <>
                    {chatMode === 'single' && models.find(m => m.id === selectedModel)?.name}
                    {chatMode === 'stack' && `Stack: ${stackModels.length} models`}
                    {chatMode === 'vs' && `VS: ${vsModels.length} models`}
                  </>
                )}
                {mode === 'image' && 'Image Generation'}
                {mode === 'video' && 'Video Generation'}
                {mode === 'audio' && 'Text to Speech'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {isSpeaking && (
              <Button variant="ghost" size="icon" onClick={stopSpeaking} className="text-red-400">
                <Square className="w-4 h-4" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSpeechEnabled(!speechEnabled)} 
              className={speechEnabled ? 'text-red-400' : 'text-zinc-500'}
            >
              {speechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={exportChat} disabled={messages.length === 0} className="text-zinc-500">
              <Save className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={shareChat} disabled={messages.length === 0} className="text-zinc-500">
              <Share2 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={clearChat} disabled={messages.length === 0} className="text-zinc-500 hover:text-red-400">
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Chat */}
      <main ref={chatRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-red-500 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-red-500/30">
                <Bot className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-white text-3xl font-bold mb-2">Guru Chat</h2>
              <p className="text-zinc-400 mb-8">Your AI assistant with memory</p>
              
              {/* Mode Selection */}
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {[
                  { id: 'chat', icon: MessageSquare, label: 'Chat' }, 
                  { id: 'image', icon: ImageIcon, label: 'Image' }, 
                  { id: 'video', icon: Video, label: 'Video' }, 
                  { id: 'audio', icon: Music, label: 'Audio' }
                ].map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => setMode(m.id as ModeType)} 
                    className={`px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 transition-all ${
                      mode === m.id 
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    <m.icon className="w-4 h-4" /> {m.label}
                  </button>
                ))}
              </div>

              {/* Chat Mode Selection (only in chat mode) */}
              {mode === 'chat' && (
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                  {[
                    { id: 'single', icon: Sparkles, label: 'Single Model' }, 
                    { id: 'stack', icon: Layers, label: 'Stack Models' }, 
                    { id: 'vs', icon: Swords, label: 'VS Battle' }
                  ].map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => setChatMode(m.id as ChatModeType)} 
                      className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                        chatMode === m.id 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                          : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                      }`}
                    >
                      <m.icon className="w-3 h-3" /> {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Start Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg mx-auto">
                {mode === 'chat' && (
                  <>
                    <button 
                      onClick={() => { setInput('Tell me a creative joke') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"Tell me a creative joke"</p>
                    </button>
                    <button 
                      onClick={() => { setInput('Explain quantum computing simply') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"Explain quantum computing simply"</p>
                    </button>
                  </>
                )}
                {mode === 'image' && (
                  <>
                    <button 
                      onClick={() => { setInput('A majestic lion in space suit') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"A majestic lion in space suit"</p>
                    </button>
                    <button 
                      onClick={() => { setInput('Cyberpunk city at sunset') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"Cyberpunk city at sunset"</p>
                    </button>
                  </>
                )}
                {mode === 'video' && (
                  <>
                    <button 
                      onClick={() => { setInput('A cat playing piano') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"A cat playing piano"</p>
                    </button>
                    <button 
                      onClick={() => { setInput('Ocean waves at sunset') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"Ocean waves at sunset"</p>
                    </button>
                  </>
                )}
                {mode === 'audio' && (
                  <>
                    <button 
                      onClick={() => { setInput('Welcome to Guru Chat!') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"Welcome to Guru Chat!"</p>
                    </button>
                    <button 
                      onClick={() => { setInput('The quick brown fox jumps over the lazy dog') }} 
                      className="p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 border border-zinc-700/50 text-left"
                    >
                      <p className="text-white text-sm">"The quick brown fox..."</p>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                    <Card className={`p-4 ${
                      msg.role === 'user' 
                        ? 'bg-red-500 text-white' 
                        : msg.error 
                          ? 'bg-red-900/30 text-red-200 border border-red-800' 
                          : 'bg-zinc-800 text-white'
                    }`}>
                      {renderMessage(msg)}
                    </Card>
                    
                    {msg.role === 'assistant' && !msg.error && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => speak(msg.content)} 
                          className="h-7 px-2 text-zinc-500 hover:text-white"
                        >
                          <Volume2 className="w-3 h-3" />
                        </Button>
                        {msg.mediaUrl && msg.type !== 'audio' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => downloadMedia(msg.mediaUrl!, `guru-${msg.type}-${Date.now()}.${msg.type === 'video' ? 'mp4' : 'png'}`)} 
                            className="h-7 px-2 text-zinc-500 hover:text-white"
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => copyToClipboard(msg.content, msg.id)} 
                          className="h-7 px-2 text-zinc-500 hover:text-white"
                        >
                          {copiedId === msg.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        </Button>
                        {msg.modelName && (
                          <span className="text-xs text-zinc-600 px-2 py-1">{msg.modelName}</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {msg.role === 'user' && (
                    <div className="w-9 h-9 rounded-xl bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <Card className="bg-zinc-800 text-white p-4">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
                      <span className="text-zinc-400">
                        {mode === 'image' ? 'Creating image...' : 
                         mode === 'video' ? 'Generating video (may take 30-60s)...' : 
                         mode === 'audio' ? 'Converting to speech...' : 
                         chatMode === 'vs' ? 'Models competing...' :
                         chatMode === 'stack' ? 'Models processing...' :
                         'Thinking...'}
                      </span>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Input Footer */}
      <footer className="bg-zinc-800 border-t border-zinc-700 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Mode Buttons */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {/* Generation Mode */}
            <div className="flex gap-1">
              {[
                { id: 'chat', label: 'Chat' }, 
                { id: 'image', label: 'Image' }, 
                { id: 'video', label: 'Video' }, 
                { id: 'audio', label: 'Audio' }
              ].map(m => (
                <button 
                  key={m.id} 
                  onClick={() => setMode(m.id as ModeType)} 
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                    mode === m.id ? 'bg-red-500 text-white' : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            
            {/* Model Selection (Chat mode only) */}
            {mode === 'chat' && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 bg-zinc-700 border-zinc-600 text-zinc-300">
                      <Settings className="w-3 h-3 mr-1" />
                      {chatMode === 'single' ? models.find(m => m.id === selectedModel)?.name || 'Model' : chatMode.toUpperCase()}
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-800 border-zinc-700 max-h-80 overflow-y-auto">
                    <DropdownMenuLabel className="text-zinc-400">Chat Mode</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setChatMode('single')} className="text-zinc-300 focus:bg-zinc-700">
                      <Sparkles className="w-4 h-4 mr-2" /> Single Model
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setChatMode('stack')} className="text-zinc-300 focus:bg-zinc-700">
                      <Layers className="w-4 h-4 mr-2" /> Stack Models
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setChatMode('vs')} className="text-zinc-300 focus:bg-zinc-700">
                      <Swords className="w-4 h-4 mr-2" /> VS Battle
                    </DropdownMenuItem>
                    
                    {chatMode === 'single' && (
                      <>
                        <DropdownMenuSeparator className="bg-zinc-700" />
                        <DropdownMenuLabel className="text-zinc-400">Select Model</DropdownMenuLabel>
                        {models.map(m => (
                          <DropdownMenuItem 
                            key={m.id} 
                            onClick={() => setSelectedModel(m.id)}
                            className={`text-zinc-300 focus:bg-zinc-700 ${selectedModel === m.id ? 'bg-red-500/20 text-red-400' : ''}`}
                          >
                            <span className="mr-2">{m.provider}</span>
                            <span className="font-medium">{m.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
          
          {/* Input Row */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={isListening ? stopListening : startListening} 
              className={`h-12 w-12 flex-shrink-0 ${
                isListening 
                  ? 'bg-red-500 border-red-500 text-white animate-pulse' 
                  : 'bg-zinc-700 border-zinc-600 text-zinc-400'
              }`}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            
            <Input 
              ref={inputRef} 
              placeholder={
                mode === 'chat' ? 'Message Guru...' : 
                mode === 'image' ? 'Describe image...' : 
                mode === 'video' ? 'Describe video...' : 
                'Text to speak...'
              } 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && !isLoading && sendMessage()} 
              className="bg-zinc-700 border-zinc-600 text-white h-12" 
              disabled={isLoading || isListening} 
            />
            
            {isLoading ? (
              <Button 
                onClick={stopGeneration} 
                className="h-12 w-12 flex-shrink-0 bg-red-500 hover:bg-red-600 text-white"
              >
                <Square className="w-5 h-5" />
              </Button>
            ) : (
              <Button 
                onClick={sendMessage} 
                disabled={!input.trim()} 
                className="h-12 w-12 flex-shrink-0 bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
