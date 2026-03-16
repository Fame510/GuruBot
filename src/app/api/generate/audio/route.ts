import { NextRequest, NextResponse } from 'next/server'

// Audio generation - uses browser-native TTS (free, no API key needed)
// The frontend already has full TTS support via Web Speech API
export async function POST(request: NextRequest) {
  try {
    const { prompt, text, voice } = await request.json()
    const content = prompt || text
    
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ success: false, error: 'Text required' }, { status: 400 })
    }

    console.log('Audio request:', content.slice(0, 50))
    
    // Return response for browser-native TTS handling
    // The frontend uses Web Speech API for text-to-speech
    return NextResponse.json({ 
      success: true, 
      text: content,
      voice: voice || 'default',
      useBrowserTTS: true,
      note: 'Audio rendered via browser Web Speech API'
    })

  } catch (error: any) {
    console.error('Audio error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Audio generation failed' 
    }, { status: 500 })
  }
}
