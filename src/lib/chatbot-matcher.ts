import { CHATBOT_CATEGORIES, SUPPORT_EMAIL } from "@/data/chatbot-menu";
import { isGreeting } from "@/lib/chatbot/text";

/**
 * The deterministic fast path, running BEFORE retrieval.
 *
 * THE RULE FOR ADDING ANYTHING HERE:
 *
 *   An intent may return a constant only if the answer is a route, an email
 *   address, or a UI affordance — something that cannot go stale. Anything
 *   about dates, eligibility, pricing, tags, rules or program details belongs
 *   in `knowledge/` and must go through retrieval.
 *
 * This rule is not academic. Two intents used to live here that broke it, and
 * both silently served wrong answers for months, because a match here means
 * the knowledge base is never consulted:
 *
 *   - a Claude Challenge intent listing tags "@abtalksonai, #Klymb AI,
 *     #60DaysOfClaude, #60DaysOfGenAI". The live challenge page and the
 *     official guidelines PDF both say to tag Anthropic, Anil Bajpai and
 *     Klymb AI. Retrieval had the right answer; this overrode it.
 *   - an "is Klymb AI free" intent answering "completely free" after the site
 *     had moved to "most challenges are free; paid cohorts are priced up
 *     front".
 *
 * Both are deleted. Do not reintroduce factual answers here, and do not grow
 * this file into a keyword FAQ — that is what the retrieval pipeline is for.
 */

export type MatchResult = { answer: string; confidence: number };

const INTENTS: { regex: RegExp; answer: string }[] = [
  {
    // Careers/recruitment enquiry — an email address, not a fact about a program.
    regex:
      /\b(how\s*(do\s*i|to)\s*)?(apply|join|work)\s*(for|with|at)\s*(the\s*)?(Klymb AI\s*)?(team|company|Klymb AI)\b.*\b(job|role|hiring|career|work)\b|\bwork\s*(for|with)\s*Klymb AI\b/i,
    answer: `If you'd like to work with the Klymb AI team, email your cover letter, resume and anything else relevant to ${SUPPORT_EMAIL}.`,
  },
  {
    regex: /\b(contact\s*(email|details)?|email\s*address|support\s*email|reach\s*(you|the\s*team))\b/i,
    answer: `You can reach the Klymb AI team at ${SUPPORT_EMAIL}.`,
  },
];

/**
 * Requests for someone else's data, or to act on another person's account.
 *
 * Retrieval cannot catch these: "can you tell me my friend's profile details"
 * is built entirely from words the knowledge base uses constantly, so it
 * sails through the confidence gate and lands on real documents about
 * profiles. The problem was never that the corpus lacks the answer — it is
 * that answering at all is the wrong behaviour. That makes it a scope rule,
 * checked before retrieval, not a knowledge gap.
 */
/**
 * Written to tolerate how people actually type possessives: apostrophes are
 * routinely dropped ("someone elses certificate") and the noun is as often
 * plural as singular ("another students submission"). Matching only the
 * grammatically correct forms let the two most natural phrasings straight
 * through, which is the opposite of what a privacy guard is for.
 */
