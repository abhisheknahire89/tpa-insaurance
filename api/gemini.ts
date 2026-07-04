import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  maxDuration: 60, // set max duration for clinical reasoning TAT
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { sdkType, args } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server-side GEMINI_API_KEY is not configured in Vercel settings." });
  }

  try {
    if (sdkType === 'genai') {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent(args);
      return res.status(200).json({
        text: response.text,
        candidates: response.candidates
      });
    } else if (sdkType === 'generative-ai') {
      const client = new GoogleGenerativeAI(apiKey);
      const { model, contents } = args;
      const modelObj = client.getGenerativeModel({ model });
      const result = await modelObj.generateContent(contents);
      const text = result.response.text();
      return res.status(200).json({
        text
      });
    } else {
      return res.status(400).send(`Unsupported SDK type: ${sdkType}`);
    }
  } catch (error: any) {
    console.error("Vercel serverless proxy error:", error);
    return res.status(500).json({ error: error.message || "Failed to query Gemini API server-side" });
  }
}
