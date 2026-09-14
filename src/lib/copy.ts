export type Tone = 'gentle' | 'balanced' | 'blunt'

export function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const pick = <T>(list: readonly T[], seed: string): T => list[hash(seed) % list.length]

interface Register {
  base: readonly string[]
  sharp: readonly string[]
}

type Bank = Record<Tone, Register>

export function line(b: Bank, tone: Tone, seed: string, sharp = false): string {
  const register = b[tone]
  const pool = sharp && register.sharp.length ? register.sharp : register.base
  return pick(pool.length ? pool : b.balanced.base, seed)
}

export const BANKS = {
  overdue: {
    gentle: {
      base: [
        'The deadline for {t} has passed.',
        '{t} is quite late now.',
        '{t} is late.',
        '{t} is overdue.',
        'The deadline for {t} has gone. You\'ve still got about {d} to do on it.',
        '{t} was due, and there\'s still {d} of it left.',
      ],
      sharp: [
        '{t} is past its deadline and you haven\'t done any of it yet.',
        '{t} was due already and none of it is done.',
        'The deadline for {t} has passed. None of the work is done.',
      ],
    },
    balanced: {
      base: [
        '{t} was due already and you still have about {d} of work left on it.',
        'You\'re past the deadline on {t}. Whether it still takes late work is worth a look.',
        'It\'s worth checking whether {t} still takes late submissions.',
        'You\'re past the deadline on {t} and there\'s still {d} to do.',
        '{t} is late. Hand in whatever you have.',
      ],
      sharp: [
        'You haven\'t started {t} and it\'s already late.',
        '{t} was due and you\'ve done none of it. Hmm.',
        'The deadline went past and {t} is still exactly where it started.',
      ],
    },
    blunt: {
      base: [
        '{t} is quite late now, and I suspect you know that.',
        '{t} was due and it\'s still sitting there unfinished.',
        'You\'ve got about {d} left on {t} and it was due already.',
        'The deadline for {t} has come and gone. I gather you\'re not troubled by that.',
      ],
      sharp: [
        '{t} has been overdue for days now. I have been keeping count, since you evidently haven\'t.',
        'Still nothing on {t}, and it was due already.',
        '{t} has been overdue for a while now and you still haven\'t opened it.',
        'There\'s nothing at all on {t} and the deadline has gone. Deadlines are evidently a matter of opinion with you.',
      ],
    },
  },

  crunch: {
    gentle: {
      base: [
        '{t} is due {d} and it\'s worth {n}% of your grade in {c}.',
        'You\'ve got about {w} of work left on {t} and it\'s due {d}.',
        'That {n}% assignment for {c} is due {d}.',
        '{n}% of your grade in {c} comes down to {t}, due {d}.',
        'There\'s {w} of work left on {t}. It\'s due {d}.',
      ],
      sharp: [
        '{t} is {n}% of {c} and you haven\'t started it yet.',
        '{t} is due {d} and none of it is done.',
        'Nothing has been done on {t} yet. It\'s {n}% of {c}, due {d}.',
        'The whole of {t} is still to do and it\'s due {d}.',
      ],
    },
    balanced: {
      base: [
        'You have {w} to do on {t} before {d}.',
        '{n}% of your {c} grade rests on {t}. It\'s due {d}.',
        'You\'ve got {w} left on {t} and it\'s due {d}. Perhaps today?',
        '{t} is due {d} and you\'ve still got {w} of work to do.',
        '{t} is due {d}. I\'d give it the next free hour you have.',
      ],
      sharp: [
        '{t} is due {d} and you\'ve done none of it. Hmm.',
        'You\'re going to run out of time on {t} if you leave it much longer.',
        '{n}% of {c} rests on {t} and you haven\'t started it. The deadline is {d}.',
      ],
    },
    blunt: {
      base: [
        '{t} is due {d} and you\'ve allegedly got it under control.',
        'You have {w} of work left on {t} and it\'s due {d}. I mention this purely as a matter of record.',
        'There\'s {w} left on {t} and you\'re running out of days.',
        '{n}% of {c} is due {d} and you seem entirely calm about it.',
        '{w} of work on {t}, due {d}. I trust you have a plan you haven\'t shared with me.',
      ],
      sharp: [
        '{t} is worth {n}% of your grade in {c}, a fact you appear to be actively ignoring.',
        '{t} is due {d}. It\'s worth {n}% of {c}, rather a lot to leave this late.',
        'You\'ve not started {t} and it\'s {n}% of {c}, due {d}. Optimism on this scale is almost admirable.',
      ],
    },
  },

  avoiding: {
    gentle: {
      base: [
        '{t} has been sitting on your list for {n} days.',
        'You added {t} {n} days ago and haven\'t touched it since.',
        '{t} has been on your list for {n} days and you haven\'t done any of it.',
        'You haven\'t started {t} in the {n} days it\'s been on your list.',
      ],
      sharp: [
        'It\'s been {n} days and you still haven\'t started {t}.',
        '{t} has been on your list longer than anything else on it.',
        'It\'s been {n} days since {t} appeared and you\'ve not gone near it.',
        '{n} days on your list, and none of {t} is done.',
      ],
    },
    balanced: {
      base: [
        'You keep pushing {t} to the next day.',
        'You\'ve had {n} days to start {t} and haven\'t.',
        'You\'ve been meaning to start {t} for {n} days now.',
        '{t} has been on your list {n} days. Perhaps ten minutes on it today.',
      ],
      sharp: [
        'Every time you sit down to study you find something to do that isn\'t {t}.',
        'Perhaps today\'s the day you actually start {t}.',
        'You\'ve spent {n} days deciding to start {t} tomorrow.',
      ],
    },
    blunt: {
      base: [
        '{t} has been on the list for {n} days and you\'ve scrolled past it every one of them.',
        '{t} has been on your list for {n} days. I do notice these things.',
        'You\'ve moved {t} to tomorrow so many times that tomorrow has stopped meaning anything.',
        '{t} has been on your list {n} days. I do wonder what you think will change.',
        '{n} days of {t} sitting untouched. I\'m starting to think it\'s personal.',
      ],
      sharp: [
        '{t} has been on your list for {n} days. I\'m not turning a blind eye to either your procrastination or your abysmal logging habits.',
        'You\'ve had {n} days to make a start on {t} but it seems that the passage of time eludes you.',
        'You\'ve had {n} days to make a start on {t} but it seems that temporal awareness is not your forte.',
        '{n} days of avoiding {t}. You are not this consistent about anything else.',
      ],
    },
  },

  stale: {
    gentle: {
      base: [
        'You haven\'t studied {c} in {n} days.',
        'It\'s been {n} days since you did anything for {c}.',
        '{c} hasn\'t had any of your time in {n} days.',
        'Your last bit of {c} work was {n} days ago.',
      ],
      sharp: [
        'You\'ve gone {n} days without opening anything for {c}.',
        'Quite a while since {c} got any attention. {n} days, in fact.',
        'It\'s been {n} days since you did any {c} work, and there\'s a deadline on the way.',
        '{c} hasn\'t had a minute from you in {n} days, and its next deadline is close.',
      ],
    },
    balanced: {
      base: [
        'You\'ve not touched {c} in {n} days. Perhaps have a look at it today?',
        '{n} days without {c} and there\'s a deadline coming.',
        'There\'s no {c} time logged in the last {n} days and there\'s work coming up.',
        'It\'s been {n} days since you last did anything for {c}, and there\'s work coming up in it.',
        'No {c} work for {n} days now. Perhaps twenty minutes on it today.',
      ],
      sharp: [
        'When did you last do anything for {c}? It\'s been {n} days.',
        'You\'ve stopped making time for {c} entirely.',
        '{n} days without {c}. There\'s work due in it soon.',
      ],
    },
    blunt: {
      base: [
        'I can\'t find any {c} work in the last {n} days.',
        'You\'ve not done anything for {c} in {n} days.',
        '{c} has had {n} days of nothing from you.',
        '{n} days since your last {c} work. I shall continue to mention it.',
      ],
      sharp: [
        'There is no evidence whatsoever that you have opened {c} in the last {n} days.',
        'You\'ve gone {n} days without {c} and I suspect you\'d struggle to say what it\'s about.',
        '{n} days without opening {c}. You appear to have dropped it.',
      ],
    },
  },

  breakdown: {
    gentle: {
      base: [
        '{t} looks like about {d} of work if you do the whole thing at once.',
        '{t} is {d} of work and you haven\'t broken it up at all.',
        'There\'s about {d} of work in {t}.',
        '{t} is about {d} of work in one piece.',
      ],
      sharp: [
        '{t} is {d} of work and none of it has been started.',
        'You\'ve not made a start on {t}. It\'s about {d} of work.',
        'None of {t} is done yet. It\'s about {d} of work.',
      ],
    },
    balanced: {
      base: [
        'Perhaps split {t} into a few smaller bits.',
        '{t} would be easier to start if you split it into a few steps.',
        'You\'ve got about {d} of work on {t}. I\'d probably start with whichever bit seems easiest.',
        'Perhaps write down the first three things {t} actually needs.',
      ],
      sharp: [
        'I suspect {t} keeps getting skipped because you\'ve never worked out where to start.',
        'You\'re not going to get through {d} of {t} in one sitting.',
        '{t} is {d} of work and you\'ve not found a first step in it. Invent one and do that.',
      ],
    },
    blunt: {
      base: [
        '{t} is too big to sit down and just do, it\'s {d} of work.',
        'You\'ve got {d} of work on {t} and no plan for any of it.',
        '{t} is {d} of work and you\'re treating it as one sitting.',
        '{d} of work on {t}. I\'d love to know what the plan is.',
      ],
      sharp: [
        '{t} is {d} of work and you\'ve been circling it for days.',
        '{d} of work on {t} and not a minute of it done. Perhaps start smaller.',
        '{d} of work on {t}, no plan, no start. You\'re waiting for it to feel smaller.',
      ],
    },
  },

  streakRisk: {
    gentle: {
      base: [
        'You\'re {r} minutes short of keeping the streak today.',
        'You\'re {r} minutes short of keeping your {n}-day streak today.',
        'Your {n}-day streak needs another {r} minutes before midnight.',
        '{r} more minutes today and the streak carries to {m}.',
        '{r} minutes today keeps the {n}-day streak.',
      ],
      sharp: [
        'You\'ve got a {n}-day streak going and {r} minutes left to protect it.',
        'Your streak is {n} days. It expires at midnight unless you can find {r} minutes!',
        '{n} days in a row so far. {r} minutes today and it becomes {m}.',
      ],
    },
    balanced: {
      base: [
        '{n} days in a row. You haven\'t done enough today to keep it going.',
        'Your streak\'s at {n} days and it resets at midnight.',
        '{n} days in a row so far, and it all rests on the next {r} minutes.',
        'The streak is {n} days. {r} minutes before midnight keeps it.',
      ],
      sharp: [
        'You\'re about to lose {n} days over one evening.',
        '{n} days of work, and you\'re going to let it go over one evening?',
        '{n} consecutive days. You\'re {r} minutes from letting that go.',
      ],
    },
    blunt: {
      base: [
        '{n} days of work and today\'s the one you skip?',
        '{n} days in a row, and you\'re {r} minutes from throwing it away.',
        '{n} days in a row, and you\'re going to stop {r} minutes short.',
        '{r} minutes is all that stands between you and losing {n} days. I find the suspense unbearable.',
      ],
      sharp: [
        'You have {r} minutes to save {n} days, and I have my doubts.',
        '{n} days gone at midnight unless you can manage {r} minutes. That is not very many minutes.',
        '{n} days of work, {r} minutes to keep it, and I fancy you\'ll find something else to do.',
      ],
    },
  },

  celebrateStreak: {
    gentle: {
      base: [
        'That\'s {n} days in a row now.',
        'You\'ve studied {n} days straight.',
        'That\'s {n} days in a row!',
        'You\'ve studied every day for {n} days.',
        '{n} days running.',
      ],
      sharp: [
        '{n} days in a row without missing one.',
        'Your streak\'s at {n} days.',
      ],
    },
    balanced: {
      base: [
        '{n} days straight. It\'s starting to look like a routine!',
        '{n} days running, the longest you\'ve kept it going.',
        'You\'ve studied {n} days running now. Quite unlike you!',
        '{n} days in a row. I\'d call that a habit.',
      ],
      sharp: [
        '{n} days in a row without a single miss.',
        '{n} days straight. That took some doing!',
        '{n} days without dropping one. Quite a run.',
      ],
    },
    blunt: {
      base: [
        '{n} days in a row. I had rather assumed you\'d stop by now.',
        '{n} days straight. Frankly more than I expected of you.',
        '{n} days in a row. That is an unusually long time for you to keep at anything.',
        '{n} days in a row. I shall withhold my scepticism for now.',
      ],
      sharp: [
        '{n} days without missing one. Well done.',
        '{n} days in a row. Whatever\'s got into you, do keep it up.',
        '{n} days without a miss. Go on then.',
      ],
    },
  },

  celebrateEarly: {
    gentle: {
      base: [
        'You finished {t} {n} days before it was due.',
        '{t} is done with {n} days to spare.',
        'You handed {t} in {n} days early.',
        '{t} was finished {n} days ahead of the deadline.',
      ],
      sharp: [
        '{t} is done, a good {n} days before it was due. Nice!',
        'You had {n} days left and you finished {t} anyway.',
        '{t} is done and the deadline is still {n} days away.',
      ],
    },
    balanced: {
      base: [
        'That\'s {t} done well ahead of the deadline.',
        'You finished {t} early enough that you\'ve actually got the week free.',
        'You finished {t} {n} days early. Quite unlike you!',
        '{t} went in {n} days before it was due. Quite a change of pace.',
        '{t} is done with {n} days left. I\'d take the rest of the day.',
      ],
      sharp: [
        '{t} went in {n} days early. Perhaps something has changed.',
        'You finished {t} with {n} whole days spare.',
        '{n} days ahead of schedule on {t}. I am not used to this.',
      ],
    },
    blunt: {
      base: [
        'You had {n} days left and you allegedly finished {t} already. Hmm...',
        'You finished {t} {n} days early. I\'ve taken note of it in case it never happens again.',
        '{t}, done, {n} days early. I trust nobody helped you.',
        'You finished {t} with {n} days to spare. I shall need to see that again before I believe it.',
        '{t}, finished, {n} days early. I am recording this for posterity.',
      ],
      sharp: [
        '{t}, finished, {n} days early. I am obliged to record that you have exceeded expectations.',
        '{n} days early on {t}. I shall have to revise my opinion of you slightly.',
        '{n} days early on {t}. I had no idea you were capable of this.',
      ],
    },
  },

  celebrateBig: {
    gentle: {
      base: [
        '{t} is done and that was {n}% of your grade in {c}.',
        '{t} was the big one for {c} and it\'s finished.',
        'That\'s {n}% of {c} you don\'t have to think about again.',
        '{t} is finished. It was {n}% of {c}.',
      ],
      sharp: [
        'You\'ve just done {n}% of your {c} grade in a single sitting.',
        '{t} is finished, and that was {n}% of your {c} grade.',
        '{t} is finished. That was {n}% of {c} in one go.',
      ],
    },
    balanced: {
      base: [
        'You\'ve just cleared {n}% of {c} in one go.',
        '{t} is done, and it was worth {n}% of {c}.',
        'That\'s {n}% of your {c} grade settled.',
        '{t} is done, and {n}% of {c} with it.',
      ],
      sharp: [
        '{n}% of {c} finished in one assignment. Quite a chunk.',
        'You\'ve just taken {n}% of {c} off the table.',
        'You\'ve just cleared {n}% of {c} with {t}. I\'d take the evening off.',
      ],
    },
    blunt: {
      base: [
        '{t} is done and it was worth {n}% of {c}. I\'d call that a good day.',
        'That\'s {n}% of {c} handled. Do try not to coast on it.',
        'That\'s {n}% of {c} out of the way. I had money on you leaving it later.',
        '{n}% of {c}, done. I suppose even you have your moments.',
      ],
      sharp: [
        '{n}% of your {c} grade, done in one go. I shall say something complimentary later.',
        'You\'ve finished the {n}% one. I trust this isn\'t a fluke.',
        '{n}% of {c}, finished, all at once. That\'s the sort of thing a serious person does.',
      ],
    },
  },

  overload: {
    gentle: {
      base: [
        'You\'ve got {d} of studying scheduled today.',
        '{d} of studying planned today. That\'s quite a lot.',
        'There\'s {d} of studying on today.',
        'Today\'s plan adds up to {d}.',
      ],
      sharp: [
        'Today\'s plan comes to {d}. That\'s a lot more than you usually do.',
        'There\'s {d} of studying on today. That\'s roughly double what you normally manage.',
        'Today\'s blocks come to {d}, close to double a normal day for you.',
      ],
    },
    balanced: {
      base: [
        '{d} planned for today. Perhaps move one of those to tomorrow while you still can.',
        'Move one of today\'s blocks to tomorrow, there\'s {d} on there.',
        'You\'ve scheduled {d} today and you\'re not going to get through all of it.',
        'You\'ve put {d} on today. Pick the one you\'d drop and drop it now.',
      ],
      sharp: [
        'You\'ve planned {d} of study today. That\'s roughly double a normal day for you.',
        '{d} on today\'s calendar. Perhaps halve it while there\'s still time?',
        'You\'ve put {d} on today. That\'s close to double your usual output.',
      ],
    },
    blunt: {
      base: [
        'You\'ve got {d} planned today. I find following through with that somewhat unlikely...',
        'You\'ve scheduled {d} of study today. I admire the ambition.',
        '{d} of study today. I look forward to the report.',
        '{d} on today. I shall check back this evening.',
      ],
      sharp: [
        '{d} of study in a single day. You have never once done that.',
        'You\'ve planned {d} today, roughly double what you manage on a good day. I\'ll wait.',
        '{d} in one day. That is a plan written by someone who won\'t be doing it.',
      ],
    },
  },

  emptyPlan: {
    gentle: {
      base: [
        'You haven\'t scheduled any study time today and {t} is due {d}.',
        'Your calendar\'s empty today and {t} is due {d}.',
        'Nothing\'s planned for today and {t} is due {d}.',
        'There\'s no study time on today\'s calendar. {t} is due {d}.',
      ],
      sharp: [
        '{t} is due {d} and there\'s nothing on your calendar for today.',
        'You\'ve nothing scheduled today and {t} is due {d}.',
        '{t} is due {d}. Today has nothing planned on it.',
      ],
    },
    balanced: {
      base: [
        'Nothing planned today. {t} is due {d}, in case that\'s slipped your mind.',
        'You\'ve got nothing scheduled today, which is fine until you remember {t} is due {d}.',
        'Your calendar\'s empty and {t} is due {d}. I\'ll leave that with you.',
        'Nothing\'s planned today. Perhaps set an hour aside for {t}, due {d}.',
      ],
      sharp: [
        '{t} is due {d} and today is entirely empty. Perhaps put an hour somewhere?',
        'Nothing at all planned today, and {t} is due {d}.',
        'Your calendar is blank. {t} is due {d}.',
      ],
    },
    blunt: {
      base: [
        'There\'s nothing in your calendar for today and {t} is due {d}. I\'ll say no more.',
        'An empty calendar today, with {t} due {d}. I find the confidence remarkable.',
        'Not a minute set aside today, with {t} due {d}.',
        'An empty day today, and {t} due {d}.',
        'Nothing on the calendar today. {t} is due {d}. I\'m sure you have your reasons.',
      ],
      sharp: [
        '{t} is due {d} and you have set aside precisely no time for it.',
        'Nothing planned, {t} due {d}. It seems that forward planning is not your forte.',
        'Nothing at all planned, {t} due {d}. You\'re relying on one heroic evening.',
      ],
    },
  },

  calibration: {
    gentle: {
      base: [
        'Your tasks tend to take about {n}% longer than you estimate.',
        'A two hour estimate from you tends to take {d}.',
        'Whatever you plan for, it usually takes about {n}% longer.',
        'Work takes you about {n}% longer than you plan for.',
      ],
      sharp: [
        'Two hours of planned work has been taking {d}.',
        'Your estimates run about {n}% short. Plans are adjusted for it.',
        'What you call two hours has been taking {d}.',
      ],
    },
    balanced: {
      base: [
        'You estimate low by about {n}%. Perhaps add that on when you plan by hand.',
        'Tasks you estimate at two hours average {d}.',
        'Your estimates run about {n}% short. I add that on when I build your plan.',
        'Two hours of your planning has been running to {d}. Perhaps plan fewer things and finish them.',
      ],
      sharp: [
        'Two hours of your planning is {d} of real work.',
        'You\'re off by about {n}% on estimates. Perhaps assume things take half again as long.',
        'Two hours in your book is {d} in practice. I\'ve stopped taking your estimates at face value.',
        'Your estimates are {n}% short. I adjust for it, but you should know.',
      ],
    },
    blunt: {
      base: [
        'You underestimate your work by {n}%.',
        'When you say two hours, you mean {d}.',
        'You are {n}% optimistic about your own speed.',
        'Your estimates are {n}% wrong. This has been true for some time now.',
      ],
      sharp: [
        'You are wrong about your own speed by {n}%, consistently, and have been for some time.',
        'You are out by {n}% every single time. I have stopped being surprised by it.',
        'What you call two hours is {d}, and has been for a while. You plan the same way regardless.',
      ],
    },
  },

  freedTime: {
    gentle: {
      base: [
        'Everything you planned for today is done, with about {d} left.',
        'You\'ve finished everything planned for today.',
        'Today\'s plan is finished and there\'s about {d} of the day left.',
        'Every block you planned today is finished. It\'s not yet evening.',
      ],
      sharp: [
        'A full day of planned study, all of it done, with {d} to spare.',
        'Every block on a busy day is finished. About {d} left.',
        'A full day of blocks, all finished before the evening.',
      ],
    },
    balanced: {
      base: [
        'You\'ve cleared today\'s plan with about {d} left. {t} would be next.',
        'Everything planned is done. {d} left in the day.',
        'Today\'s finished with {d} to spare. Perhaps make a start on {t}?',
        'Everything planned is finished with {d} left. Perhaps start something you\'d otherwise dread.',
        'Today\'s blocks are all done. About {d} of the day left.',
      ],
      sharp: [
        'That was a full day and you finished all of it. {d} left.',
        'A whole day of blocks, all done, {d} spare. Perhaps {t} next?',
        'A full day of blocks, all done, {d} left. I\'d spend it on something that isn\'t studying.',
      ],
    },
    blunt: {
      base: [
        'Everything planned is done and it isn\'t even late. Go outside.',
        'You\'ve finished the lot with {d} to spare. Eat some grass.',
        'Today\'s plan, finished. I shall try to contain my surprise.',
        'Every block done. I suppose miracles do happen.',
      ],
      sharp: [
        'A full day, finished, {d} to spare. I am impressed.',
        'Every block done on a heavy day. I shall allow it.',
        'A full day of blocks, all finished. I am obliged to acknowledge it.',
      ],
    },
  },

  allClear: {
    gentle: {
      base: [
        'Nothing\'s due this week.',
        'You\'re caught up, nothing due and nothing overdue.',
        'There\'s nothing on your calendar for the next week or so.',
        'There\'s nothing needing attention this week.',
      ],
      sharp: [
        'Nothing due, nothing overdue. Quite a rare state of affairs.',
        'Nothing at all due for well over a week.',
        'Nothing at all due for the next ten days.',
      ],
    },
    balanced: {
      base: [
        'Nothing\'s due for a while. You could make a proper start on something for once.',
        'You\'re clear this week. Historically this is when you do the least.',
        'Nothing\'s due this week. Perhaps enjoy it.',
        'Nothing due for over five days. Perhaps pick the thing you\'d least like to do and do a bit of it.',
      ],
      sharp: [
        'Nothing due for a fortnight. Perhaps pick the largest thing you have and chip at it.',
        'A completely clear run for over a week.',
      ],
    },
    blunt: {
      base: [
        'Nothing\'s due this week. I\'m sure you\'ll find a way to waste it.',
        'You\'re entirely caught up. I\'m told this does happen occasionally.',
        'You\'re completely caught up. Don\'t get used to it.',
        'Nothing due. I shall observe how you squander it.',
      ],
      sharp: [
        'Over a week clear. I shall be interested to see what you do with it.',
        'A fortnight with nothing due. I smell fish.',
        'Ten days with nothing due. I shall enjoy watching you fill them with nothing.',
      ],
    },
  },

  welcomeBack: {
    gentle: {
      base: [
        'It\'s been {n} days since you last did anything.',
        'It\'s been {n} days since you last logged anything.',
        'Welcome back, it\'s been {n} days.',
        'You\'ve been away {n} days.',
        'Your last session was {n} days ago.',
      ],
      sharp: [
        'You\'ve been away {n} days. Quite a while!',
        '{n} days since your last session. A few things have crept closer in the meantime.',
        'It\'s been {n} days. Several deadlines are nearer than they were.',
      ],
    },
    balanced: {
      base: [
        '{n} days since your last session, and a few deadlines have moved closer.',
        'You\'ve been gone {n} days and there\'s a fair bit waiting.',
        'Back after {n} days. Perhaps start with something small.',
        '{n} days away. I\'d pick one small thing and do only that today.',
      ],
      sharp: [
        'You\'ve been away {n} days. Perhaps take the first thing on the list and leave the rest for now.',
        '{n} days away. A fair amount has piled up in the meantime.',
        'Back after {n} days. Start at the top of the list and ignore the rest for now.',
        '{n} days away. I\'d pick one thing and leave the rest until tomorrow.',
      ],
    },
    blunt: {
      base: [
        'Where\'ve you been? It\'s been {n} days.',
        'You\'ve been absent {n} days. Your deadlines, regrettably, have not been.',
        '{n} days of silence, and here you are.',
        '{n} days away. I trust the holiday was restful.',
        'Back after {n} days. The list has not improved in your absence.',
      ],
      sharp: [
        '{n} days away. I had begun to wonder whether you were coming back at all.',
        'You\'ve been gone {n} days. Let\'s see what that\'s cost you.',
        '{n} days gone. Let\'s see how much of that you can pretend didn\'t happen.',
      ],
    },
  },

  exam: {
    gentle: {
      base: [
        'Your {c} {k} is {w}.',
        'You\'ve got the {c} {k} {w}.',
        'The {c} {k} is {w}.',
        'The {c} {k} falls {w}.',
      ],
      sharp: [
        'Your {c} {k} is {w}. There\'s been no {c} work for a while.',
        'The {c} {k} is {w} and you\'ve not looked at {c} in days.',
        'Your {c} {k} is {w}. You\'ve done nothing for {c} in days.',
      ],
    },
    balanced: {
      base: [
        'Your {c} {k} is {w}. Perhaps a review session today?',
        'The {c} {k} is {w}. Worth going through your notes this week.',
        'Your {c} {k} is {w}. That has rather crept up on you.',
        'The {c} {k} is {w}. I\'d start with whatever you understood least at the time.',
        'The {c} {k} is {w}. Perhaps a look through your notes today.',
      ],
      sharp: [
        'There\'s a {c} {k} {w}. As far as I can tell, you\'ve not opened the notes once.',
        'The {c} {k} is {w} and you\'ve done no revision at all yet.',
        'You\'ve got the {c} {k} {w} and you haven\'t opened {c} in days.',
        'You\'ve done nothing for {c} in days and the {k} is {w}. Perhaps tonight.',
      ],
    },
    blunt: {
      base: [
        '{c} {k} {w}. You\'ll be cramming the night before at this rate.',
        'The {c} {k} is {w}. I trust you have some sort of plan. No? Concepts of a plan?',
        'The {c} {k} is {w} and you\'re going to end up cramming the night before.',
        'The {c} {k} is {w}. I assume it\'s all in your head already.',
        'The {c} {k} is {w}. I gather the revision will be taking place at some unspecified future date.',
      ],
      sharp: [
        'Your {c} {k} is {w}, and your revision so far amounts to nothing at all.',
        'The {c} {k} is {w}. I would describe your preparation as theoretical.',
        'The {c} {k} is {w} and you haven\'t reviewed for it at all.',
      ],
    },
  },
} as const satisfies Record<string, Bank>

