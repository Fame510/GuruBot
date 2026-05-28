import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'

// Available models via Vercel AI Gateway (zero-config)
export const FREE_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', context: 128000 },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', context: 128000 },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', context: 200000 },
  { id: 'anthropic/claude-haiku-3.5', name: 'Claude Haiku 3.5', provider: 'Anthropic', context: 200000 },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', context: 1000000 },
  { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', context: 2000000 },
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
    const selectedModel = model || 'openai/gpt-4o-mini'
    
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

async function handleSingleMode(message: string, history: ChatMessage[], model: string) {
  try {
    const msgs = [
      ...history.slice(-20),
      ...(message ? [{ role: 'user' as const, content: message.slice(0, 4000) }] : [])
    ]

    const result = await generateText({
      model,
      system: 'You are Guru, a helpful AI assistant.',
      messages: msgs,
      maxOutputTokens: 2000,
    })

    const response = result.text
    if (!response) {
      return NextResponse.json({ success: false, error: 'No response from model' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      response, 
      model,
      modelName: FREE_MODELS.find(m => m.id === model)?.name || model
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'API error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

async function handleVSMode(message: string, history: ChatMessage[], models: string[]) {
  const results = await Promise.all(models.map(async (modelId) => {
    try {
      const result = await generateText({
        model: modelId,
        system: 'You are Guru, competing against another AI. Be concise but thorough.',
        messages: [
          ...history.slice(-10),
          { role: 'user' as const, content: message.slice(0, 4000) }
        ],
        maxOutputTokens: 1500,
      })

      return { 
        model: modelId, 
        response: result.text,
        modelName: FREE_MODELS.find(m => m.id === modelId)?.name || modelId
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      return { model: modelId, response: null, error: errorMessage, modelName: modelId }
    }
  }))

  const successfulResults = results.filter(r => r.response)
  
  return NextResponse.json({ 
    success: true, 
    mode: 'vs',
    results: successfulResults,
    responses: results.map(r => `**${r.modelName}**: ${r.response || r.error}`).join('\n\n---\n\n')
  })
}

async function handleStackMode(message: string, history: ChatMessage[], models: string[]) {
  let currentResponse = message
  const chain: Array<{ model: string; response: string; modelName: string }> = []

  for (const modelId of models) {
    try {
      const result = await generateText({
        model: modelId,
        system: 'You are an AI that improves and refines the given input. Make it better, clearer, and more helpful.',
        messages: [
          ...history.slice(-10),
          { role: 'user' as const, content: currentResponse.slice(0, 4000) }
        ],
        maxOutputTokens: 1500,
      })

      if (result.text) {
        currentResponse = result.text
        chain.push({ 
          model: modelId, 
          response: result.text, 
          modelName: FREE_MODELS.find(m => m.id === modelId)?.name || modelId 
        })
      }
    } catch {
      // Continue to next model in chain
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
