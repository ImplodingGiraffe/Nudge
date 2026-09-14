import { useState } from 'react'
import { ArrowRight, CalendarRange, Sparkles, Zap } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Input } from './ui'
import { cx } from '../lib/ui'

const POINTS = [
  {
    icon: Zap,
    title: 'Know what to work on next',
    body: 'Nudge weighs deadlines, grade value, remaining work, and available study time.',
  },
  {
    icon: CalendarRange,
    title: 'Make a plan that fits your week',
    body: 'Move and resize study blocks, or have Nudge draft a weekly plan.',
  },
  {
    icon: Sparkles,
    title: 'Catch work before it piles up',
    body: 'Get a clear reminder when a task is slipping.',
  },
]

export function Onboarding({ onAddCourse }: { onAddCourse: () => void }) {
  const store = useStore()
  const [name, setName] = useState('')

  const finish = (then: 'course' | 'sample') => {
    store.updateSettings({ name: name.trim() || undefined, onboarded: true })
    if (then === 'sample') store.loadSample()
    else onAddCourse()
  }

  return (
    <div className="h-full flex-1 min-h-0 flex overflow-y-auto scroll-slim px-4 py-10 bg-bg text-ink">
      <div className="w-full max-w-[560px] m-auto a-rise">
        <div className="flex items-center gap-2.5 mb-7">
          <span className="h-9 w-9 rounded-[10px] bg-invert-bg text-invert-ink grid place-items-center font-bold text-[17px]">
            N
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Nudge</span>
        </div>

        <h1 className="text-[30px] sm:text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-ink">
          Plan your semester
          <br />
          before it piles up.
        </h1>
        <p className="mt-3 text-[15px] text-ink-2 leading-relaxed max-w-[46ch]">
          Made with student schedules in mind. Nudge keeps your courses, deadlines, and study time in one place.
          See what needs attention, then make time for it.
        </p>

        <ul className="mt-7 flex flex-col gap-4">
          {POINTS.map((p) => (
            <li key={p.title} className="flex items-start gap-3">
              <span className="mt-0.5 h-8 w-8 rounded-[9px] bg-tint grid place-items-center shrink-0 text-ink-2">
                <p.icon size={16} />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink leading-snug">{p.title}</h2>
                <p className="text-[13px] text-ink-2 leading-relaxed mt-0.5">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col sm:flex-row gap-2.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name (optional)"
            aria-label="Your first name"
            maxLength={24}
            className="sm:max-w-[190px] h-12"
            onKeyDown={(e) => e.key === 'Enter' && finish('course')}
          />
          <Button variant="primary" size="lg" onClick={() => finish('course')} className="flex-1">
            Add my first course
            <ArrowRight size={17} />
          </Button>
        </div>

        <button
          onClick={() => finish('sample')}
          className={cx(
            'mt-3.5 text-[13px] text-ink-3 hover:text-ink underline underline-offset-4 decoration-line-2 transition-colors',
          )}
        >
          Or look around with a sample semester first
        </button>

        <p className="mt-8 text-[12px] text-ink-3 leading-relaxed">
          Everything stays in your browser. No account, no sync, nothing uploaded.
        </p>
      </div>
    </div>
  )
}
