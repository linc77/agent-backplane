export function LoadingState({ label }: { label: string }) {
  return (
    <div className="page-loading-state" role="status">
      <span>{label}</span>
      <div aria-hidden="true" className="page-loading-skeleton">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
