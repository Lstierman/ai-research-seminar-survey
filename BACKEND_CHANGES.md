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

## 1. Ignore duplicates (`rid`)

Every request now carries a stable `rid` (e.g. `topic:P-xxx:3`). If an attempt was saved but the
reply was lost, the retry comes in with the same `rid`. Wrap the existing `doPost` handler:

```js
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var cache = CacheService.getScriptCache();
  if (body.rid) {
    var seen = cache.get("rid:" + body.rid);
    if (seen) return ContentService.createTextOutput(seen).setMimeType(ContentService.MimeType.JSON);
  }
  var out = handlePost_(body);                 // ← rename the current doPost body to handlePost_(body)
  var text = out.getContent();
  if (body.rid && text.indexOf('"error"') < 0) cache.put("rid:" + body.rid, text, 21600); // 6 h
  return out;
}
```

For `topic`, also skip appending if rows for the same `participant_id` + `position` already exist.

## 2. Hold the lock shorter

* Read what you need (participant lookup, condition counts) **before** `lock.waitLock(...)`.
  Only the write (`appendRow` / `setValues`) and, for `start`, the condition pick need the lock.
* Prefer one `sheet.getRange(...).setValues(rows)` over 3 × `appendRow` for a topic.
* When the lock can't be taken, return `{"error":"busy","status":503}` (not 400/403), so the
  survey keeps retrying.

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
