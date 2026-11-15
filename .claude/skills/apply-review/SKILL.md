---
name: apply-review
description: Apply findings from a code or design review. Fix each issue with its suggested fix, or in an obvious, mechanical way that doesn't change behavior; ask the user (AskUserQuestion) about everything else. Use after a reviewer reports issues and the user wants them addressed.
argument-hint: "[review findings or where to find them]"
---

Apply the review findings ($ARGUMENTS, or the most recent review in this conversation).

Fix issues with suggested fixes or in an obvious, mechanical way that doesn't change
behavior. For the rest, use the AskUserQuestion tool for the user to review.

How to sort each finding:

- **Fix directly** when the reviewer's suggested fix is unambiguous, or the fix is
  mechanical (a wrong citation, a typo, a contradiction with one obvious resolution, a
  missing case in a list) and leaves user-visible behavior and earlier decisions unchanged.
- **Ask** when a fix changes behavior, picks between several reasonable options, or
  touches a decision the user already made. Give each question a recommended option
  (listed first, marked "(Recommended)") and enough context to answer it without
  reading the review. Ask before editing, so the result is written once.

Then apply the answers, record new decisions where the project records them (for a
design doc, its decisions list), and report briefly: what was fixed directly, what was
decided, and anything left open.
