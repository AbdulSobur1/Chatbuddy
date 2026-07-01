// ────────────────────────────────────────────────────────────
// ChatBuddy — Supabase Edge Function: smart-reply
// Deploy via: supabase functions deploy smart-reply --no-verify-jwt
//
// Called after receiving a new message. Takes the last 3
// messages as context and returns 3 short reply suggestions.
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

interface SmartReplyRequest {
  contextMessages: { role: string; content: string }[]
}

serve(async (req) => {
  try {
    // ── 1. Authenticate user via Supabase JWT ───────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const token = authHeader.replace('Bearer ', '')

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    })

    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Parse request ────────────────────────────────────
    const { contextMessages }: SmartReplyRequest = await req.json()

    if (!contextMessages || contextMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'Context messages required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Build prompt for Claude ──────────────────────────
    const conversationText = contextMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n')

    const messages = [
      {
        role: 'system',
        content: `You are a smart reply generator for a chat app. Given the last messages in a conversation, generate 3 short reply suggestions (max 8 words each) that the user could tap to respond. The suggestions should be natural, conversational, and contextually relevant. Respond ONLY with a JSON array of 3 strings, nothing else. Example: ["Sounds good!", "I'll check it out", "Thanks!"]`,
      },
      {
        role: 'user',
        content: `Last messages:\n${conversationText}\n\nGenerate 3 reply suggestions:`,
      },
    ]

    // ── 4. Call Anthropic Claude API ───────────────────────
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages,
      }),
    })

    if (!claudeRes.ok) {
      console.error('Claude API error:', claudeRes.status)
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeRes.json()
    const replyText = claudeData.content?.[0]?.text || '[]'

    // Parse the JSON response safely
    let suggestions: string[] = []
    try {
      suggestions = JSON.parse(replyText)
      if (!Array.isArray(suggestions)) suggestions = []
    } catch {
      // If Claude didn't return valid JSON, try to extract suggestions from text
      suggestions = replyText
        .split('\n')
        .map((l: string) => l.replace(/^\d+[\)\.]\s*/, '').replace(/^["']|["']$/g, '').trim())
        .filter((l: string) => l.length > 0 && l.length <= 60)
        .slice(0, 3)
    }

    // Limit to 3 suggestions, each max 8 words
    suggestions = suggestions.slice(0, 3).map((s: string) => {
      const words = s.split(' ')
      if (words.length > 8) return words.slice(0, 8).join(' ') + '...'
      return s
    })

    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('smart-reply error:', error)
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
