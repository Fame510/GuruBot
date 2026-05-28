import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions'

const getApiKey = () => {
  const key = process.env.SILICONFLOW_API_KEY
  if (!key) {
    throw new Error('SILICONFLOW_API_KEY is not set. Please add it in the Vars section.')
  }
  return key
}

export const FREE_MODELS = [
  { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'DeepSeek', context: 64000 },
  { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'DeepSeek', context: 64000 },
  { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', provider: 'Alibaba', context: 131072 },
  { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen Coder 32B', provider: 'Alibaba', context: 131072 },
  { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', provider: 'Meta', context: 131072 },
  { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', provider: 'Meta', context: 131072 },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: 'Google', context: 8192 },
  { id: 'mistralai/Mistral-7B-Instruct-v0.2', name: 'Mistral 7B', provider: 'Mistral', context: 32768 },
]

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function GET() {
  return NextResponse.json({ models: FREE_MODELS })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, prompt, messages, model, models, mode } = body
    
    const currentMessage = message || prompt
    const conversationHistory: ChatMessage[] = messages || []
    const selectedModel = model || 'deepseek-ai/DeepSeek-V3'
    
    if (!currentMessage && conversationHistory.length === 0) {
      return NextResponse.json({ success: false, error: 'Message required' }, { status: 400 })
    }

    if (mode === 'vs' && models?.length >= 2) {
      return handleVSMode(currentMessage, conversationHistory, models)
    }

    if (mode === 'stack' && models?.length >= 2) {
      return handleStackMode(currentMessage, conversationHistory, models)
    }

    return handleSingleMode(currentMessage, conversationHistory, selectedModel)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed' }, { status: 500 })
  }
}

async function handleSingleMode(message: string, history: ChatMessage[], model: string) {
  const msgs = [
    { role: 'system' as const, content: 'You are Guru, a helpful AI assistant.' },
    ...history.slice(-20),
    ...(message ? [{ role: 'user' as const, content: message.slice(0, 4000) }] : [])
  ]

  const res = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getApiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: msgs, temperature: 0.7, max_tokens: 2000 })
  })

  if (!res.ok) {
    const err = await res.text()
    let errorMessage = `API error (${res.status})`
    try { errorMessage = JSON.parse(err).error?.message || errorMessage } catch {}
    if (res.status === 401) errorMessage = 'Invalid API key.'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }

  const data = await res.json()
  const response = data.choices?.[0]?.message?.content
  if (!response) return NextResponse.json({ success: false, error: 'No response' }, { status: 500 })

  return NextResponse.json({ 
    success: true, response, model,
    modelName: FREE_MODELS.find(m => m.id === model)?.name || model
  })
}

async function handleVSMode(message: string, history: ChatMessage[], models: string[]) {
  const results = await Promise.all(models.map(async (modelId) => {
    try {
      const res = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getApiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'You are Guru, competing against another AI.' },
            ...history.slice(-10),
            { role: 'user', content: message.slice(0, 4000) }
          ],
          temperature: 0.7, max_tokens: 1500
        })
      })
      if (!res.ok) return { model: modelId, response: null, error: `Error ${res.status}` }
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
    success: true, mode: 'vs',
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
        headers: { 'Authorization': `Bearer ${getApiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'Improve and refine the input.' },
            ...history.slice(-10),
            { role: 'user', content: currentResponse.slice(0, 4000) }
          ],
          temperature: 0.5, max_tokens: 1500
        })
      })
      if (!res.ok) continue
      const data = await res.json()
      const resp = data.choices?.[0]?.message?.content
      if (resp) {
        currentResponse = resp
        chain.push({ model: modelId, response: resp, modelName: FREE_MODELS.find(m => m.id === modelId)?.name || modelId })
      }
    } catch {}
  }

  return NextResponse.json({ success: true, mode: 'stack', finalResponse: currentResponse, chain, response: currentResponse })
}
