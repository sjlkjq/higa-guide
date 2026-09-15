# HiGA Interview Training

Source repository for Shimpei's HiGA interview training system.

## Architecture

- **Google Sheet (private):** question bank, strategy, state, attempts, event log, acknowledgements.
- **Google Apps Script Web App:** live UI and controlled writes to the private sheet.
- **GitHub Pages portal:** clean public-facing wrapper that embeds the Apps Script app so users do not see the Apps Script warning banner.
- **This public GitHub repository:** application shell/source only. The private question bank and progress data are not committed here.

## Roles

- **Student:** home practice and progress view.
- **Reviewer:** teacher view. Can review home practice and record live interview sessions, but has no system configuration UI.
- **Admin:** parent view. Same review functions plus administrative ownership of the system.

Preferred clean portal URL format:

- Student: `https://sjlkjq.github.io/higa-guide/#role=student&token=<student_token>`
- Reviewer / teacher: `https://sjlkjq.github.io/higa-guide/#role=reviewer&token=<reviewer_token>`
- Admin / parent: `https://sjlkjq.github.io/higa-guide/#role=admin&token=<parent_token>`

The role/token are placed in the URL fragment (`#...`) so they are not sent to GitHub Pages as part of the HTTP request. The portal reads them in the browser and forwards them only to the Apps Script iframe.

The direct Apps Script `/exec` URLs remain valid as a fallback, but they show Google's standard Apps Script warning banner.

Tokens are stored only in the private spreadsheet's `Config` tab. Do not commit them to GitHub.

## Automatic Apps Script deployment

The repository contains:

- `appsscript.json` — Apps Script manifest
- `.claspignore` — limits what clasp pushes
- `.github/workflows/deploy-apps-script.yml` — active automatic deployment workflow

Updates to `Code.gs`, `index.html` or `appsscript.json` on `main` are pushed automatically to the existing Apps Script web-app deployment. The existing web-app URL stays the same.

Required GitHub Actions secrets:

- `APPS_SCRIPT_ID` — Apps Script project Script ID
- `CLASPRC_JSON` — OAuth credentials created by a one-time `clasp login`; treat this as a secret and never commit it

## GitHub Pages portal

- Source: `site/index.html`
- Deployment workflow: `.github/workflows/deploy-pages.yml`
- Production URL: `https://sjlkjq.github.io/higa-guide/`

The portal is only a wrapper. The training UI and all Google Sheet access still run inside the existing Apps Script application, so there is no second copy of progress data or business logic.

The Apps Script `doGet` uses `HtmlService.XFrameOptionsMode.ALLOWALL` so the web app can be embedded. Role/token authorization remains enforced by the Apps Script backend.

## Training flow

A valid home-practice attempt records:

1. the configured thinking timer;
2. at least two main-answer key points;
3. an aloud-answer confirmation;
4. required follow-up questions, each with key points from what the student actually said;
5. guided reflection selections.

The student cannot manually mark a question `Ready`. Home practice is reviewed on **Content, Logic, Specificity and Ownership**. English is not routinely scored because it is not the limiting factor for this applicant.

**Delivery** is scored only in a **Live Interview** entry, where the reviewer can actually observe pace, pauses, confidence, eye contact / engagement, and response to follow-up questions.

A reviewer records one or two concrete improvement targets. On the next attempt for the same question, the student sees those targets but not the previous answer, so the new attempt tests independent thinking rather than memorisation.

## Privacy

Do not move the private Google Sheet data into this public repository. Keep application details, attempt history, scoring and reviewer notes in Google Sheets.
