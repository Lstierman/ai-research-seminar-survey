/*
 * SURVEY SETTINGS — the only file you normally need to edit before launch.
 */
window.SURVEY_CONFIG = {
  // ── Backend ────────────────────────────────────────────────────────────────
  // Paste the "Web app URL" you get when you deploy backend/Code.gs (see LAUNCH.md), e.g.
  // "https://script.google.com/macros/s/AKfycb.../exec"
  // Leave empty when running locally with `npm run local` (it then uses /api automatically).
  backendUrl: "",

  // ── Study texts ────────────────────────────────────────────────────────────
  studyTitle: "Learning from an AI assistant",
  estimatedMinutes: 30,
  contactName: "Leander Stierman",
  contactEmail: "", // TODO before launch: shown on the consent and thank-you pages
  institution: "Ghent University — AI Research Seminar 2026",

  // ── Media ──────────────────────────────────────────────────────────────────
  // Put the files in docs/media/audio and docs/media/video, named <topic>_<variant>.<ext>,
  // e.g. topic1_correct.mp3, topic1_error_easy.mp4 (full list: open check.html).
  audioExt: "mp3",
  videoExt: "mp4",
  // Participants can only continue after the audio/video has played to the end once.
  requireFullPlay: true,
  // Text explanations: minimum seconds per word before "Continue" unlocks (0 = no minimum).
  // 0.12 s/word ≈ 40 s for a 330-word explanation.
  textMinSecondsPerWord: 0.12,

  // ── Questions ──────────────────────────────────────────────────────────────
  // Shuffle the order of the A–D options per participant (the stored answer is always the original letter).
  // Recommended: in the source document B is correct for most questions.
  shuffleOptions: true,
  certaintyLabels: [
    "1 — Not sure at all (guessing)",
    "2 — Slightly sure",
    "3 — Moderately sure",
    "4 — Very sure",
    "5 — Completely sure",
  ],

  // ── Final questions after the 6 topics ────────────────────────────────────
  // Types:
  //   "choice" – options: ["...", "..."]         (stored as the option text)
  //   "scale"  – options: ["1 — ...", ..., "5 — ..."] (stored as the option text)
  //   "text"   – free text
  // followUp shows a conditional prompt inline without adding another question screen.
  extraQuestions: [
    {
      id: "pleasant_modality",
      type: "choice",
      prompt: "Which format did you find most pleasant to use?",
      options: ["Text", "Voice/audio", "Video"],
      required: true,
    },
    {
      id: "clearest_modality",
      type: "choice",
      prompt: "Which format gave you the clearest explanations?",
      options: ["Text", "Voice/audio", "Video"],
      required: true,
    },
    {
      id: "noticed_errors",
      type: "choice",
      prompt: "Do you think the AI assistant made any mistakes in its explanations?",
      options: ["Yes", "No"],
      required: true,
      followUp: {
        id: "estimated_error_count",
        type: "scale",
        prompt: "If yes, how many errors do you think the AI assistant made?",
        options: ["1 — error", "2 — errors", "3 — errors", "4 — errors", "5 — errors", "6 — errors"],
      },
    },
  ],

  // ── Devices ────────────────────────────────────────────────────────────────
  // true = phones are refused (as in experiment-design.md); false = phones only get a warning.
  blockPhones: false,
};
