export default function StatCard({ title, value, tone = "neutral", detail }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__title">{title}</span>
      <strong className="stat-card__value">{value}</strong>
      {detail ? <span className="stat-card__detail">{detail}</span> : null}
    </article>
  );
}
