# Backend changes needed (Apps Script `Code.gs`)

`Code.gs` is not in this repository, so these changes have to be made by hand in the
Apps Script editor. After editing: **Deploy → Manage deployments → Edit → Version: New version → Deploy**
(otherwise the `/exec` URL keeps running the old code; the URL itself stays the same).

## Why results go missing

Measured on the live backend (19 Nov 2026): every request runs behind one script lock.
With 40 simultaneous requests (dummy requests that write nothing), the median reply took 17 s, the slowest 32 s, and one failed with
*"Time-out van vergrendeling: een ander proces heeft de vergrendeling te lang vastgehouden"* (lock time-out).
Real saves hold the lock longer, so a class submitting at the same time hits this often.
The old front end gave up after 3 attempts within about 2.5 s. Then:

* a topic save fails → the participant sees an error and often closes the page;
* the final `finish` call fails → the participant stays `in_progress`, and the dashboard **hides
  unfinished participants and all their saved answers by default**.

The front end now retries for several minutes with back-off and keeps retrying automatically.
The changes below make the backend safe for that.

## 1. Save queue + duplicate protection → `backend/queue.gs`

Add [`backend/queue.gs`](backend/queue.gs) to the Apps Script project (setup steps are at the top of
the file). In short: rename the current `doPost(e)` in `Code.gs` to `handlePost_(body)`, run
`installQueueTrigger()` once, and deploy a new version.

* `topic` and `finish` are stored in a queue (Script Properties) and acknowledged at once, without
  waiting for the Sheet lock. A trigger writes the queue to the Sheet every minute, oldest first, using
  the existing handler code. The Sheet and the dashboard can therefore be up to ~1 minute behind.
* `start` still runs directly, because it has to return the assigned condition.
* Every request carries a stable `rid`. A retry of something already handled gets the same answer and
  is not saved twice, and a retry that arrives while the item is still waiting just overwrites it.
* Items the Sheet code refuses (e.g. *Unknown participant*) are kept as `dead:` properties instead of
  being lost. `queueStatus()` shows what is waiting and what was refused.
* Limits: Script Properties hold 500 kB in total (about 80 participants' worth of unsaved answers,
  emptied every minute) and 9 kB per item (larger items are saved directly, as before).

## 2. Hold the lock shorter (still useful for `start` and the queue drain)

* Read what you need (participant lookup, condition counts) **before** `lock.waitLock(...)`.
  Only the write and, for `start`, the condition pick need the lock.
* Prefer one `sheet.getRange(...).setValues(rows)` over 3 × `appendRow` for a topic.
* When the lock can't be taken, return `{"error":"busy","status":503}` (not 400/403), so the
  survey (and the queue) keeps retrying.

## 3. Class group (`/class/`)

The page `https://lstierman.github.io/ai-research-seminar-survey/class/` sends on `start`:
`{ action:"start", test:true, group:"class", key:"<class login ID>", rid, ... }`.

1. Apps Script → Project settings → Script properties → add `CLASS_KEY` = the class login ID
   (sent to you separately — do not commit it).
2. In the `start` handler, before the existing dashboard-key check for test runs:

```js
var isClass = body.group === "class";
if (isClass) {
  if (body.key !== PropertiesService.getScriptProperties().getProperty("CLASS_KEY"))
    return json_({ error: "Wrong class login ID", status: 403 }); // use your existing JSON-reply helper
  body.test = true;                 // stored as test data: excluded from balancing, purgeable
} else if (body.test) {
  /* existing check: body.key must equal the dashboard key */
}
```

3. Add a `group` column at the end of the **participants** sheet header and write
   `isClass ? "class" : ""` into it. `action=data` already returns all columns, and the dashboard
   reads `group` to show the new **Include class group** toggle.
