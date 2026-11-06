# How the chat works

This page explains, in plain English, what happens from the moment someone
opens Pre-Legal to the moment they download an agreement as a PDF and come
back to it later.

## The pieces

- **The browser app** shows a sidebar of the user's documents, the chat, and
  a live preview of the agreement. On a wide screen the page fits the window
  and each part scrolls on its own, so all stay visible throughout. On
  smaller screens the sidebar slides in from a menu button, and on a narrow
  screen the chat comes first and the agreement below it.
- **The server** runs in the same Docker container. It handles accounts,
  stores drafts, hands out the list of agreements and their standard terms,
  and passes chat messages to the AI.
- **The database** holds accounts, login sessions and saved drafts. It is
  wiped every time the app restarts, which is fine for now: everyone then
  has to sign up again and their drafts are gone.
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

A notice that drafts are a starting point for review by a lawyer, not legal
advice, stays at the bottom of every screen.

## 1. Accounts

A new user signs up with a name, an email and a password of at least 8
characters. A returning user logs in with their email and password. If
either is wrong the message does not say which, so nobody can use the form
to find out who has an account.

The server never stores the password itself, only a scrambled version of it
(a salted hash) that can check a password but cannot be turned back into one.

After signing up or logging in, the browser holds a session cookie: a long
random code that identifies the user on each request. Page scripts cannot
read it and other websites' requests do not carry it. It lasts 7 days, and
the user stays logged in across tabs and reloads until then. **Log out** ends
the session on the server, so the old code stops working. If the app has
restarted, the session no longer exists and the next action returns the user
to the log in screen.

Only logged-in users can use the AI, so anonymous visitors cannot spend the
AI credit.

## 2. Choosing an agreement

The browser loads the list of agreements and the user's saved documents, and
the chat opens by asking what the user needs, with the cursor already in the
message box. Below that message are buttons for three common agreements (Mutual NDA,
Cloud Service Agreement, Professional Services Agreement) and a **See all**
button that lists every agreement with a one-line description.

The user can either tap an agreement, which starts it straight away, or
describe their need in their own words, such as "I need to protect info
before a meeting with a partner". A description goes to the AI, which picks
the agreement that fits best, says in a sentence why, and a **Start** button
for it appears under its reply. The agreement only starts when the user
clicks that button, so a casual "ok" never starts the wrong one. If the
request is unclear, the AI asks a short question first. If Pre-Legal cannot
draft what they asked for, such as an employment contract or an apartment
rental, the AI says plainly that there is no good match and points to See
all. It does not suggest an agreement that would not fit, and no Start button
appears.

Four agreements attach to a main agreement: the Service Level Agreement,
the Data Processing Agreement, the Business Associate Agreement and the AI
Addendum. They are drafted on their own, and their interview asks which
main agreement they belong to.

## 3. Starting the interview

Once an agreement is chosen, the server creates a saved draft for it, the
chat posts a short greeting that asks the first question, the preview shows
the empty agreement with bracketed placeholders such as "[Provider Company]",
and the chat header shows the agreement's name. To work on something else,
the user clicks **New document**; the current draft stays in the sidebar.

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

## 4. Each message

When the user sends a message during the interview, the browser sends the
server five things:

- which agreement is being drafted,
- the interview so far (how the agreement was chosen is left out),
- the details collected so far,
- the user's local date, so "next Monday" means their Monday,
- how far the interview has got (its stage, described in section 6).

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

The server does not trust that answer blindly. It checks what code can check
reliably (see "Complete answers" in section 5) and does not use a value that
fails: it tells the user what is wrong in its own words, in place of the AI's
reply. A detail the AI leaves empty never erases one already collected. The
server then sends the reply and the updated
details back to the browser, which shows the reply in the chat and fills in
the preview straight away.

Answering a message and saving the result are two separate steps: the AI's
side of the server remembers nothing between messages. Once the reply is
shown, the browser saves the draft (see "Saving and reopening").

If the AI cannot be reached, the user sees an error and their message stays
in the box so they can send it again.

## 5. How the AI interviews

