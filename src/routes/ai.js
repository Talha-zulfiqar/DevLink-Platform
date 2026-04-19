const express = require('express');
const router = express.Router();

// POST /api/ai/chat - Get AI response using Google Gemini
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not found in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'AI service not configured' 
      });
    }

    // Call Google Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ 
            text: message 
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error:', response.status, errorData);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to get AI response',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const data = await response.json();
    const aiMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response. Please try again.';
    
    console.log('✅ AI Response generated successfully');
    res.json({ 
      success: true,
      reply: aiMessage 
    });
  } catch (error) {
    console.error('❌ AI chat error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process your message',
      details: error.message 
    });
  }
});

module.exports = router;
