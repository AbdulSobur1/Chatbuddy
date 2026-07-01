// ────────────────────────────────────────────────────────────
// ChatBuddy — Supabase Edge Function: transcribe
// Deploy via: supabase functions deploy transcribe --no-verify-jwt
//
// Downloads a voice note audio file from Supabase Storage and
// sends it to OpenAI Whisper for transcription. Stores the
// transcript in the voice_note_transcripts table.
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

interface TranscribeRequest {
  fileUrl: string
  messageId: string
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
    const { fileUrl, messageId }: TranscribeRequest = await req.json()

    if (!fileUrl || !messageId) {
      return new Response(JSON.stringify({ error: 'fileUrl and messageId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Download the audio file ──────────────────────────
    const audioRes = await fetch(fileUrl)
    if (!audioRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to download audio file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const audioBlob = await audioRes.blob()

    // ── 4. Send to OpenAI Whisper API ───────────────────────
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const formData = new FormData()
    formData.append('file', audioBlob, 'voice-note.m4a')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'json')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    })

    if (!whisperRes.ok) {
      const errorText = await whisperRes.text()
      console.error('Whisper API error:', whisperRes.status, errorText)
      return new Response(JSON.stringify({ error: 'Transcription service unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const whisperData = await whisperRes.json()
    const transcript = whisperData.text || ''

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'No transcript returned' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Store the transcript ─────────────────────────────
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/voice_note_transcripts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        message_id: messageId,
        transcript,
      }),
    })

    if (!upsertRes.ok) {
      console.error('Failed to store transcript:', await upsertRes.text())
    }

    return new Response(JSON.stringify({ transcript }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('transcribe error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
