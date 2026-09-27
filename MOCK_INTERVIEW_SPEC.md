# Mock Interview V1 - Specification

## Ownership and review roles

### Specification owner
Responsible for:
- preserving each school's verified interview format;
- separating verified school rules from application-based practice questions;
- preventing invented scoring criteria or invented interview mechanics;
- defining the deterministic interview state machine and acceptance criteria.

### Development owner
Responsible for:
- implementing only approved question text stored in the private Google Sheet;
- preventing the browser or any LLM from generating interview questions;
- preserving the existing HiGA training application;
- recording transcript and timing telemetry without exposing secrets in the public repository.

### Test owner
Responsible for:
- treating the implementation as untrusted until tests pass;
- testing authorization, profile isolation, question ordering, persistence, language switching, microphone fallbacks and session completion;
- checking that no question can be generated outside MockQuestions;
- checking that the production training application remains unaffected.

## Product objective

One simple mock-interview flow:

1. Select Shimpei or Shiori.
2. Start interview.
3. The system reads one pre-approved question aloud.
4. The applicant answers aloud.
5. The system records transcript/timing where the browser supports it.
6. The next pre-approved question is asked.
7. At the end, a factual practice log is shown.

There are no student-facing practice/official modes.

## Source control rules

Every question has:
- source_type
- source_ref
- profile
- language
- phase
- concept

Allowed source types in V1:
- official_sample: question text published by the school;
- application_based: practice question derived from the school's verified interview scope and/or the applicant's submitted/application material.

No question is to be labelled an official school question unless source_type is official_sample.

## Deterministic interview engine

- No LLM generates questions during an interview.
- No LLM rewrites a question during an interview.
- Question order comes only from MockQuestions.order.
- V1 asks the configured sequence exactly as stored.
- A repeated-question action repeats the same stored question.
- A student cannot jump to an arbitrary unapproved question.

## School constraints

### Shimpei / HiGA
The mock is built from the verified 2027 HiGA interview/oral-examination scope and Shimpei's submitted material.
The app must not introduce unverified mechanics such as requiring a whiteboard, requiring handwritten work to camera, or claiming an invented scoring rubric is HiGA's rubric.

### Shiori / Kaichi Tokorozawa GSC
The mock follows the verified 2027 online international selection constraints:
- oral examination/interview in Japanese;
- English oral examination/interview required for GSC applicants;
- published official oral-exam examples may be used exactly as official samples.
The app must not invent an official Japanese/English time split or claim a practice question is an official past question.

Doshisha content is not part of V1. It will be added only after the exact application route and current official interview constraints are grounded.

## Telemetry

Per answer, record where technically available:
- session id
- profile
- question id
- start/end time
- transcript
- response latency
- answer duration
- longest internal silence
- speech detected
- recognition supported/error
- repeat count

Do not infer psychological traits from telemetry.

## V1 feedback

V1 feedback is descriptive only:
- answered questions
- transcript availability
- response latency
- meaningful long pauses
- no-answer/empty-transcript cases

It is not represented as a school's official scoring standard.

## Privacy

- Questions and response data remain in the private Google Sheet.
- GitHub remains public but contains no tokens and no applicant response history.
- Existing role/token authorization remains in the Apps Script backend.

## Acceptance criteria

1. Existing HiGA Training URL continues to load unchanged.
2. Mock URL requires the existing valid access token.
3. Shimpei and Shiori question sets cannot leak into each other.
4. Every spoken question must exactly match a row in MockQuestions.
5. Japanese questions use Japanese TTS/recognition settings; English questions use English settings.
6. Unsupported speech recognition does not crash the interview.
7. A saved answer increments the correct session counters.
8. Completing the interview closes the correct session.
9. No LLM call exists in the interview runtime.
10. Unit/integration tests for the legacy application and mock endpoints pass before merge.
