import { DocumentRequirement, DocumentCategory } from '../types';

// Maps ICD-10 codes (or diagnosis categories) to required documents
const diagnosisDocumentMap: Record<string, DocumentCategory[]> = {
    // Respiratory
    'J18': ['chest_xray', 'cbc', 'abg'],           // Pneumonia
    'J12': ['chest_xray', 'cbc', 'covid_test'],    // Viral pneumonia
    'J44': ['chest_xray', 'cbc', 'abg', 'ecg'],    // COPD

    // Cardiac
    'I21': ['ecg', 'cbc', 'lft', 'kft'],           // MI
    'I50': ['ecg', 'chest_xray', 'cbc'],           // Heart failure

    // Infectious
    'A41': ['blood_culture', 'cbc', 'lft', 'kft'], // Sepsis
    'A90': ['ns1_antigen', 'cbc', 'dengue_igm'],   // Dengue Fever

    // Gastrointestinal
    'K35': ['usg_abdomen', 'cbc', 'urine_routine'], // Acute appendicitis

    // Default for unknown
    'default': ['cbc'],
};

const documentDetails: Record<DocumentCategory, { displayName: string; description: string }> = {
    'chest_xray': { displayName: 'Chest X-Ray', description: 'PA view chest radiograph' },
    'cbc': { displayName: 'CBC Report', description: 'Complete blood count with differential' },
    'abg': { displayName: 'ABG Report', description: 'Arterial blood gas analysis' },
    'ecg': { displayName: 'ECG', description: '12-lead electrocardiogram' },
    'ct_scan': { displayName: 'CT Scan', description: 'Computed tomography report' },
    'mri': { displayName: 'MRI', description: 'Magnetic resonance imaging report' },
    'ultrasound': { displayName: 'Ultrasound', description: 'Ultrasonography report' },
    'blood_culture': { displayName: 'Blood Culture', description: 'Blood culture and sensitivity' },
    'urine_routine': { displayName: 'Urine Routine', description: 'Urine analysis report' },
    'lft': { displayName: 'LFT', description: 'Liver function tests' },
    'kft': { displayName: 'KFT', description: 'Kidney function tests' },
    'covid_test': { displayName: 'COVID-19 Test', description: 'RT-PCR or Rapid Antigen Test' },
    'ns1_antigen': { displayName: 'Dengue NS1 Antigen', description: 'Rapid test for early Dengue detection' },
    'dengue_igm': { displayName: 'Dengue IgM', description: 'Antibody test for Dengue' },
    'usg_abdomen': { displayName: 'USG Abdomen / Pelvis', description: 'Abdominal ultrasonography' },
    'other': { displayName: 'Other Document', description: 'Additional supporting document' },
};

export const getRequiredDocuments = (diagnosisOrIcd10: string): DocumentRequirement[] => {
    let category = 'default';

    // Check if it's an ICD-10 code format (e.g., A90, J18.9)
    if (/^[A-Z][0-9]{2}/.test(diagnosisOrIcd10)) {
        category = diagnosisOrIcd10.substring(0, 3);
    } else {
        // Fallback explicit text matching
        const lowerDiag = diagnosisOrIcd10.toLowerCase();
        if (lowerDiag.includes('dengue')) category = 'A90';
        else if (lowerDiag.includes('appendicitis')) category = 'K35';
        else if (lowerDiag.includes('pneumonia')) category = 'J18';
        else if (lowerDiag.includes('sepsis')) category = 'A41';
        else if (lowerDiag.includes('myocardial') || lowerDiag.includes('mi')) category = 'I21';
    }

    const requiredCategories = diagnosisDocumentMap[category] || diagnosisDocumentMap['default'];

    return requiredCategories.map((cat, index) => ({
        category: cat,
        displayName: documentDetails[cat].displayName,
        isRequired: index < 2, // First 2 are required, rest optional
        description: documentDetails[cat].description,
    }));
};

/**
 * Matches a filename to a document category
 */
export const guessDocumentCategory = (filename: string): DocumentCategory => {
    const lower = filename.toLowerCase();

    if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('cxr')) return 'chest_xray';
    if (lower.includes('cbc') || lower.includes('blood count')) return 'cbc';
    if (lower.includes('abg') || lower.includes('blood gas')) return 'abg';
    if (lower.includes('ecg') || lower.includes('ekg')) return 'ecg';
    if (lower.includes('ct') || lower.includes('scan')) return 'ct_scan';
    if (lower.includes('mri')) return 'mri';
    if (lower.includes('usg') || lower.includes('ultrasound')) return 'ultrasound';
    if (lower.includes('culture')) return 'blood_culture';
    if (lower.includes('urine')) return 'urine_routine';
    if (lower.includes('lft') || lower.includes('liver')) return 'lft';
    if (lower.includes('kft') || lower.includes('kidney') || lower.includes('renal')) return 'kft';
    if (lower.includes('covid') || lower.includes('rtpcr')) return 'covid_test';
    if (lower.includes('ns1') || lower.includes('antigen')) return 'ns1_antigen';
    if (lower.includes('igm') || lower.includes('mac')) return 'dengue_igm';
    if (lower.includes('usg abdomen') || lower.includes('pelvis')) return 'usg_abdomen';

    return 'other';
};
