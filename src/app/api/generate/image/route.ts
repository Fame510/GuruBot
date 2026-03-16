import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'
import path from 'path'

// Use z-ai-web-dev-sdk for image generation
export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()
    
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ success: false, error: 'Prompt required' }, { status: 400 })
    }

    console.log('Image request:', prompt.slice(0, 100))
    
    // Initialize Z-AI SDK
    const zai = await ZAI.create()
    
    // Generate image
    const response = await zai.images.generations.create({
      prompt: prompt.slice(0, 500),
      size: '1024x1024'
    })
    
    // Get base64 image data
    const base64Data = response.data?.[0]?.base64
    
    if (!base64Data) {
      throw new Error('No image data returned')
    }
    
    // Save to a temp file and return URL
    const filename = `image-${Date.now()}.png`
    const filepath = path.join(process.cwd(), 'public', 'generated', filename)
    
    // Ensure directory exists
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    // Write the base64 data as image file
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filepath, buffer)
    
    // Return the public URL
    const imageUrl = `/generated/${filename}`
    
    console.log('Image saved:', imageUrl)
    
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
