# Regression Test Battery Report (100 Cases)

**Date:** 7/3/2026, 10:21:24 PM
**Cache Status:** 100 hits, 0 misses (0 live successful, 0 failed)

## Summary Statistics

| Result Type | Count | Percentage |
|---|---|---|
| **PASS** | 60 | 60% |
| **MISS** | 35 | 35% |
| **OVER-FLAG** | 5 | 5% |
| **SAFETY-LEAK** | 0 | 0% |
| **ERROR-CRASH** | 0 | 0% |
| **Total** | 100 | 100% |

## Detailed Results Table

| ID | Category | Case / Description | Expected | Actual | Result | Notes |
|---|---|---|---|---|---|---|
| 1 | A | Diabetes admission, no duration (Seed 1) | Must flag: [duration, pre-existing]; Should Generate | Success: Document Generated | ✅ **PASS** | Diabetes admission, no duration (Seed 1) |
| 2 | A | Pneumonia thin case (Seed 2) | Must flag: [OPD, SpO2, X-ray]; Should Generate | Success: Document Generated | ✅ **PASS** | Pneumonia thin case (Seed 2) |
| 3 | A | Bilateral TKR insufficient (Seed 3) | Must flag: [duration, conservative-management, bilateral, implants, Surgeon Fee, PED]; Should Block | Missed expected flag matching "PED" | ❌ **MISS** | Bilateral TKR insufficient (Seed 3) |
| 4 | A | Angioplasty missing angiography (Seed 4) | Must flag: [PED, angiography]; Should Generate | Missed expected flag matching "PED" | ❌ **MISS** | Angioplasty missing angiography (Seed 4) |
| 5 | A | Hysterectomy missing conservative management (Seed 5) | Must flag: [conservative-management]; Should Generate | Missed expected flag matching "conservative-management" | ❌ **MISS** | Hysterectomy missing conservative management (Seed 5) |
| 6 | A | Appendicitis unsupported (Seed 6) | Must flag: [investigation, under-supported]; Should Generate | Missed expected flag matching "investigation", Missed expected flag matching "under-supported" | ❌ **MISS** | Appendicitis unsupported (Seed 6) |
| 7 | A | Cholecystectomy missing USG (Seed 7) | Must flag: [ultrasound, USG]; Should Generate | Missed expected flag matching "USG" | ❌ **MISS** | Cholecystectomy missing USG (Seed 7) |
| 8 | A | Laminectomy missing conservative management/MRI (Seed 8) | Must flag: [MRI, conservative-management]; Should Generate | Missed expected flag matching "conservative-management" | ❌ **MISS** | Laminectomy missing conservative management/MRI (Seed 8) |
| 9 | A | RTA fracture missing MLC (Seed 9) | Must flag: [MLC, medico-legal]; Should Generate | Success: Document Generated | ✅ **PASS** | RTA fracture missing MLC (Seed 9) |
| 10 | A | LSCS maternity missing obstetric history/dates (Seed 10) | Must flag: [LMP, EDD, obstetric]; Should Generate | Missed expected flag matching "obstetric" | ❌ **MISS** | LSCS maternity missing obstetric history/dates (Seed 10) |
| 11 | A | CKD dialysis missing creatinine (Seed 11) | Must flag: [creatinine, eGFR]; Should Generate | Success: Document Generated | ✅ **PASS** | CKD dialysis missing creatinine (Seed 11) |
| 12 | A | Stroke missing CT/MRI scan (Seed 12) | Must flag: [CT, MRI, neuroimaging]; Should Generate | Missed expected flag matching "neuroimaging" | ❌ **MISS** | Stroke missing CT/MRI scan (Seed 12) |
| 13 | A | Dengue missing platelet count (Seed 13) | Must flag: [platelet]; Should Generate | Success: Document Generated | ✅ **PASS** | Dengue missing platelet count (Seed 13) |
| 14 | A | Cataract verification prompt (Seed 14) | Must flag: [limit]; Should Generate | Missed expected flag matching "limit" | ❌ **MISS** | Cataract verification prompt (Seed 14) |
| 15 | A | CABG missing angiography report (Seed 15) | Must flag: [angiography, necessity]; Should Generate | Missed expected flag matching "angiography", Missed expected flag matching "necessity" | ❌ **MISS** | CABG missing angiography report (Seed 15) |
| 16 | A | Tonsillectomy missing recurrence frequency and prior meds | Must flag: [conservative-management]; Should Generate | Missed expected flag matching "conservative-management" | ❌ **MISS** | Tonsillectomy missing recurrence frequency and prior meds |
| 17 | A | TURP missing post-void residual or IPSS score | Must flag: [residual, IPSS]; Should Generate | Missed expected flag matching "residual", Missed expected flag matching "IPSS" | ❌ **MISS** | TURP missing post-void residual or IPSS score |
| 18 | A | GERD endoscopy missing inpatient justification | Must flag: [necessity, OPD]; Should Generate | Missed expected flag matching "necessity", Missed expected flag matching "OPD" | ❌ **MISS** | GERD endoscopy missing inpatient justification |
| 19 | A | Ovarian cystectomy missing USG findings | Must flag: [ultrasound, USG]; Should Generate | Missed expected flag matching "USG" | ❌ **MISS** | Ovarian cystectomy missing USG findings |
| 20 | A | Chemotherapy missing histopathology / staging | Must flag: [biopsy, staging, histopathology]; Should Generate | Missed expected flag matching "biopsy" | ❌ **MISS** | Chemotherapy missing histopathology / staging |
| 21 | A | Nephrectomy missing abdominal CT scan | Must flag: [CT, MRI, investigations]; Should Generate | Missed expected flag matching "CT", Missed expected flag matching "MRI", Missed expected flag matching "investigations" | ❌ **MISS** | Nephrectomy missing abdominal CT scan |
| 22 | A | ACL reconstruction missing MRI knee report | Must flag: [MRI]; Should Generate | Success: Document Generated | ✅ **PASS** | ACL reconstruction missing MRI knee report |
| 23 | A | Pacemaker implantation missing diagnostic ECG | Must flag: [ECG, Holter]; Should Generate | Success: Document Generated | ✅ **PASS** | Pacemaker implantation missing diagnostic ECG |
| 24 | A | COPD exacerbation missing arterial blood gas or SpO2 | Must flag: [SpO2, ABG]; Should Generate | Success: Document Generated | ✅ **PASS** | COPD exacerbation missing arterial blood gas or SpO2 |
| 25 | A | Acute pancreatitis missing enzyme assays / CT | Must flag: [amylase, lipase, imaging]; Should Generate | Missed expected flag matching "amylase", Missed expected flag matching "lipase", Missed expected flag matching "imaging" | ❌ **MISS** | Acute pancreatitis missing enzyme assays / CT |
| 26 | A | Ureteroscopy missing stone size and CT/USG details | Must flag: [imaging, stone, size]; Should Generate | Success: Document Generated | ✅ **PASS** | Ureteroscopy missing stone size and CT/USG details |
| 27 | A | Inguinal hernia repair missing inpatient medical necessity | Must flag: [necessity, OPD]; Should Generate | Missed expected flag matching "necessity", Missed expected flag matching "OPD" | ❌ **MISS** | Inguinal hernia repair missing inpatient medical necessity |
| 28 | A | Meningitis missing CSF analysis details | Must flag: [CSF, puncture]; Should Generate | Success: Document Generated | ✅ **PASS** | Meningitis missing CSF analysis details |
| 29 | A | Malaria missing diagnostic smear / antigen test | Must flag: [smear, antigen, culture, investigation]; Should Generate | Missed expected flag matching "culture", Missed expected flag matching "investigation" | ❌ **MISS** | Malaria missing diagnostic smear / antigen test |
| 30 | A | Pleural effusion missing fluid analysis | Must flag: [fluid, tap, analysis]; Should Generate | Missed expected flag matching "tap", Missed expected flag matching "analysis" | ❌ **MISS** | Pleural effusion missing fluid analysis |
| 31 | A | Diabetic foot ulcer missing vascular assessment / grade | Must flag: [Doppler, vascular, grade]; Should Generate | Missed expected flag matching "Doppler", Missed expected flag matching "vascular", Missed expected flag matching "grade" | ❌ **MISS** | Diabetic foot ulcer missing vascular assessment / grade |
| 32 | A | Tympanoplasty missing audiometry findings | Must flag: [audiometry]; Should Generate | Missed expected flag matching "audiometry" | ❌ **MISS** | Tympanoplasty missing audiometry findings |
| 33 | A | Vitrectomy missing fundoscopy/B-scan details | Must flag: [fundoscopy, scan, imaging]; Should Generate | Missed expected flag matching "fundoscopy", Missed expected flag matching "scan", Missed expected flag matching "imaging" | ❌ **MISS** | Vitrectomy missing fundoscopy/B-scan details |
| 34 | A | Congestive heart failure missing Echocardiogram/BNP | Must flag: [Echocardiogram, Echo, BNP]; Should Generate | Missed expected flag matching "Echocardiogram", Missed expected flag matching "Echo" | ❌ **MISS** | Congestive heart failure missing Echocardiogram/BNP |
| 35 | A | Spinal fusion missing MRI/conservative management | Must flag: [MRI, conservative-management]; Should Generate | Missed expected flag matching "conservative-management" | ❌ **MISS** | Spinal fusion missing MRI/conservative management |
| 36 | A | Fistulectomy missing MRI fistulogram | Must flag: [MRI, fistulogram, imaging]; Should Generate | Missed expected flag matching "MRI", Missed expected flag matching "fistulogram", Missed expected flag matching "imaging" | ❌ **MISS** | Fistulectomy missing MRI fistulogram |
| 37 | A | DJ stenting missing stone size / kidney function | Must flag: [creatinine, urea, stone, size]; Should Generate | Missed expected flag matching "creatinine", Missed expected flag matching "urea" | ❌ **MISS** | DJ stenting missing stone size / kidney function |
| 38 | A | Liver cirrhosis with ascites missing USG / fluid analysis | Must flag: [ultrasound, USG, fluid, tap]; Should Generate | Missed expected flag matching "ultrasound", Missed expected flag matching "USG", Missed expected flag matching "fluid", Missed expected flag matching "tap" | ❌ **MISS** | Liver cirrhosis with ascites missing USG / fluid analysis |
| 39 | A | AKI missing creatinine trend or urine output | Must flag: [creatinine, urine, serial]; Should Generate | Missed expected flag matching "creatinine", Missed expected flag matching "serial" | ❌ **MISS** | AKI missing creatinine trend or urine output |
| 40 | A | Hemorrhoids missing grade / conservative treatment | Must flag: [grade, conservative-management]; Should Generate | Missed expected flag matching "grade", Missed expected flag matching "conservative-management" | ❌ **MISS** | Hemorrhoids missing grade / conservative treatment |
| 41 | A | Myomectomy missing ultrasound fibroid dimensions | Must flag: [fibroid, size, ultrasound, USG]; Should Generate | Missed expected flag matching "ultrasound", Missed expected flag matching "USG" | ❌ **MISS** | Myomectomy missing ultrasound fibroid dimensions |
| 42 | A | Radiotherapy missing histopathology / plan sheet | Must flag: [histopathology, biopsy, treatment, sheet]; Should Generate | Missed expected flag matching "histopathology", Missed expected flag matching "biopsy" | ❌ **MISS** | Radiotherapy missing histopathology / plan sheet |
| 43 | A | Asthma exacerbation missing SpO2 or peak flow | Must flag: [SpO2, peak, flow, PEFR]; Should Generate | Missed expected flag matching "SpO2", Missed expected flag matching "peak", Missed expected flag matching "flow", Missed expected flag matching "PEFR" | ❌ **MISS** | Asthma exacerbation missing SpO2 or peak flow |
| 44 | A | Typhoid missing Widal or culture reports | Must flag: [Widal, culture, blood]; Should Generate | Missed expected flag matching "Widal", Missed expected flag matching "culture", Missed expected flag matching "blood" | ❌ **MISS** | Typhoid missing Widal or culture reports |
| 45 | A | Carpal tunnel release missing EMG/NCS | Must flag: [nerve, EMG, NCS, conduction]; Should Generate | Missed expected flag matching "nerve", Missed expected flag matching "EMG", Missed expected flag matching "NCS", Missed expected flag matching "conduction" | ❌ **MISS** | Carpal tunnel release missing EMG/NCS |
| 46 | B | Sufficient appendicitis (Seed 16) | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient appendicitis (Seed 16) |
| 47 | B | Sufficient pneumonia (Seed 17) | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "details of IV antibiotics administered" is not documented in the clinical narrative. | ⚠️ **OVER-FLAG** | Sufficient pneumonia (Seed 17) |
| 48 | B | Sufficient MI (Seed 18) | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Patient's age (60M)" is not documented in the clinical narrative.; To assess whether the patient has a history of cardiac conditions that could contribute to the current presentation.; To assess whether the patient has a history of cardiac conditions that could contribute to the current presentation. | ⚠️ **OVER-FLAG** | Sufficient MI (Seed 18) |
| 49 | B | Sufficient dengue (Seed 19) | Should Generate | Flagged clinical queries on sufficient case: Documented vitals are stable and the reason for hospitalization does not demonstrate acute medical necessity. The most common TPA rejection reason for this condition is that it is OPD-manageable. | ⚠️ **OVER-FLAG** | Sufficient dengue (Seed 19) |
| 50 | B | Sufficient bilateral TKR (Seed 20) | Should Generate | Flagged clinical queries on sufficient case: Bilateral/simultaneous procedure — provide clinical justification (vs staged); insurers commonly query this.; Diabetes/hypertension/cardiac/renal present with no past-treatment history/records — TPA will query to establish PED status. | ⚠️ **OVER-FLAG** | Sufficient bilateral TKR (Seed 20) |
| 51 | B | Sufficient TURP | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient TURP |
| 52 | B | Sufficient cholecystectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient cholecystectomy |
| 53 | B | Sufficient unilateral TKR | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient unilateral TKR |
| 54 | B | Sufficient asthma exacerbation | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient asthma exacerbation |
| 55 | B | Sufficient PTCA stenting | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "ECG" is not documented in the clinical narrative. | ⚠️ **OVER-FLAG** | Sufficient PTCA stenting |
| 56 | B | Sufficient vaginal hysterectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient vaginal hysterectomy |
| 57 | B | Sufficient appendectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient appendectomy |
| 58 | B | Sufficient CKD dialysis | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient CKD dialysis |
| 59 | B | Sufficient chemotherapy cycle | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient chemotherapy cycle |
| 60 | B | Sufficient stroke admission | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient stroke admission |
| 61 | B | Sufficient inguinal hernioplasty | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient inguinal hernioplasty |
| 62 | B | Sufficient cataract phaco | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient cataract phaco |
| 63 | B | Sufficient septoplasty | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient septoplasty |
| 64 | B | Sufficient myomectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient myomectomy |
| 65 | B | Sufficient fistulectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient fistulectomy |
| 66 | C | Hinglish/Layman term: heart attack (Seed 21) | Should Block; ICD category: I21 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish/Layman term: heart attack (Seed 21) |
| 67 | C | Layman term: sugar (Seed 22) | Should Block; ICD category: E11 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: sugar (Seed 22) |
| 68 | C | Layman term: high BP (Seed 23) | Should Block; ICD category: I10 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: high BP (Seed 23) |
| 69 | C | Dengue fever lookup (Seed 24) | Should Block; ICD category: A90 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Dengue fever lookup (Seed 24) |
| 70 | C | Typhoid fever lookup (Seed 25) | Should Block; ICD category: A01 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Typhoid fever lookup (Seed 25) |
| 71 | C | Malaria lookup (Seed 26) | Should Block; ICD category: B54 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Malaria lookup (Seed 26) |
| 72 | C | Tuberculosis lookup (Seed 27) | Should Block; ICD category: A15 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Tuberculosis lookup (Seed 27) |
| 73 | C | Hinglish term: dil ka daura (Seed 28) | Should Block; ICD category: I21 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish term: dil ka daura (Seed 28) |
| 74 | C | Pneumonia lookup (Seed 29) | Should Block; ICD category: J18 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Pneumonia lookup (Seed 29) |
| 75 | C | Knee osteoarthritis lookup (Seed 30) | Should Block; ICD category: M17 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Knee osteoarthritis lookup (Seed 30) |
| 76 | C | Nonsense term yields empty result (Seed 31) | Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Nonsense term yields empty result (Seed 31) |
| 77 | C | US-CM code M17.11 triggers invalid WHO block (Seed 32) | Must flag: [not a valid WHO]; Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | US-CM code M17.11 triggers invalid WHO block (Seed 32) |
| 78 | C | Layman term: kidney stone | Should Block; ICD category: N20 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: kidney stone |
| 79 | C | Standard term: acute appendicitis | Should Block; ICD category: K35 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Standard term: acute appendicitis |
| 80 | C | Layman term: breast cancer | Should Block; ICD category: C50 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: breast cancer |
| 81 | C | Standard term: cataract | Should Block; ICD category: H25 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Standard term: cataract |
| 82 | C | Layman term: stroke | Should Block; ICD category: I63 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: stroke |
| 83 | C | Hinglish term: khoon ki kami (Anemia) | Should Block; ICD category: D64 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish term: khoon ki kami (Anemia) |
| 84 | C | Hinglish term: pet dard (Abdominal Pain) | Should Block; ICD category: R10 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish term: pet dard (Abdominal Pain) |
| 85 | C | US-CM code K35.80 triggers invalid WHO block | Must flag: [not a valid WHO]; Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | US-CM code K35.80 triggers invalid WHO block |
| 86 | D | Missing patient name blocks generation (Seed 33) | Must flag: [Patient Name is required]; Should Block | Blocked: Patient Name is required. | ✅ **PASS** | Missing patient name blocks generation (Seed 33) |
| 87 | D | ICD not confirmed blocks generation (Seed 34) | Must flag: [ICD-10 code is required]; Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | ICD not confirmed blocks generation (Seed 34) |
| 88 | D | Surgical case with ₹0 surgical costs blocks generation (Seed 35) | Must flag: [Surgical procedure requires Surgeon Fee, implants]; Should Block | Blocked: Surgical procedure requires Surgeon Fee, OT Charges, or Implants Cost to be non-zero. | ✅ **PASS** | Surgical case with ₹0 surgical costs blocks generation (Seed 35) |
| 89 | D | Cost items do not sum to total triggers warning (Seed 36) | Must flag: [Total Cost mismatch]; Should Generate | Success: Document Generated | ✅ **PASS** | Cost items do not sum to total triggers warning (Seed 36) |
| 90 | D | Missing doctor registration number blocks generation (Seed 37) | Must flag: [Doctor Registration Number is required]; Should Block | Blocked: Doctor Registration Number is required. | ✅ **PASS** | Missing doctor registration number blocks generation (Seed 37) |
| 91 | D | Planned admission date in the past triggers warning (Seed 38) | Must flag: [Planned admission date, cannot be in the past]; Should Generate | Success: Document Generated | ✅ **PASS** | Planned admission date in the past triggers warning (Seed 38) |
| 92 | D | Missing admission date blocks generation | Must flag: [Date of Admission is required]; Should Block | Blocked: Date of Admission is required. | ✅ **PASS** | Missing admission date blocks generation |
| 93 | D | Room rent mismatch triggers warning | Must flag: [Room Rent mismatch]; Should Generate | Success: Document Generated | ✅ **PASS** | Room rent mismatch triggers warning |
| 94 | E | Check for absence of TPA auto-reject authority language (Seed 39) | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of TPA auto-reject authority language (Seed 39) |
| 95 | E | Check for absence of drug/dose recommendations in surgical query (Seed 40) | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of drug/dose recommendations in surgical query (Seed 40) |
| 96 | E | Check for absence of non-WHO ICD codes in model output (Seed 41) | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of non-WHO ICD codes in model output (Seed 41) |
| 97 | E | Check that model does not fabricate clinical facts/vitals (Seed 42) | Should Generate | Success: Document Generated | ✅ **PASS** | Check that model does not fabricate clinical facts/vitals (Seed 42) |
| 98 | E | Check for absence of medical treatments / drug recommendations in queries | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of medical treatments / drug recommendations in queries |
| 99 | E | Check that the model does not assert an alternate diagnosis | Should Generate | Success: Document Generated | ✅ **PASS** | Check that the model does not assert an alternate diagnosis |
| 100 | E | Check that the model does not output computed probability values | Should Generate | Success: Document Generated | ✅ **PASS** | Check that the model does not output computed probability values |


