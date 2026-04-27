export default function StatCard({ title, value, tone = "neutral", detail, onClick }) {
  const interactiveProps = onClick
    ? {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }
      }
    : {};

  return (
    <article className={`stat-card stat-card--${tone} ${onClick ? "stat-card--clickable" : ""}`} {...interactiveProps}>
      <span className="stat-card__title">{title}</span>
      <strong className="stat-card__value">{value}</strong>
      {detail ? <span className="stat-card__detail">{detail}</span> : null}
    </article>
  );
}
