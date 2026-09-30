# WildCast — Accounts & Sign-in: Executive Summary

*Draft, updated 2026-09-30 (end of day). Status: steps 1-5 built and automatically tested; awaiting a live preview test, then review and merge.*

## What we're doing
Moving WildCast from shared access keys to **personal accounts**, so every person has their own login,
and the app knows who is on the Wild Stack team and who is a client.

## Why
- A shared key makes everyone look identical: no personal folders, no accountability, no way to tell a
  team member from a client.
- The team login was built recently but parts of the app still only understand the old keys, so some
  team members are turned away from features they should have.
- Team access is currently granted just by typing a company email address, with nothing proving the
  person owns it. That needs closing.

## Who gets what
| Who | How identified | Access |
|---|---|---|
| Wild Stack team | `@wildstack.studio` or `@intothewild.hamburg` email, and approved | Everything, including publishing templates and Figma import |
| Clients (Wolt, DoorDash, others) | Any other email | Everything except import and template publishing; Manager and Designer view toggle |

## What we are building, in order (steps 1-5 built, not yet live)
1. Recognise both team domains, and require approval (an approved-email list and/or invite code) before
   anyone can become team. Closes the "type a company email, get full access" gap.
2. Let team accounts publish and manage templates (today only the old shared key can).
3. Make the AI features check who is calling, and record AI usage per person. No credit cap for now.
4. Switch off shared activation keys on **Monday 5 October 2026**. Key users need an account before then.
5. Lock sign-in briefly after repeated wrong passwords.
6. Later, once an email service is chosen: email confirmation and "forgot password" (not started).

## Decisions made
- AI credits stay uncapped until usage is better understood; we will collect usage numbers meanwhile.
- Activation keys end 5 October 2026.
- Clients get Manager and Designer view, never import.

## Risks and open items
- Anyone still using a shared key must create an account before 5 October or they will be locked out.
- Team sign-up stays gated by approval until email confirmation exists.
- Email service (confirmation, password reset): about a day of work plus domain setup; not yet chosen.

## How we work
Every change is built on its own branch, tested for real before it is called done, and reviewed before it
goes live. A running log of changes and tests is kept for the final write-up.
