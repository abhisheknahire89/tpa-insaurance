import codesData from '../data/icd10Codes.json';
import categoriesData from '../data/icd10Categories.json';
import { ICD_SYNONYM_MAP } from '../data/icdSynonymMap';
import { queryMedGemma } from './llmClient';

export interface IcdCandidate {
  code: string;
  description: string;
  category: string;
  matchMethod: 'synonym' | 'exact' | 'contains' | 'ai_fallback';
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

/**
 * Normalizes clinical query terms (lowercase, trim, collapse spaces)
 */
export function normalizeTerm(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Validates whether a code exists in the official WHO ICD-10 dataset
 */
export function validateCode(code: string): boolean {
  if (!code) return false;
  const target = code.trim().toUpperCase();
  const inCodes = codesData.codes.some(c => c.code.toUpperCase() === target);
  if (inCodes) return true;
  const inCategories = categoriesData.categories.some(c => c.categoryCode.toUpperCase() === target);
  return inCategories;
}

/**
 * Retrieves the official description of a code
 */
export function getDescription(code: string): string {
  const target = code.trim().toUpperCase();
  const foundCode = codesData.codes.find(c => c.code.toUpperCase() === target);
  if (foundCode) return foundCode.description;
  const foundCat = categoriesData.categories.find(c => c.categoryCode.toUpperCase() === target);
  if (foundCat) return foundCat.title;
  return 'Unknown Code';
}

/**
 * Performs ranked searches on the WHO ICD-10 tables (synonym -> exact -> contains)
 */
export function lookupICD(input: string): IcdCandidate[] {
  const normalized = normalizeTerm(input);
  if (!normalized) return [];

  // 1. Synonym Match
  const synonymMatches = ICD_SYNONYM_MAP.filter(
    (s) => normalizeTerm(s.term) === normalized
  );
  if (synonymMatches.length > 0) {
    return synonymMatches.map((m) => {
      const desc = getDescription(m.code);
      const cat = m.code.includes('.') ? m.code.split('.')[0] : m.code;
      return {
        code: m.code,
        description: desc,
        category: cat,
        matchMethod: 'synonym',
        confidence: 'high',
        note: m.note
      };
    });
  }

  // 2. Exact Match in descriptions
  const exactCodes = codesData.codes.filter(
    (c) => normalizeTerm(c.description) === normalized
  );
  const exactCats = categoriesData.categories.filter(
    (cat) => normalizeTerm(cat.title) === normalized
  );

  if (exactCodes.length > 0 || exactCats.length > 0) {
    const candidates: IcdCandidate[] = [];
    exactCats.forEach((c) => {
      candidates.push({
        code: c.categoryCode,
        description: c.title,
        category: c.categoryCode,
        matchMethod: 'exact',
        confidence: 'high'
      });
    });
    exactCodes.forEach((c) => {
      candidates.push({
        code: c.code,
        description: c.description,
        category: c.category,
        matchMethod: 'exact',
        confidence: 'high'
      });
    });
    return candidates;
  }

  // 3. Contains Keyword Match (ranked by specificity)
  const searchWords = normalized.split(' ').filter((w) => w.length > 1);
  if (searchWords.length === 0) return [];

  const matchedCats = categoriesData.categories.filter((cat) => {
    const titleLower = cat.title.toLowerCase();
    return searchWords.every((w) => titleLower.includes(w));
  });

  const matchedCodes = codesData.codes.filter((c) => {
    const descLower = c.description.toLowerCase();
    return searchWords.every((w) => descLower.includes(w));
  });

  const containsCandidates: IcdCandidate[] = [];

  matchedCats.forEach((c) => {
    containsCandidates.push({
      code: c.categoryCode,
      description: c.title,
      category: c.categoryCode,
      matchMethod: 'contains',
      confidence: 'medium'
    });
  });

  matchedCodes.forEach((c) => {
    containsCandidates.push({
      code: c.code,
      description: c.description,
      category: c.category,
      matchMethod: 'contains',
      confidence: 'medium'
    });
  });

  // Rank matches:
  // - Starts with query term gets priority.
  // - Shorter codes (category level) preferred.
  // - Shorter descriptions (higher density) preferred.
  containsCandidates.sort((a, b) => {
    const aDesc = a.description.toLowerCase();
    const bDesc = b.description.toLowerCase();
    
    const aStarts = aDesc.startsWith(normalized);
    const bStarts = bDesc.startsWith(normalized);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    const aLen = a.code.replace('.', '').length;
    const bLen = b.code.replace('.', '').length;
    if (aLen !== bLen) return aLen - bLen;

    return a.description.length - b.description.length;
  });

  return containsCandidates.slice(0, 10);
}

/**
 * AI-Fallback endpoint when lookup yields zero results.
 * Calls local MedGemma with strict WHO schema validation.
 */
export async function assignICDViaModel(diagnosis: string, context?: string): Promise<IcdCandidate[]> {
  const systemInstruction = `You are a strict WHO ICD-10 medical coding assistant.
Given a provisional diagnosis and clinical context, recommend a valid WHO ICD-10 code (e.g. J18.9, E11.9, I10) and its official description.

You must respond with a raw JSON object and nothing else (no markdown backticks, no wrapping text):
{
  "code": "ICD-10 code here",
  "description": "official description here"
}

The code you return MUST be a valid WHO ICD-10 code (3 or 4 characters, with a dot if 4 characters). Do not invent codes.`;

  const prompt = `Diagnosis: ${diagnosis}
${context ? `Context: ${context}` : ''}

Identify the closest valid WHO ICD-10 code.`;

  try {
    const responseText = await queryMedGemma(prompt, systemInstruction);
    
    let cleanText = responseText.trim();
    // Robustly extract the JSON object block matching the first { ... } structure
    const jsonMatch = cleanText.match(/(\{[\s\S]*?\})/);
    if (jsonMatch) {
      cleanText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(cleanText);
    const proposedDesc = parsed.description || parsed.diagnosis || diagnosis;
    
    console.log(`[icdService] Ignoring direct AI code suggestion "${parsed.code}" and re-deriving from description: "${proposedDesc}"`);
    
    const candidates = lookupICD(proposedDesc);
    if (candidates.length > 0) {
      return candidates.map(c => ({
        ...c,
        matchMethod: 'ai_fallback' as const,
        confidence: 'low' as const
      }));
    } else {
      const fallbackCandidates = lookupICD(diagnosis);
      if (fallbackCandidates.length > 0) {
        return fallbackCandidates.map(c => ({
          ...c,
          matchMethod: 'ai_fallback' as const,
          confidence: 'low' as const
        }));
      }
    }
  } catch (error) {
    console.error('[icdService] AI fallback coding failed:', error);
  }

  return [];
}
