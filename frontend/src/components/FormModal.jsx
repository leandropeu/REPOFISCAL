function renderField(field, value, onChange) {
  if (field.type === "textarea") {
    return (
      <textarea
        id={field.name}
        rows={field.rows || 4}
        placeholder={field.placeholder}
        value={value ?? ""}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        id={field.name}
        value={value ?? ""}
        onChange={(event) => onChange(field.name, event.target.value)}
      >
        <option value="">{field.placeholder || "Selecione"}</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="checkbox-field" htmlFor={field.name}>
        <input
          id={field.name}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.name, event.target.checked)}
        />
        <span>{field.checkboxLabel || field.label}</span>
      </label>
    );
  }

  return (
    <input
      id={field.name}
      type={field.type || "text"}
      placeholder={field.placeholder}
      step={field.step}
      value={value ?? ""}
      onChange={(event) => onChange(field.name, event.target.value)}
    />
  );
}

function ReportBlock({ report }) {
  if (!report) {
    return null;
  }

  return (
    <aside className="report-panel">
      <div className="report-panel__header">
        <div>
          <span className="eyebrow">Relatorio</span>
          <h4>{report.title}</h4>
        </div>
        {report.description ? <p>{report.description}</p> : null}
      </div>

      {report.metrics?.length ? (
        <div className="report-metrics">
          {report.metrics.map((metric) => (
            <article key={metric.label} className="report-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      ) : null}

      {report.timeline?.length ? (
        <div className="report-timeline">
          <span className="report-timeline__title">Historico e processos em transito</span>
          <ul>
            {report.timeline.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

export default function FormModal({
  open,
  title,
  fields,
  formData,
  onChange,
  onClose,
  onSubmit,
  submitLabel,
  report
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <h3>{title}</h3>
            <p>Preencha os campos necessarios e acompanhe o relatorio historico do processo.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <form className="modal-form" onSubmit={onSubmit}>
          <div className="modal-layout">
            <div className="modal-grid">
              {fields.map((field) =>
                field.type === "checkbox" ? (
                  <div
                    key={field.name}
                    className={`field field--checkbox ${field.fullWidth ? "field--full" : ""}`}
                  >
                    {renderField(field, formData[field.name], onChange)}
                  </div>
                ) : (
                  <label
                    key={field.name}
                    className={`field ${field.fullWidth ? "field--full" : ""}`}
                    htmlFor={field.name}
                  >
                    <span>{field.label}</span>
                    {renderField(field, formData[field.name], onChange)}
                  </label>
                )
              )}
            </div>
            <ReportBlock report={report} />
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
