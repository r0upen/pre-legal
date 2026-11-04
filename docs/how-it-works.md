# How the NDA chat works

This page explains, in plain English, what happens from the moment someone
opens Pre-Legal to the moment they download a Mutual NDA as a PDF.

## The pieces

- **The browser app** shows the chat on the left and a live preview of the
  agreement on the right. On a wide screen the page fits the window and
  each side scrolls on its own, so both stay visible throughout; on a narrow
  screen the chat comes first and the agreement below it.
- **The server** runs in the same Docker container. It hands out the
  agreement's standard terms and passes chat messages to the AI.
- **The AI** is the gpt-oss-120b model, reached through OpenRouter and run
  on Cerebras for speed. It conducts the interview.
- **The template** is the Common Paper Mutual NDA. The standard terms never
  change; only the cover page (parties, dates, terms) is filled in.

## 1. Signing in and starting

The user signs in with a name and email (a placeholder: there is no
password). The browser then loads the standard terms from the server and
shows an empty agreement with bracketed placeholders such as
"[Party 1 Company]". The chat opens with a fixed greeting that asks for the
first party's name, with the cursor already in the message box. Nothing has
been sent to the AI yet.

## The chat box

Messages appear as bubbles: the user's on the right, the assistant's on the
left. The message box grows as the user types, up to a few lines. Enter
sends the message and Shift+Enter starts a new line, which helps with
addresses.

While the AI is replying, three moving dots show that the assistant is
typing, and the box is locked so the message can't be changed or sent
twice. The cursor stays in the box throughout, whether the user pressed
Enter or clicked the send button, so they can type the next answer as soon
as the reply arrives without clicking.

## 2. Each message

When the user sends a message, the browser sends the server three things:

- the whole conversation so far,
- the details collected so far,
- the user's local date, so "next Monday" means their Monday.

The server adds its instructions for the AI and the current details, and
asks the AI for one answer. The AI must reply in a fixed format with three
parts: the full set of agreement details as it now understands them, a
short acknowledgement of what the user just said, and the next question.
The question is a required part of its own, so every reply asks one and the
conversation never stalls. The server joins the acknowledgement and the
question into the single message the user sees.

The server also limits how long that answer may be: about 2,000 tokens,
roughly 1,500 words, counting the AI's hidden reasoning as well as its
reply. A normal turn uses a few hundred. Without a limit, the AI service
sets aside credit for an answer about twenty times longer on every message,
so the chat could fail while the account still had credit.

The server does not trust that answer blindly. It drops anything invalid,
such as an impossible date or a term outside 1 to 10 years, and a detail
the AI leaves empty never erases one already collected. The server then
sends the reply and the updated details back to the browser, which shows
the reply in the chat and fills in the preview straight away.

The server keeps nothing between messages: the conversation lives only in
the browser. Reloading the page starts a new conversation.

If the AI cannot be reached, the user sees an error and their message stays
in the box so they can send it again.

## 3. How the AI interviews

The instructions tell the AI to:

- sound warm, friendly and conversational, while staying short and
  professional, and acknowledge each answer in its own words;
- ask exactly one question at a time, in a set order: for each party its
  name, who signs, the signer's title and the notice address; then the
  purpose, the effective date, whether the agreement ends after a set term
  and if so how many years, how long confidentiality lasts, governing law,
  which courts, and any changes to the standard terms;
- record several details at once if the user gives them together;
- ask for a full name (first and last) for each signer;
- ask for a complete notice address: street, city, state and ZIP code, or
  the equivalent including the country outside the US;
- ask whether a party is a company or an individual when that is unclear
  (an individual's name is used as the company too);
- say what changed when the user changes an earlier answer;
- gently ask once when an answer is clearly not a real value (random
  letters, a placeholder like "test", or an answer that does not fit the
  question), and accept it as given if the user confirms; real names are
  never questioned just because they are uncommon;
- talk about the details in plain language, never in the app's internal
  terms (for example "November 3, 2026" rather than "2026-11-03");
- never invent names, addresses or dates, and stay on the topic of the NDA;
- remind the user that it is not a lawyer and the draft should be reviewed
  by one.

## 4. Checking the details

Once every required detail is collected, a "Check the details" box appears
above the preview, and the agreement side scrolls back to the top so the
user sees it. The Preview title and the Download PDF button stay at the top
of that side while the agreement scrolls. The app builds this summary itself from the collected
details, so it always matches what will be printed. The AI only asks the
user to check it.

The user either clicks **Confirm details** or tells the AI what to change.
If anything changes after confirming, the box comes back and must be
confirmed again.

## 5. Downloading the PDF

**Download PDF** is enabled only when every detail is collected and the
user has confirmed the summary. Clicking it opens the browser's print
dialog, where the user chooses "Save as PDF". The printed copy contains the
cover page, the standard terms and a note that the draft is a starting
point for review by a lawyer, not legal advice.