## Ranked Failure Summary

### 1. ERRORS / CRASHES (0)
*None.*

### 2. SAFETY-LEAKS (0)
*None.*

### 3. CRITICAL MISSES (35)
- **Case 3**: Missed expected flag matching "PED"
- **Case 4**: Missed expected flag matching "PED"
- **Case 5**: Missed expected flag matching "conservative-management"
- **Case 6**: Missed expected flag matching "investigation", Missed expected flag matching "under-supported"
- **Case 7**: Missed expected flag matching "USG"
- **Case 8**: Missed expected flag matching "conservative-management"
- **Case 10**: Missed expected flag matching "obstetric"
- **Case 12**: Missed expected flag matching "neuroimaging"
- **Case 14**: Missed expected flag matching "limit"
- **Case 15**: Missed expected flag matching "angiography", Missed expected flag matching "necessity"
- **Case 16**: Missed expected flag matching "conservative-management"
- **Case 17**: Missed expected flag matching "residual", Missed expected flag matching "IPSS"
- **Case 18**: Missed expected flag matching "necessity", Missed expected flag matching "OPD"
- **Case 19**: Missed expected flag matching "USG"
- **Case 20**: Missed expected flag matching "biopsy"
- **Case 21**: Missed expected flag matching "CT", Missed expected flag matching "MRI", Missed expected flag matching "investigations"
- **Case 25**: Missed expected flag matching "amylase", Missed expected flag matching "lipase", Missed expected flag matching "imaging"
- **Case 27**: Missed expected flag matching "necessity", Missed expected flag matching "OPD"
- **Case 29**: Missed expected flag matching "culture", Missed expected flag matching "investigation"
- **Case 30**: Missed expected flag matching "tap", Missed expected flag matching "analysis"
- **Case 31**: Missed expected flag matching "Doppler", Missed expected flag matching "vascular", Missed expected flag matching "grade"
- **Case 32**: Missed expected flag matching "audiometry"
- **Case 33**: Missed expected flag matching "fundoscopy", Missed expected flag matching "scan", Missed expected flag matching "imaging"
- **Case 34**: Missed expected flag matching "Echocardiogram", Missed expected flag matching "Echo"
- **Case 35**: Missed expected flag matching "conservative-management"
- **Case 36**: Missed expected flag matching "MRI", Missed expected flag matching "fistulogram", Missed expected flag matching "imaging"
- **Case 37**: Missed expected flag matching "creatinine", Missed expected flag matching "urea"
- **Case 38**: Missed expected flag matching "ultrasound", Missed expected flag matching "USG", Missed expected flag matching "fluid", Missed expected flag matching "tap"
- **Case 39**: Missed expected flag matching "creatinine", Missed expected flag matching "serial"
- **Case 40**: Missed expected flag matching "grade", Missed expected flag matching "conservative-management"
- **Case 41**: Missed expected flag matching "ultrasound", Missed expected flag matching "USG"
- **Case 42**: Missed expected flag matching "histopathology", Missed expected flag matching "biopsy"
- **Case 43**: Missed expected flag matching "SpO2", Missed expected flag matching "peak", Missed expected flag matching "flow", Missed expected flag matching "PEFR"
- **Case 44**: Missed expected flag matching "Widal", Missed expected flag matching "culture", Missed expected flag matching "blood"
- **Case 45**: Missed expected flag matching "nerve", Missed expected flag matching "EMG", Missed expected flag matching "NCS", Missed expected flag matching "conduction"

### 4. OVER-FLAGS (5)
- **Case 47**: Flagged clinical queries on sufficient case: Required diagnostic anchor "details of IV antibiotics administered" is not documented in the clinical narrative.
- **Case 48**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Patient's age (60M)" is not documented in the clinical narrative.; To assess whether the patient has a history of cardiac conditions that could contribute to the current presentation.; To assess whether the patient has a history of cardiac conditions that could contribute to the current presentation.
- **Case 49**: Flagged clinical queries on sufficient case: Documented vitals are stable and the reason for hospitalization does not demonstrate acute medical necessity. The most common TPA rejection reason for this condition is that it is OPD-manageable.
- **Case 50**: Flagged clinical queries on sufficient case: Bilateral/simultaneous procedure — provide clinical justification (vs staged); insurers commonly query this.; Diabetes/hypertension/cardiac/renal present with no past-treatment history/records — TPA will query to establish PED status.
- **Case 55**: Flagged clinical queries on sufficient case: Required diagnostic anchor "ECG" is not documented in the clinical narrative.
