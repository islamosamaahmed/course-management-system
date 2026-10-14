# S.T.C AI intent handling

S.T.C AI keeps its existing authenticated chat route and database tools. The intent layer in `server/ai-intents.js` groups natural Arabic and English requests into semantic intents, records their required data, optional parameters, permissions, and example variations, then `server/ai-assistant.js` routes each request to the existing application tools.

Intent examples are reference material, not exact-match triggers. Classification uses normalized Arabic, common Egyptian phrasing, domain terms, first-person/other-student scope, relative dates, numbers and comparison operators, plus the previous turns where a short follow-up needs context.

## Data and permissions

- Student profile, schedule, attendance, exam attempts, payments and notifications are fetched on demand for the authenticated user. Student queries resolve the student record through that user ID and filter related records by the same student ID or active enrollment.
- A student asking for another student's private data is denied before any other-student data query runs. The existing group-attendance route may answer with only the authenticated student's own status.
- Financial threshold queries against other students are limited to assistant/admin roles and bind the parsed amount as a SQL parameter. All other staff queries continue to use existing role permissions.
- Exam result tools only read submitted attempts belonging to the current student. They do not retrieve answer keys or reveal correct answers during an active exam.
- The application does not currently store a lecture location or a separate public-announcements feed. The assistant says when those details are unavailable instead of inventing them; announcement-style requests use the student's own notification feed.
- Account-security questions provide navigation guidance or read the current user's Google link status. The assistant never changes passwords or OAuth links.

## Extending intents

Add intent metadata and examples to `STUDENT_INTENTS`, then refine `classifyStudentIntent` without turning example sentences into exact-match conditions. If the intent needs a new source of data, add a parameterized tool that scopes its query to the authenticated identity and add route-level tests for both returned data and denied access.

Run `npm run check`, `node --test tests/ai-assistant.test.js`, and `npm test` after changing intent classification or tool access.
