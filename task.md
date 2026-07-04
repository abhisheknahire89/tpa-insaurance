# Foundation Tasks & Codebase Cleanup Checklist

## Task 1 & 5: Security & Serverless Proxy
- [x] Overwrite `services/apiKeys.ts` with browser-proxying fetch logic & startup key verification checks
- [x] Overwrite `utils/insuranceEfficiencyAnalysis.ts` to remove hardcoded API keys
- [x] Update `DEPLOYMENT_GUIDE.md` to remove hardcoded keys and replace with placeholder
- [x] Create `.env.local.example` with template environment variables
- [x] Update `.gitignore` to explicitly ignore `.env` file
- [x] Create `api/gemini.ts` Vercel serverless function
- [x] Update `vite.config.ts` to add configureServer local middleware proxy for `/api/gemini`
- [x] Update `vercel.json` rewrite configuration to prevent routing `/api/*` to `/index.html`

## Task 2: Centralize Gemini Models
- [x] Create `config/modelConfig.ts` with centralized model names
- [x] Update `services/geminiService.ts` to import and use `MODEL_TEXT` & `MODEL_DOCUMENT`
- [x] Update `services/documentExtractionService.ts` to import and use `MODEL_DOCUMENT`
- [x] Update `services/evidenceExtractionService.ts` to import and use `MODEL_DOCUMENT`
- [x] Update `services/voiceDictationService.ts` to import and use `MODEL_TEXT`
- [x] Update `utils/insuranceEfficiencyAnalysis.ts` to use `MODEL_TEXT`
- [x] Update `services/api.ts` to import and use `MODEL_TTS`
- [x] Update `hooks/useSpeechRecognition.ts` to import and use `MODEL_AUDIO`
- [x] Update `hooks/useVedaSession.ts` to import and use `MODEL_AUDIO`
- [x] Update `scripts/geminiChecker.ts` to use `MODEL_TEXT`
- [x] Update `scripts/dynamicCaseGenerator.ts` to use `MODEL_TEXT`
- [x] Update `engine/layers/05_llmInterface.ts` to use `MODEL_TEXT`

## Task 3: MedGemma custom endpoint & VITE_DEMO_MODE support
- [x] Overwrite `services/llmClient.ts` to support `VITE_MEDGEMMA_ENDPOINT_URL`, fall back to Gemini reasoning, and enforce `DEMO_FALLBACKS` only under `VITE_DEMO_MODE=true`

## Task 4: Duplicate Files Cleanup
- [x] Delete identical duplicate suffix-2 files (45 files)
- [x] Delete root `auth.txt` file
- [x] Delete `components/cost claculator uses ICD databases` and its twin
- [x] Delete diverged duplicate suffix-2 files (8 files) after user approval
