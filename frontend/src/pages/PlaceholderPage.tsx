export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <div className="text-2xl font-bold">{title}</div>
      <div className="text-sm text-textMuted">UI wired; API integration is implemented in backend.</div>
    </div>
  );
}