export const HOURLY_GREETINGS = [
  'Late session?',
  'Still awake?',
  'This is a very late session.',
  'Please go to bed.',
  'The day has not started yet.',
  'Up before the day?',
  'Early bird.',
  'Morning, then.',
  'Good morning.',
  'The day is underway.',
  'A respectable morning.',
  'Nearly noon.',
  'Noon. Make it count.',
  'Afternoon, at last.',
  'The day is moving.',
  'Still time to turn it around.',
  'Late afternoon.',
  'Evening is here.',
  'Good evening.',
  'The evening is yours.',
  'Evening.',
  'One more useful hour?',
  'Winding down?',
  'Still up?',
] as const

export const START_ENCOURAGEMENT = [
  '10 minutes on the clock.',
  'First step.',
  'One block at a time.',
  '10 minutes to start.',
]

export const FOCUS_DONE = [
  'Session logged.',
  'Time recorded.',
  'Session saved.',
  'Time logged.',
]

export const greet = (d = new Date(), _seed = '', name = '') => {
  const h = d.getHours()
  const greeting = HOURLY_GREETINGS[h]
  const trimmedName = name.trim()
  if (!trimmedName) return greeting

  const punctuation = greeting.match(/[.!?]$/)?.[0] ?? ''
  const withoutPunctuation = punctuation ? greeting.slice(0, -punctuation.length) : greeting
  return `${withoutPunctuation}, ${trimmedName}${punctuation}`
}

export function fill(t: string, vars: Record<string, string | number>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))
}