The AI asks only about the essentials: the parties, dates, money and what
the agreement covers. For a Cloud Service Agreement, for example, that is
who the provider and customer are, who signs for each, their addresses, the
service, the order date, the subscription period, the fees and how they are
paid, the effective date, the governing law and the courts. Where a common
answer exists, the question mentions it, such as "1 year is common", so the
user can simply accept it.

Everything else is a **routine term**, such as the liability cap or how
much notice ends a renewal. Routine terms start filled in with Common
Paper's usual default and are not asked about one by one. At the end the app
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
  question), and accept it as given if the user confirms, without asking
  again; real names are never questioned just because they are uncommon;
- ask which place the user means when a place given for the governing law or
  the courts could be more than one ("Washington" could be the state or D.C.;
  "Portland" could be in Oregon or Maine), and record the full official name,
  such as "the State of Washington";
- talk about the details in plain language, never in the app's internal
  terms (for example "November 3, 2026" rather than "2026-11-03");
- never invent names, addresses, amounts or dates, and stay on the topic of
  the agreement;
- remind the user that it is not a lawyer and the draft should be reviewed
  by one.

The Mutual NDA was built first and keeps its own, slightly different
interview: it asks about every term, including how long the agreement and
confidentiality last.

### Complete answers

In a legal document, a vague detail causes real problems, so each detail has a
short definition of what a complete answer is, with examples of vague ones. The
definitions are in the agreement's entry in the catalog, and the party details
(company, signer, title, address) share one set, so every agreement has them.
For example, fees need an amount and how they are charged.

If an answer falls short, the AI does not record it yet and asks for exactly
what is missing: "Elena" gets "What's Elena's last name?", "200 Market St" gets
a question about the city, state and ZIP code, "$2,500" gets a question about
how it is charged, and "Harbor Logistics" gets a question about its legal form
(not for an individual). It then puts the parts together. It asks once: if the
user says that is all there is, such as a person with only one name or a
business with no legal form, the AI records it as given and moves on. A real
name is never questioned just because it is uncommon.

Whether an answer is vague is the AI's judgment, so it can occasionally miss one.
The summary is where the user sees any that got through.

Code checks a few things firmly, and the user cannot confirm past them:

- a date must exist on the calendar (past dates are fine, since agreements are
  sometimes backdated);
- an NDA's number of years must be from 1 to 10;
- a Service Level Agreement's target uptime must be above 0% and at most 100%;
- a US notice address must have a real state and a ZIP code in the right format;
- a governing law reading "the State of ..." must not be a misspelled US state.

Code cannot tell every address apart, so it passes anything it cannot be sure
of. An address ending in another country's name is not checked at all. One with
no country that looks like a bad US address, such as "Perth, WA 6000", is
refused with a request to add the country, which clears it. A state name that
resembles no real state, as in "the State of Narnia", is left to the AI, because
"the State of" also begins the names of real countries.

## 6. The end of the interview and checking the details

The app, not the AI, runs the end of the interview, because the AI sometimes
put the last two requests in one message and no wording of its instructions
stopped that. The server keeps track of a stage, saved with the draft:

1. **Collecting**: details are still missing, and the AI asks for them. The
   server alone decides when everything is collected, using one rule for
   every agreement, and tells the browser.
2. **Changes**: once everything is collected, the app asks whether the user
   wants any changes to the standard terms.
3. **Review**: once that is answered, the app asks the user to check the
   summary and click Confirm details, and reminds them that a lawyer should
   review the draft. It asks again after any later change.
4. **Confirmed**: the user clicked Confirm details. If they keep chatting
   without changing anything, the app says the details are confirmed and they
   can download the PDF.

These questions are fixed text. The AI still writes the short acknowledgement
in front of them, and whatever question it wrote itself is thrown away.

There is one exception. The AI can flag that it needs one more answer about
what the user just said, and then its own question is shown and the stage
waits. It may do this if the user wants changes but has not said what they
are, if an answer is incomplete, needs a double-check or a place needs
clarifying, or if an
answer makes a term marked "only if" apply. Because this is the AI's own
judgment, it can occasionally get it wrong, such as asking one more question
about a routine term, or not asking about an "only if" term. That term then
stays "Not applicable" and tagged Default in the summary, where the user can
see it and ask to change it.

