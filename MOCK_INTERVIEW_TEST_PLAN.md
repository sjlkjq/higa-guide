# Mock Interview Comprehensive QA Plan

Date: 2026-09-28

## Roles

### Specification QA
Confirms the product contract:
- interviewer questions are deterministic and pre-approved;
- no LLM generates live interview questions;
- Parent/Admin use is test-only and must never contaminate applicant history;
- Shimpei and Shiori data remain isolated by profile/session;
- existing HiGA Interview Training remains unaffected.

### Development QA
Checks implementation correctness across Apps Script backend, browser UI, GitHub Pages routing, persistence, retries, and telemetry.

### Independent test QA
Treats all implementation assumptions as untrusted. Tests both expected behavior and adversarial/malformed inputs.

## Automated coverage

### A. Authentication and roles
- Student bootstrap = persistent mode.
- Admin bootstrap = test mode.
- Reviewer bootstrap = test mode.
- Role spoofing cannot change the role determined by the token.
- Invalid tokens cannot bootstrap/start/save/finish.

### B. Question-bank delivery
- Inactive questions are excluded.
- Questions are ordered numerically within profile.
- Unknown/inactive question IDs cannot be saved.
- Runtime speaks only stored question_text.
- No OpenAI/Anthropic/Gemini/live question-generation endpoint exists in runtime.

### C. Applicant/profile isolation
- Shimpei sessions persist as Shimpei.
- Shiori sessions persist as Shiori.
- Invalid profiles cannot start.
- Payload profile must match question profile.
- Session profile must match answer profile/question profile.

### D. Parent/Admin test safety
- Admin start creates no MockSessions row.
- Admin answer creates no MockAnswers row.
- Admin finish mutates no applicant row.
- Same checks apply to both Shimpei and Shiori.
- Reviewer direct access is also non-persistent.
- UI labels Parent/Admin test sessions as not saved.

### E. Session lifecycle and retry safety
- Missing session rejects answer.
- Duplicate session ID rejects duplicate creation.
- Duplicate answer retry is idempotent: one answer row, one counter increment.
- Answers cannot be appended after completion.
- Missing finish session fails cleanly.
- Repeated finish is idempotent and does not overwrite original completion.
- Finishing one session cannot mutate another.

### F. Telemetry
- Valid latency/duration/silence persist.
- Blank/null telemetry remains blank, not zero.
- Negative telemetry is clamped to zero.
- Main/follow-up counters increment independently.
- Recognition error state is cleared between questions.
- Repeating a question resets timing/transcript/recognition state.

### G. Browser/audio fallback
- TTS uses configured question language.
- Speech recognition uses configured question language.
- Unsupported speech recognition has a fallback path.
- Microphone denial does not crash interview flow.
- Live transcript remains hidden from applicant.

### H. Routing / integration
- Root /mock.html exists.
- Root mock route forwards to Apps Script mode=mock.
- Parent/Admin launcher uses fixed Apps Script deployment URL, not iframe origin.
- Mock UI is isolated from legacy training doGet.
- Parent/Admin and Student navigation expose Mock Interview as designed.

### I. Malformed input
- Null/malformed start payload is rejected cleanly.
- Null/malformed answer payload is rejected cleanly.
- Null/malformed finish payload is rejected cleanly.

## Live production-data audit

The production Google Sheet MockQuestions / MockSessions / MockAnswers was audited separately from the simulated test harness.

Checks:
- unique question IDs;
- allowed profiles only;
- allowed source types only;
- allowed main/followup kinds only;
- required fields present;
- every follow-up parent_id resolves;
- no main question has a parent_id;
- no duplicate order within profile;
- language matches interview phase;
- official_sample rows are explicitly identified;
- current applicant MockSessions and MockAnswers row counts checked.

## Initial comprehensive run

Automated test total: 109
Pass: 100
Fail: 9

Defects exposed:
1. session/profile mismatch was not rejected;
2. blank latency converted to zero;
3. duplicate answer retry duplicated data/counters;
4. answers could be appended after session completion;
5. null/blank timing fields converted to zero;
6. recognition error leaked to the next question;
7. repeating a question did not reset answer timing/transcript state;
8. malformed answer payload could throw;
9. one question-order test contained an incorrect expected global profile order; test corrected (not a product defect).

## Fix verification run

Automated test total: 117
Pass: 117
Fail: 0

All product defects above were fixed and regression cases remain in the permanent suite.
