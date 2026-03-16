import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Video generation using z-ai-web-dev-sdk
// This creates a task and returns immediately with task ID
// Frontend should poll /api/generate/video/status for results
export async function POST(request: NextRequest) {
  try {
    const { prompt, taskId } = await request.json()
    
    // If taskId is provided, check status
    if (taskId) {
      return checkVideoStatus(taskId)
    }
    
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ success: false, error: 'Prompt required' }, { status: 400 })
    }

    console.log('Video request:', prompt.slice(0, 100))
    
    // Initialize Z-AI SDK
    const zai = await ZAI.create()
    
    // Create video generation task
    const videoResponse = await zai.video.generations.create({
      prompt: prompt.slice(0, 500),
      quality: 'speed',
      duration: 5,
      fps: 30
    })
    
    const newTaskId = videoResponse.id
    
    if (!newTaskId) {
      throw new Error('No task ID returned')
    }
    
    console.log('Video task created:', newTaskId, 'Status:', videoResponse.task_status)
    
    // Return task ID for polling
    return NextResponse.json({ 
      success: true, 
      taskId: newTaskId,
      status: videoResponse.task_status,
      prompt,
      message: 'Video generation started. Poll for status.'
    })

  } catch (error: any) {
    console.error('Video error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Video generation failed' 
    }, { status: 500 })
  }
}

// Check video generation status
async function checkVideoStatus(taskId: string) {
  try {
    const zai = await ZAI.create()
    const result = await zai.async.result.query(taskId)
    
    console.log('Video status check:', taskId, 'Status:', result.task_status)
    
    if (result.task_status === 'SUCCESS') {
      const videoUrl = result.video_url || 
                       result.video_result?.[0]?.url || 
                       result.url || 
                       result.video
      
      return NextResponse.json({ 
        success: true,
        status: 'SUCCESS',
        videoUrl,
        taskId
      })
    }
    
    if (result.task_status === 'FAIL') {
      return NextResponse.json({ 
        success: false,
        status: 'FAIL',
        error: 'Video generation failed'
      })
    }
    
    // Still processing
    return NextResponse.json({ 
      success: true,
      status: 'PROCESSING',
      taskId,
      message: 'Video still processing...'
    })
    
  } catch (error: any) {
    console.error('Video status check error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Status check failed' 
    }, { status: 500 })
  }
}

// GET endpoint for status polling
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  
  if (!taskId) {
    return NextResponse.json({ success: false, error: 'taskId required' }, { status: 400 })
  }
  
  return checkVideoStatus(taskId)
}
