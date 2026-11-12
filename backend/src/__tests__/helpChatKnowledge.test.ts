import { describe, expect, it } from "vitest";
import { HELP_TOPICS, answerHelpQuestion, parseKeywords } from "../services/helpChatKnowledge";

/**
 * The Need Help agent's answers (FR-110).
 *
 * THE RISK THIS GUARDS AGAINST is not a missed question — it is a confident wrong answer. A
 * member told the wrong year range loses a save and makes a phone call, and trusts the next
 * answer less. So the tests below assert the SPECIFIC numbers and names the form actually
 * enforces, and they will fail the day a rule changes without its answer changing with it.
 *
 * This file needs no database, which is deliberate: the knowledge base is pure, so it can be
 * verified even when the suite's live-database guard refuses to run anything else.
 */

const reply = (question: string) => answerHelpQuestion(question).reply;
const topic = (question: string) => answerHelpQuestion(question).topic;

describe("the help agent answers the form's own rules", () => {
  it("gives the Zikr e Hussain range as 1375 AH, not the other fields' 1401", () => {
    const text = reply("since when have you been doing zikr e hussain?");
    expect(topic("since when have you been doing zikr e hussain?")).toBe("zikr_year");
    expect(text).toContain("1375");
    expect(text).not.toContain("1401");
  });

  it("gives the other Hijri fields as 1401 AH", () => {
    const text = reply("what years can I pick for a title?");
    expect(text).toContain("1401");
  });

  it("says the Ashara grid starts at the Zikr year, with 1404 as the floor", () => {
    const text = reply("why does the ashara list start where it does?");
    expect(topic("why does the ashara list start where it does?")).toBe("ashara");
    expect(text).toContain("1404");
    expect(text).toContain("Zikr e Hussain");
  });

  it("describes the password rule as 8 characters, and three classes under 12", () => {
    const text = reply("what password do I need?");
    expect(text).toContain("8");
    expect(text).toContain("12");
    expect(text).toContain("three");
  });

  it("explains a blank BMI as derived and bounded, not as an error", () => {
    const text = reply("why is my bmi blank?");
    expect(topic("why is my bmi blank?")).toBe("health_bmi");
    expect(text).toMatch(/blank until/i);
    expect(text).toMatch(/feet and inches/i);
  });

  it("tells the member to choose the Zone before the Hizb", () => {
    const text = reply("my hizb list is empty");
    expect(text).toMatch(/Zone first/i);
  });

  it("says an inactive Hizb is still offered, because a member may belong to one", () => {
    expect(reply("can I pick a hizb that closed?")).toMatch(/no longer running are still listed/i);
  });

  it("says Clear is how an Ashara answer is taken back", () => {
    expect(reply("how do I undo an ashara year?")).toContain("Clear");
  });

  it("says Maqamaat no longer asks for years", () => {
    const text = reply("where do I put the years for maqamaat muqaddasah?");
    expect(topic("where do I put the years for maqamaat muqaddasah?")).toBe("maqamaat");
    expect(text).toMatch(/no longer asked for/i);
  });

  it("says Tamreen methods take more than one answer", () => {
    expect(reply("can I choose two tamreen methods?")).toMatch(/more than one/i);
  });

  it("says a rejected photograph is removed", () => {
    expect(reply("what happens if my photo is rejected?")).toMatch(/removed from\s+your profile/i);
  });

  it("says one Save covers all twelve tabs", () => {
    const text = reply("do I have to save each tab?");
    expect(text).toMatch(/all twelve tabs/i);
  });

  it("says an empty dropdown is the organisation's doing, not the member's", () => {
    const text = reply("this dropdown has no options");
    expect(topic("this dropdown has no options")).toBe("empty_dropdown");
    expect(text).toMatch(/not that anything is wrong with your profile/i);
  });

  it("answers who can see the profile without overstating the privacy", () => {
    const text = reply("who can see my profile?");
    expect(text).toMatch(/only an administrator can correct/i);
  });
});

describe("matching", () => {
  it("prefers the specific topic when a general word also matches", () => {
    // "year" appears in several answers; "ashara" settles it.
    expect(topic("which years are in the ashara list")).toBe("ashara");
  });

  it("is not thrown by case or punctuation", () => {
    expect(topic("WHY IS MY BMI BLANK?!")).toBe("health_bmi");
  });

  /**
   * One weak word must not produce an answer. "I have a question about my year" should
   * reach a person, not a confident paragraph about titles.
   */
  it("refuses to answer on a single weak keyword", () => {
    expect(topic("a question about my year")).toBeNull();
  });

  it("offers the list of subjects when nothing matches, and says so", () => {
    const answer = answerHelpQuestion("can you book me a flight to Colombo");
    expect(answer.topic).toBeNull();
    expect(answer.reply).toMatch(/could not match/i);
    // The fallback must name real topics, or it is an apology with no way forward.
    expect(answer.reply).toContain(HELP_TOPICS[0].label);
  });

  it("never returns an empty reply", () => {
    for (const question of ["", "   ", "???", "help", "xyzzy"]) {
      expect(answerHelpQuestion(question).reply.length).toBeGreaterThan(20);
    }
  });
});

