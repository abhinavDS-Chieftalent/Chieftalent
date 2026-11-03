// All landing-page copy in one place so it can be reviewed as a whole.
// Rules: sentence case, active voice, no em or en dashes, no invented statistics, every claim
// true to the code (see the design spec, "Facts to verify"). Planned features appear only in PLANNED.

export const SALES_LABEL = 'Talk to DotStark'
export const SALES_EMAIL = 'sales@dotstark.com'
export const SALES_MAILTO = `mailto:${SALES_EMAIL}`
export const SUPPORT_EMAIL = 'yash@dotstark.com' // interview problems and candidate data requests
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

export const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#for-candidates', label: 'For candidates' },
  { href: '#data-privacy', label: 'Data & privacy' },
]

export const HERO = {
  line1: 'Fifty CVs in.',
  line2: 'A shortlist out.',
  sub: 'ChiefTalent reads every CV against your job description and interviews the ones who fit. You decide.',
  secondary: 'See how a role runs',
}

// Sample data for the hero graphic (labelled "Sample" on the page).
export const SHORTLIST_LINE = 70
export const RANKED = [
  { name: 'Ananya S.', score: 91 },
  { name: 'Dev M.', score: 84 },
  { name: 'Ishaan K.', score: 78 },
  { name: 'Riya T.', score: 72 },
  { name: 'Karan P.', score: 63 },
  { name: 'Neel B.', score: 48 },
]

export const IDEA = {
  title: 'The first round runs itself. You keep the final word.',
  paragraphs: [
    'Every CV is read against your job description. The people who fit get a personal link to a 30-minute video interview, taken in their browser.',
    'You get recordings, transcripts and scores on one page. The AI recommends. A person makes the final hiring decision.',
  ],
}

export const STAGES = [
  {
    key: 'job',
    title: 'Add the job',
    text: 'Paste the job description or upload a PDF. ChiefTalent turns it into a clean structure and keeps a copy you can download.',
  },
  {
    key: 'cvs',
    title: 'CVs come in',
    text: 'Upload as many PDFs as you have. Each one is scored against the job with reasons, and exact duplicates are caught.',
  },
  {
    key: 'invite',
    title: 'Good fits get a link',
    text: 'Above your shortlist line, the candidate is emailed a personal interview link. Below it, nothing is sent.',
  },
  {
    key: 'interview',
    title: 'They interview in their browser',
    text: 'They confirm their email with a code, fill in a short form, then have 30 minutes: one video answer and 20 questions based on your job and their own CV.',
  },
  {
    key: 'review',
    title: 'You review the evidence',
    text: 'Recordings, transcripts, answers and AI notes sit on one page. Every score comes with its reasons.',
  },
  {
    key: 'decide',
    title: 'You decide',
    text: 'Select, reject or ask for another look. You can overrule any recommendation, send a link to someone the AI turned down, or issue a fresh interview.',
  },
]

export const AI_DOES = [
  'Scores each CV against the job and says why',
  'Writes the 20 interview questions from the job and the CV',
  'Marks the multiple-choice answers',
  'Scores the spoken answer from its transcript',
  'Recommends: progress, review or reject',
]

export const YOU_DO = [
  'Set the job and the shortlist line',
  'Watch the recordings and read the transcripts',
  'Overrule any recommendation and retake any interview',
  'Make every hiring decision',
]

export const CANDIDATE_STEPS = [
  { title: 'Confirm your email', text: 'A 6-digit code is sent to the address on your CV.' },
  { title: 'Share a few details', text: 'A short form for the hiring team. It is not scored.' },
  { title: 'Check camera and microphone', text: 'A quick test before the clock starts.' },
  { title: 'Take the interview', text: '30 minutes: one video answer and 20 multiple-choice questions.' },
  { title: 'Stay in the window', text: 'Leaving full screen or switching tabs gives a warning. A third warning ends the interview.' },
]

export const PLANNED = [
  {
    name: 'Situation-based video question',
    text: 'A final camera question, answerable in about five minutes, that shows how a candidate handles a real work situation: working with others, technical thinking, problem solving, decisions and communication.',
  },
  {
    name: 'Stronger interview integrity checks',
    text: 'Spotting a second person or a phone in frame, where the candidate is looking, head position, background voices, and photo or screen spoofing.',
  },
  {
    name: 'Server-side speech-to-text',
    text: 'Transcripts produced by the platform instead of the candidate’s browser, so accuracy no longer depends on which browser they use.',
  },
  {
    name: 'Video and voice analysis',
    text: 'The AI reviewing how an answer was delivered, not only the transcript.',
  },
]

export const FACTS = [
  { q: 'What is stored', a: 'CVs, interview answers, recordings, transcripts and AI evaluations.' },
  { q: 'What goes to the AI API', a: 'CV text and the transcripts of spoken answers, to score them and to write interview questions.' },
  { q: 'Who decides', a: 'People make the hiring decision. The AI recommends, and you can overrule it, including for a CV it turned down.' },
  { q: 'Deleting a candidate', a: 'Removes their CV, answers, recordings and evaluation.' },
  { q: 'Access', a: 'Staff sign in as an admin or a recruiter. Each interview link is unique to one candidate and needs an emailed code.' },
  { q: 'The shortlist line', a: 'The default is 70 out of 100. It is a setting, so it can be changed.' },
]

export const CLOSING = {
  title: 'Run your next hiring round on ChiefTalent.',
}
