export interface ClinicalSynonymGroup {
  keys: string[];       // Anchor term or search keywords from rules
  synonyms: string[];   // Corresponding words/phrases in narrative that count as present
}

/**
 * CLINICAL SYNONYM MAP (Editable Config)
 * Bridges formal TPA diagnostic rules / check-lists to natural clinical notes.
 */
export const CLINICAL_SYNONYMS: ClinicalSynonymGroup[] = [
  {
    keys: ['wbc', 'leukocyte', 'white blood cell', 'elevated wbc'],
    synonyms: ['wbc', 'tc', 'leukocyte', 'count', 'cells', 'leukocytosis', 'leucocytosis']
  },
  {
    keys: ['menorrhagia', 'evidence of menorrhagia', 'heavy bleeding', 'heavy menstrual'],
    synonyms: ['menorrhagia', 'heavy menstrual', 'heavy bleeding', 'menstrual bleeding', 'blood loss', 'abnormal uterine bleeding', 'aub']
  },
  {
    keys: ['abdominal', 'tenderness', 'examination', 'finding'],
    synonyms: ['tender', 'tenderness', 'rebound', 'guarding', 'rigidity', 'abdominal', 'abdomen']
  },
  {
    keys: ['severity', 'severity indicator', 'limitation'],
    synonyms: ['severe', 'severity', 'limitation', 'unable', 'difficulty', 'distress', 'meters', 'stairs', 'restrict', 'grade', 'nyha', 'class']
  },
  {
    keys: ['platelet', 'thrombocytopenia'],
    synonyms: ['platelet', 'platelets', 'thrombocytopenia', 'plt', 'thrombocyte', '/cumm', '/mcl']
  },
  {
    keys: ['angiography', 'angio', 'coronary angiography', 'cag'],
    synonyms: ['angiography', 'angio', 'cag', 'coronary', 'catheterization', 'vessel', 'blockage', 'stenosis']
  },
  {
    keys: ['ns1', 'dengue'],
    synonyms: ['ns1', 'dengue', 'igm', 'igg', 'serology', 'dengue antigen', 'dengue antibody']
  },
  {
    keys: ['widal', 'typhoid', 'enteric'],
    synonyms: ['widal', 'culture', 'typhi', 'salmonella', 'enteric', 'typhoid', 'blood culture']
  },
  {
    keys: ['lmp', 'last menstrual', 'edd', 'expected date'],
    synonyms: ['lmp', 'last menstrual', 'edd', 'expected date', 'gestational age', 'gestation', 'weeks pregnant', 'antenatal']
  },
  {
    keys: ['visual acuity', 'vision acuity', 'a-scan', 'iol'],
    synonyms: ['visual acuity', 'acuity', 'vision', 'a-scan', 'iol', 'lens power', 'biometry', 'slit lamp', 'cataract']
  },
  {
    keys: ['conservative', 'prior treatment', 'failed conservative', 'non-surgical'],
    synonyms: ['conservative', 'physio', 'physiotherapy', 'analgesic', 'nsaid', 'injection', 'steroid', 'tablet', 'oral medication', 'pain management', 'brace', 'splint']
  },
  {
    keys: ['surgeon\'s note', 'surgeon note', 'indication for'],
    synonyms: ['surgeon', 'consult', 'advised', 'planned', 'indicated', 'recommend', 'advised surgery']
  },
  {
    keys: ['x-ray', 'xray', 'cxr'],
    synonyms: ['x-ray', 'xray', 'cxr', 'chest film', 'infiltrate', 'consolidation']
  },
  {
    keys: ['ultrasound', 'usg', 'sonography'],
    synonyms: ['usg', 'ultrasound', 'scan', 'sono', 'echo', 'sonography']
  },
  {
    keys: ['mri', 'magnetic resonance'],
    synonyms: ['mri', 'scan', 'neuroimaging']
  },
  {
    keys: ['ct ', 'computed tomography'],
    synonyms: ['ct', 'scan', 'computed']
  },
  {
    keys: ['residual', 'pvr'],
    synonyms: ['residual', 'pvr', 'urine', 'void']
  },
  {
    keys: ['ipss'],
    synonyms: ['ipss', 'score', 'symptom', 'index']
  },
  {
    keys: ['biopsy', 'histopath'],
    synonyms: ['biopsy', 'histopath', 'pathology', 'report', 'tissue', 'malignant', 'cancer', 'carcinoma']
  },
  {
    keys: ['staging'],
    synonyms: ['stage', 'staging', 't1', 't2', 't3', 't4', 'n1', 'n2', 'n3', 'm0', 'm1', 'metastasis']
  },
  {
    keys: ['plan sheet'],
    synonyms: ['plan', 'sheet', 'protocol', 'cycle', 'chemo', 'regimen']
  },
  {
    keys: ['audiometry'],
    synonyms: ['audiometry', 'audiogram', 'hearing', 'loss', 'db', 'hearing loss', 'decibel', 'pure tone']
  },
  {
    keys: ['fundoscopy', 'acuity'],
    synonyms: ['vision', 'acuity', 'fundus', 'eye', 'cataract', 'slit', 'fundoscopy', 'b-scan', 'vitreous', 'retina', 'ophthalmoscopy', 'eye exam', 'posterior segment']
  },
  {
    keys: ['creatinine', 'egfr', 'urea'],
    synonyms: ['creatinine', 'egfr', 'urea', 'kidney', 'renal', 'scr', 'bun']
  },
  {
    keys: ['spo2', 'oxygen', 'hypoxia'],
    synonyms: ['spo2', 'oxygen', 'o2', 'hypoxia', 'saturation', 'room air']
  },
  {
    keys: ['abg', 'blood gas'],
    synonyms: ['abg', 'ph', 'pco2', 'po2', 'hco3', 'blood gas']
  },
  {
    keys: ['pefr', 'peak flow'],
    synonyms: ['pefr', 'peak', 'flow', 'spirometry', 'pft']
  },
  {
    keys: ['amylase', 'lipase'],
    synonyms: ['amylase', 'lipase', 'enzyme', 'pancreas', 'pancreatic', 'pancreatitis']
  },
  {
    keys: ['emg', 'ncs', 'conduction'],
    synonyms: ['emg', 'ncs', 'nerve', 'conduction', 'velocity', 'nerve conduction', 'electromyography', 'nerve velocity', 'nerve study', 'conduction velocity']
  },
  {
    keys: ['electrocardiogram', 'ecg'],
    synonyms: ['ecg', 'ekg', 'electrocardiogram', 'lead']
  },
  {
    keys: ['imaging', 'scan'],
    synonyms: ['imaging', 'scan', 'usg', 'ultrasound', 'ct', 'mri', 'x-ray', 'xray', 'cxr', 'sonography', 'echo']
  },
  {
    keys: ['nsaid', 'prescription', 'refill', 'medication'],
    synonyms: ['medication', 'nsaid', 'analgesic', 'tablet', 'drug', 'prescription', 'physio', 'conservative', 'painkiller', 'pain killer', 'oral medications']
  },
  {
    keys: ['pessary'],
    synonyms: ['pessary', 'ring', 'conservative', 'management', 'support']
  },
  {
    keys: ['doppler', 'vascular', 'grade'],
    synonyms: ['doppler', 'vascular', 'abi', 'arterial', 'duplex', 'flow', 'grade', 'wagner', 'stage', 'depth']
  },
  {
    keys: ['hb', 'hemoglobin', 'hgb'],
    synonyms: ['hb', 'hemoglobin', 'hgb']
  },
  {
    keys: ['tenecteplase', 'thrombolysis', 'alteplase'],
    synonyms: ['tenecteplase', 'thrombolysis', 'alteplase', 'thrombolytic']
  },
  {
    keys: ['troponin', 'trop'],
    synonyms: ['troponin', 'trop']
  },
  {
    keys: ['petechiae', 'rash'],
    synonyms: ['petechiae', 'petechial', 'rash']
  },
  {
    keys: ['csf', 'lumbar puncture', 'spinal fluid'],
    synonyms: ['csf', 'lumbar puncture', 'spinal fluid', 'cerebrospinal', 'lp done', 'meningitis']
  }
];
