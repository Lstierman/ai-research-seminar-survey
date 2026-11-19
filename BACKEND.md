# Backend (Apps Script)

The backend `Code.gs` is **not** kept in this repository on purpose: it contains the answer key, and this
repository and its GitHub Pages site are public. It lives in the Google Sheet (Extensions → Apps Script).

## Version 1.1: what the survey here expects

* **Save queue.** `topic` and `finish` saves are stored right away and acknowledged without waiting for the
  Sheet lock. A trigger writes them to the Sheet every minute (the dashboard also triggers it on load).
  Before this, every save waited for one lock. When many participants submitted together, saves timed out
  after 30 s and were lost.
* **Class group.** `start` with `group:"class"` needs the class login ID (Script Property `CLASS_KEY`, also
  shown in the *Info* sheet). These participants are stored as test data with `group = class`.
* The dashboard shows `queue.waiting` / `queue.dead` from `?action=data`.

## Updating the backend

1. Extensions → Apps Script → replace all of `Code.gs` with the new version → Save.
2. Select `setup` → Run. This adds the `group` column, the class login ID and the every-minute `drainQueue`
   trigger. Approve the new permission (triggers). Existing data and the dashboard key are kept.
3. Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy. The `/exec` URL stays the same.

Useful functions in the editor: `queueStatus` (what is waiting / refused), `drainQueue` (write now),
`retryDeadLetters` (put refused saves back in the queue after fixing the cause).
