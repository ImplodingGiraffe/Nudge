import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Upload } from 'lucide-react'
import {
  BACKUP_ACCEPT,
  BackupError,
  type BackupPayload,
  backupFilename,
  copyText,
  decodeBackup,
  downloadFile,
  fmtBytes,
  isFramed,
} from '../lib/backup'
import { Button, Sheet, Textarea } from './ui'
import { useToast } from '../lib/toast'

export function ExportSheet({
  open,
  onClose,
  text,
}: {
  open: boolean
  onClose: () => void
  text: string
}) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const [name, setName] = useState(backupFilename)
  const tried = useRef(false)

  useEffect(() => {
    if (!open || tried.current || !text) return
    tried.current = true
    const filename = backupFilename()
    setName(filename)
    downloadFile(filename, text)
  }, [open, text])

  useEffect(() => {
    if (!open) {
      tried.current = false
      setCopied(false)
    }
  }, [open])

  const copy = async () => {
    const ok = await copyText(text)
    setCopied(ok)
    toast(ok ? 'Backup copied.' : 'Couldn’t reach the clipboard. Select the text and copy it.')
  }

  const bytes = new TextEncoder().encode(text).length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Backup"
      description={`${name} · ${fmtBytes(bytes)}`}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-3 leading-relaxed">
          {isFramed()
            ? 'Your backup should be in Downloads. If it did not download, copy the text below and save it as a .nudge file.'
            : 'Saved to Downloads. You can also copy the text below.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => downloadFile(name, text)}>
            <Download size={14} />
            Download again
          </Button>
          <Button size="sm" variant={copied ? 'primary' : 'secondary'} onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy backup text'}
          </Button>
        </div>

        <Textarea
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          spellCheck={false}
          aria-label="Backup contents"
          className="h-40 font-mono text-[11px] leading-[1.45]"
        />
      </div>
    </Sheet>
  )
}

export function ImportSheet({
  open,
  onClose,
  onRestore,
}: {
  open: boolean
  onClose: () => void
  onRestore: (data: BackupPayload) => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setPasted('')
      setBusy(false)
    }
  }, [open])

  const restore = async (text: string) => {
    setBusy(true)
    try {
      onRestore(await decodeBackup(text))
      onClose()
    } catch (e) {

      toast(e instanceof BackupError ? e.message : 'That file couldn’t be read.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Restore a backup" size="md">
      <div className="flex flex-col gap-4">
        <div>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={14} />
            Choose a backup file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={BACKUP_ACCEPT}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) await restore(await f.text())
            }}
          />
          <p className="text-[12.5px] text-ink-3 leading-relaxed mt-2">
            A <span className="font-mono text-[11.5px]">.nudge</span> file, or a{' '}
            <span className="font-mono text-[11.5px]">.json</span> backup from an older version.
          </p>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-[12.5px] text-ink-3 leading-relaxed mb-2">
            Or paste backup text from another device.
          </p>
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="NUDGE BACKUP v1&#10;…"
            spellCheck={false}
            aria-label="Backup text"
            className="h-28 font-mono text-[11px] leading-[1.45]"
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="primary" disabled={!pasted.trim() || busy} onClick={() => restore(pasted)}>
              Restore
            </Button>
          </div>
        </div>

        <p className="text-[12.5px] text-ink-3 leading-relaxed">
          Restoring replaces everything currently in Nudge. You can undo it immediately after restoring.
        </p>
      </div>
    </Sheet>
  )
}
