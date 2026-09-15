# HiGA Interview Training

Source repository for Shimpei's HiGA interview training system.

## Architecture

- **Google Sheet (private):** question bank, strategy, state, attempts, event log, acknowledgements.
- **Google Apps Script Web App:** live UI and controlled writes to the private sheet.
- **This public GitHub repository:** application shell/source only. The private question bank and progress data are not committed here.

## Deploy / update the live app

1. Open the private spreadsheet **HiGA Interview Training DB - Shimpei**.
2. Open **拡張機能 -> Apps Script**.
3. Replace `Code.gs` with the contents of `Code.gs` in this repository.
4. Replace the Apps Script HTML file named **index** (lowercase) with the contents of `index.html`.
5. Click **デプロイ -> デプロイを管理 -> 編集（鉛筆） -> バージョン: 新バージョン -> デプロイ**.
6. **次のユーザーとして実行:** 自分.
7. **アクセスできるユーザー:** use the broadest option that lets the student and reviewer open the app. App-level tokens still control the role.
8. The existing Web App URL normally stays the same when the existing deployment is updated.

## Roles

- **Student:** home practice and progress view.
- **Reviewer:** teacher view. Can review home practice and record live interview sessions, but has no system configuration UI.
- **Admin:** parent view. Same review functions plus administrative ownership of the system.

URL format:

- Student: `<DEPLOYMENT_URL>?role=student&token=<student_token>`
- Reviewer / teacher: `<DEPLOYMENT_URL>?role=reviewer&token=<reviewer_token>`
- Admin / parent: `<DEPLOYMENT_URL>?role=admin&token=<parent_token>`

Tokens are stored only in the private spreadsheet's `Config` tab. Do not commit them to GitHub.

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