const THIRD_PARTY_DATA =
  /\b(my\s+)?(friends?'?s?|someone\s*else'?s?|somebody\s*else'?s?|another\s+(person|user|student|candidate|member|participant)s?'?s?|other\s+(people|students|users)'?s?|his|her|their)\b[^?]*\b(profile|account|details|data|email|phone|number|score|submission|certificate|application|progress|report)s?\b/i;

export function isThirdPartyDataRequest(input: string): boolean {
  return THIRD_PARTY_DATA.test(input.trim());
}

export const THIRD_PARTY_DATA_REPLY =
  `I can't look up or share anyone else's account, profile or personal details — that information is private to them. ` +
  `I can help with anything about Klymb AI itself, or you can reach the team at ${SUPPORT_EMAIL}.`;

/**
 * Questions about what a specific day, week, mission or task CONTAINS.
 *
 * Rudra gives general program information only. Like the third-party rule this
 * is a scope rule, not a knowledge gap: "what is day 23" is built from words
 * the corpus uses constantly, so the confidence gate cannot be what stops it.
 *
 * The word "day" alone is not enough. "is the day 60 submission compulsory"
 * and "what is the day 15 interview" are rules about the program and stay
 * answerable, so a day reference only blocks when it comes with a content
 * word (task, topic, solution, learn, build...), or as a bare "what is day N"
 * that is not about a rule (certificate, submission, streak...). A question
 * about the milestone voice interviews ("what does the day 15 interview
 * cover") is about the interview, never about a day's content.
 */
const DAY_REFERENCE =
  /\b(?:days?|weeks?|module|mission|task|phase)\s*[-#]?\s*\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)\s+(?:day|week)\b/i;
const RELATIVE_TASK =
  /\b(?:today'?s?|tomorrow'?s?|yesterday'?s?|next|previous|current)\s+(?:day'?s?\s+)?(?:task|problem|prompt|assignment|mission|topic|lesson)s?\b/i;
const CURRICULUM =
  /\b(?:curriculum|syllabus|roadmap|day[\s-]*(?:by|wise)[\s-]*day|day[\s-]*wise|week[\s-]*(?:by|wise)[\s-]*week|(?:list|schedule)\s+of\s+(?:all\s+)?(?:the\s+)?(?:tasks|topics|days|missions))\b/i;
const DAY_CONTENT_WORD =
  /\b(?:tasks?|topics?|problems?|prompts?|assignments?|solutions?|solve|answers?|hints?|lessons?|content|covers?|covered|teach|taught|learn|learning|build|built|syllabus|curriculum|kya\s+hai)\b/i;
const WHAT_IS_DAY =
  /\bwhat(?:'?s|\s+is|\s+was|\s+are|\s+happens)?\s+(?:on\s+|in\s+)?(?:the\s+)?(?:days?|week|mission|module|phase)\s*\d/i;
const DAY_RULE_WORD =
  /\b(?:certificate|cert|submission|submit|deadline|streak|miss|missed|skip|late|folder|repo|unlock)\b/i;
const INTERVIEW = /\b(?:interview|checkpoint)\b/i;

export function isDayContentRequest(input: string): boolean {
  const text = input.trim();
  if (CURRICULUM.test(text) || RELATIVE_TASK.test(text)) return true;
  if (!DAY_REFERENCE.test(text) || INTERVIEW.test(text)) return false;
  if (DAY_CONTENT_WORD.test(text)) return true;
  return WHAT_IS_DAY.test(text) && !DAY_RULE_WORD.test(text);
}

/**
 * Anything outside Klymb AI itself: coding help, concept tutorials, homework,
 * general knowledge, and attempts to change the assistant's role.
 *
 * The confidence gate cannot catch these on its own. The corpus is full of
 * Python, GitHub, AI, data science and interview vocabulary because the
 * programs are about those things, so "write a python function" or "what is
 * machine learning" score as answerable. Hence a scope rule before retrieval.
 *
 * Pasted code and role/jailbreak attempts are refused outright. Task and
 * concept questions are refused unless they name something Klymb AI-specific,
 * so "can i use python in the coding challenge" still reaches retrieval.
 * Site and account words count as anchors too: "how do i fix the login
 * error" is a support question, not a debugging request.
 *
 * PASTED_CODE is case-sensitive on purpose: "which one should i select from
 * the tracks" must not read as SQL.
 */
const PASTED_CODE =
  /```|Traceback \(most recent call last\)|^\s*(?:def|class)\s+\w+.*:\s*$|^\s*import\s+[\w.]+(?:\s+as\s+\w+)?\s*;?\s*$|^\s*from\s+[\w.]+\s+import\s+\w+|#include\s*<|\bpublic\s+(?:static\s+)?(?:void|class|int)\b|\bfunction\s*\w*\s*\([^)]*\)\s*\{|\b(?:const|let|var)\s+\w+\s*=\s*\S|\bconsole\.log\(|\bSystem\.out\.print|\bprint\(.*\)|\bSELECT\s+[\w*,\s]+\s+FROM\s+\w+|\bselect\s+\*\s+from\s+\w+|\w+(?:Error|Exception):\s/m;
const ROLE_OVERRIDE =
  /\b(?:ignore|forget|disregard|override|bypass)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:your|the\s+above|above|previous|prior|earlier|these|those|system|my\s+previous)\s+(?:\w+\s+)?(?:instructions?|rules?|prompts?|guidelines?|restrictions?)\b|\bsystem\s+prompt\b|\bjailbreak\b|\bdeveloper\s+mode\b|(?:^|\b(?:you|now|please|pls|can\s+you|could\s+you)\s+)act\s+as\b|\bpretend\s+(?:to\s+be|you\s*(?:are|'re))\b|\byou\s+are\s+now\b|\brole[\s-]?play\b/i;
const CODING_TASK =
  /\b(?:write|code|debug|fix|solve|implement|generate|optimi[sz]e|refactor|convert|review|correct|complete|explain)\b[^?.!]*\b(?:code|codes|function|functions|program|programs|script|query|queries|algorithm|method|loop|regex|snippet|bug|error|leetcode|dsa|array|linked\s*list|binary\s*tree|recursion|sorting|sort|stack|queue|hashmap|api|endpoint|component|sql|python|java|javascript|typescript|c\+\+|html|css|react)\b/i;
const CONCEPT_QUESTION =
  /\b(?:what\s+is|what\s+are|whats|what's|explain|define|definition\s+of|difference\s+between|how\s+does|how\s+do\s+(?:i|you)\s+(?:use|write)|teach\s+me|meaning\s+of|tutorial|example\s+of)\b[^?.!]*\b(?:python|java|javascript|typescript|c\+\+|golang|rust|react|node\.?js|sql|html|css|recursion|algorithms?|data\s+structures?|linked\s*lists?|arrays?|pointers?|variables?|closures?|oop|object[\s-]oriented|inheritance|polymorphism|big[\s-]o|time\s+complexity|machine\s+learning|deep\s+learning|neural\s+networks?|transformers?|llms?|large\s+language\s+models?|embeddings?|vector\s+databases?|rag|fine[\s-]?tuning|regression|classification|overfitting|gradient\s+descent|pandas|numpy|tensorflow|pytorch|docker|kubernetes|blockchain|cloud\s+computing|operating\s+systems?|dbms|computer\s+networks?)\b/i;
const GENERAL_TASK =
  /\b(?:capital\s+of|president\s+of|prime\s+minister\s+of|who\s+(?:won|invented|discovered)|translate|weather|horoscope|recipe)\b|\b(?:solve|calculate|integrate|differentiate|simplify)\b[^?.!]*\d|\d+\s*[-+*/^x]\s*\d+\s*=|\b(?:write|draft|compose|generate)\b[^?.!]*\b(?:essay|poem|story|song|speech|joke|caption|bio|paragraph|article|summary|cover\s+letter)\b/i;
/** Naming something Klymb AI-specific puts a task/concept question back in scope. */
const PLATFORM_ANCHOR =
  /\b(?:abtalks|ab\s+talks|klymb|rudra|challenges?|cohort|hackathon|vicodathon|workshops?|webinar|bootcamp|certificates?|certs?|streak|submissions?|submit\w*|(?:your|abtalks|which|these|those|the)\s+programs?|leaderboard|dashboard|scout|recruiters?|voice\s+interview|anil|bajpai|enrol+(?:ment)?|register|registration|track|login|log\s+in|sign\s*in|sign\s*up|account|profile|website|site|page|portal)\b/i;

export function isOutOfScopeRequest(input: string): boolean {
  const text = input.trim();
  if (PASTED_CODE.test(text) || ROLE_OVERRIDE.test(text)) return true;
  if (PLATFORM_ANCHOR.test(text)) return false;
  return CODING_TASK.test(text) || CONCEPT_QUESTION.test(text) || GENERAL_TASK.test(text);
}

/** Menu / navigation commands. UI affordances, never facts. */
const MENU_COMMANDS =
  /^(menu|help|options|start|main\s*menu|home|topics|what\s*can\s*you\s*do\??)$/i;

/**
 * Menu commands and greetings both answer with the menu. Greetings go through
 * `isGreeting`, which also catches stretched and combined forms ("heyyyy",
 * "hiii there", "hello team!") that a fixed word list misses.
 */
export function isMenuCommand(input: string): boolean {
  const trimmed = input.trim();
  return MENU_COMMANDS.test(trimmed) || isGreeting(trimmed);
}

/**
 * Resolves "5" or "claude challenge" to a menu category, so a user can drive
 * the menu by number without that turning into a factual answer — the returned
 * category becomes a retrieval query, not a canned reply.
 */
export function matchCategory(
  input: string,
): { label: string; query: string; page: string | null } | null {
  const trimmed = input.trim();
  const asNumber = /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : null;
  const category =
    asNumber !== null
      ? CHATBOT_CATEGORIES.find((c) => c.number === asNumber)
      : CHATBOT_CATEGORIES.find(
          (c) => c.label.toLowerCase() === trimmed.toLowerCase(),
        );
  if (!category) return null;
  return {
    label: category.label,
    query: category.seedQuestion,
    page: category.href,
  };
}

export function matchQuestion(query: string): MatchResult | null {
  const trimmed = query.trim();
  for (const intent of INTENTS) {
    if (intent.regex.test(trimmed)) {
      return { answer: intent.answer, confidence: 1 };
    }
  }
  return null;
}
