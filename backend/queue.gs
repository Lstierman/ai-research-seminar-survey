/*
 * SAVE QUEUE for the survey backend: add this file next to Code.gs in the Apps Script project.
 *
 * Problem: every request waits for one script lock while it writes to the Sheet. When a class submits at
 * the same time, requests wait ~30 s and fail with a lock time-out, so answers go missing.
 *
 * Fix: "topic" and "finish" posts are NOT written to the Sheet right away. Each one is stored as one
 * Script Property (durable, no lock needed because every request gets its own key) and acknowledged
 * at once. A time trigger (every minute) drains the queue into the Sheet one item at a time, using the
 * existing handler code. "start" still runs directly, because it must return the assigned condition.
 *
 * Setup (once):
 *   1. In Code.gs rename   function doPost(e) { ... }   to   function handlePost_(body) { ... }
 *      and use the `body` argument instead of parsing e.postData yourself.
 *      It must still return its usual ContentService JSON output.
 *   2. Add this file. Run installQueueTrigger() once from the editor (accept the permissions).
 *   3. Deploy → Manage deployments → Edit → Version: New version → Deploy.
 *
 * Check the queue: run queueStatus() in the editor (View → Logs). Items the Sheet code refused
 * (e.g. "Unknown participant") are kept as "dead:" properties instead of being dropped.
 */

var QUEUED_ACTIONS = { topic: true, finish: true };
var Q_PREFIX = "q:";            // waiting items
var DEAD_PREFIX = "dead:";      // items the handler refused with a 400/403 (kept for inspection)
var MAX_VALUE_BYTES = 8500;     // Script Property values are limited to 9 kB
var DRAIN_BUDGET_MS = 4.5 * 60 * 1000; // stay below the 6-minute execution limit

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return queueReply_({ error: "Bad request", status: 400 }); }
  var cache = CacheService.getScriptCache();

  // A retry of a request that was already handled: answer the same, do nothing.
  if (body.rid) {
    var seen = cache.get("rid:" + body.rid);
    if (seen) return ContentService.createTextOutput(seen).setMimeType(ContentService.MimeType.JSON);
  }

  if (QUEUED_ACTIONS[body.action] && body.pid) {
    var value = JSON.stringify({ t: Date.now(), body: body });
    if (value.length <= MAX_VALUE_BYTES) {
      // The key is the request id, so a retry that arrives while the item is still waiting simply
      // overwrites it with the same content: no duplicate.
      var key = Q_PREFIX + (body.rid || body.action + ":" + body.pid + ":" + Utilities.getUuid());
      PropertiesService.getScriptProperties().setProperty(key, value);
      var ok = JSON.stringify({ ok: true, queued: true });
      if (body.rid) cache.put("rid:" + body.rid, ok, 21600);
      return ContentService.createTextOutput(ok).setMimeType(ContentService.MimeType.JSON);
    }
    // Too large for the queue (very long free-text answers): fall through to a direct save.
  }

  var out = handlePost_(body);
  var text = out.getContent();
  if (body.rid && text.indexOf('"error"') < 0) cache.put("rid:" + body.rid, text, 21600);
  return out;
}

// Runs every minute from the trigger. Safe to run by hand as well.
function drainQueue() {
  // Separate mutex for the drain, so two drains never overlap. The handler keeps using its own lock.
  var mutex = LockService.getUserLock();
  if (!mutex.tryLock(1000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var items = Object.keys(all)
      .filter(function (k) { return k.indexOf(Q_PREFIX) === 0; })
      .map(function (k) { return { key: k, item: JSON.parse(all[k]) }; })
      .sort(function (a, b) { return a.item.t - b.item.t; }); // keeps topic 1..6 before finish

    var started = Date.now();
    for (var i = 0; i < items.length; i++) {
      if (Date.now() - started > DRAIN_BUDGET_MS) break; // the rest goes in the next run
      var it = items[i];
      var res;
      try { res = JSON.parse(handlePost_(it.item.body).getContent()); }
      catch (err) { res = { error: String(err), status: 500 }; }

      if (!res.error) {
        props.deleteProperty(it.key);
      } else if (res.status === 400 || res.status === 403) {
        props.setProperty(DEAD_PREFIX + it.key.slice(Q_PREFIX.length), JSON.stringify({ error: res.error, item: it.item }));
        props.deleteProperty(it.key);
      }
      // Any other error (lock time-out, Sheets hiccup): leave it in the queue for the next run.
    }
  } finally {
    mutex.releaseLock();
  }
}

function installQueueTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "drainQueue") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("drainQueue").timeBased().everyMinutes(1).create();
}

function queueStatus() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var waiting = 0, dead = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(Q_PREFIX) === 0) waiting++;
    else if (k.indexOf(DEAD_PREFIX) === 0) dead.push(k + " → " + JSON.parse(all[k]).error);
  });
  Logger.log("Waiting: " + waiting + "\nRefused (" + dead.length + "):\n" + dead.join("\n"));
  return { waiting: waiting, dead: dead.length };
}

function queueReply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
