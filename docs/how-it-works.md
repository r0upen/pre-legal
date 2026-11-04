# How the chat works

This page explains, in plain English, what happens from the moment someone
opens Pre-Legal to the moment they download an agreement as a PDF.

## The pieces

- **The browser app** shows the chat on the left and a live preview of the
  agreement on the right. On a wide screen the page fits the window and
  each side scrolls on its own, so both stay visible throughout; on a narrow
  screen the chat comes first and the agreement below it.
- **The server** runs in the same Docker container. It hands out the list
  of agreements and their standard terms, and passes chat messages to the AI.
- **The AI** is the gpt-oss-120b model, reached through OpenRouter and run
  on Cerebras for speed. It helps choose an agreement and conducts the
  interview.
- **The templates** are 11 Common Paper agreements, such as the Mutual NDA,
  the Cloud Service Agreement and the Data Processing Agreement. Their
  standard terms never change; only a cover page (parties, dates, money and
  other terms) is filled in.
- **The catalog** is a list describing each agreement: its name, what it is
  for and, for every agreement except the Mutual NDA, which details its cover
  page needs, in the order the AI asks about them. The Mutual NDA keeps the
  official cover page it came with.

## 1. Signing in and choosing an agreement

The user signs in with a name and email (a placeholder: there is no
password). The browser loads the list of agreements, and the chat opens by
asking what the user needs, with the cursor already in the message box.
Below that message are buttons for three common agreements (Mutual NDA,
Cloud Service Agreement, Professional Services Agreement) and a **See all**
button that lists every agreement with a one-line description.

The user can either tap an agreement, which starts it straight away, or
describe their need in their own words, such as "I need to protect info
before a meeting with a partner". A description goes to the AI, which picks
the agreement that fits best, says in a sentence why, and a **Start** button
for it appears under its reply. The agreement only starts when the user
clicks that button, so a casual "ok" never starts the wrong one. If the
request is unclear, the AI asks a short question first. If Pre-Legal cannot
draft what they asked for, such as an employment contract, the AI says so
plainly, suggests the closest agreement and explains how it differs.

Four agreements attach to a main agreement: the Service Level Agreement,
the Data Processing Agreement, the Business Associate Agreement and the AI
Addendum. They are drafted on their own, and their interview asks which
main agreement they belong to.

## 2. Starting the interview

Once an agreement is chosen, the chat posts a short greeting that asks the
first question, the preview shows the empty agreement with bracketed
placeholders such as "[Provider Company]", and the chat header shows the
agreement's name with a **Change document** button. Changing document asks
for confirmation, because it clears every answer, and returns to the
opening choices.

## The chat box

Messages appear as bubbles: the user's on the right, the assistant's on the
left. The message box grows as the user types, up to a few lines. Enter
sends the message and Shift+Enter starts a new line, which helps with
addresses.

While the AI is replying, three moving dots show that the assistant is
typing, and the box is locked so the message can't be changed or sent
twice. The cursor stays in the box throughout, whether the user pressed
Enter, clicked the send button or clicked a button to choose an agreement,
so they can type the next answer without clicking.

## 3. Each message

When the user sends a message during the interview, the browser sends the
server four things:

- which agreement is being drafted,
- the interview so far (how the agreement was chosen is left out),
- the details collected so far,
- the user's local date, so "next Monday" means their Monday.

The server adds its instructions for the AI and the current details, and
asks the AI for one answer. The AI must reply in a fixed format: the details
the user just gave, any routine term the user asked to change (see below),
a short acknowledgement of what the user said, and the next question. The
question is a required part of its own, so every reply asks one and the
conversation never stalls. The server joins the acknowledgement and the
question into the single message the user sees.

The server also limits how long that answer may be: about 2,000 tokens,
roughly 1,500 words, counting the AI's hidden reasoning as well as its
reply. A normal turn uses a few hundred. Without a limit, the AI service
sets aside credit for an answer about twenty times longer on every message,
so the chat could fail while the account still had credit.

The server does not trust that answer blindly. It drops anything invalid,
such as an impossible date, and a detail the AI leaves empty never erases
one already collected. The server then sends the reply and the updated
details back to the browser, which shows the reply in the chat and fills in
the preview straight away.

The server keeps nothing between messages: the conversation lives only in
the browser. Reloading the page starts a new conversation.

If the AI cannot be reached, the user sees an error and their message stays
in the box so they can send it again.

## 4. How the AI interviews

The AI asks only about the essentials: the parties, dates, money and what
the agreement covers. For a Cloud Service Agreement, for example, that is
who the provider and customer are, who signs for each, their addresses, the
service, the order date, the subscription period, the fees and how they are
paid, the effective date, the governing law and the courts. Where a common
answer exists, the question mentions it, such as "1 year is common", so the
user can simply accept it.

Everything else is a **routine term**, such as the liability cap or how
much notice ends a renewal. Routine terms start filled in with Common
Paper's usual default and are not asked about one by one. At the end the AI
says so, and the user can ask to change any of them in their own words, for
example "make the liability cap 2 times the fees". Some terms only matter
after a particular answer, such as safeguards for health data; they start
as "Not applicable" and the AI asks about them only when they apply.

The AI's instructions also tell it to:

- sound warm, friendly and conversational, while staying short and
  professional, and acknowledge each answer in its own words;
- ask exactly one question at a time, in the agreement's set order;
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
- never invent names, addresses, amounts or dates, and stay on the topic of
  the agreement;
- remind the user that it is not a lawyer and the draft should be reviewed
  by one.

The Mutual NDA was built first and keeps its own, slightly different
interview: it asks about every term, including how long the agreement and
confidentiality last and any changes to the standard terms.

## 5. Checking the details

Once every required detail is collected, a "Check the details" box appears
above the preview, and the agreement side scrolls back to the top so the
user sees it. The Preview title and the Download PDF button stay at the top
of that side while the agreement scrolls. The app builds this summary itself
from the collected details, so it always matches what will be printed. The
AI only asks the user to check it.

Every routine term still at its default is tagged **Default** in the
summary, so the user can see which terms they did not choose themselves. A
term the user changed loses the tag.

The user either clicks **Confirm details** or tells the AI what to change.
If anything changes after confirming, the box comes back and must be
confirmed again.

## 6. Downloading the PDF

**Download PDF** is enabled only when every detail is collected and the
user has confirmed the summary. Clicking it opens the browser's print
dialog, where the user chooses "Save as PDF"; the suggested file name is the
agreement's name. The printed copy contains the cover page, the standard
terms and a note that the draft is a starting point for review by a lawyer,
not legal advice.
