 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 interface TTSRequest {
   text: string;
   voiceId: string;
   modelId?: string;
 }
 
 const handler = async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response("ok", { headers: corsHeaders });
   }
 
   try {
     const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
     if (!ELEVENLABS_API_KEY) {
       throw new Error("ELEVENLABS_API_KEY is not configured");
     }
 
     const { text, voiceId, modelId = "eleven_multilingual_v2" }: TTSRequest = await req.json();
 
     if (!text || !voiceId) {
       throw new Error("Missing required fields: text, voiceId");
     }
 
     console.log(`Generating TTS for voice ${voiceId}, text length: ${text.length}`);
 
     const response = await fetch(
       `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
       {
         method: "POST",
         headers: {
           "xi-api-key": ELEVENLABS_API_KEY,
           "Content-Type": "application/json",
         },
         body: JSON.stringify({
           text,
           model_id: modelId,
           voice_settings: {
             stability: 0.5,
             similarity_boost: 0.75,
             style: 0.3,
             use_speaker_boost: true,
           },
         }),
       }
     );
 
     if (!response.ok) {
       const errorText = await response.text();
       console.error("ElevenLabs API error:", response.status, errorText);
       throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
     }
 
     const audioBuffer = await response.arrayBuffer();
     const audioBase64 = base64Encode(audioBuffer);
 
     console.log("TTS generated successfully, audio size:", audioBuffer.byteLength);
 
     return new Response(
       JSON.stringify({
         success: true,
         audioContent: audioBase64,
       }),
       {
         status: 200,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   } catch (error: any) {
     console.error("Error in elevenlabs-tts:", error);
     return new Response(
       JSON.stringify({ error: error.message }),
       {
         status: 500,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   }
 };
 
 serve(handler);