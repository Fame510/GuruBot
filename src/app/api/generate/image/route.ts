import { NextRequest, NextResponse } from 'next/server'

// Image generation using Pollinations.ai (free, no API key needed)
export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()
    
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ success: false, error: 'Prompt required' }, { status: 400 })
    }

    console.log('Image request:', prompt.slice(0, 100))
    
    // Use Pollinations.ai - free image generation API
    const encodedPrompt = encodeURIComponent(prompt.slice(0, 500))
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`
    
    // Verify the URL works by making a HEAD request
    const checkRes = await fetch(imageUrl, { method: 'HEAD' })
    
    if (!checkRes.ok) {
      throw new Error('Image generation service unavailable')
    }
    
    console.log('Image URL generated:', imageUrl)
    
    return NextResponse.json({ 
      success: true, 
      imageUrl,
      prompt
    })

  } catch (error: any) {
    console.error('Image error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Image generation failed' 
    }, { status: 500 })
  }
}
