# Nudge

<img width="1440" height="786" alt="Screenshot 2026-09-13 at 7 35 57 PM" src="https://github.com/user-attachments/assets/bad4ff3a-402d-437d-a309-7eb1847fc008" />


\
Nudge is a study planner built for college students to keep track of courses, deadlines, study time, notes, and all the other little things. It's designed to be fairly intuitive and has features that are intended to help procrastinators (like me) keep their personal and academic life organized. It also has an optional AI assistant (more below).

Although the original goal was for Nudge to stay as minimal as possible, the insidious scope creep sank its voracious tentacles into my codebase. I realized I wanted to include more of the day-to-day features students may want.

You can use the live version over at [nudge.neocities.org](https://nudge.neocities.org) or run it locally on your own machine. Nudge is a static website so the main app runs completely offline and you don't need to make an account (there are two caveats which I'll explain below).

You might say there are plenty of study apps out there already. Why Nudge? I started out making Nudge almost exclusively for myself because none of these other study planners/trackers worked well for me. Some were too limited, some too cluttered and confusing, and many sat behind paywalls charging ridiculous prices. I wanted something free, open source, and with a clean aesthetic. And I wanted it to include the kinds of features that would be both useful and delightful.

## Run it locally

You will need Node.js installed on your machine:

```bash
git clone https://github.com/ImplodingGiraffe/nudge.git
cd nudge
npm install
npm run dev
```

Open up the local URL shown in your terminal (usually `http://localhost:5173`).

You now have Nudge running on your own computer!

## Build it

If you want to make a production build of the static site:

```bash
npm run build
```

The finished build will be a single self-contained file waiting at `dist/index.html`.

## Your data

Nudge stores all your courses, tasks, plans, study sessions, and notes right in your browser's local storage. No data (except for the _optional and manually-triggered_ AI) gets uploaded to the cloud.

While this is awesome for privacy and offline use, it does mean Nudge doesn't support automatic syncing between devices. I decided to go this route because I wanted Nudge to be something you own. Static websites are wonderfully simple and keeping it static means I can host the live version for free on Neocities. In the future I might look into adding an optional field in settings where you can drop in an API key for a cloud storage provider. This also has the benefit of keeping important data, like notes, safer from accidental deletion.

> **Please note:** clearing your browser or site data (sus ngl) will permanently delete your Nudge data.
>
> **PLEASE** export a backup from **Settings → Data** before clearing anything (or when moving to a new device) so you can import that backup file back in whenever you want.

## Nudge reminders

Reminders tell you what's due, how much work you have left, and what you've been putting off, then nudge you (heh) toward what you _should_ be doing.

Reminders have their own personalities! You can set them to be **gentle**, **balanced**, or **blunt**. If blunt mode is enabled, expect some degree of humiliation.

> **Note:** Nudge reminders are completely rules-based. You do _not_ need to set up Nudge AI to see them. You can see all 360 reminder variations in `src/lib/copy.ts` if you so wish.

## Nudge notes

This was a late addition to the app, but I realized Nudge would benefit from having a built-in notes tab right alongside the schedule.

That said, I am wary that taking lecture notes here instead of something like Google Docs (setting aside Google privacy concerns) is dangerous, since everything lives right in your browser's storage. If your browser data gets cleared out and you haven't exported a backup, your notes sink with the ship. I realize that this is a rather large issue and have considered the File System Access API to save and read notes locally on your computer. But this is only supported on Chromium-based browsers. (I'm typing this on Firefox by the way.) 🥲

> **Note:** Nudge's notes editor is powered by [Plate.js](https://platejs.org/).

## Nudge AI

It feels like every single website nowadays slaps "AI" on the homepage just to market itself. I didn't want Nudge to be oriented around that. Nudge AI is entirely optional. If you want to use it, you'll have to grab your own API key. It connects to Google Gemini to (hopefully) help you do things like lay out your week, break assignments into smaller steps, schedule study sessions and so on.

To use it, grab a free Gemini key from Google AI Studio and paste it into settings. The key stays saved in your browser and **is not** included in your exported Nudge backups. Nudge only sends data over to Google when you actively trigger an AI request.

> **Note:** It should go without saying that even when Nudge is hosted locally, you need an internet connection to use Nudge AI.

Adding Nudge AI brings some maintenance headaches from a developer perspective (constantly shifting model endpoints etc). Since AI isn't the focus of Nudge and hasn't been tested to death, it's bound to have bugs. If you run into them please open an issue and let me know!

## Feedback

As I just said, Nudge is definitely a bit buggy. Over the past few days, I have tried my best to hunt down the little critters but I know some have escaped my clutches. Bug reports, weird quirks, ideas, and feedback (good or bad) are all welcome.

I'm not a true developer myself (more of a vibe coder, though that term often unfairly implies sloppiness) but I care a lot about Nudge and want it to feel polished and reliable.

One area that I know needs more love is responsive design. Most of my testing was focused around desktop usability though I did try to keep mobile in mind. I will try to improve usability across devices of all shapes and sizes in the future.

Since I am a newly minted college student I doubt I'll have much time to work on Nudge. But I'll do my best to squash bugs and look over PRs!

Cheers,\
ImplodingGiraffe
