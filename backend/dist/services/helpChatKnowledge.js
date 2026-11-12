"use strict";
/**
 * The Need Help agent's answers (FR-110).
 *
 * WHY THIS IS A KNOWLEDGE BASE AND NOT A LANGUAGE MODEL
 *   Every answer below is a rule this application actually enforces, taken from the same
 *   place the validation is. That is the point: a member asking "what years can I pick for
 *   my title?" needs 1401 AH to the current Hijri year because that is what the server will
 *   accept, and an answer that sounds plausible but is wrong costs them a failed save and a
 *   phone call. Nothing here can invent a rule the form does not have.
 *
 *   It also needs no API key, costs nothing per message, and works when the network does
 *   not — which for a members' form used on phones in a Jamaat hall is worth more than
 *   handling an unusual phrasing.
 *
 * KEEPING IT TRUE
 *   Each entry names the requirement it restates. When a rule changes, the entry changes
 *   with it — an answer that has drifted from the code is worse than no answer, because the
 *   member trusts it. The tests pin the specific numbers for exactly this reason.
 *
 * MATCHING
 *   Keyword scoring, not a parser. Questions are short and the vocabulary is small: the
 *   member types "bmi blank" or "cant save party". Weighted terms beat a bag of words
 *   because "year" appears in half the topics while "ashara" appears in one.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_TOPICS = void 0;
exports.answerHelpQuestion = answerHelpQuestion;
exports.HELP_TOPICS = [
    {
        id: "its_and_signin",
        label: "Signing in with your ITS number",
        keywords: [["its", 2], ["sign in", 2], ["signin", 2], ["login", 2], "log in", "username", "cannot sign", "locked"],
        answer: "You sign in with your ITS number and your password, choosing Member as the role. " +
            "Your ITS number is the one on your ITS card and is 6 to 20 digits with no spaces. " +
            "If you cannot sign in after several tries the system locks the account for a short " +
            "while to protect it. An administrator can reset your password, which also clears " +
            "that lock straight away."
    },
    {
        id: "password",
        label: "Your password and changing it",
        keywords: [["password", 2], "passcode", "change password", "forgot", "reset", "weak", "strong"],
        answer: "The first time you sign in with a password an administrator gave you, you must change " +
            "it before you can open your profile. A password needs at least 8 characters. If it is " +
            "shorter than 12 it must also mix at least three of: capital letters, small letters, " +
            "digits and symbols — so a longer phrase is easier than a short complicated one. It " +
            "cannot start or end with a space, and your new password cannot be the same as your " +
            "current one. Changing it signs you out of your other devices, which is deliberate."
    },
    {
        id: "saving",
        label: "Saving, and moving between tabs",
        keywords: [["save", 2], ["saving", 2], "unsaved", "lost", "tab", "discard", "submit"],
        answer: "One Save Profile button covers all twelve tabs, not just the one you are looking at. " +
            "Anything you type is kept while you move between tabs, so you can fill in several and " +
            "save once at the end. The banner saying you have unsaved changes stays until you " +
            "save or discard. You do not have to complete everything — a partly filled profile " +
            "saves perfectly well, and you can come back to the rest later."
    },
    {
        id: "save_refused",
        label: "A save that was refused",
        keywords: [["error", 2], ["refused", 2], "rejected", "correct", "red", "failed to save", "cannot save", "wont save", "highlighted"],
        answer: "When a save is refused, the tab holding the problem opens by itself and the field is " +
            "marked in red with the reason underneath. Fix the fields marked red and press Save " +
            "Profile again. Nothing is written until everything is accepted, so a refused save " +
            "never leaves half your answers stored. If the message says the profile was changed in " +
            "another session, reload the page and apply your change again."
    },
    {
        id: "photo",
        label: "Your photograph",
        keywords: [["photo", 2], ["photograph", 2], ["picture", 2], "image", "upload", "jpeg", "png", "approved", "rejected"],
        answer: "Your photograph is uploaded on the Personal tab. A JPEG or PNG works best, and a " +
            "clear head-and-shoulders picture is what is wanted. After you upload it, an " +
            "administrator or your Zonal Head reviews it. If it is rejected it is removed from " +
            "your profile and you can upload a different one."
    },
    {
        id: "name_fields",
        label: "Name, prefix and surname",
        keywords: [["prefix", 2], ["surname", 2], "sheikh", "mulla", "father name", "full name", "name"],
        answer: "Your name is recorded in parts on the Personal tab: First Prefix, Name, Father " +
            "Prefix, Father Name and Surname. The prefixes offer None, Mulla and Sheikh — leave " +
            "them as None if neither applies. Your full name is shown at the top of the page as " +
            "those parts joined together, so it will change as you fill them in. The Title and " +
            "Prefix tab shows the prefix you chose here and asks only for the year."
    },
    {
        id: "nationality_mohallah",
        label: "Nationality and Mohallah",
        keywords: [["nationality", 2], ["mohallah", 2], "citizen", "country", "address", "residence"],
        answer: "Nationality is on the Personal tab, just before Marital Status, and is typed in " +
            "freely. Mohallah sits beside your Residence Address on the same tab and is chosen " +
            "from the Mohallahs the system already holds. Both are optional."
    },
    {
        id: "contact_numbers",
        label: "Mobile and WhatsApp numbers",
        keywords: [["mobile", 2], ["whatsapp", 2], "phone", "number", "contact"],
        answer: "The Personal tab has separate boxes for Phone, Mobile No. 1 and 2, and WhatsApp No. 1 " +
            "and 2. They are separate on purpose, so fill in the Mobile boxes as well as WhatsApp " +
            "if the numbers differ. An administrator sees a dash against any you leave empty, so " +
            "if someone tells you your mobile number is missing, this is the tab to check."
    },
    {
        id: "zone_party",
        label: "Zone and Hizb (Party)",
        keywords: [["zone", 2], ["party", 2], ["hizb", 2], "leader", "side lead"],
        answer: "Zone and Hizb are on the Hizb tab. Choose your Zone first — the Hizb list only fills " +
            "in once a Zone is chosen, and it then shows the Hizbs belonging to that Zone. " +
            "Changing the Zone clears a Hizb that does not belong to the new one. Hizbs that are " +
            "no longer running are still listed, so you can record one you genuinely belong to. " +
            "If you are not in a Hizb, leave both blank — the rest of your profile still saves."
    },
    {
        id: "zikr_year",
        label: "Since when have you been doing Zikr e Hussain AS",
        keywords: [["zikr", 2], ["hussain", 2], "since when", "since year"],
        answer: "This is on the Hizb tab and is a Hijri year, from 1375 AH up to the present Hijri " +
            "year. It reaches further back than the other year questions on purpose. It also " +
            "decides where the Ashara Mubaraka list starts, so filling it in first makes that tab " +
            "much shorter."
    },
    {
        id: "idarat",
        label: "Idarat al Zakereen registration and the 5 Kalam recordings",
        keywords: [["idarat", 2], ["kalam", 2], "registered", "recording", "website", "upload"],
        answer: "Both are on the Hizb tab. Registered with Idarat al Zakereen is a simple Yes or No, " +
            "and leaving it unanswered is not the same as answering No. The question about when " +
            "the 5 Kalam recordings were uploaded is a plain text box, so answer it however you " +
            "remember it — 'last Ashara' or 'not yet' are perfectly good answers."
    },
    {
        id: "hijri_years",
        label: "Which years the Hijri dropdowns accept",
        keywords: [["hijri", 2], ["ah", 2], "year", "1401", "1448", "gregorian"],
        answer: "Title Year, Prefix Year, Sharaf Year and the Other Sansta 'Since' year are Hijri " +
            "years and run from 1401 AH to the present Hijri year. They are marked (AH) so you " +
            "know not to enter a Gregorian year. The Zikr e Hussain year is the exception and " +
            "starts further back, at 1375 AH. The Ashara Mubaraka list is Hijri too."
    },
    {
        id: "titles_sharaf",
        label: "Titles and Sharaf",
        keywords: [["title", 2], ["sharaf", 2], "add row", "several", "remove"],
        answer: "Titles are on the Title and Prefix tab and Sharaf on its own tab. You may hold " +
            "several of each: press Add to create a row, choose the value and its Hijri year — " +
            "1401 AH up to the present Hijri year — and add another row for the next one. The same title in two different years is fine; the " +
            "same title in the same year twice is not. Each row can be removed on its own."
    },
    {
        id: "ashara",
        label: "Ashara Mubaraka",
        keywords: [["ashara", 2], ["mubaraka", 2], ["aqa moula", 2], "aamil", "moze", "venue", "attended"],
        answer: "The Ashara Mubaraka tab lists one row per Hijri year, starting from the year you gave " +
            "for Zikr e Hussain on the Hizb tab, or 1404 AH if that is earlier or not filled in. " +
            "For each year you attended, choose With Aqa Moula TUS or With Aamil; leave the rest " +
            "untouched. Choosing With Aqa Moula TUS fills in where Ashara was held that year. " +
            "Choosing With Aamil asks for your Moze and, optionally, the Venue. If you pick the " +
            "wrong one, press Clear on that row to remove the answer entirely."
    },
    {
        id: "maqamaat",
        label: "Maqamaat Muqaddasah",
        keywords: [["maqamaat", 2], ["muqaddasah", 2], ["place", 2], "visited", "ziyarat", "number of times"],
        answer: "Add one row per place you have visited, with the number of times you went. Each place " +
            "may appear only once — if you have been more than once, raise the number of times " +
            "rather than adding the place again. The years of each visit are no longer asked for."
    },
    {
        id: "health_bmi",
        label: "Height, weight and BMI",
        keywords: [["bmi", 2], ["height", 2], ["weight", 2], "feet", "inches", "blood", "donor", "fitness"],
        answer: "Height is entered as feet and inches in two boxes, and the centimetres that will be " +
            "saved are shown underneath so you can check them. Weight is in kilograms. BMI is " +
            "worked out for you and cannot be typed — it stays blank until both height and weight " +
            "are filled in, and it will also stay blank if a measurement is outside what is " +
            "possible for a person, which usually means a digit went astray."
    },
    {
        id: "education",
        label: "Education and Hifz",
        keywords: [["education", 2], ["hifz", 2], ["sanad", 2], "degree", "surah", "ayat", "ayyah"],
        answer: "The Education / Hifz tab asks for your level of education, whether it is complete or " +
            "ongoing, and your major subjects. The Hifz questions appear once you say you hold a " +
            "Hifz Sanad: the Sanad itself, the Surah and Ayat you have reached, and when you last " +
            "updated it."
    },
    {
        id: "tamreen",
        label: "Tamreen",
        keywords: [["tamreen", 2], ["method", 2], "frequency", "ustad", "books", "karachi"],
        answer: "The Tamreen tab asks how often you do Tamreen with your Hizb and on your own, and " +
            "which methods you use. Methods now allow more than one answer — tick every method " +
            "that applies rather than choosing the closest one. If you say you do not attend the " +
            "Karachi Zakireen Tamreen, a box appears for the reason."
    },
    {
        id: "asbaq",
        label: "Asbaq",
        keywords: [["asbaq", 2], ["halqa", 2], "zaher", "taweel", "haqiqat", "ustad"],
        answer: "The Asbaq tab asks which level you are at — Zaher, Taweel or Haqiqat — your Halqa, " +
            "and the name of your Ustad, which is typed in freely."
    },
    {
        id: "khidmat",
        label: "Other Sansta Khidmat",
        keywords: [["khidmat", 2], ["sansta", 2], ["umoor", 2], "designation", "since"],
        answer: "This tab records service you give outside your Hizb. Choosing Sansta, Umoor or Both " +
            "decides which name boxes appear, so pick that first. The 'Since' year here is a Hijri " +
            "year from 1401 AH."
    },
    {
        id: "empty_dropdown",
        label: "A dropdown with nothing in it",
        keywords: [
            ["empty", 2],
            ["no options", 2],
            ["nothing in it", 2],
            "blank list",
            "nothing to choose",
            "not set up",
            "dropdown"
        ],
        answer: "A dropdown saying options have not been set up yet means the organisation has not " +
            "entered those values, not that anything is wrong with your profile. Leave that field " +
            "and save the rest; your other answers are unaffected. Mention it to your Zonal Head " +
            "or an administrator so the list can be filled in."
    },
    {
        id: "draft_values",
        label: "A value marked DRAFT — NEEDS REVIEW",
        keywords: [["draft", 2], ["needs review", 2], "review", "provisional"],
        answer: "DRAFT — NEEDS REVIEW beside an option means the organisation has suggested that value " +
            "but not yet confirmed it. You may still choose it, and your answer stays as it is " +
            "when the value is later confirmed or renamed."
    },
    {
        id: "privacy",
        label: "Who can see what you enter",
        keywords: [["who can see", 2], ["private", 2], ["privacy", 2], "visible", "confidential", "health data"],
        answer: "Your profile is yours to fill in. Administrators and your Zonal Head can open it to " +
            "read it, and only an administrator can correct an answer — every such change is " +
            "recorded against the person who made it. Your health answers are not included in " +
            "reports or exports."
    }
];
/** Anything scoring below this is treated as unmatched. Two weak words should not answer. */
const MATCH_THRESHOLD = 2;
function normalise(text) {
    return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}