When the stage reaches Review, a "Check the details" box appears above the
preview, and the agreement side scrolls back to the top so the user sees it.
The Preview title and the Download PDF button stay at the top of that side
while the agreement scrolls. The app builds this summary itself from the
collected details, so it always matches what will be printed.

Every routine term still at its default is tagged **Default** in the
summary, so the user can see which terms they did not choose themselves. A
term the user changed loses the tag.

The user either clicks **Confirm details** or tells the AI what to change.
The button waits while a reply is on its way, since that reply could change
the details. If anything changes after confirming, the box comes back and must
be confirmed again.

## 7. Downloading the PDF

**Download PDF** is enabled only once the user has confirmed the summary. Clicking it opens the browser's print
dialog, where the user chooses "Save as PDF"; the suggested file name is the
agreement's name. The printed copy starts with a note at the top of the first
page that the draft is a starting point for review by a lawyer, not legal
advice, followed by the cover page and the standard terms. The sidebar, the
chat and the on-screen notice are left out.

## 8. Saving and reopening

Drafts save themselves; there is no Save button. A draft is created when an
agreement starts, and saved again after every reply and every Confirm details
click. What is saved is everything needed to pick up where the user left off:
the whole conversation, the details collected and the interview's stage. The chat before an agreement is chosen is saved only once one
starts, so simply browsing creates nothing.

The sidebar lists the user's own drafts with the latest change first, each
showing the agreement's name, the company names known so far and the date,
such as "Acme Inc. and Globex LLC, Nov 4". Nobody can see or open another
user's drafts, not even by guessing a draft's number.

Clicking a draft reopens it with its conversation and document exactly as
they were, and the interview carries on from there. A draft that was already
confirmed can be downloaded straight away. **New document** starts a fresh
chat. Reloading the page also starts a fresh chat, with every draft still in
the sidebar.

Each sidebar item has a menu (the three dots) with **Rename** and **Delete**.
Rename turns the name into a text box: Enter or clicking elsewhere saves it,
Escape cancels, and an empty or unchanged name changes nothing. The new name
replaces the agreement's name in the sidebar only, with the parties and date
still below it. Renaming does not count as a change to the agreement, so the
draft keeps its place and date. Saves never touch the name, and names can be up
to 100 characters.

Delete first asks for confirmation, because it cannot be undone. The draft and
its conversation are then permanently removed. If it was the open draft, the
user lands on a fresh chat straight away. Both actions wait for any save still
running, so a late save cannot undo them, and nobody can rename or delete
another user's drafts.

If a save fails, the user sees a warning and keeps working: every save carries
the whole draft, so the next one catches up. If the user moves to another
document while the AI is still replying, that message and its reply are
dropped, so a late answer can never overwrite a newer copy of the draft. Saves
run one at a time and reopening a draft waits for them, so it never loads a
copy older than the one the user just saw.

## Known limitations before real users

These are deliberately not built yet and must be done before real people use
Pre-Legal:

- **Two tabs on one draft.** Each tab holds its own copy of a draft and every
  save replaces the stored one, so with the same draft open in two tabs or on
  two devices the last save wins and the other tab's newer answers are lost.
  Saves need a version check and a message when there is a conflict. A draft
  deleted in one tab also stays listed in the other until it is reloaded; there,
  opening or deleting it shows an error and saving it shows the save warning.
- **Secure cookie over HTTPS.** The session cookie does not yet require HTTPS,
  because the app runs on plain `http://localhost`. Once it is deployed over
  HTTPS the cookie must be marked Secure, or it could be sent unencrypted.
- **Login rate limiting.** Nothing limits how many passwords someone can try,
  so an attacker could keep guessing. Logins need a limit on repeated attempts.
- **Password reset.** A user who forgets their password has no way back into
  their account. This needs a reset flow, which also means sending email.
