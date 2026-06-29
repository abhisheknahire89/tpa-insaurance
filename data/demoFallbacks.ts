export interface DemoFallbackReasoning {
  challengesConsidered: string[];
  anchors: string[];
  discriminators: Array<{
    challenge: string;
    evidence: string;
    reason: string;
  }>;
}

export const DEMO_FALLBACKS: Record<string, DemoFallbackReasoning> = {
  diabetes: {
    "challengesConsidered": [
      "could this be managed as OPD?",
      "could this be a pre-existing condition?",
      "is the stated diagnosis actually supported by the documented findings?"
    ],
    "anchors": [
      "HbA1c level",
      "Urinalysis for glucose and ketones",
      "ECG",
      "Blood pressure monitoring",
      "Patient's history of diabetes management (if any)"
    ],
    "discriminators": [
      {
        "challenge": "could this be managed as OPD?",
        "evidence": "HbA1c level > 9% or blood glucose consistently above 300 mg/dL despite oral medications, presence of significant symptoms like dehydration, altered mental status, or severe complications (e.g., diabetic ketoacidosis).",
        "reason": "If the patient's HbA1c is below 9%, and their blood sugar levels are controlled with oral medications without significant symptoms or complications, outpatient management may be appropriate."
      },
      {
        "challenge": "could this be a pre-existing condition?",
        "evidence": "Patient has a documented history of diabetes mellitus (HbA1c > 6.5% or diagnosis by a physician), and the current hyperglycemia is likely related to poor glycemic control, medication non-adherence, or an acute exacerbation of existing diabetes.",
        "reason": "If the patient has a known history of diabetes with documented HbA1c levels above the diagnostic threshold, and their current presentation is consistent with poorly controlled diabetes, it's more likely a pre-existing condition. If there's no prior diagnosis or evidence of diabetes management, it may be a new onset."
      },
      {
        "challenge": "is the stated diagnosis actually supported by the documented findings?",
        "evidence": "Blood glucose levels (fasting and postprandial), HbA1c level, urinalysis for glucose and ketones, ECG, blood pressure monitoring. Patient's history of diabetes management.",
        "reason": "The diagnosis should be based on established criteria for diabetes mellitus (e.g., fasting plasma glucose ≥ 126 mg/dL, HbA1c ≥ 6.5%, or both). The presence of hyperglycemia and symptoms like polyuria and polydipsia support the diagnosis. A urinalysis for ketones is important to rule out diabetic ketoacidosis."
      }
    ]
  },
  pneumonia: {
    "challengesConsidered": [
      "could this be managed as OPD?",
      "could this be a pre-existing condition?",
      "is the stated diagnosis actually supported by the documented findings?"
    ],
    "anchors": [
      "chest X-ray with infiltrate",
      "blood cultures (if indicated)"
    ],
    "discriminators": [
      {
        "challenge": "could this be managed as OPD?",
        "evidence": "chest X-ray showing focal consolidation, vital signs stable and improving, no significant comorbidities.",
        "reason": "If the chest X-ray shows a localized infiltrate with improvement in symptoms and vital signs, outpatient management is appropriate. The patient's history should indicate that this is not a new or worsening condition."
      },
      {
        "challenge": "could this be a pre-existing condition?",
        "evidence": "patient has a documented history of pneumonia from at least 3 months ago.",
        "reason": "If the patient has a known history of community acquired pneumonia, it is unlikely to be a new or acute infection. The patient's medical record should include documentation of prior episodes of pneumonia."
      },
      {
        "challenge": "is the stated diagnosis actually supported by the documented findings?",
        "evidence": "chest X-ray showing infiltrate consistent with pneumonia, elevated white blood cell count, and clinical symptoms (cough, fever) are present.",
        "reason": "The chest X-ray should demonstrate evidence of consolidation or infiltrates. The patient's vital signs and clinical presentation should be consistent with pneumonia."
      }
    ]
  },
  appendicitis: {
    "challengesConsidered": [
      "could this be managed as OPD?",
      "could this be a pre-existing condition?",
      "is the stated diagnosis actually supported by the documented findings?"
    ],
    "anchors": [
      "appendiceal diameter > 6mm",
      "presence of periappendiceal inflammation on imaging (CT or MRI)",
      "clinical symptoms consistent with appendicitis (RLQ pain, fever, elevated WBC count)"
    ],
    "discriminators": [
      {
        "challenge": "could this be managed as OPD?",
        "evidence": "appendiceal diameter < 6mm on imaging",
        "reason": "If the appendix is small (less than 6 mm), it may be amenable to outpatient management with close follow-up. This requires a CT or MRI scan showing an appendiceal diameter less than 6mm."
      },
      {
        "challenge": "could this be a pre-existing condition?",
        "evidence": "history of prior appendectomy, documented history of chronic RLQ pain",
        "reason": "A previous appendectomy or chronic RLQ pain could suggest that the current symptoms are related to a healed appendix or another underlying issue. This requires a detailed patient history including any prior surgical interventions and/or medical conditions."
      },
      {
        "challenge": "is the stated diagnosis actually supported by the documented findings?",
        "evidence": "CT scan showing appendiceal diameter > 6mm, presence of periappendiceal inflammation on imaging (CT or MRI), clinical symptoms consistent with appendicitis (RLQ pain, fever, elevated WBC count)",
        "reason": "The diagnosis of acute appendicitis is supported by the combination of a non-compressible appendix greater than 6mm in diameter and evidence of periappendiceal inflammation. The patient's symptoms also align with this diagnosis."
      }
    ]
  }
};
