import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ANY, IV_OPTIONS, SORT_OPTIONS, atsOptions } from './filtering.js'

function Field({ label, value, onChange, options, width }) {
  return (
    <div className={width}>
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, text]) => (
            <SelectItem key={v} value={v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Status, ATS score and interview score filters plus a sort order. They narrow and order the rows
 * of the current tab. State is held by the page (and kept in the URL); this only renders it.
 */
export default function FilterBar({ filters, onChange, onReset, active, statusOptions, atsThreshold, shown, total }) {
  return (
    <div data-filters className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line px-6 py-4">
      <Field
        label="Status"
        value={filters.status}
        onChange={(v) => onChange('status', v)}
        options={[[ANY, 'Any status'], ...statusOptions]}
        width="w-full sm:w-48"
      />
      <Field
        label="ATS score"
        value={filters.ats}
        onChange={(v) => onChange('ats', v)}
        options={atsOptions(atsThreshold)}
        width="w-full sm:w-60"
      />
      <Field
        label="Interview score"
        value={filters.iv}
        onChange={(v) => onChange('iv', v)}
        options={IV_OPTIONS}
        width="w-full sm:w-48"
      />
      <Field
        label="Sort by"
        value={filters.sort}
        onChange={(v) => onChange('sort', v)}
        options={SORT_OPTIONS}
        width="w-full sm:w-56"
      />
      <div className="ml-auto flex items-center gap-3 pb-1.5">
        <p data-result-count aria-live="polite" className="text-sm text-muted-foreground">
          Showing <span className="num font-semibold text-foreground">{shown}</span> of{' '}
          <span className="num">{total}</span>
        </p>
        {active && (
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset filters
          </Button>
        )}
      </div>
    </div>
  )
}
