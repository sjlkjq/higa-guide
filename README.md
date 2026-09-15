# HiGA Interview Training

Source repository for Shimpei's HiGA interview training system.

## Architecture

- **Google Sheet (private):** question bank, strategy, state, attempts, event log, acknowledgements.
- **Google Apps Script Web App:** live UI and controlled writes to the private sheet.
- **This public GitHub repository:** application shell/source only. The private question bank and progress data are not committed here.

## Roles

- **Student:** home practice and progress view.
- **Reviewer:** teacher view. Can review home practice and record live interview sessions, but has no system configuration UI.
- **Admin:** parent view. Same review functions plus administrative ownership of the system.

URL format:

- Student: `<DEPLOYMENT_URL>?role=student&token=<student_token>`
- Reviewer / teacher: `<DEPLOYMENT_URL>?role=reviewer&token=<reviewer_token>`
- Admin / parent: `<DEPLOYMENT_URL>?role=admin&token=<parent_token>`

Tokens are stored only in the private spreadsheet's `Config` tab. Do not commit them to GitHub.

## Automatic Apps Script deployment

The repository contains:

- `appsscript.json` — Apps Script manifest
- `.claspignore` — limits what clasp pushes
- `deploy-apps-script.yml.template` — GitHub Actions workflow template

Once the one-time GitHub Actions setup is completed, updates to `Code.gs`, `index.html` or `appsscript.json` on `main` can be pushed automatically to the existing Apps Script web-app deployment. The existing web-app URL stays the same.

Required GitHub Actions secrets:

- `APPS_SCRIPT_ID` — Apps Script project Script ID
- `CLASPRC_JSON` — OAuth credentials created by a one-time `clasp login`; treat this as a secret and never commit it

The current production deployment ID is already referenced by the workflow template.

### One-time setup

1. In Apps Script, open **プロジェクトの設定** and copy **スクリプト ID**.
2. Enable **Google Apps Script API** at the Apps Script user settings page.
3. On the owner's Windows PC, install Node.js if needed, then run:
   - `npm install -g @google/clasp`
   - `clasp login`
4. Copy the contents of `%USERPROFILE%\.clasprc.json` into the GitHub Actions secret `CLASPRC_JSON`.
5. Add the copied Script ID as the GitHub Actions secret `APPS_SCRIPT_ID`.
6. Move/copy `deploy-apps-script.yml.template` to `.github/workflows/deploy-apps-script.yml`.
7. Run the workflow once with **Actions -> Deploy Apps Script -> Run workflow**.

After that, code updates on `main` deploy automatically.

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
