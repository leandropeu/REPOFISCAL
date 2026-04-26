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

function AttachmentHistory({ attachments }) {
  if (!attachments?.enabled) {
    return null;
  }

  if (!attachments.documentId) {
    return (
      <section className="attachment-panel">
        <div className="attachment-panel__header">
          <div>
            <span className="eyebrow">Anexos</span>
            <h4>Solicitacao documental</h4>
          </div>
        </div>
        <div className="empty-state">Salve o documento primeiro para liberar anexos e historico completo.</div>
      </section>
    );
  }

  return (
    <section className="attachment-panel">
      <div className="attachment-panel__header">
        <div>
          <span className="eyebrow">Anexos</span>
          <h4>Solicitacao documental</h4>
        </div>
        <span className="panel__meta">
          {attachments.files.length} arquivo(s) e {attachments.history.length} evento(s)
        </span>
      </div>

      {attachments.loading ? <div className="empty-state">Carregando anexos e historico...</div> : null}

      <div className="attachment-upload-grid">
        <label className="field field--full" htmlFor="document-attachment-input">
          <span>Arquivo</span>
          <input
            id="document-attachment-input"
            type="file"
            accept=".pdf,.csv,.xml,.xlsx,.xls"
            onChange={(event) => attachments.onChange("file", event.target.files?.[0] || null)}
          />
        </label>
        <label className="field" htmlFor="document-attachment-category">
          <span>Categoria</span>
          <input
            id="document-attachment-category"
            value={attachments.form.category}
            onChange={(event) => attachments.onChange("category", event.target.value)}
          />
        </label>
        <label className="field" htmlFor="document-attachment-notes">
          <span>Observacoes</span>
          <input
            id="document-attachment-notes"
            value={attachments.form.notes}
            onChange={(event) => attachments.onChange("notes", event.target.value)}
          />
        </label>
        <div className="attachment-panel__actions">
          <button type="button" className="primary-button" onClick={attachments.onUpload} disabled={attachments.uploading}>
            {attachments.uploading ? "Enviando..." : "Anexar arquivo"}
          </button>
        </div>
      </div>

      <div className="attachment-columns">
        <div className="attachment-card">
          <span className="attachment-card__title">Arquivos vinculados</span>
          <div className="attachment-list">
            {attachments.files.length ? (
              attachments.files.map((file) => (
                <div key={file.id} className="attachment-list__item">
                  <div>
                    <strong>{file.original_name}</strong>
                    <span>
                      {(file.category || "Sem categoria")} - {file.uploaded_by_name || "Sistema"} - {attachments.formatDateTime(file.created_at)}
                    </span>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => attachments.onDownload(file)}>
                    Baixar
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">Nenhum anexo vinculado a esta solicitacao.</div>
            )}
          </div>
        </div>

        <div className="attachment-card">
          <span className="attachment-card__title">Historico de solicitacao</span>
          <div className="attachment-timeline">
            {attachments.history.length ? (
              attachments.history.map((entry) => (
                <div key={`${entry.id}-${entry.created_at}`} className="attachment-timeline__item">
                  <strong>{entry.description}</strong>
                  <span>
                    {entry.user_name || entry.user_email || "Sistema"} - {attachments.formatDateTime(entry.created_at)}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state">Nenhum evento registrado ainda.</div>
            )}
          </div>
        </div>
      </div>
    </section>
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
  report,
  attachments
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
          <AttachmentHistory attachments={attachments} />
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