/**
 * The best-matching topic for a question, or a fallback that says what can be asked.
 *
 * Scores every topic and takes the highest, rather than returning the first hit: "which
 * years can I choose for Ashara" contains both "year" and "ashara", and the Ashara answer
 * is the useful one.
 */
function answerHelpQuestion(question) {
    const haystack = normalise(question);
    let best = null;
    for (const topic of exports.HELP_TOPICS) {
        let score = 0;
        for (const keyword of topic.keywords) {
            const [term, weight] = Array.isArray(keyword) ? keyword : [keyword, 1];
            if (haystack.includes(` ${normalise(term).trim()} `))
                score += weight;
        }
        if (score > 0 && (!best || score > best.score))
            best = { topic, score };
    }
    if (!best || best.score < MATCH_THRESHOLD) {
        return {
            topic: null,
            reply: "I could not match that to something I know about. I can help with questions on " +
                "any of these:\n\n" +
                exports.HELP_TOPICS.map((t) => `• ${t.label}`).join("\n") +
                "\n\nTry naming the tab or the field — for example 'what years can I pick for a " +
                "title' or 'why is my BMI blank'. For anything outside the form itself, your Zonal " +
                "Head or an administrator can help."
        };
    }
    return { topic: best.topic.id, reply: best.topic.answer };
}
