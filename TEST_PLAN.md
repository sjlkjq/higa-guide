# HiGA Interview Training - Automated Test Plan

## Scope

The automated suite protects the critical paths of the Student, Reviewer and Admin application, the GitHub Pages portal, and the Apps Script/Google Sheet workflow.

## Unit tests

### Portal routing
- Student hash parses correctly.
- Reviewer hash parses correctly.
- Admin hash parses correctly.
- Hash parameters override stale query parameters.
- Invalid roles are rejected.
- Short/invalid tokens are rejected by the portal shell.
- Apps Script iframe URL is built with the selected role/token.
- Canonical public URL keeps role/token in the fragment rather than the HTTP query.

### Authorization and configuration
- Student token resolves to Student even if another role is requested.
- Reviewer token resolves to Reviewer.
- Parent token resolves to Admin.
- Unknown tokens are rejected.
- Public config does not expose private tokens.
- Boolean configuration parsing is normalized.
- Meaningful key-point line counting works as required.

### Readiness logic
- Low reasoning scores result in Weak.
- Passing-but-not-ready scores result in Developing.
- Ready requires the configured minimum number of reviewed attempts.
- Ready requires every core dimension to meet the threshold.

### UI source contracts
- No normal-flow browser `alert()` remains.
- Home scoring uses Content, Logic, Specificity and Ownership only.
- Delivery is added only to live-interview scoring.
- Follow-up key-point fields exist.
- Guided reflection choices exist.

## Integration tests

### Role and bootstrap
- Student bootstrap returns Shimpei / Student.
- Reviewer bootstrap returns Sakai-sensei / Reviewer.
- Admin bootstrap returns Hiro / Admin.
- Invalid access token is rejected.
- Apps Script `doGet` injects the URL role/token before the client starts.

### Home practice
- Valid attempt writes to Attempts and creates/updates State.
- Reviewer cannot submit a Student home attempt.
- Missing main-answer key points are rejected.
- Insufficient thinking time is rejected.
- Missing follow-up key points are rejected.
- Missing guided reflection is rejected.

### Review workflow
- Student cannot submit reviewer scoring.
- All four reasoning scores are required.
- First strong review remains Developing when two reviews are required.
- Second strong review can move the question to Ready.
- One below-threshold core score prevents Ready.
- Reviewer identity and improvement target are persisted.

### Live interview
- Student cannot submit live review.
- All five live dimensions are required.
- Delivery is stored separately.
- Reviewer identity and Delivery note are stored.

### Acknowledgement
- Revisions append to history rather than overwriting prior entries.

### Portal / same-tab role switching regression
- The portal listens for `hashchange`.
- Switching Student -> Admin -> Reviewer in the same browser tab updates the iframe URL each time.
- This directly covers the defect where all links appeared as Shimpei / Student.

## Continuous deployment gates

- `npm test` runs in the standalone test workflow.
- `npm test` runs before Apps Script is pushed/redeployed.
- `npm test` runs before GitHub Pages is deployed.
- A failing test blocks deployment.

## Current result

Latest suite: **35 passed / 0 failed** on Node 24 in GitHub Actions.
