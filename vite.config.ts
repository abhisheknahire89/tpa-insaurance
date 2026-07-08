import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiKey = env.VITE_GEMINI_API_KEY || '';

  const localApiPlugin = () => ({
    name: 'local-api-proxy',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url === '/api/gemini' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { sdkType, args } = JSON.parse(body);
              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: "Local VITE_GEMINI_API_KEY is not configured in your .env.local file." }));
                return;
              }

              if (sdkType === 'genai') {
                const ai = new GoogleGenAI({ apiKey });
                const response = await ai.models.generateContent(args);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  text: response.text,
                  candidates: response.candidates
                }));
              } else if (sdkType === 'generative-ai') {
                const client = new GoogleGenerativeAI(apiKey);
                const { model, contents } = args;
                const modelObj = client.getGenerativeModel({ model });
                const result = await modelObj.generateContent(contents);
                const text = result.response.text();
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text }));
              } else {
                res.statusCode = 400;
                res.end(`Unsupported SDK type: ${sdkType}`);
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "Failed to call Gemini API locally" }));
            }
          });
          return;
        }
        next();
      });
    }
  });

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), localApiPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Group heavy ICD-10 static database files into their own chunk
            if (
              id.includes('icd10Codes.json') ||
              id.includes('icd10Categories.json') ||
              id.includes('icd10Database.ts')
            ) {
              return 'icd-database';
            }
            // Group external dependencies into a vendor chunk
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    }
  };
});
