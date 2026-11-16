export function PublicLoading({ message }: { message: string }) {
  return <section className="public-loading" role="status" aria-live="polite">
    <div className="public-loading-card">
      <div className="public-loading-brand"><span className="brand-mark">A</span><strong>adometa</strong></div>
      <p className="sr-only">{message}</p>
      <div className="public-loading-bar" aria-hidden="true"><span /></div>
      <div className="public-loading-placeholders" aria-hidden="true"><i /><i /><i /></div>
      <div className="public-loading-lines" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  </section>;
}
