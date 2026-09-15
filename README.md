# HiGA Interview Training

Source repository for Shimpei's HiGA interview training system.

## Architecture

- **Google Sheet (private):** question bank, strategy, state, attempts, event log, acknowledgements.
- **Google Apps Script Web App:** live UI and controlled writes to the private sheet.
- **This public GitHub repository:** application shell/source only. The private question bank and progress data are not committed here.

## Deploy the live app

1. Open the private spreadsheet **HiGA Interview Training DB - Shimpei**.
2. Open **Extensions -> Apps Script**.
3. Replace `Code.gs` with the contents of `Code.gs` in this repository.
4. Add an HTML file named **Index** and paste the contents of `index.html`.
5. Deploy -> **New deployment** -> **Web app**.
6. Execute as: **Me**.
7. Who has access: choose the broadest option available that lets both parent and student open the app. Access is still protected by the app tokens stored in the private Config sheet.
8. Copy the deployment URL.
9. Use:
   - Student: `<DEPLOYMENT_URL>?role=student&token=<student_token>`
   - Parent: `<DEPLOYMENT_URL>?role=parent&token=<parent_token>`

The tokens are already stored in the private spreadsheet's `Config` tab. Do not commit them to GitHub.

## Why completion cannot be batch-checked

A valid attempt is created only after the system records:

1. the configured thinking timer;
2. at least two student key points;
3. an aloud-answer confirmation;
4. the required number of follow-up answers;
5. a short reflection.

The student cannot manually mark a question `Ready`. Parent/coach review determines readiness using Content, Logic, Specificity, English, Delivery and Ownership.

## Privacy

Do not move the private Google Sheet data into this public repository. Keep submitted-application details, attempt history and scoring in Google Sheets.