describe("the knowledge base itself", () => {
  it("has unique ids, since the id is stored on every chat row", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every topic a label and a non-trivial answer", () => {
    for (const t of HELP_TOPICS) {
      expect(t.label.length, t.id).toBeGreaterThan(3);
      expect(t.answer.length, t.id).toBeGreaterThan(80);
      expect(t.keywords.length, t.id).toBeGreaterThan(0);
    }
  });

  /** Every topic must be reachable, or it is documentation nobody will ever be shown. */
  it("can reach every topic from its own label", () => {
    for (const t of HELP_TOPICS) {
      expect(answerHelpQuestion(t.label).topic, t.id).not.toBeNull();
    }
  });
});

/**
 * Administrator-written topics, layered on the built-in ones (FR-110a).
 *
 * The override is the behaviour worth pinning: a topic sharing a key with a built-in has to
 * REPLACE it, not sit beside it, or a member would get whichever of the two happened to
 * score higher and nobody could tell which answer they had seen.
 */
describe("administrator-written topics", () => {
  const custom = {
    id: "jamaat_timings",
    label: "Jamaat timings",
    keywords: [["timings", 2] as [string, number], "namaz", "when"],
    answer: "Timings are announced by your Jamaat and are not recorded in this form."
  };

  it("answers from a topic the built-ins do not cover", () => {
    const answer = answerHelpQuestion("what are the timings?", [custom]);
    expect(answer.topic).toBe("jamaat_timings");
    expect(answer.reply).toContain("announced by your Jamaat");
  });

  it("leaves the built-in topics answering everything else", () => {
    expect(answerHelpQuestion("why is my bmi blank?", [custom]).topic).toBe("health_bmi");
  });

  it("replaces a built-in when it reuses that key, rather than competing with it", () => {
    const override = {
      id: "health_bmi",
      label: "Height, weight and BMI",
      keywords: [["bmi", 2] as [string, number]],
      answer: "Ask your Zonal Head about the health questions."
    };

    const answer = answerHelpQuestion("why is my bmi blank?", [override]);
    expect(answer.topic).toBe("health_bmi");
    expect(answer.reply).toBe(override.answer);
    // The built-in wording must be gone, not merely outscored.
    expect(answer.reply).not.toMatch(/feet and inches/i);
  });

  it("falls back to the built-in when the override is not supplied", () => {
    // Deactivating a topic simply stops it being passed in, which must restore the original.
    expect(answerHelpQuestion("why is my bmi blank?", []).reply).toMatch(/feet and inches/i);
  });

  it("lists the administrator's topics in the no-match reply", () => {
    const answer = answerHelpQuestion("completely unrelated gibberish xyzzy", [custom]);
    expect(answer.topic).toBeNull();
    expect(answer.reply).toContain("Jamaat timings");
  });

  it("does not let an administrator's topic shrink the built-in list", () => {
    const answer = answerHelpQuestion("completely unrelated gibberish xyzzy", [custom]);
    for (const t of HELP_TOPICS) expect(answer.reply, t.id).toContain(t.label);
  });
});

/**
 * The keyword syntax an administrator types: comma separated, a trailing * doubling a word.
 * It is the whole of what they have to learn, so it has to behave exactly as described.
 */
describe("parseKeywords", () => {
  it("reads a plain comma-separated list", () => {
    expect(parseKeywords("namaz, timings, when")).toEqual(["namaz", "timings", "when"]);
  });

  it("doubles a word marked with a trailing star", () => {
    expect(parseKeywords("ashara*, attended")).toEqual([["ashara", 2], "attended"]);
  });

  it("tolerates stray spaces and trailing commas", () => {
    expect(parseKeywords("  bmi* ,  height ,, ")).toEqual([["bmi", 2], "height"]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords("   ,  , ")).toEqual([]);
  });

  /** A lone "*" would otherwise become a zero-length keyword matching every question. */
  it("drops a bare star", () => {
    expect(parseKeywords("*")).toEqual([]);
  });

  it("produces keywords the matcher can actually use", () => {
    const topic = {
      id: "t",
      label: "T",
      keywords: parseKeywords("timings*"),
      answer: "An answer long enough to be worth returning to the member."
    };
    expect(answerHelpQuestion("what are the timings", [topic]).topic).toBe("t");
  });
});
