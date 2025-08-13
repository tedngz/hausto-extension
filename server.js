require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');
const app = express();
app.use(cors());
app.use(bodyParser.json({limit:'10mb'}));

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY || '' });
const openai = new OpenAIApi(configuration);

app.post('/auth/exchange', async (req,res) => {
  const code = req.body.code;
  if (!code) return res.status(400).json({ error: 'no_code' });
  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', { method:'POST', body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', redirect_uri: process.env.GOOGLE_REDIRECT_URI || '', grant_type: 'authorization_code'
    }) });
    const tok = await tokenResp.json();
    if (tok.error) return res.status(400).json({ error: tok });
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const profile = await profileResp.json();
    return res.json({ email: profile.email, profile });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.post('/api/analyze-property', async (req,res) => {
  const { imageUrls, userPreference, title, url } = req.body;
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) return res.status(400).json({ error: 'no_images' });

  try {
    const highlights = [];
    const descriptions = [];

    for (const imgUrl of imageUrls) {
      const prompt = `Describe the standout feature of the photo at this URL in 12 words or less: ${imgUrl}`;
      const completion = await openai.createChatCompletion({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 60 });
      const desc = completion.data.choices[0]?.message?.content?.trim() || 'Nice feature';
      highlights.push({ url: imgUrl, highlight: desc });
      descriptions.push(desc);
    }

    const vibePrompt = `User prefers: ${JSON.stringify(userPreference)}. Property features: ${descriptions.join('; ')}. Rate the match as one of: Casual, Good, Strong, Perfect. Explain briefly.`;
    const vibeResp = await openai.createChatCompletion({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: vibePrompt }], max_tokens: 60 });
    const vibeText = vibeResp.data.choices[0]?.message?.content?.trim() || 'Casual';
    let tier = 'Casual';
    if (/perfect/i.test(vibeText)) tier = 'Perfect';
    else if (/strong/i.test(vibeText)) tier = 'Strong';
    else if (/good/i.test(vibeText)) tier = 'Good';
    else tier = 'Casual';

    return res.json({ vibe: tier, explanation: vibeText, highlights });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'analysis_error' });
  }
});

app.get('/ping', (req,res) => res.json({ ok:true }));

const port = process.env.PORT || 4000;
app.listen(port, ()=>console.log('Hausto backend listening on', port));
