import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

// Test single GPT-5 call with temperature 1
import OpenAI from 'openai';

async function testGPT5() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  try {
    console.log('Testing GPT-5 with temperature 1...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-2025-08-07',
      messages: [
        {
          role: 'user',
          content: 'Return a simple JSON: {"status": "working", "model": "gpt-5"}'
        }
      ],
      temperature: 1, // GPT-5 only supports temperature 1
      max_completion_tokens: 100,
      response_format: { type: 'json_object' }
    });
    
    console.log('✅ Success:', completion.choices[0]?.message?.content);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testGPT5();