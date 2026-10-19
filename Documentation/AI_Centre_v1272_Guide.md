# AI Centre (monorepo v1272)

The AI Centre is where Admin controls Ask Nidus and the AI agents in Platform, Simulator and Project Planner. Every change asks for a reason and is written to the Admin Audit log.

## Who can do what

| Permission | Lets you |
|---|---|
| `ai.view` | See usage, organisations, plans, the data catalogue, meaning search and Assessor calibration (read only). |
| `ai.settings.edit` | Use the kill switch, change models and prices, credit settings, retention defaults and safety limits. |
| `ai.credits.edit` | Set plan allowances, organisation overrides and top-ups, and switch AI off for one organisation. |
| `ai.catalogue.edit` | Change what Ask Nidus may query, and which languages AI answers are offered in. |
| `ai.embeddings.manage` | Retry failed embeddings and re-embed records. |
| `ai.simulator.author` | Write Simulator rubrics and stakeholder personas, calibrate the Assessor, set difficulty ranges. |

Super and system admins have all of them; support admins can view.

## Overview

Runs, failures, blocked runs (kill switch, AI notice not accepted, out of credits), organisations using AI and estimated cost for the chosen period. Click a count to open the matching runs or organisations. Breakdowns by agent, model, app, organisation and day are below.

## Organisations

Each organisation's AI status, credits used this billing period and its allowance.

- **Disable AI for this organisation** overrides the organisation's own switch. The reason is shown to them.
- **Monthly credit allowance override** replaces the plan's allowance (blank = plan allowance).
- **Override retention** sets conversation and usage-record retention for this organisation, even outside the normal range (for example a legal hold). The organisation can no longer change it.
- **Add credits** adds a one-off top-up for this period, or an adjustment (+ or −).

The AI notice and the organisation's own on/off switch belong to its Account Owner (AI Settings page in the app).

## Plans & Credits

Monthly AI credits per plan:

- **Platform and Simulator subscription plans:** per organisation.
- **Project Planner plans:** per paid seat, pooled across the account. The `trial` row is the 14-day trial.
- **Simulator plans** (free, basic, professional…): used when the organisation has no paid Platform plan; the owner's Simulator plan decides.

Blank means the plan includes no own allowance. Organisations without any paid plan get the "credits without a paid plan" value from Settings.

## Models & Routing

Choose which approved model handles routing, quick answers and agent work, and the price per million tokens used to turn usage into credits. Every routed model must be approved and priced. Changes apply within about a minute.

## Data Catalogue

The registers Ask Nidus and Report Builder may query, for Platform and Simulator separately. You can rename a register, describe it (the AI reads the description), switch it on or off, make it available in the Planner edition, and edit its fields: label, type, whether it can be filtered, grouped or totalled, allowed values and links to other registers. A new register needs a database view first (monorepo SQL). Users still only see records they have access to.

**AI answer languages:** which app languages AI may answer in. Record text is never translated.

## Meaning Search

Records (risks, issues, actions, decisions, lessons, meeting summaries, daily log entries, delays, schedule tasks) are embedded in the background every two minutes so Ask Nidus and meeting filing can find similar records by meaning. This page shows the queue per app and record type, failed rows (no record text is shown), and each organisation's share of non-English content — the current model is English-only, so non-English records are found by keyword until a multilingual model is approved. Use **Re-embed** for one organisation, all records, or failed rows only.

## Assessor Calibration (Simulator)

Per scenario:

- **Rubric:** criteria with a weight and a description of each level 1–4, used for single decisions, the whole run or both. With no rubric the Assessor is off for that scenario.
- **Scoring & difficulty:** adaptive difficulty on/off and its easiest/hardest level (1–5). **Count the Assessor toward the score** with a weight — only possible once the scenario is calibrated.
- **Calibration:** score recent assessments yourself, then compare. A scenario is calibrated after 30 author-scored assessments with at least 80% of criterion levels within one level of the Assessor.
- **Flags:** learners who disagree with an assessment. Uphold or dismiss with a note.

Learners are never identified here.

## Stakeholder Personas (Simulator)

Goals, concerns, priorities and red lines (one per line), personality, communication style and notes for each Simulator stakeholder. The AI stakeholder replies in character and remembers the learner's decisions within a run; ignoring red lines lowers its trust, and low trust makes its escalations come sooner. Event outcomes, health and scores stay rule-based.

## Settings

- **Kill switch:** switches every AI feature off for every organisation within about a minute. Non-AI features carry on.
- **Credits:** the value of one credit in model cost, the warning level (Account Owners are warned in the app and by email), and the allowance for organisations without a paid plan.
- **Retention:** default periods for conversations and usage records, and the range organisations may choose from.
- **Safety limits:** agent steps per question, rows per query and query timeout.
