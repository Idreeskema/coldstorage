import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Download, FileSpreadsheet, UploadCloud, X } from 'lucide-react'
import { useStore } from '../../core/store'
import type { ImportPreview, ImportIssue } from '../../core/excel'
import type { ImportMode, ImportSummary } from '../../core/importer'
import { inr, num } from '../../core/format'
import { Alert, Button, Card, Modal, PageHeader, toast } from '../../ui'
import './trade.css'

const MONEY = new Set(['payments', 'amount', 'outstanding'])

function groupBySheet(list: ImportIssue[]) {
  const m = new Map<string, ImportIssue[]>()
  for (const i of list) m.set(i.sheet, [...(m.get(i.sheet) ?? []), i])
  return [...m.entries()]
}

function Issues({ title, list, kind }: { title: string; list: ImportIssue[]; kind: 'error' | 'warning' }) {
  if (!list.length) return null
  return (
    <Card title={`${title} (${list.length})`}>
      <div className="trade-issues">
        {groupBySheet(list).map(([sheet, items]) => (
          <details key={sheet} open={kind === 'error' || items.length <= 8}>
            <summary><b>{sheet}</b> <span className="muted">· {items.length}</span></summary>
            <ul>
              {items.map((i, k) => (
                <li key={k}>{i.row !== undefined && <span className="trade-row">Row {i.row}</span>}{i.message}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </Card>
  )
}

export default function ImportExportPage() {
  const importTrade = useStore((s) => s.importTrade)
  const stateSnapshot = useStore
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [failure, setFailure] = useState('')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState<ImportSummary | null>(null)
  const [exporting, setExporting] = useState(false)

  const counts = useMemo(() => preview && ({
    customers: preview.customers.length, agreements: preview.agreements.length,
    movements: preview.movements.length, payments: preview.payments.length,
  }), [preview])

  const readFile = async (file: File) => {
    setFailure(''); setPreview(null); setDone(null); setFileName(file.name)
    if (!/\.xlsx$/i.test(file.name)) { setFailure('Please choose an Excel .xlsx workbook.'); return }
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const { parseWorkbook } = await import('../../core/excel')
      setPreview(await parseWorkbook(buf))
    } catch (e) {
      setFailure(`The file could not be processed${e instanceof Error ? `: ${e.message}` : '.'}`)
    } finally { setBusy(false) }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void readFile(f)
  }

  const runImport = () => {
    if (!preview?.canImport) return
    const res = importTrade(preview, mode)
    setConfirm(false)
    if (!res.ok || !res.summary) { toast(res.error ?? 'Import failed', 'error'); return }
    setDone(res.summary); setPreview(null)
    toast('Workbook imported')
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const { exportWorkbook } = await import('../../core/excel')
      const blob = await exportWorkbook(stateSnapshot.getState())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `coldstore-trade-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast('Workbook exported')
    } catch {
      toast('Export failed', 'error')
    } finally { setExporting(false) }
  }

  const reset = () => { setPreview(null); setFailure(''); setFileName(''); setDone(null); if (inputRef.current) inputRef.current.value = '' }

  return (
    <div className="page">
      <PageHeader title="Import / Export" sub="Bring in your Excel workbook, or take a copy of everything out"
        actions={<Button icon={<Download />} onClick={doExport} disabled={exporting}>{exporting ? 'Preparing…' : 'Export workbook'}</Button>} />

      {done && (
        <Card title="Import complete">
          <Alert kind="success">
            {done.mode === 'replace' ? 'Existing data was replaced.' : 'Data was merged into the existing records.'}{' '}
            {done.growersAdded} customers added ({done.growersReused} matched), {done.allocationsAdded} agreements added
            {done.allocationsUpdated ? `, ${done.allocationsUpdated} updated` : ''}, {num(done.cratesGiven)} crates given, {num(done.cratesReceived)} received,{' '}
            {done.paymentsAdded} payments ({inr(done.paymentsTotal)}).
            {done.duplicatesSkipped > 0 && ` ${done.duplicatesSkipped} rows were already present and skipped.`}
          </Alert>
          {(done.unplacedLots > 0 || done.overrideReceipts > 0) && (
            <div style={{ marginTop: 10 }}>
              <Alert kind="warning">
                {done.unplacedLots > 0 && `${done.unplacedLots} lots did not fit in any chamber and are unassigned. `}
                {done.overrideReceipts > 0 && `${done.overrideReceipts} receipts exceed crates given and are flagged.`}
              </Alert>
            </div>
          )}
          <div className="row wrap trade-links" style={{ marginTop: 14 }}>
            <Link className="btn primary" to="/admin/trade">Open trade ledger</Link>
            <Link className="btn secondary" to="/admin/customers">Customer dashboard</Link>
            <Link className="btn secondary" to="/admin/growers">Growers</Link>
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </Card>
      )}

      {!done && (
        <div
          className={`trade-drop ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
          onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f) }} />
          {fileName && !failure ? <FileSpreadsheet /> : <UploadCloud />}
          <b>{busy ? 'Reading workbook…' : fileName && !failure ? fileName : 'Drop your .xlsx here, or click to choose'}</b>
          <span className="muted">Sheets used: Main Transactions, Crates Movement, Payments, Dashboard, Customer List. Nothing is uploaded; the file is read in your browser.</span>
        </div>
      )}

      {failure && <Alert kind="error">{failure}</Alert>}

      {preview && counts && (
        <>
          <div className="grid cols-4 trade-counts">
            {([['Customers', counts.customers], ['Agreements', counts.agreements], ['Crate movements', counts.movements], ['Payments', counts.payments]] as const).map(([l, v]) => (
              <div key={l} className="card trade-count"><span>{l}</span><b className="num">{num(v)}</b></div>
            ))}
          </div>

          {!preview.canImport && <Alert kind="error">This workbook cannot be imported until the errors below are fixed.</Alert>}

          <Card title="Reconciliation" sub="Totals computed from the imported rows vs the totals stored in the workbook" pad={false}>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Measure</th><th className="r">Computed</th><th className="r">Workbook</th><th className="r">Match</th></tr></thead>
                <tbody>
                  {preview.reconciliation.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="r num">{MONEY.has(r.key) ? inr(r.computed) : num(r.computed)}</td>
                      <td className="r num">{r.workbook === undefined ? <span className="muted">not in file</span> : MONEY.has(r.key) ? inr(r.workbook) : num(r.workbook)}</td>
                      <td className="r">{r.match === null ? <span className="muted">—</span> : r.match ? <Check className="trade-ok" size={17} aria-label="Matches" /> : <X className="trade-bad" size={17} aria-label="Differs" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Issues title="Errors" list={preview.errors} kind="error" />
          <Issues title="Warnings" list={preview.warnings} kind="warning" />

          <Card title="Import mode">
            <div className="trade-modes">
              <label className={`trade-mode ${mode === 'merge' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                <div><b>Merge</b><span>Keep current data. Agreements are matched by Transaction ID; rows already present are skipped.</span></div>
              </label>
              <label className={`trade-mode danger ${mode === 'replace' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                <div><b>Replace</b><span>Delete all current growers, agreements, boxes, receipts, lots, dispatches and payments, then load the workbook.</span></div>
              </label>
            </div>
            {mode === 'replace' && (
              <div style={{ marginTop: 12 }}>
                <Alert kind="error"><b>Replace wipes the current data.</b> Everything in the app now is removed and cannot be recovered. Export a backup first.</Alert>
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 14 }}>
              <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={!preview.canImport} onClick={() => setConfirm(true)}>
                {mode === 'replace' ? 'Replace data with this workbook' : 'Merge workbook into current data'}
              </Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </Card>
        </>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={mode === 'replace' ? 'Replace all data?' : 'Merge workbook?'}
        footer={<>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={runImport}>{mode === 'replace' ? 'Yes, replace everything' : 'Import'}</Button>
        </>}>
        {mode === 'replace' ? (
          <div className="trade-warn"><AlertTriangle /><p>All current data will be permanently deleted and replaced with <b>{counts?.agreements}</b> agreements for <b>{counts?.customers}</b> customers from <b>{fileName}</b>.</p></div>
        ) : (
          <p>Add <b>{counts?.agreements}</b> agreements, <b>{counts?.movements}</b> crate movements and <b>{counts?.payments}</b> payments from <b>{fileName}</b> to the current data.</p>
        )}
      </Modal>
    </div>
  )
}
