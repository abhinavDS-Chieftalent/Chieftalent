/** What the candidate typed into the pre-interview form. Never scored. */
export default function DetailsSection({ details }) {
  const fields = [
    ['Name', `${details.first_name} ${details.last_name}`],
    ['Current city', details.current_city],
    ['Hometown', details.hometown],
    ['Current company', details.current_company || 'None'],
    ['Total experience', `${details.total_experience} yrs`],
    ['Notice period', `${details.notice_period} days`],
    ['Current CTC', details.current_ctc],
    ['Expected CTC', details.expected_ctc],
    ['Family and earning members', `${details.family_members} and ${details.earning_members}`],
  ]
  return (
    <section data-review-section="details" className="space-y-5 border-t border-line pt-8">
      <div>
        <h2 className="text-xl font-bold">Candidate details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Filled in by the candidate before the interview. Kept for your records, never scored.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className="m-0 mt-0.5 break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground">Skills description</h3>
        <p className="mt-1 max-w-[70ch] whitespace-pre-line break-words text-sm leading-relaxed">
          {details.skills_description}
        </p>
      </div>
    </section>
  )
}
