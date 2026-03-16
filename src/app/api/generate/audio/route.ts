import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'
import path from 'path'

// Audio generation using z-ai-web-dev-sdk TTS
export async function POST(request: NextRequest) {
  try {
    const { prompt, text, voice } = await request.json()
    const content = prompt || text
    
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ success: false, error: 'Text required' }, { status: 400 })
    }

    console.log('Audio request:', content.slice(0, 50))
    
    // Initialize Z-AI SDK
    const zai = await ZAI.create()
    
    // Generate audio using TTS
    const response = await zai.audio.tts.create({
      input: content.slice(0, 2000),
      voice: voice || 'alloy'
    })
    
    // Get audio data - it might be a buffer or have audio content
    let audioBuffer: Buffer | null = null
    
    if (Buffer.isBuffer(response)) {
      audioBuffer = response
    } else if (response.buffer) {
      audioBuffer = Buffer.from(response.buffer)
    } else if (response.data) {
      // If it's base64 encoded
      if (typeof response.data === 'string') {
        audioBuffer = Buffer.from(response.data, 'base64')
      } else if (Buffer.isBuffer(response.data)) {
        audioBuffer = response.data
      } else if (response.data.buffer) {
        audioBuffer = Buffer.from(response.data.buffer)
      }
    } else if (typeof response === 'string') {
      // Might be base64 string directly
      audioBuffer = Buffer.from(response, 'base64')
    }
    
    if (!audioBuffer) {
      // Fallback: return the raw response for client-side handling
      console.log('TTS response structure:', Object.keys(response))
      return NextResponse.json({ 
        success: true, 
        text: content,
        note: 'Audio generated via browser TTS',
        useBrowserTTS: true
      })
    }
    
    // Save to a file
    const filename = `audio-${Date.now()}.mp3`
    const filepath = path.join(process.cwd(), 'public', 'generated', filename)
    
    // Ensure directory exists
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    fs.writeFileSync(filepath, audioBuffer)
    
    const audioUrl = `/generated/${filename}`
    
    console.log('Audio saved:', audioUrl)
    
    return NextResponse.json({ 
      success: true, 
      audioUrl,
      text: content,
      voice
    })

  } catch (error: any) {
    console.error('Audio error:', error)
    // Fallback to browser TTS
    return NextResponse.json({ 
      success: true, 
      text: prompt || text,
      note: 'Using browser TTS',
      useBrowserTTS: true
    })
  }
}
