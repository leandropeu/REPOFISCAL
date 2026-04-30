function renderField(field, value, onChange, readOnly = false) {
  function formatCurrencyInput(inputValue) {
    if (inputValue === "" || inputValue === null || typeof inputValue === "undefined") {
      return "";
    }
    const text = String(inputValue);
    if (text.includes("R$")) {
      return text;
    }
    const normalized = Number(text);
    if (Number.isNaN(normalized)) {
      return text;
    }
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(normalized);
  }

  function parseCurrencyInput(inputValue) {
    let normalized = String(inputValue || "").replace(/[^\d,.-]/g, "");
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastComma >= 0 && lastDot >= 0) {
      normalized = lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
    } else if (lastComma >= 0) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (lastDot >= 0) {
      const decimalPart = normalized.slice(lastDot + 1);
      normalized = decimalPart.length === 2 ? normalized.replace(/,/g, "") : normalized.replace(/\./g, "");
    }
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (field.type === "textarea") {
    return (
      <textarea
        id={field.name}
        rows={field.rows || 4}
        placeholder={field.placeholder}
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(event) => !readOnly && onChange(field.name, event.target.value)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        id={field.name}
        value={value ?? ""}
        disabled={readOnly}
        onChange={(event) => !readOnly && onChange(field.name, event.target.value)}
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
          disabled={readOnly}
          onChange={(event) => !readOnly && onChange(field.name, event.target.checked)}
        />
        <span>{field.checkboxLabel || field.label}</span>
      </label>
    );
  }

  if (field.type === "currency") {
    return (
      <input
        id={field.name}
        type="text"
        inputMode="decimal"
        placeholder={field.placeholder || "R$ 0,00"}
        value={formatCurrencyInput(value)}
        readOnly={readOnly}
        onChange={(event) => !readOnly && onChange(field.name, event.target.value)}
        onBlur={(event) => !readOnly && onChange(field.name, formatCurrencyInput(parseCurrencyInput(event.target.value)))}
      />
    );
  }

  return (
    <input
      id={field.name}
      type={field.type || "text"}
      placeholder={field.placeholder}
      step={field.step}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={(event) => !readOnly && onChange(field.name, event.target.value)}
    />
  );
}

function ModalTools({ actions }) {
  if (!actions?.enabled) {
    return null;
  }

  return (
    <div className="modal-tools">
      <label className="field modal-tools__format" htmlFor="modal-export-format">
        <span>Tipo</span>
        <select
          id="modal-export-format"
          value={actions.format}
          onChange={(event) => actions.onFormatChange(event.target.value)}
        >
          {actions.formatOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={() => actions.onExtract(actions.format)}>
        Extrair
      </button>
      <button type="button" className="secondary-button" onClick={() => actions.onExtract("pdf")}>
        Imprimir
      </button>
    </div>
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
            <h4>{attachments.title || "Solicitacao documental"}</h4>
          </div>
        </div>
        <div className="empty-state">{attachments.saveMessage || "Salve o documento primeiro para liberar anexos e historico completo."}</div>
      </section>
    );
  }

  return (
    <section className="attachment-panel">
      <div className="attachment-panel__header">
        <div>
          <span className="eyebrow">Anexos</span>
          <h4>{attachments.title || "Solicitacao documental"}</h4>
        </div>
        <span className="panel__meta">
          {attachments.files.length} arquivo(s), {(attachments.invoices || []).length} nota(s) e {attachments.history.length} evento(s)
        </span>
      </div>

      {attachments.loading ? <div className="empty-state">Carregando anexos e historico...</div> : null}

      <div className="attachment-upload-grid">
        <label className="field field--full" htmlFor="document-attachment-input">
          <span>Arquivo</span>
          <input
            id="document-attachment-input"
            type="file"
            accept={attachments.getImportAccept ? attachments.getImportAccept(attachments.form.import_format) : ".pdf,.csv,.xml,.txt,.xlsx,.xls"}
            onChange={(event) => attachments.onChange("file", event.target.files?.[0] || null)}
          />
        </label>
        <label className="field" htmlFor="document-attachment-import-format">
          <span>Tipo de importacao</span>
          <select
            id="document-attachment-import-format"
            value={attachments.form.import_format || "auto"}
            onChange={(event) => attachments.onChange("import_format", event.target.value)}
          >
            {(attachments.importFormatOptions || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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
            {attachments.uploading ? "Enviando..." : attachments.uploadLabel || "Anexar arquivo"}
          </button>
        </div>
      </div>

      <div className="attachment-strip">
        {attachments.files.length ? (
          attachments.files.map((file) => (
            <button key={`strip-${file.id}`} type="button" className="attachment-chip" onClick={() => attachments.onDownload(file)}>
              {file.original_name}
            </button>
          ))
        ) : (
          <span>{attachments.emptyFilesLabel || "Nenhum anexo vinculado a esta solicitacao."}</span>
        )}
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
              <div className="empty-state">{attachments.emptyFilesLabel || "Nenhum anexo vinculado a esta solicitacao."}</div>
            )}
          </div>
        </div>

        <div className="attachment-card">
          <span className="attachment-card__title">{attachments.section === "contracts" ? "Notas fiscais e historico" : "Historico de solicitacao"}</span>
          <div className="attachment-timeline">
            {attachments.section === "contracts" && attachments.invoices?.length ? (
              attachments.invoices.map((invoice) => (
                <div key={`invoice-${invoice.id}`} className="attachment-timeline__item">
                  <strong>NF {invoice.invoice_number}</strong>
                  <span>
                    {(invoice.status || "Sem status")} - {attachments.formatDateTime(invoice.issue_date || invoice.due_date || invoice.created_at)}
                  </span>
                </div>
              ))
            ) : attachments.history.length ? (
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
  attachments,
  readOnly = false,
  actions = null
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
            <p>{readOnly ? "Visualizacao do registro com campos bloqueados para consulta." : "Preencha os campos necessarios e acompanhe o relatorio historico do processo."}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <ModalTools actions={actions} />
        <form className="modal-form" onSubmit={onSubmit}>
          <div className="modal-layout">
            <div className="modal-grid">
              {fields.map((field) =>
                field.type === "checkbox" ? (
                  <div
                    key={field.name}
                    className={`field field--checkbox ${field.fullWidth ? "field--full" : ""}`}
                  >
                    {renderField(field, formData[field.name], onChange, readOnly)}
                  </div>
                ) : (
                  <label
                    key={field.name}
                    className={`field ${field.fullWidth ? "field--full" : ""}`}
                    htmlFor={field.name}
                  >
                    <span>{field.label}</span>
                    {renderField(field, formData[field.name], onChange, readOnly)}
                  </label>
                )
              )}
            </div>
            <ReportBlock report={report} />
          </div>
          <AttachmentHistory attachments={attachments} />
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              {readOnly ? "Fechar" : "Cancelar"}
            </button>
            {!readOnly ? (
              <button type="submit" className="primary-button">
                {submitLabel}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
