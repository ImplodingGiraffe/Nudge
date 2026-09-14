import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { fmtDuration } from '../lib/date'
import { encodeBackup } from '../lib/backup'
import { ExportSheet, ImportSheet } from './BackupSheets'
import { AiSettings } from './ai/AiSettings'
import { PALETTES } from '../lib/theme'
import { Button, ConfirmDialog, Field, Input, Segmented, Select, Sheet, Switch } from './ui'
import { useToast } from '../lib/toast'
import { cx } from '../lib/ui'

type SettingsSection = 'general' | 'planning' | 'data'

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  const store = useStore()
  const { toast } = useToast()
  const [confirmReset, setConfirmReset] = useState(false)
  const [backup, setBackup] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [section, setSection] = useState<SettingsSection>('general')

  const set = store.updateSettings

  const exportData = async () => {
    const { version, courses, assignments, blocks, plannerEvents, scheduleOverrides, sessions, todayList, settings: st } = useStore.getState()
    setBackup(await encodeBackup({ version, courses, assignments, blocks, plannerEvents, scheduleOverrides, sessions, focusNotes: useStore.getState().focusNotes, todayList, settings: st }))
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Settings"
        size="md"
      >
        <div className="flex flex-col gap-5">
          <Segmented
            ariaLabel="Settings section"
            value={section}
            onChange={setSection}
            options={[
              { value: 'general', label: 'General' },
              { value: 'planning', label: 'Planning' },
              { value: 'data', label: 'Data' },
            ]}
            className="w-full [&>button]:flex-1"
          />
          {section === 'general' && (
            <div className="flex flex-col gap-5">
              <Field label="Name">
                <Input
                  value={settings.name ?? ''}
                  onChange={(e) => set({ name: e.target.value || undefined })}
                  placeholder="Your name"
                  maxLength={24}
                />
              </Field>

              <Field
                group
                label="Nudge tone"
                hint={
                  settings.tone === 'gentle'
                    ? 'Calm and low pressure.'
                    : settings.tone === 'blunt'
                      ? 'No sugercoating.'
                      : 'Clear and direct.'
                }
              >
                <Segmented
                  ariaLabel="Nudge tone"
                  value={settings.tone}
                  onChange={(v) => set({ tone: v })}
                  options={[
                    { value: 'gentle', label: 'Gentle' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'blunt', label: 'Blunt' },
                  ]}
                />
              </Field>

              <Field group label="Appearance">
                <Segmented
                  ariaLabel="Theme"
                  value={settings.theme}
                  onChange={(v) => set({ theme: v })}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </Field>

              <Field group label="Colour theme">
                <div role="radiogroup" aria-label="Color theme" className="grid grid-cols-3 gap-2">
                  {PALETTES.map((p) => {
                    const active = settings.palette === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set({ palette: p.id })}
                        className={cx(
                          'flex flex-col gap-1.5 rounded-ctl border p-1.5 transition-[border-color,background-color] duration-150 active:scale-[.985]',
                          active ? 'border-ink bg-tint' : 'border-line hover:border-line-2',
                        )}
                      >
                        <span
                          className="palette-scope relative block h-11 rounded-lg bg-bg ring-1 ring-inset ring-line-2"
                          data-palette={p.id}
                        >
                          <span className="absolute inset-1.5 flex items-center gap-1.5 rounded-md bg-surface px-1.5">
                            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-palette-accent" />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="block h-1 rounded-full bg-ink" />
                              <span className="block h-1 w-2/3 rounded-full bg-ink-3" />
                            </span>
                          </span>
                        </span>
                        <span
                          className={cx(
                            'text-[12px] leading-none',
                            active ? 'font-medium text-ink' : 'text-ink-3',
                          )}
                        >
                          {p.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>
          )}

          {section === 'planning' && (
            <div className="flex flex-col gap-5">
              <div className="border-t border-line pt-4">
                <h3 className="text-[13px] font-semibold text-ink mb-2.5">Focus timer</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Focus length">
                    <Select value={settings.focusMin} onChange={(e) => set({ focusMin: Number(e.target.value) })}>
                      {[15, 20, 25, 30, 45, 50, 60].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Short break">
                    <Select value={settings.shortBreakMin} onChange={(e) => set({ shortBreakMin: Number(e.target.value) })}>
                      {[3, 5, 8, 10].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Long break">
                    <Select value={settings.longBreakMin} onChange={(e) => set({ longBreakMin: Number(e.target.value) })}>
                      {[10, 15, 20, 30].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Long break every">
                    <Select
                      value={settings.longBreakEvery}
                      onChange={(e) => set({ longBreakEvery: Number(e.target.value) })}
                    >
                      {[2, 3, 4, 5, 6].map((m) => (
                        <option key={m} value={m}>
                          {m} rounds
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[13px] text-ink-2">Chime when a session ends</span>
                  <Switch
                    checked={settings.sound}
                    onChange={(v) => set({ sound: v })}
                    label="Chime when a session ends"
                  />
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <h3 className="text-[13px] font-semibold text-ink mb-2.5">Study planning</h3>
                <Field label="Daily study capacity">
                  <Select
                    value={settings.dailyCapacityMin}
                    onChange={(e) => set({ dailyCapacityMin: Number(e.target.value) })}
                  >
                    {[90, 120, 150, 180, 210, 240, 300, 360, 480].map((m) => (
                      <option key={m} value={m}>
                        {fmtDuration(m, { long: true })}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Field label="Planner starts at">
                    <Select value={settings.dayStartHour} onChange={(e) => set({ dayStartHour: Number(e.target.value) })}>
                      {[5, 6, 7, 8, 9, 10].map((h) => (
                        <option key={h} value={h}>
                          {h}:00
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Planner ends at">
                    <Select value={settings.dayEndHour} onChange={(e) => set({ dayEndHour: Number(e.target.value) })}>
                      {[20, 21, 22, 23, 24].map((h) => (
                        <option key={h} value={h}>
                          {h === 24 ? 'Midnight' : `${h}:00`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>

              <AiSettings />
            </div>
          )}

          {section === 'data' && (
            <div className="border-t border-line pt-4">
              <h3 className="text-[13px] font-semibold text-ink mb-1">Your data</h3>
              <p className="text-[12.5px] text-ink-3 leading-relaxed mb-3">
                Data is stored locally in your browser.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={exportData}>
                  <Download size={14} />
                  Export backup
                </Button>
                <Button size="sm" onClick={() => setRestoring(true)}>
                  <Upload size={14} />
                  Import
                </Button>
                <Button size="sm" onClick={() => store.loadSample()}>
                  Load sample semester
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
                  Erase everything
                </Button>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <ExportSheet open={backup !== null} onClose={() => setBackup(null)} text={backup ?? ''} />

      <ImportSheet
        open={restoring}
        onClose={() => setRestoring(false)}
        onRestore={(data) => {
          store.importState(data)
          toast('Data restored', { action: { label: 'Undo', run: () => store.undo() } })
          onClose()
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          store.resetAll()
          onClose()
          toast('Everything erased. Fresh start.')
        }}
        title="Erase all your data?"
        body="This removes your courses, tasks, study blocks, and logged sessions. It cannot be undone. Export a backup first if you may need it."
        confirmLabel="Erase everything"
      />
    </>
  )
}