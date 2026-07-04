import { reviewEvidence } from '../engine/evidenceReview';
import { groundedCases, GroundedTestCase } from './groundedBattery';
import { generateBatchWithGemini } from './dynamicCaseGenerator';
import { makePreAuthRecord } from './testBattery';
import { checkCaseWithGemini } from './geminiChecker';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Metrics to track in run_meta.json
interface RunMetrics {
  startTime: string;
  totalEvaluated: number;
  totalPassed: number;
  totalFailed: number;
  factualIssuesCount: number;
  codeIssuesCount: number;
  authorityIssuesCount: number;
  missedGapsCount: number;
}

// Utility: Shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Utility: Sleep for exponential backoff or rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function continuousAudit() {
  console.log('🚀 Starting 18-Hour Continuous Testing + Gemini Audit Loop');

  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const rawLogPath = path.join(LOGS_DIR, 'audit_raw.jsonl');
  const findingsPath = path.join(LOGS_DIR, 'audit_findings.md');
  const summaryPath = path.join(LOGS_DIR, 'audit_summary.md');
  const metaPath = path.join(LOGS_DIR, 'run_meta.json');

  const apiKey = process.env.GEMINI_API_KEY;
  const skipGemini = !apiKey;

  if (skipGemini) {
    console.warn('⚠️ GEMINI_API_KEY is not set. The loop will run the engine but SKIP Gemini evaluation.');
  } else {
    console.log('✅ GEMINI_API_KEY detected. Independent audit enabled.');
  }

  const DURATION_MS = 18 * 60 * 60 * 1000; // 18 hours
  const endTime = Date.now() + DURATION_MS;
  let iterationCounter = 1;

  let metrics: RunMetrics = {
    startTime: new Date().toISOString(),
    totalEvaluated: 0,
    totalPassed: 0,
    totalFailed: 0,
    factualIssuesCount: 0,
    codeIssuesCount: 0,
    authorityIssuesCount: 0,
    missedGapsCount: 0
  };

  // Initialize markdown logs
  fs.writeFileSync(findingsPath, '# Continuous Audit Findings\\n\\n', 'utf-8');

  while (Date.now() < endTime) {
    console.log(`\\n--- Starting Iteration Set ${iterationCounter} ---`);

    let currentBatch: GroundedTestCase[];
    if (iterationCounter === 1 || skipGemini) {
      console.log('Using static grounded cases for this iteration.');
      currentBatch = [...groundedCases];
    } else {
      console.log('Synthesizing a dynamic batch of 20 authentic cases using Gemini...');
      let newCases = null;
      try {
        newCases = await generateBatchWithGemini(20);
      } catch (err) {
        console.error('Error generating dynamic cases:', err);
      }

      if (newCases && newCases.length > 0) {
        console.log(`✅ Synthesized ${newCases.length} new dynamic cases.`);
        currentBatch = newCases;
      } else {
        console.warn('⚠️ Dynamic generation failed or returned null. Falling back to static grounded cases.');
        currentBatch = [...groundedCases];
      }
    }

    const shuffledCases = shuffleArray(currentBatch);

    for (const tc of shuffledCases) {
      if (Date.now() >= endTime) {
        console.log('⏱️ Time limit reached. Stopping continuous audit.');
        break;
      }

      console.log(`Running Case ${tc.id} (${tc.diagnosis})...`);
      const record = makePreAuthRecord(tc);

      let engineOutput;
      try {
        engineOutput = await reviewEvidence(record);
      } catch (err) {
        console.error(`Error running engine for Case ${tc.id}:`, err);
        continue;
      }

      let verdict = null;
      if (!skipGemini) {
        let retries = 0;
        let success = false;

        while (!success && retries < 3) {
          try {
            verdict = await checkCaseWithGemini(tc, engineOutput, iterationCounter);
            success = true;
          } catch (err: any) {
            if (err.status === 429) {
              console.log(`Rate limited (429). Sleeping for 15s before retry...`);
              await sleep(15000);
              retries++;
            } else {
              console.error(`Failed Gemini check for Case ${tc.id}:`, err);
              break;
            }
          }
        }
      }

      // Log raw outputs
      fs.appendFileSync(
        rawLogPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          iteration: iterationCounter,
          caseId: tc.id,
          engineOutput,
          verdict
        }) + '\\n'
      );

      // Log findings if Gemini gave a verdict
      if (verdict) {
        metrics.totalEvaluated++;
        if (verdict.overallPass) {
          metrics.totalPassed++;
        } else {
          metrics.totalFailed++;
          metrics.factualIssuesCount += verdict.factualIssues.length;
          metrics.codeIssuesCount += verdict.codeIssues.length;
          metrics.authorityIssuesCount += verdict.authorityIssues.length;
          metrics.missedGapsCount += verdict.missedGaps.length;

          // Append to Markdown
          const mdContent = `
### Case ${tc.id} | Iteration ${iterationCounter}
**Status:** ❌ Failed
- **Factual Issues:** ${verdict.factualIssues.length > 0 ? verdict.factualIssues.join('; ') : 'None'}
- **Code Issues:** ${verdict.codeIssues.length > 0 ? verdict.codeIssues.join('; ') : 'None'}
- **Authority Issues:** ${verdict.authorityIssues.length > 0 ? verdict.authorityIssues.join('; ') : 'None'}
- **Missed Gaps:** ${verdict.missedGaps.length > 0 ? verdict.missedGaps.join('; ') : 'None'}
`;
          fs.appendFileSync(findingsPath, mdContent);
        }

        // Rewrite summary metrics
        fs.writeFileSync(metaPath, JSON.stringify(metrics, null, 2), 'utf-8');
        fs.writeFileSync(summaryPath, `
# Audit Summary
- **Start Time:** ${metrics.startTime}
- **Total Cases Evaluated:** ${metrics.totalEvaluated}
- **Total Passed:** ${metrics.totalPassed}
- **Total Failed:** ${metrics.totalFailed}
- **Pass Rate:** ${((metrics.totalPassed / Math.max(1, metrics.totalEvaluated)) * 100).toFixed(2)}%

### Issue Breakdown
- **Factual Issues:** ${metrics.factualIssuesCount}
- **Code Issues:** ${metrics.codeIssuesCount}
- **Authority Issues:** ${metrics.authorityIssuesCount}
- **Missed Gaps:** ${metrics.missedGapsCount}
        `.trim(), 'utf-8');
      }

      // Sleep briefly between cases to avoid hitting rate limits instantly
      await sleep(2000);
    }

    iterationCounter++;
  }

  console.log('✅ Continuous Audit Loop completed.');
}

continuousAudit().catch(err => {
  console.error('Fatal error in continuous audit:', err);
});
