export function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <header className="page-header">
      <p className="eyebrow dark">{eyebrow}</p>
      <h2>{title}</h2>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </header>
  );
}
