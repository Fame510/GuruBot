import { NextRequest, NextResponse } from 'next/server'

// SiliconFlow API configuration
const API_BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions'

// API key from environment only - NEVER hardcoded
const getApiKey = () => {
  const key = process.env.SILICONFLOW_API_KEY
  if (!key) {
    throw new Error('SILICONFLOW_API_KEY is not set. Please add it in the Vars section (settings button in top right).')
  }
  return key
}

// Available models on SiliconFlow
export const FREE_MODELS = [
  { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'DeepSeek', context: 64000 },
  { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'DeepSeek', context: 64000 },
  { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: 'Alibaba', context: 131072 },
  { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen Coder 32B', provider: 'Alibaba', context: 131072 },
  { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', provider: 'Meta', context: 131072 },
  { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', provider: 'Meta', context: 131072 },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: 'Google', context: 8192 },
  { id: 'mistralai/Mistral-7B-Instruct-v0.2', name: 'Mistral 7B', provider: 'Mistral', context: 32768 },
  { id: 'THUDM/glm-4-9b-chat', name: 'GLM-4 9B', provider: 'Zhipu', context: 128000 },
  { id: 'internlm/internlm2_5-7b-chat', name: 'InternLM 2.5 7B', provider: 'Shanghai AI Lab', context: 32768 },
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
    const selectedModel = model || 'deepseek-ai/DeepSeek-V3'
    
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

  const res = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
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
    let errorMessage = `SiliconFlow API error (${res.status})`
    try {
      const errorData = JSON.parse(err)
      if (errorData.error?.message) {
        errorMessage = errorData.error.message
      } else if (errorData.message) {
        errorMessage = errorData.message
      }
    } catch {
      errorMessage = err || errorMessage
    }
    
    // Provide helpful messages for common errors
    if (res.status === 401) {
      errorMessage = 'Invalid API key. Please check your SILICONFLOW_API_KEY is correct.'
    } else if (res.status === 402 || res.status === 403) {
      errorMessage = 'Insufficient balance or access denied. Please check your SiliconFlow account.'
    } else if (res.status === 429) {
      errorMessage = 'Rate limited. Please wait a moment and try again.'
    }
    
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
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
      const res = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
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
      const res = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
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
