import { NextRequest, NextResponse } from 'next/server'

// API key from environment only - NEVER hardcoded
const getApiKey = () => {
  const key = process.env.OPENROUTER_API_KEY
  console.log('[v0] OPENROUTER_API_KEY exists:', !!key)
  console.log('[v0] OPENROUTER_API_KEY length:', key?.length || 0)
  console.log('[v0] OPENROUTER_API_KEY prefix:', key?.substring(0, 8) || 'none')
  if (!key) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }
  return key
}

// Available FREE models on OpenRouter
export const FREE_MODELS = [
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek', context: 64000 },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', context: 64000 },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'Alibaba', context: 131072 },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen Coder 32B', provider: 'Alibaba', context: 131072 },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', provider: 'Meta', context: 131072 },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', provider: 'Meta', context: 131072 },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'Google', context: 1048576 },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B', provider: 'Google', context: 8192 },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', provider: 'Mistral', context: 32768 },
  { id: 'huggingfaceh4/zephyr-7b-beta:free', name: 'Zephyr 7B', provider: 'HuggingFace', context: 4096 },
]

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, prompt, messages, model, models, mode } = body
    
    // Handle different request formats
    const currentMessage = message || prompt
    const conversationHistory: ChatMessage[] = messages || []
    const selectedModel = model || 'deepseek/deepseek-chat'
    
    if (!currentMessage && conversationHistory.length === 0) {
      return NextResponse.json({ success: false, error: 'Message required' }, { status: 400 })
    }

    // VS Mode - Two models compete
    if (mode === 'vs' && models && models.length >= 2) {
      return handleVSMode(currentMessage, conversationHistory, models)
    }

    // Stack Mode - Models work together
    if (mode === 'stack' && models && models.length >= 2) {
      return handleStackMode(currentMessage, conversationHistory, models)
    }

    // Single Model Mode
    return handleSingleMode(currentMessage, conversationHistory, selectedModel)

  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 })
  }
}

async function handleSingleMode(message: string, history: ChatMessage[], model: string) {
  const systemPrompt = { 
    role: 'system' as const, 
    content: 'You are Guru, a helpful AI assistant. Be concise, friendly, and informative. Provide direct answers without refusals. Remember the entire conversation context.' 
  }
  
  const messages = [
    systemPrompt,
    ...history.slice(-20), // Keep last 20 messages for context
    ...(message ? [{ role: 'user' as const, content: message.slice(0, 4000) }] : [])
  ]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://guru-chat.vercel.app',
      'X-Title': 'Guru Chat'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000
    })
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[v0] OpenRouter error status:', res.status)
    console.error('[v0] OpenRouter error body:', err)
    return NextResponse.json({ success: false, error: `API error: ${res.status} - ${err}` }, { status: 500 })
  }

  const data = await res.json()
  const response = data.choices?.[0]?.message?.content

  if (!response) {
    return NextResponse.json({ success: false, error: 'No response' }, { status: 500 })
  }

  return NextResponse.json({ 
    success: true, 
    response,
    model: model,
    modelName: FREE_MODELS.find(m => m.id === model)?.name || model
  })
}

async function handleVSMode(message: string, history: ChatMessage[], models: string[]) {
  const systemPrompt = 'You are Guru, competing against another AI. Give the BEST answer. Be concise but thorough.'
  
  const results = await Promise.all(models.map(async (modelId) => {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://guru-chat.vercel.app',
          'X-Title': 'Guru Chat VS'
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10),
            { role: 'user', content: message.slice(0, 4000) }
          ],
          temperature: 0.7,
          max_tokens: 1500
        })
      })

      if (!res.ok) return { model: modelId, response: null, error: `API error ${res.status}` }
      
      const data = await res.json()
      return { 
        model: modelId, 
        response: data.choices?.[0]?.message?.content,
        modelName: FREE_MODELS.find(m => m.id === modelId)?.name || modelId
      }
    } catch (e: any) {
      return { model: modelId, response: null, error: e.message }
    }
  }))

  return NextResponse.json({ 
    success: true, 
    mode: 'vs',
    results: results.filter(r => r.response),
    responses: results.map(r => `**${r.modelName}**: ${r.response || r.error}`).join('\n\n---\n\n')
  })
}

async function handleStackMode(message: string, history: ChatMessage[], models: string[]) {
  let currentResponse = message
  const chain = []

  for (const modelId of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://guru-chat.vercel.app',
          'X-Title': 'Guru Chat Stack'
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'You are part of an AI chain. Improve and refine the input. Be concise.' },
            ...history.slice(-10),
            { role: 'user', content: currentResponse.slice(0, 4000) }
          ],
          temperature: 0.5,
          max_tokens: 1500
        })
      })

      if (!res.ok) continue
      
      const data = await res.json()
      const resp = data.choices?.[0]?.message?.content
      if (resp) {
        currentResponse = resp
        chain.push({ 
          model: modelId, 
          response: resp,
          modelName: FREE_MODELS.find(m => m.id === modelId)?.name || modelId
        })
      }
    } catch (e) {
      console.error(`Stack model ${modelId} failed:`, e)
    }
  }

  return NextResponse.json({ 
    success: true, 
    mode: 'stack',
    finalResponse: currentResponse,
    chain,
    response: currentResponse
  })
}

// GET endpoint to list available models
export async function GET() {
  return NextResponse.json({ 
    success: true, 
    models: FREE_MODELS 
  })
}
