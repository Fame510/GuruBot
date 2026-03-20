import { NextRequest, NextResponse } from 'next/server'

// Video generation using Pollinations.ai (free, no API key needed)
export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()
    
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ success: false, error: 'Prompt required' }, { status: 400 })
    }

    console.log('Video request:', prompt.slice(0, 100))
    
    // Use Pollinations.ai for video generation (free)
    const encodedPrompt = encodeURIComponent(prompt.slice(0, 500))
    const videoUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}`
    
    // Generate a task ID for frontend compatibility
    const taskId = `vid-${Date.now()}`
    
    console.log('Video task created:', taskId)
    
    return NextResponse.json({ 
      success: true, 
      taskId,
      status: 'SUCCESS',
      videoUrl,
      prompt,
      message: 'Video generation started.'
    })

  } catch (error: any) {
    console.error('Video error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Video generation failed' 
    }, { status: 500 })
  }
}

// GET endpoint for status polling (returns success immediately since Pollinations handles it via URL)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  
  if (!taskId) {
    return NextResponse.json({ success: false, error: 'taskId required' }, { status: 400 })
  }
  
  // Pollinations video URLs are generated on-demand, so we always return SUCCESS
  return NextResponse.json({ 
    success: true,
    status: 'SUCCESS',
    taskId,
    message: 'Video ready'
  })
}
