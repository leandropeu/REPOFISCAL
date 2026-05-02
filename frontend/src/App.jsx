import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import DataTable from "./components/DataTable.jsx";
import FormModal from "./components/FormModal.jsx";
import StatCard from "./components/StatCard.jsx";
import repofiscalLogo from "./assets/repofiscal-logo.png";
import { useAuth } from "./contexts/AuthContext.jsx";
import { api } from "./services/api.js";

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "reports", label: "Relatorios" },
  { id: "operations", label: "Operacoes" },
  { id: "users", label: "Usuarios" },
  { id: "files", label: "Arquivos" },
  { id: "vendors", label: "Fornecedores" },
  { id: "units", label: "Unidades" },
  { id: "contracts", label: "Orcamentos" },
  { id: "invoices", label: "Notas Fiscais" },
  { id: "avcb", label: "AVCB" },
  { id: "clcb", label: "CLCB" }
];

const themeOptions = [
  { id: "original", label: "Original" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Claro" }
];

const defaultDashboard = {
  counts: {
    vendors: 0,
    active_users: 0,
    files: 0,
    units: 0,
    active_contracts: 0,
    pending_invoices: 0,
    avcb_attention: 0,
    clcb_attention: 0,
    invoices_paid_total: 0
  },
  upcoming_contracts: [],
  pending_invoices: [],
  regulatory_alerts: [],
  recent_files: []
};

const emptyEntities = {
  users: [],
  vendors: [],
  units: [],
  contracts: [],
  invoices: [],
  documents: [],
  files: []
};

const defaultOperations = {
  backup: {
    archive_exists: false,
    archive_path: "",
    archive_size_bytes: 0,
    last_backup_snapshot: null,
    last_backup_at: null,
    snapshots_count: 0,
    oldest_snapshot: null,
    newest_snapshot: null,
    retention_days: 10,
    check_interval_seconds: 60
  },
  logs: {
    lines: [],
    requested_lines: 120,
    log_path: "",
    exists: false
  },
  audit: {
    entries: [],
    requested_limit: 120
  }
};

const defaultDocumentAttachments = {
  loading: false,
  uploading: false,
  files: [],
  invoices: [],
  history: [],
  form: {
    file: null,
    import_format: "auto",
    category: "",
    notes: ""
  }
};

const initialForms = {
  users: {
    name: "",
    email: "",
    role: "operator",
    password: "",
    active: true
  },
  vendors: {
    kind: "service",
    name: "",
    document: "",
    contact_name: "",
    email: "",
    phone: "",
    status: "active",
    notes: ""
  },
  units: {
    name: "",
    code: "",
    tax_id: "",
    state_registration: "",
    city: "",
    state: "",
    address: "",
    manager_name: "",
    manager_email: "",
    manager_phone: "",
    active: true,
    notes: ""
  },
  contracts: {
    vendor_id: "",
    unit_id: "",
    title: "",
    contract_number: "",
    category: "",
    compliance_type: "",
    certificate_number: "",
    start_date: "",
    end_date: "",
    value: 0,
    status: "active",
    renewal_alert_days: 30,
    notes: ""
  },
  invoices: {
    vendor_id: "",
    unit_id: "",
    contract_id: "",
    invoice_number: "",
    series: "",
    issue_date: "",
    due_date: "",
    total_amount: 0,
    tax_amount: 0,
    status: "pending",
    access_key: "",
    notes: ""
  },
  documents: {
    document_type: "AVCB",
    unit_id: "",
    vendor_id: "",
    professional_id: "",
    contract_id: "",
    request_number: "",
    document_number: "",
    issue_date: "",
    expiry_date: "",
    status: "in_progress",
    last_inspection_date: "",
    notes: ""
  }
};

const entityPath = {
  users: "/api/users",
  vendors: "/api/vendors",
  units: "/api/units",
  contracts: "/api/contracts",
  invoices: "/api/invoices",
  documents: "/api/regulatory-documents",
  files: "/api/files"
};

const fileExtensionsLabel = ".pdf, .csv, .xml, .txt, .xlsx, .xls";

const exportFormatOptions = [
  { value: "csv", label: "CSV" },
  { value: "xml", label: "XML" },
  { value: "txt", label: "TXT" },
  { value: "xls", label: "Excel" },
  { value: "pdf", label: "PDF / imprimir" }
];

const importFormatOptions = [
  { value: "auto", label: "Detectar pelo arquivo", accept: ".pdf,.csv,.xml,.txt,.xlsx,.xls" },
  { value: "pdf", label: "PDF", accept: ".pdf" },
  { value: "xml", label: "XML", accept: ".xml" },
  { value: "csv", label: "CSV", accept: ".csv" },
  { value: "txt", label: "TXT", accept: ".txt" },
  { value: "xls", label: "Excel", accept: ".xlsx,.xls" }
];

const typeLabels = {
  service: "Servico",
  product: "Produto"
};

const explicitStatusLabels = {
  active: "Ativo",
  inactive: "Inativo",
  signed: "Assinado",
  expiring: "A vencer",
  expired: "Vencido",
  pending: "Pendente",
  review: "Em analise",
  paid: "Pago",
  canceled: "Cancelado",
  in_progress: "Em tramite",
  issued: "Emitido",
  renewed: "Renovado",
  archived: "Arquivado"
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function parseCurrencyValue(value) {
  if (typeof value === "number") {
    return value;
  }
  let normalized = String(value || "").replace(/[^\d,.-]/g, "");
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

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function formatDate(value) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "-";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

function formatFileSize(sizeBytes) {
  const size = Number(sizeBytes || 0);
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getImportAccept(format) {
  return importFormatOptions.find((option) => option.value === format)?.accept || importFormatOptions[0].accept;
}

function formatSnapshotKey(value) {
  if (!value) {
    return "-";
  }

  const match = String(value).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})0000Z$/);
  if (!match) {
    return value;
  }

  const [, year, month, day, hour] = match;
  return `${day}/${month}/${year} ${hour}:00 UTC`;
}

function getDueMeta(value) {
  if (!value) {
    return { tone: "neutral", label: "Sem vencimento", priority: 3, sortValue: Number.POSITIVE_INFINITY };
  }

  const target = parseDateValue(value);
  if (!target) {
    return { tone: "neutral", label: "Data invalida", priority: 3, sortValue: Number.POSITIVE_INFINITY };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { tone: "danger", label: `Atrasado ${Math.abs(diffDays)} dia(s)`, priority: 0, sortValue: target.getTime() };
  }

  if (diffDays <= 60) {
    return { tone: "warning", label: diffDays === 0 ? "Vence hoje" : `Vence em ${diffDays} dia(s)`, priority: 1, sortValue: target.getTime() };
  }

  return { tone: "success", label: "Em dia", priority: 2, sortValue: target.getTime() };
}

function statusBadge(value) {
  const toneMap = {
    active: "success",
    inactive: "muted",
    signed: "info",
    expiring: "warning",
    expired: "danger",
    pending: "warning",
    review: "info",
    paid: "success",
    canceled: "danger",
    in_progress: "warning",
    issued: "success",
    renewed: "success",
    archived: "muted"
  };

  return (
    <span className={`status-badge status-badge--${toneMap[value] || "neutral"}`}>
      {explicitStatusLabels[value] || value || "-"}
    </span>
  );
}

function getInvoiceDueMeta(invoice) {
  if (!invoice) {
    return { tone: "neutral", label: "Sem vencimento", priority: 3, sortValue: Number.POSITIVE_INFINITY };
  }

  if (invoice.status === "paid") {
    return { tone: "success", label: "Pago", priority: 3, sortValue: Number.POSITIVE_INFINITY };
  }

  if (invoice.status === "canceled") {
    return { tone: "neutral", label: "Cancelado", priority: 3, sortValue: Number.POSITIVE_INFINITY };
  }

  return getDueMeta(invoice.due_date);
}

function dueBadge(value, metaOverride = null) {
  const meta = metaOverride || getDueMeta(value);
  return <span className={`status-badge status-badge--${meta.tone}`}>{meta.label}</span>;
}

function dueCell(value, metaOverride = null) {
  return (
    <div className="due-cell">
      <strong>{formatDate(value)}</strong>
      {dueBadge(value, metaOverride)}
    </div>
  );
}

function dueRowClass(value, metaOverride = null) {
  const meta = metaOverride || getDueMeta(value);
  if (meta.priority >= 3) {
    return "";
  }
  const tone = meta.tone;
  if (tone === "danger") {
    return "table-row--danger";
  }
  if (tone === "warning") {
    return "table-row--warning";
  }
  if (tone === "success") {
    return "table-row--success";
  }
  return "";
}

function ThemeSelector({ theme, onChange, compact = false }) {
  return (
    <label className={`theme-switcher ${compact ? "theme-switcher--compact" : ""}`}>
      <span>Tema</span>
      <select value={theme} onChange={(event) => onChange(event.target.value)}>
        {themeOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoginScreen({ onLogin, loading, error, theme, onThemeChange }) {
  const [email, setEmail] = useState("superadm@repofiscal.local");
  const [password, setPassword] = useState("super123");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-login-shell">
        <div className="auth-brand auth-brand--login">
          <div className="auth-avatar" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none" role="presentation">
              <circle cx="24" cy="17" r="7.5" stroke="currentColor" strokeWidth="2.2" />
              <path d="M11 37c2.7-6.1 8-9.2 13-9.2S34.3 30.9 37 37" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <img className="auth-brand__logo auth-brand__logo--login" src={repofiscalLogo} alt="REPOFISCAL" />
        </div>

        <section className="auth-panel auth-panel--form auth-panel--login">
          <h2 className="auth-login-title">Login</h2>

          <form className="auth-form auth-form--login" onSubmit={handleSubmit}>
            <label className="field field--login" htmlFor="email">
              <span>E-mail</span>
              <input id="email" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>

            <label className="field field--login" htmlFor="password">
              <span>Senha</span>
              <input id="password" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>

            <label className="auth-remember" htmlFor="remember-login">
              <input id="remember-login" type="checkbox" defaultChecked />
              <span>Lembrar</span>
            </label>

            {error ? <div className="banner banner--error">{error}</div> : null}

            <button type="submit" className="primary-button primary-button--wide auth-login-button" disabled={loading || submitting}>
              {loading || submitting ? "ENTRANDO" : "LOGIN"}
            </button>

            <div className="auth-login-theme">
              <ThemeSelector theme={theme} onChange={onThemeChange} compact />
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(content, fileName, type = "text/plain;charset=utf-8") {
  downloadBlobFile(new Blob([content], { type }), fileName);
}

function escapeCsvValue(value) {
  const normalized = value == null ? "" : String(value);
  const escaped = normalized.replace(/"/g, "\"\"");
  return /[;"\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function exportRowsAsCsv(fileName, rows, columns) {
  const normalizedColumns = normalizeExportColumns(columns);
  const header = normalizedColumns.map((column) => escapeCsvValue(column.label)).join(";");
  const lines = rows.map((row) =>
    normalizedColumns
      .map((column) => escapeCsvValue(column.format ? column.format(row[column.key], row) : row[column.key]))
      .join(";")
  );

  downloadTextFile(`\uFEFF${[header, ...lines].join("\n")}`, fileName, "text/csv;charset=utf-8");
}

function exportRowsAsJson(fileName, rows) {
  downloadTextFile(JSON.stringify(rows, null, 2), fileName, "application/json;charset=utf-8");
}

function escapeXmlValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeExportColumns(columns) {
  return columns.filter((column) => column.key !== "download");
}

function exportRowsAsXml(fileName, rows, columns, rootName = "registros") {
  const normalizedColumns = normalizeExportColumns(columns);
  const lines = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    `<${rootName}>`,
    ...rows.map((row) => [
      "  <registro>",
      ...normalizedColumns.map((column) => `    <${column.key}>${escapeXmlValue(row[column.key])}</${column.key}>`),
      "  </registro>"
    ].join("\n")),
    `</${rootName}>`
  ];
  downloadTextFile(lines.join("\n"), fileName, "application/xml;charset=utf-8");
}

function exportRowsAsTxt(fileName, rows, columns) {
  const normalizedColumns = normalizeExportColumns(columns);
  const header = normalizedColumns.map((column) => column.label).join("\t");
  const lines = rows.map((row) => normalizedColumns.map((column) => row[column.key] ?? "").join("\t"));
  downloadTextFile([header, ...lines].join("\n"), fileName, "text/plain;charset=utf-8");
}

function exportRowsAsExcel(fileName, rows, columns, title = "Relatorio") {
  const normalizedColumns = normalizeExportColumns(columns);
  const html = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <table>
          <caption>${escapeXmlValue(title)}</caption>
          <thead><tr>${normalizedColumns.map((column) => `<th>${escapeXmlValue(column.label)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>${normalizedColumns.map((column) => `<td>${escapeXmlValue(row[column.key])}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;
  downloadTextFile(html, fileName, "application/vnd.ms-excel;charset=utf-8");
}

function printRows(title, rows, columns, filterSummary = []) {
  const normalizedColumns = normalizeExportColumns(columns);
  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    throw new Error("O navegador bloqueou a janela de impressao.");
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeXmlValue(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
          h1 { font-size: 20px; margin: 0 0 8px; }
          p { margin: 0 0 14px; color: #555; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
          th { background: #f1f3f5; }
        </style>
      </head>
      <body>
        <h1>${escapeXmlValue(title)}</h1>
        <p>Gerado em ${escapeXmlValue(new Date().toLocaleString("pt-BR"))}${filterSummary.length ? ` | ${escapeXmlValue(filterSummary.join(" | "))}` : ""}</p>
        <table>
          <thead><tr>${normalizedColumns.map((column) => `<th>${escapeXmlValue(column.label)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${normalizedColumns.map((column) => `<td>${escapeXmlValue(row[column.key])}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function printForm(title, fields, filterSummary = []) {
  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    throw new Error("O navegador bloqueou a janela de impressao.");
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeXmlValue(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
          h1 { font-size: 21px; margin: 0 0 6px; }
          p { margin: 0 0 18px; color: #555; font-size: 12px; }
          .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .field { border: 1px solid #cfd7df; border-radius: 8px; padding: 8px 10px; min-height: 58px; page-break-inside: avoid; }
          .field--full { grid-column: 1 / -1; min-height: 94px; }
          .label { display: block; color: #4d5a66; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
          .value { display: block; font-size: 13px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; }
          .empty { color: #89939e; }
          @media print {
            body { margin: 16mm; }
            .form-grid { gap: 8px; }
          }
        </style>
      </head>
      <body>
        <h1>${escapeXmlValue(title)}</h1>
        <p>Gerado em ${escapeXmlValue(new Date().toLocaleString("pt-BR"))}${filterSummary.length ? ` | ${escapeXmlValue(filterSummary.join(" | "))}` : ""}</p>
        <section class="form-grid">
          ${fields.map((field) => `
            <article class="field ${field.fullWidth || field.type === "textarea" ? "field--full" : ""}">
              <span class="label">${escapeXmlValue(field.label)}</span>
              <span class="value ${field.value === "" || field.value === null || typeof field.value === "undefined" ? "empty" : ""}">${escapeXmlValue(field.value === "" || field.value === null || typeof field.value === "undefined" ? "-" : field.value)}</span>
            </article>
          `).join("")}
        </section>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function exportRowsByFormat({ fileBase, title, rows, columns, format, filterSummary = [] }) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const suffix = filterSummary.length ? "-filtrado" : "";
  const fileNameBase = `${fileBase}${suffix}-${timestamp}`;

  if (format === "xml") {
    exportRowsAsXml(`${fileNameBase}.xml`, rows, columns, "repofiscal");
    return;
  }
  if (format === "txt") {
    exportRowsAsTxt(`${fileNameBase}.txt`, rows, columns);
    return;
  }
  if (format === "xls") {
    exportRowsAsExcel(`${fileNameBase}.xls`, rows, columns, title);
    return;
  }
  if (format === "pdf") {
    printRows(title, rows, columns, filterSummary);
    return;
  }
  exportRowsAsCsv(`${fileNameBase}.csv`, rows, columns);
}

function exportReportAsCsv(fileName, report, filterSummary) {
  const metadataLines = [
    "sep=;",
    `# Relatorio;${escapeCsvValue(report.title)}`,
    `# Gerado em;${escapeCsvValue(new Date().toLocaleString("pt-BR"))}`,
    `# Filtros;${escapeCsvValue(filterSummary.length ? filterSummary.join(" | ") : "Sem filtros aplicados")}`,
    ""
  ];

  const header = report.columns.map((column) => escapeCsvValue(column.label)).join(";");
  const lines = report.rows.map((row) =>
    report.columns
      .map((column) => escapeCsvValue(column.format ? column.format(row[column.key], row) : row[column.key]))
      .join(";")
  );

  downloadTextFile(`\uFEFF${[...metadataLines, header, ...lines].join("\n")}`, fileName, "text/csv;charset=utf-8");
}

function exportReportAsJson(fileName, report, filterSummary) {
  downloadTextFile(
    JSON.stringify(
      {
        report: {
          id: report.id,
          title: report.title,
          description: report.description
        },
        generated_at: new Date().toISOString(),
        filters: filterSummary,
        columns: report.columns.map((column) => ({ key: column.key, label: column.label })),
        rows: report.rows
      },
      null,
      2
    ),
    fileName,
    "application/json;charset=utf-8"
  );
}

function parseDisplayDateValue(value) {
  if (!value) {
    return null;
  }

  const direct = parseDateValue(String(value));
  if (direct) {
    return direct;
  }

  const match = String(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return parseDateValue(`${year}-${month}-${day}`);
}

function limitTimeline(items, emptyLabel) {
  if (!items.length) {
    return [{ label: emptyLabel, detail: "Sem ocorrencias relacionadas no momento." }];
  }
  return items.slice(0, 6);
}

function buildFilterFieldsFromForm(fields, options = {}) {
  const { excludeNames = [], includeDueState = false } = options;
  const mappedFields = fields
    .filter((field) => !excludeNames.includes(field.name))
    .map((field) => {
      if (field.type === "checkbox") {
        return {
          name: field.name,
          label: field.label,
          filterType: "select",
          options: [
            { value: "true", label: "Sim" },
            { value: "false", label: "Nao" }
          ]
        };
      }

      if (field.type === "date") {
        return {
          name: field.name,
          label: field.label,
          filterType: "date-range"
        };
      }

      if (field.type === "select") {
        return {
          name: field.name,
          label: field.label,
          filterType: "select",
          options: field.options || []
        };
      }

      if (field.type === "number") {
        return {
          name: field.name,
          label: field.label,
          filterType: "number"
        };
      }

      return {
        name: field.name,
        label: field.label,
        filterType: "text"
      };
    });

  if (includeDueState) {
    mappedFields.push({
      name: "due_state",
      label: "Situacao do vencimento",
      filterType: "select",
      options: [
        { value: "success", label: "Em dia" },
        { value: "warning", label: "A vencer" },
        { value: "danger", label: "Vencido" }
      ]
    });
  }

  return mappedFields;
}

function getInitialListFilters() {
  return {
    users: {},
    files: {},
    vendors: {},
    units: {},
    contracts: {},
    invoices: {},
    avcb: {},
    clcb: {}
  };
}

function matchesDateRange(value, fromValue, toValue) {
  if (!fromValue && !toValue) {
    return true;
  }

  const parsedValue = parseDateValue(value);
  if (!parsedValue) {
    return false;
  }

  const fromDate = parseDateValue(fromValue);
  const toDate = parseDateValue(toValue);

  if (fromDate && parsedValue < fromDate) {
    return false;
  }

  if (toDate && parsedValue > toDate) {
    return false;
  }

  return true;
}

function matchesFilterValue(rowValue, filterValue, filterType) {
  if (filterValue === "" || filterValue === null || typeof filterValue === "undefined") {
    return true;
  }

  if (filterType === "number") {
    return String(rowValue ?? "") === String(filterValue);
  }

  if (filterType === "select") {
    if (typeof rowValue === "boolean") {
      return String(rowValue) === String(filterValue);
    }
    return String(rowValue ?? "") === String(filterValue);
  }

  return String(rowValue ?? "")
    .toLowerCase()
    .includes(String(filterValue).trim().toLowerCase());
}

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") {
      return "original";
    }

    const savedTheme = window.localStorage.getItem("repofiscal-theme");
    return themeOptions.some((option) => option.id === savedTheme) ? savedTheme : "original";
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loadingData, setLoadingData] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(defaultDashboard);
  const [entities, setEntities] = useState(emptyEntities);
  const [operations, setOperations] = useState(defaultOperations);
  const [reportFilters, setReportFilters] = useState({
    report_id: "",
    vendor_id: "",
    unit_id: "",
    status: "",
    date_from: "",
    date_to: ""
  });
  const [search, setSearch] = useState({
    operations: "",
    reports: "",
    users: "",
    files: "",
    vendors: "",
    units: "",
    contracts: "",
    invoices: "",
    avcb: "",
    clcb: ""
  });
  const [listFilters, setListFilters] = useState(getInitialListFilters);
  const [listFilterPanels, setListFilterPanels] = useState({
    users: false,
    files: false,
    vendors: false,
    units: false,
    contracts: false,
    invoices: false,
    avcb: false,
    clcb: false
  });
  const [modal, setModal] = useState({ section: null, item: null, documentType: null, mode: "edit" });
  const [deleteElevation, setDeleteElevation] = useState({
    open: false,
    section: null,
    item: null,
    email: "",
    password: "",
    loading: false
  });
  const [formData, setFormData] = useState({});
  const [initialModalFormData, setInitialModalFormData] = useState({});
  const [modalFieldErrors, setModalFieldErrors] = useState({});
  const [savingModal, setSavingModal] = useState(false);
  const [documentAttachments, setDocumentAttachments] = useState(defaultDocumentAttachments);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  );
  const [tableExportFormat, setTableExportFormat] = useState("csv");
  const [modalExportFormat, setModalExportFormat] = useState("csv");
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState({});
  const [reportExportFormats, setReportExportFormats] = useState({});
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    file: null,
    import_format: "auto",
    category: "",
    notes: "",
    vendor_id: "",
    unit_id: "",
    contract_id: "",
    invoice_id: "",
    regulatory_document_id: ""
  });

  const activeDataKey = activeTab;
  const deferredSearch = useDeferredValue(search[activeDataKey] || "");
  const visibleTabs = useMemo(
    () =>
      tabs.filter((tab) => {
        if (tab.id === "users" || tab.id === "operations") {
          return user?.role === "adm" || user?.role === "superadm";
        }
        return true;
      }),
    [user]
  );

  async function loadAllData() {
    setLoadingData(true);
    setError("");
    try {
      const [
        dashboardData,
        systemStatus,
        systemLogs,
        auditLogs,
        users,
        vendors,
        units,
        contracts,
        invoices,
        documents,
        files
      ] = await Promise.all([
        api.get("/api/dashboard"),
        user.role === "adm" || user.role === "superadm" ? api.get("/api/system/status") : Promise.resolve(null),
        user.role === "adm" || user.role === "superadm" ? api.get("/api/system/logs?lines=120") : Promise.resolve(null),
        user.role === "adm" || user.role === "superadm" ? api.get("/api/system/audit-logs?limit=120") : Promise.resolve(null),
        user.role === "adm" || user.role === "superadm" ? api.get("/api/users") : Promise.resolve([]),
        api.get("/api/vendors"),
        api.get("/api/units"),
        api.get("/api/contracts"),
        api.get("/api/invoices"),
        api.get("/api/regulatory-documents"),
        api.get("/api/files")
      ]);

      setDashboard(dashboardData);
      setEntities({ users, vendors, units, contracts, invoices, documents, files });
      setOperations(
        systemStatus
          ? {
              backup: systemStatus.backup,
              logs: {
                ...systemLogs,
                exists: systemStatus.logs?.exists ?? false,
                log_path: systemLogs?.log_path || systemStatus.logs?.log_path || ""
              },
              audit: auditLogs || defaultOperations.audit
            }
          : defaultOperations
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
    window.localStorage.setItem("repofiscal-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (modal.section === "documents" && modal.item?.id) {
      loadModalAttachments("documents", modal.item.id);
      return;
    }
    if (modal.section === "contracts" && modal.item?.id) {
      loadModalAttachments("contracts", modal.item.id);
      return;
    }

    setDocumentAttachments(defaultDocumentAttachments);
  }, [modal.section, modal.item?.id]);

  const modalRelatedFiles = useMemo(() => {
    if (!modal.section || !modal.item?.id) {
      return [];
    }

    return entities.files.filter((file) =>
      (modal.section === "vendors" && file.vendor_id === modal.item.id) ||
      (modal.section === "units" && file.unit_id === modal.item.id) ||
      (modal.section === "invoices" && file.invoice_id === modal.item.id)
    );
  }, [entities.files, modal.item?.id, modal.section]);

  async function handleUserSwitch() {
    setBanner("");
    setError("");
    await logout();
  }

  const sectionTitle = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label || "Dashboard", [activeTab]);

  const selectOptions = useMemo(() => {
    const vendorOptions = entities.vendors.map((vendor) => ({
      value: String(vendor.id),
      label: `${vendor.name} (${typeLabels[vendor.kind] || vendor.kind})`
    }));
    const unitOptions = entities.units.map((unit) => ({
      value: String(unit.id),
      label: `${unit.code} - ${unit.name}`
    }));
    const contractOptions = entities.contracts.map((contract) => ({
      value: String(contract.id),
      label: `${contract.contract_number || "Sem numero"} - ${contract.title}`
    }));
    const invoiceOptions = entities.invoices.map((invoice) => ({
      value: String(invoice.id),
      label: `${invoice.invoice_number} - ${invoice.vendor_name}`
    }));
    const regulatoryOptions = entities.documents.map((document) => ({
      value: String(document.id),
      label: `${document.document_type} - ${document.document_number || document.request_number || "Sem numero"}`
    }));

    return { vendorOptions, unitOptions, contractOptions, invoiceOptions, regulatoryOptions };
  }, [entities]);

  const fieldsBySection = useMemo(
    () => ({
      users: [
        { name: "name", label: "Nome do usuario", placeholder: "Usuario Fiscal", required: true },
        { name: "email", label: "E-mail", type: "email", inputMode: "email", placeholder: "usuario@repofiscal.local", required: true },
        {
          name: "role",
          label: "Perfil",
          type: "select",
          required: true,
          options: [
            { value: "operator", label: "Operador" },
            { value: "adm", label: "Administrador" },
            { value: "superadm", label: "Super Administrador" }
          ]
        },
        {
          name: "password",
          label: "Senha",
          type: "password",
          required: !modal.item,
          placeholder: modal.item ? "Preencha apenas para alterar a senha" : "Senha inicial"
        },
        { name: "active", label: "Usuario ativo", type: "checkbox", checkboxLabel: "Usuario ativo" }
      ],
      vendors: [
        {
          name: "kind",
          label: "Tipo de fornecedor",
          type: "select",
          required: true,
          options: [
            { value: "service", label: "Servico" },
            { value: "product", label: "Produto" }
          ]
        },
        { name: "name", label: "Fornecedor", placeholder: "Fornecedor Alpha", required: true },
        { name: "document", label: "CNPJ ou CPF", placeholder: "00.000.000/0001-00", mask: "cpfCnpj", inputMode: "numeric" },
        { name: "contact_name", label: "Contato principal", placeholder: "Nome do responsavel" },
        { name: "email", label: "E-mail", type: "email", inputMode: "email", placeholder: "financeiro@fornecedor.com" },
        { name: "phone", label: "Telefone", placeholder: "(11) 99999-0000", mask: "phone", inputMode: "tel" },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "active", label: "Ativo" },
            { value: "inactive", label: "Inativo" }
          ]
        },
        { name: "notes", label: "Observacoes", type: "textarea", fullWidth: true }
      ],
      units: [
        { name: "name", label: "Nome da unidade", placeholder: "Matriz Sao Paulo", required: true },
        { name: "code", label: "Codigo interno", placeholder: "SP01", required: true },
        { name: "tax_id", label: "CNPJ", placeholder: "00.000.000/0001-00", mask: "cpfCnpj", inputMode: "numeric" },
        { name: "state_registration", label: "Inscricao estadual", placeholder: "123456789" },
        { name: "city", label: "Cidade", placeholder: "Sao Paulo" },
        { name: "state", label: "UF", placeholder: "SP", mask: "state", maxLength: 2 },
        { name: "address", label: "Endereco", fullWidth: true, placeholder: "Rua, numero, bairro" },
        { name: "manager_name", label: "Gestor", placeholder: "Nome do gestor" },
        { name: "manager_email", label: "E-mail do gestor", type: "email", inputMode: "email", placeholder: "gestor@empresa.com" },
        { name: "manager_phone", label: "Telefone do gestor", placeholder: "(11) 97777-6666", mask: "phone", inputMode: "tel" },
        { name: "active", label: "Unidade ativa", type: "checkbox", checkboxLabel: "Unidade ativa" },
        { name: "notes", label: "Observacoes", type: "textarea", fullWidth: true }
      ],
      contracts: [
        { name: "vendor_id", label: "Fornecedor", type: "select", options: selectOptions.vendorOptions, required: true },
        { name: "unit_id", label: "Unidade", type: "select", options: selectOptions.unitOptions, required: true },
        { name: "title", label: "Titulo do orcamento", placeholder: "Prestacao de servicos tecnicos", required: true },
        { name: "contract_number", label: "Numero do orcamento", placeholder: "ORC-2026-001" },
        { name: "category", label: "Categoria", placeholder: "Fiscal, manutencao, licenca" },
        {
          name: "compliance_type",
          label: "Natureza",
          type: "select",
          options: [
            { value: "CONTRATO", label: "Orcamento geral" },
            { value: "AVCB", label: "AVCB" },
            { value: "CLCB", label: "CLCB" }
          ]
        },
        { name: "start_date", label: "Inicio", type: "date" },
        { name: "end_date", label: "Vencimento", type: "date" },
        { name: "value", label: "Valor", type: "currency" },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "active", label: "Ativo" },
            { value: "signed", label: "Assinado" },
            { value: "expiring", label: "A vencer" },
            { value: "expired", label: "Vencido" },
            { value: "inactive", label: "Inativo" }
          ]
        },
        { name: "notes", label: "Observacoes", type: "textarea", fullWidth: true }
      ],
      invoices: [
        { name: "vendor_id", label: "Fornecedor", type: "select", options: selectOptions.vendorOptions, required: true },
        { name: "unit_id", label: "Unidade", type: "select", options: selectOptions.unitOptions, required: true },
        { name: "contract_id", label: "Orcamento vinculado", type: "select", options: selectOptions.contractOptions },
        { name: "invoice_number", label: "Numero da nota", placeholder: "100245", required: true },
        { name: "series", label: "Serie", placeholder: "1" },
        { name: "issue_date", label: "Emissao", type: "date" },
        { name: "due_date", label: "Vencimento", type: "date" },
        { name: "total_amount", label: "Valor total", type: "currency" },
        { name: "tax_amount", label: "Impostos", type: "currency" },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "pending", label: "Pendente" },
            { value: "review", label: "Em analise" },
            { value: "paid", label: "Pago" },
            { value: "canceled", label: "Cancelado" }
          ]
        },
        { name: "access_key", label: "Chave de acesso", placeholder: "44 digitos", mask: "accessKey", inputMode: "numeric", maxLength: 54 },
        { name: "notes", label: "Observacoes", type: "textarea", fullWidth: true }
      ],
      documents: [
        { name: "unit_id", label: "Unidade", type: "select", options: selectOptions.unitOptions, required: true },
        { name: "vendor_id", label: "Fornecedor", type: "select", options: selectOptions.vendorOptions },
        { name: "contract_id", label: "Orcamento", type: "select", options: selectOptions.contractOptions },
        { name: "request_number", label: "Numero do pedido", placeholder: "PED-2026-001" },
        { name: "document_number", label: "Numero do documento", placeholder: "AVCB-00991" },
        { name: "issue_date", label: "Emissao", type: "date" },
        { name: "expiry_date", label: "Vencimento", type: "date" },
        { name: "last_inspection_date", label: "Ultima vistoria", type: "date" },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "in_progress", label: "Em tramite" },
            { value: "issued", label: "Emitido" },
            { value: "renewed", label: "Renovado" },
            { value: "archived", label: "Arquivado" }
          ]
        },
        { name: "notes", label: "Observacoes", type: "textarea", fullWidth: true }
      ]
    }),
    [selectOptions, modal.item]
  );

  const listFilterDefinitions = useMemo(
    () => ({
      users: buildFilterFieldsFromForm(fieldsBySection.users, { excludeNames: ["password"] }),
      vendors: buildFilterFieldsFromForm(fieldsBySection.vendors),
      units: buildFilterFieldsFromForm(fieldsBySection.units),
      contracts: buildFilterFieldsFromForm(fieldsBySection.contracts, { includeDueState: true }),
      invoices: buildFilterFieldsFromForm(fieldsBySection.invoices, { includeDueState: true }),
      avcb: buildFilterFieldsFromForm(fieldsBySection.documents, { excludeNames: ["document_type"], includeDueState: true }),
      clcb: buildFilterFieldsFromForm(fieldsBySection.documents, { excludeNames: ["document_type"], includeDueState: true }),
      files: [
        { name: "category", label: "Categoria", filterType: "text" },
        {
          name: "extension",
          label: "Tipo de arquivo",
          filterType: "select",
          options: Array.from(new Set(entities.files.map((file) => file.extension).filter(Boolean)))
            .sort()
            .map((extension) => ({ value: extension, label: extension }))
        },
        { name: "vendor_id", label: "Fornecedor", filterType: "select", options: selectOptions.vendorOptions },
        { name: "unit_id", label: "Unidade", filterType: "select", options: selectOptions.unitOptions },
        { name: "contract_id", label: "Orcamento", filterType: "select", options: selectOptions.contractOptions },
        { name: "invoice_id", label: "Nota fiscal", filterType: "select", options: selectOptions.invoiceOptions },
        { name: "regulatory_document_id", label: "Documento regulatorio", filterType: "select", options: selectOptions.regulatoryOptions },
        { name: "created_at", label: "Data de envio", filterType: "date-range" },
        { name: "notes", label: "Observacoes", filterType: "text" }
      ]
    }),
    [entities.files, fieldsBySection, selectOptions]
  );

  const modalReport = useMemo(() => {
    const section = modal.section;
    const item = modal.item;
    if (!section) {
      return null;
    }

    const files = entities.files;
    const documents = entities.documents;
    const invoices = entities.invoices;
    const contracts = entities.contracts;
    const baseMetrics = [
      { label: "Arquivos", value: files.length },
      { label: "Docs em transito", value: documents.filter((doc) => doc.status === "in_progress").length }
    ];

    if (!item) {
      return {
        title: "Resumo do modulo",
        description: "Visao consolidada do historico relacionado e dos processos em transito deste cadastro.",
        metrics: baseMetrics,
        timeline: limitTimeline(
          [
            ...documents
              .filter((doc) => doc.status === "in_progress")
              .map((doc) => ({
                label: `${doc.document_type} em tramite`,
                detail: `${doc.request_number || "Sem pedido"} - ${doc.unit_name || "Sem unidade"}`
              })),
            ...invoices
              .filter((invoice) => ["pending", "review"].includes(invoice.status))
              .map((invoice) => ({
                label: `NF ${invoice.invoice_number} em transito`,
                detail: `${invoice.vendor_name || "Sem fornecedor"} - ${formatDate(invoice.due_date)}`
              }))
          ],
          "Modulo sem historico"
        )
      };
    }

    const relatedFiles = files.filter((file) =>
      (section === "vendors" && file.vendor_id === item.id) ||
      (section === "units" && file.unit_id === item.id) ||
      (section === "contracts" && file.contract_id === item.id) ||
      (section === "invoices" && file.invoice_id === item.id) ||
      (section === "documents" && file.regulatory_document_id === item.id) ||
      (section === "users" && file.uploaded_by_user_id === item.id)
    );

    const relatedDocuments = documents.filter((document) =>
      (section === "vendors" && document.vendor_id === item.id) ||
      (section === "units" && document.unit_id === item.id) ||
      (section === "contracts" && document.contract_id === item.id) ||
      (section === "documents" && (document.unit_id === item.unit_id || document.vendor_id === item.vendor_id)) ||
      (section === "invoices" && document.contract_id === item.contract_id)
    );

    const relatedContracts = contracts.filter((contract) =>
      (section === "vendors" && contract.vendor_id === item.id) ||
      (section === "units" && contract.unit_id === item.id) ||
      (section === "documents" && contract.id === item.contract_id)
    );

    const relatedInvoices = invoices.filter((invoice) =>
      (section === "vendors" && invoice.vendor_id === item.id) ||
      (section === "units" && invoice.unit_id === item.id) ||
      (section === "contracts" && invoice.contract_id === item.id) ||
      (section === "documents" && invoice.contract_id === item.contract_id)
    );

    const timeline = [
      ...relatedDocuments.map((document) => ({
        label: `${document.document_type} ${document.document_number || document.request_number || "sem numero"}`,
        detail: `${explicitStatusLabels[document.status] || document.status} - ${formatDate(document.expiry_date)}`
      })),
      ...relatedInvoices.map((invoice) => ({
        label: `NF ${invoice.invoice_number}`,
        detail: `${explicitStatusLabels[invoice.status] || invoice.status} - ${formatDate(invoice.due_date)}`
      })),
      ...relatedFiles.map((file) => ({
        label: `Arquivo ${file.original_name}`,
        detail: `${file.category || "Sem categoria"} - ${formatDateTime(file.created_at)}`
      })),
      ...relatedContracts.map((contract) => ({
        label: `Orcamento ${contract.contract_number || contract.title}`,
        detail: `${explicitStatusLabels[contract.status] || contract.status} - ${formatDate(contract.end_date)}`
      }))
    ];

    return {
      title: "Historico do processo",
      description: "Resumo do historico documental, anexos e itens atualmente em transito relacionados a este registro.",
      metrics: [
        { label: "Arquivos vinculados", value: relatedFiles.length },
        { label: "Documentos relacionados", value: relatedDocuments.length },
        { label: "Processos em transito", value: relatedDocuments.filter((doc) => doc.status === "in_progress").length + relatedInvoices.filter((invoice) => ["pending", "review"].includes(invoice.status)).length },
        { label: "Orcamentos relacionados", value: relatedContracts.length }
      ],
      timeline: limitTimeline(timeline, "Sem historico relacionado")
    };
  }, [modal, entities]);

  const avcbRows = useMemo(
    () => entities.documents.filter((document) => document.document_type === "AVCB"),
    [entities.documents]
  );

  const clcbRows = useMemo(
    () => entities.documents.filter((document) => document.document_type === "CLCB"),
    [entities.documents]
  );

  const criticalDeadlines = useMemo(() => {
    const rows = [
      ...entities.contracts.map((contract) => ({
        modulo: "Orcamento",
        identificador: contract.contract_number || contract.title,
        titulo: contract.title,
        unidade: contract.unit_name,
        fornecedor: contract.vendor_name,
        vencimento: contract.end_date,
        situacao: explicitStatusLabels[contract.status] || contract.status,
        alerta: getDueMeta(contract.end_date).label,
        prioridade: getDueMeta(contract.end_date).priority
      })),
      ...entities.invoices.map((invoice) => ({
        modulo: "Nota fiscal",
        identificador: invoice.invoice_number,
        titulo: `NF ${invoice.invoice_number}`,
        unidade: invoice.unit_name,
        fornecedor: invoice.vendor_name,
        vencimento: invoice.due_date,
        situacao: explicitStatusLabels[invoice.status] || invoice.status,
        alerta: getInvoiceDueMeta(invoice).label,
        prioridade: getInvoiceDueMeta(invoice).priority
      })),
      ...entities.documents.map((document) => ({
        modulo: document.document_type,
        identificador: document.document_number || document.request_number,
        titulo: `${document.document_type} ${document.document_number || document.request_number || "Sem numero"}`,
        unidade: document.unit_name,
        fornecedor: document.vendor_name,
        vencimento: document.expiry_date,
        situacao: explicitStatusLabels[document.status] || document.status,
        alerta: getDueMeta(document.expiry_date).label,
        prioridade: getDueMeta(document.expiry_date).priority
      }))
    ];

    return rows
      .filter((row) => row.prioridade <= 1)
      .sort((left, right) => left.prioridade - right.prioridade || parseDateValue(left.vencimento)?.getTime() - parseDateValue(right.vencimento)?.getTime());
  }, [entities.contracts, entities.documents, entities.invoices]);

  const inTransitProcesses = useMemo(() => {
    const rows = [
      ...entities.contracts
        .filter((contract) => ["expiring", "signed"].includes(contract.status))
        .map((contract) => ({
          modulo: "Orcamento",
          identificador: contract.contract_number || contract.title,
          unidade: contract.unit_name,
          fornecedor: contract.vendor_name,
          status: explicitStatusLabels[contract.status] || contract.status,
          referencia: contract.end_date ? `Vencimento ${formatDate(contract.end_date)}` : "Sem vencimento"
        })),
      ...entities.invoices
        .filter((invoice) => ["pending", "review"].includes(invoice.status))
        .map((invoice) => ({
          modulo: "Nota fiscal",
          identificador: invoice.invoice_number,
          unidade: invoice.unit_name,
          fornecedor: invoice.vendor_name,
          status: explicitStatusLabels[invoice.status] || invoice.status,
          referencia: invoice.due_date ? `Vencimento ${formatDate(invoice.due_date)}` : "Sem vencimento"
        })),
      ...entities.documents
        .filter((document) => ["in_progress", "issued", "renewed"].includes(document.status))
        .map((document) => ({
          modulo: document.document_type,
          identificador: document.document_number || document.request_number,
          unidade: document.unit_name,
          fornecedor: document.vendor_name,
          status: explicitStatusLabels[document.status] || document.status,
          referencia: document.expiry_date ? `Vencimento ${formatDate(document.expiry_date)}` : "Sem vencimento"
        }))
    ];

    return rows;
  }, [entities.contracts, entities.documents, entities.invoices]);

  const reportDefinitions = useMemo(
    () => [
      {
        id: "executive-summary",
        title: "Resumo executivo",
        fileBase: "repofiscal-resumo-executivo",
        description: "Indicadores consolidados do dashboard para diretoria, fiscal e acompanhamento geral.",
        metrics: [
          { label: "Relatorios", value: "11 tipos" },
          { label: "Registros-base", value: Object.values(entities).reduce((sum, list) => sum + list.length, 0) },
          { label: "Criticos", value: criticalDeadlines.length },
          { label: "Em transito", value: inTransitProcesses.length }
        ],
        highlights: [
          `${dashboard.counts.vendors} fornecedores cadastrados`,
          `${dashboard.counts.active_contracts} orcamentos ativos e ${dashboard.counts.pending_invoices} notas pendentes`,
          `${dashboard.counts.avcb_attention + dashboard.counts.clcb_attention} documentos regulatorios em alerta`
        ],
        columns: [
          { key: "fornecedores", label: "Fornecedores" },
          { key: "usuarios_ativos", label: "Usuarios ativos" },
          { key: "arquivos", label: "Arquivos" },
          { key: "unidades", label: "Unidades" },
          { key: "contratos_ativos", label: "Orcamentos ativos" },
          { key: "notas_pendentes", label: "Notas pendentes" },
          { key: "avcb_alerta", label: "AVCB alerta" },
          { key: "clcb_alerta", label: "CLCB alerta" },
          { key: "notas_pagas_total", label: "Notas pagas total", format: (value) => formatCurrency(value) }
        ],
        rows: [
          {
            fornecedores: dashboard.counts.vendors,
            usuarios_ativos: dashboard.counts.active_users,
            arquivos: dashboard.counts.files,
            unidades: dashboard.counts.units,
            contratos_ativos: dashboard.counts.active_contracts,
            notas_pendentes: dashboard.counts.pending_invoices,
            avcb_alerta: dashboard.counts.avcb_attention,
            clcb_alerta: dashboard.counts.clcb_attention,
            notas_pagas_total: dashboard.counts.invoices_paid_total
          }
        ]
      },
      {
        id: "users",
        title: "Usuarios e perfis",
        fileBase: "repofiscal-usuarios",
        description: "Controle de acessos, perfis e situacao dos usuarios da plataforma.",
        metrics: [
          { label: "Usuarios", value: entities.users.length },
          { label: "Superadm", value: entities.users.filter((item) => item.role === "superadm").length },
          { label: "Adm", value: entities.users.filter((item) => item.role === "adm").length },
          { label: "Ativos", value: entities.users.filter((item) => item.active).length }
        ],
        highlights: [
          "Relatorio completo de governanca de acesso",
          "Perfis operador, adm e superadm",
          "Pode ser usado em auditorias internas"
        ],
        columns: [
          { key: "name", label: "Usuario" },
          { key: "email", label: "E-mail" },
          { key: "role_label", label: "Perfil" },
          { key: "active_label", label: "Status" },
          { key: "created_at_label", label: "Criado em" }
        ],
        rows: entities.users.map((item) => ({
          name: item.name,
          email: item.email,
          role_label: item.role === "superadm" ? "Superadm" : item.role === "adm" ? "Adm" : "Operador",
          active_label: item.active ? "Ativo" : "Inativo",
          created_at_label: formatDateTime(item.created_at)
        }))
      },
      {
        id: "vendors",
        title: "Fornecedores",
        fileBase: "repofiscal-fornecedores",
        description: "Base de fornecedores de servicos e produtos.",
        metrics: [
          { label: "Fornecedores", value: entities.vendors.length },
          { label: "Servicos", value: entities.vendors.filter((item) => item.kind === "service").length },
          { label: "Produtos", value: entities.vendors.filter((item) => item.kind === "product").length }
        ],
        highlights: [
          "Relaciona fornecedor, tipo e contato",
          "Apoia homologacao e controle operacional",
          "Base pronta para auditoria fiscal e tecnica"
        ],
        columns: [
          { key: "tipo_registro", label: "Registro" },
          { key: "nome", label: "Nome" },
          { key: "fornecedor", label: "Fornecedor" },
          { key: "tipo", label: "Tipo" },
          { key: "documento", label: "Documento" },
          { key: "contato", label: "Contato" },
          { key: "status", label: "Status" }
        ],
        rows: entities.vendors.map((item) => ({
            tipo_registro: "Fornecedor",
            nome: item.name,
            fornecedor: item.name,
            tipo: typeLabels[item.kind] || item.kind,
            documento: item.document,
            contato: item.contact_name || item.email || item.phone,
            status: explicitStatusLabels[item.status] || item.status
          }))
      },
      {
        id: "units",
        title: "Unidades",
        fileBase: "repofiscal-unidades",
        description: "Relatorio estrutural das unidades, gestores e dados fiscais basicos.",
        metrics: [
          { label: "Unidades", value: entities.units.length },
          { label: "Ativas", value: entities.units.filter((item) => item.active).length },
          { label: "UFs", value: new Set(entities.units.map((item) => item.state).filter(Boolean)).size },
          { label: "Gestores", value: entities.units.filter((item) => item.manager_name).length }
        ],
        highlights: [
          "Inclui codigo interno, cidade, UF e gestor",
          "Base para cruzamento com orcamentos e notas",
          "Apoia padronizacao cadastral das filiais"
        ],
        columns: [
          { key: "code", label: "Codigo" },
          { key: "name", label: "Unidade" },
          { key: "tax_id", label: "CNPJ" },
          { key: "city", label: "Cidade" },
          { key: "state", label: "UF" },
          { key: "manager_name", label: "Gestor" },
          { key: "status", label: "Status" }
        ],
        rows: entities.units.map((item) => ({
          code: item.code,
          name: item.name,
          tax_id: item.tax_id,
          city: item.city,
          state: item.state,
          manager_name: item.manager_name,
          status: item.active ? "Ativa" : "Inativa"
        }))
      },
      {
        id: "contracts",
        title: "Orcamentos",
        fileBase: "repofiscal-orcamentos",
        description: "Orcamentos gerais e de compliance com valor, vigencia e classificacao.",
        metrics: [
          { label: "Orcamentos", value: entities.contracts.length },
          { label: "Ativos", value: entities.contracts.filter((item) => item.status === "active").length },
          { label: "A vencer", value: entities.contracts.filter((item) => getDueMeta(item.end_date).tone === "warning").length },
          { label: "Vencidos", value: entities.contracts.filter((item) => getDueMeta(item.end_date).tone === "danger").length }
        ],
        highlights: [
          "Monitora vigencia e vencimento por unidade",
          "Distingue orcamento geral, AVCB e CLCB",
          "Base para renovacao e planejamento"
        ],
        columns: [
          { key: "contract_number", label: "Numero" },
          { key: "title", label: "Orcamento" },
          { key: "vendor_name", label: "Fornecedor" },
          { key: "unit_name", label: "Unidade" },
          { key: "compliance_type", label: "Tipo" },
          { key: "end_date_label", label: "Vencimento" },
          { key: "alerta", label: "Alerta" },
          { key: "status", label: "Status" },
          { key: "value_label", label: "Valor" }
        ],
        rows: entities.contracts.map((item) => ({
          contract_number: item.contract_number,
          title: item.title,
          vendor_name: item.vendor_name,
          unit_name: item.unit_name,
          compliance_type: item.compliance_type,
          end_date_label: formatDate(item.end_date),
          alerta: getDueMeta(item.end_date).label,
          status: explicitStatusLabels[item.status] || item.status,
          value_label: formatCurrency(item.value)
        }))
      },
      {
        id: "invoices",
        title: "Notas fiscais",
        fileBase: "repofiscal-notas-fiscais",
        description: "Controle financeiro e fiscal das notas, com status, vencimento e impostos.",
        metrics: [
          { label: "Notas", value: entities.invoices.length },
          { label: "Pendentes", value: entities.invoices.filter((item) => item.status === "pending").length },
          { label: "Em analise", value: entities.invoices.filter((item) => item.status === "review").length },
          { label: "Pagas", value: entities.invoices.filter((item) => item.status === "paid").length }
        ],
        highlights: [
          "Cobertura de emissao, vencimento e valor",
          "Apoia contas a pagar e conferencias fiscais",
          "Mantem trilha para pagamentos e impostos"
        ],
        columns: [
          { key: "invoice_number", label: "NF" },
          { key: "series", label: "Serie" },
          { key: "vendor_name", label: "Fornecedor" },
          { key: "unit_name", label: "Unidade" },
          { key: "issue_date_label", label: "Emissao" },
          { key: "due_date_label", label: "Vencimento" },
          { key: "alerta", label: "Alerta" },
          { key: "status", label: "Status" },
          { key: "total_amount_label", label: "Valor total" },
          { key: "tax_amount_label", label: "Impostos" }
        ],
        rows: entities.invoices.map((item) => ({
          invoice_number: item.invoice_number,
          series: item.series,
          vendor_name: item.vendor_name,
          unit_name: item.unit_name,
          issue_date_label: formatDate(item.issue_date),
          due_date_label: formatDate(item.due_date),
          alerta: getInvoiceDueMeta(item).label,
          status: explicitStatusLabels[item.status] || item.status,
          total_amount_label: formatCurrency(item.total_amount),
          tax_amount_label: formatCurrency(item.tax_amount)
        }))
      },
      {
        id: "avcb",
        title: "AVCB",
        fileBase: "repofiscal-avcb",
        description: "Pedidos e documentos AVCB com unidade, fornecedor e vencimento.",
        metrics: [
          { label: "Registros", value: avcbRows.length },
          { label: "Em dia", value: avcbRows.filter((item) => getDueMeta(item.expiry_date).tone === "success").length },
          { label: "A vencer", value: avcbRows.filter((item) => getDueMeta(item.expiry_date).tone === "warning").length },
          { label: "Vencidos", value: avcbRows.filter((item) => getDueMeta(item.expiry_date).tone === "danger").length }
        ],
        highlights: [
          "Relatorio regulatorio especifico de AVCB",
          "Cruza unidade, fornecedor e anexos",
          "Pronto para acompanhamento de renovacao"
        ],
        columns: [
          { key: "request_number", label: "Pedido" },
          { key: "document_number", label: "Documento" },
          { key: "unit_name", label: "Unidade" },
          { key: "vendor_name", label: "Fornecedor" },
          { key: "expiry_date_label", label: "Vencimento" },
          { key: "alerta", label: "Alerta" },
          { key: "status", label: "Status" }
        ],
        rows: avcbRows.map((item) => ({
          request_number: item.request_number,
          document_number: item.document_number,
          unit_name: item.unit_name,
          vendor_name: item.vendor_name,
          expiry_date_label: formatDate(item.expiry_date),
          alerta: getDueMeta(item.expiry_date).label,
          status: explicitStatusLabels[item.status] || item.status
        }))
      },
      {
        id: "clcb",
        title: "CLCB",
        fileBase: "repofiscal-clcb",
        description: "Pedidos e documentos CLCB com monitoramento fiscal e regulatorio.",
        metrics: [
          { label: "Registros", value: clcbRows.length },
          { label: "Em dia", value: clcbRows.filter((item) => getDueMeta(item.expiry_date).tone === "success").length },
          { label: "A vencer", value: clcbRows.filter((item) => getDueMeta(item.expiry_date).tone === "warning").length },
          { label: "Vencidos", value: clcbRows.filter((item) => getDueMeta(item.expiry_date).tone === "danger").length }
        ],
        highlights: [
          "Relatorio regulatorio especifico de CLCB",
          "Mantem o mesmo criterio visual de vencimentos",
          "Suporta revisao operacional e documental"
        ],
        columns: [
          { key: "request_number", label: "Pedido" },
          { key: "document_number", label: "Documento" },
          { key: "unit_name", label: "Unidade" },
          { key: "vendor_name", label: "Fornecedor" },
          { key: "expiry_date_label", label: "Vencimento" },
          { key: "alerta", label: "Alerta" },
          { key: "status", label: "Status" }
        ],
        rows: clcbRows.map((item) => ({
          request_number: item.request_number,
          document_number: item.document_number,
          unit_name: item.unit_name,
          vendor_name: item.vendor_name,
          expiry_date_label: formatDate(item.expiry_date),
          alerta: getDueMeta(item.expiry_date).label,
          status: explicitStatusLabels[item.status] || item.status
        }))
      },
      {
        id: "files",
        title: "Arquivos e anexos",
        fileBase: "repofiscal-arquivos",
        description: "Repositorio extraivel de arquivos enviados, categorias, tamanhos e relacionamentos.",
        metrics: [
          { label: "Arquivos", value: entities.files.length },
          { label: "PDF", value: entities.files.filter((item) => item.extension === "pdf").length },
          { label: "XML", value: entities.files.filter((item) => item.extension === "xml").length },
          { label: "Excel/CSV", value: entities.files.filter((item) => ["xlsx", "xls", "csv"].includes(item.extension)).length }
        ],
        highlights: [
          "Inventario de anexos por modulo",
          "Suporte a auditoria de documentos enviados",
          "Permite consolidacao de evidencias fiscais"
        ],
        columns: [
          { key: "original_name", label: "Arquivo" },
          { key: "extension", label: "Tipo" },
          { key: "category", label: "Categoria" },
          { key: "uploaded_by_name", label: "Usuario" },
          { key: "created_at_label", label: "Data" },
          { key: "size_label", label: "Tamanho" }
        ],
        rows: entities.files.map((item) => ({
          original_name: item.original_name,
          extension: item.extension,
          category: item.category,
          uploaded_by_name: item.uploaded_by_name,
          created_at_label: formatDateTime(item.created_at),
          size_label: formatFileSize(item.size_bytes)
        }))
      },
      {
        id: "critical-deadlines",
        title: "Vencimentos criticos",
        fileBase: "repofiscal-vencimentos-criticos",
        description: "Consolidado de orcamentos, notas e documentos em atraso ou a vencer nos proximos 60 dias.",
        metrics: [
          { label: "Itens", value: criticalDeadlines.length },
          { label: "Atrasados", value: criticalDeadlines.filter((item) => item.prioridade === 0).length },
          { label: "A vencer", value: criticalDeadlines.filter((item) => item.prioridade === 1).length },
          { label: "Modulos", value: new Set(criticalDeadlines.map((item) => item.modulo)).size }
        ],
        highlights: [
          "Relatorio mais sensivel para governanca de prazos",
          "Unifica fiscal, orcamentos e regulatorio",
          "Ideal para rotina de cobranca e renovacao"
        ],
        columns: [
          { key: "modulo", label: "Modulo" },
          { key: "identificador", label: "Identificador" },
          { key: "titulo", label: "Titulo" },
          { key: "unidade", label: "Unidade" },
          { key: "fornecedor", label: "Fornecedor" },
          { key: "vencimento_label", label: "Vencimento" },
          { key: "situacao", label: "Status" },
          { key: "alerta", label: "Alerta" }
        ],
        rows: criticalDeadlines.map((item) => ({
          ...item,
          vencimento_label: formatDate(item.vencimento)
        }))
      },
      {
        id: "in-transit",
        title: "Processos em transito",
        fileBase: "repofiscal-processos-em-transito",
        description: "Consolidado operacional de itens pendentes, em analise, emitidos ou aguardando conclusao.",
        metrics: [
          { label: "Itens", value: inTransitProcesses.length },
          { label: "Notas", value: inTransitProcesses.filter((item) => item.modulo === "Nota fiscal").length },
          { label: "Orcamentos", value: inTransitProcesses.filter((item) => item.modulo === "Orcamento").length },
          { label: "Regulatorios", value: inTransitProcesses.filter((item) => item.modulo === "AVCB" || item.modulo === "CLCB").length }
        ],
        highlights: [
          "Visao unica do que ainda demanda tratativa",
          "Apoia reunioes de acompanhamento",
          "Mostra referencia de prazo e status atual"
        ],
        columns: [
          { key: "modulo", label: "Modulo" },
          { key: "identificador", label: "Identificador" },
          { key: "unidade", label: "Unidade" },
          { key: "fornecedor", label: "Fornecedor" },
          { key: "status", label: "Status" },
          { key: "referencia", label: "Referencia" }
        ],
        rows: inTransitProcesses
      }
    ],
    [avcbRows, clcbRows, criticalDeadlines.length, dashboard.counts, entities, inTransitProcesses]
  );

  const reportFilterSummary = useMemo(() => {
    const items = [];
    const reportLabel = reportDefinitions.find((report) => report.id === reportFilters.report_id)?.title;
    const vendorLabel = selectOptions.vendorOptions.find((option) => option.value === reportFilters.vendor_id)?.label;
    const unitLabel = selectOptions.unitOptions.find((option) => option.value === reportFilters.unit_id)?.label;

    if (reportLabel) {
      items.push(`Relatorio: ${reportLabel}`);
    }
    if (vendorLabel) {
      items.push(`Fornecedor: ${vendorLabel}`);
    }
    if (unitLabel) {
      items.push(`Unidade: ${unitLabel}`);
    }
    if (reportFilters.status) {
      items.push(`Status: ${explicitStatusLabels[reportFilters.status] || reportFilters.status}`);
    }
    if (reportFilters.date_from) {
      items.push(`De: ${formatDate(reportFilters.date_from)}`);
    }
    if (reportFilters.date_to) {
      items.push(`Ate: ${formatDate(reportFilters.date_to)}`);
    }

    return items;
  }, [reportDefinitions, reportFilters, selectOptions]);

  const currentFilterFields = listFilterDefinitions[activeDataKey] || [];
  const currentListFilters = listFilters[activeDataKey] || {};
  const activeListFilterCount = useMemo(
    () => Object.values(currentListFilters).filter((value) => value !== "" && value !== null && typeof value !== "undefined").length,
    [currentListFilters]
  );

  const visibleReports = useMemo(() => {
    const selectedReportId = reportFilters.report_id;
    const selectedVendorLabel = selectOptions.vendorOptions.find((option) => option.value === reportFilters.vendor_id)?.label || "";
    const selectedUnitLabel = selectOptions.unitOptions.find((option) => option.value === reportFilters.unit_id)?.label || "";
    const fromDate = parseDateValue(reportFilters.date_from);
    const toDate = parseDateValue(reportFilters.date_to);

    return reportDefinitions
      .filter((report) => !selectedReportId || report.id === selectedReportId)
      .map((report) => {
        const rows = report.rows.filter((row) => {
          const rowVendor = String(row.vendor_name || row.fornecedor || row.vendor || "").toLowerCase();
          const rowUnit = String(row.unit_name || row.unidade || row.unit || "").toLowerCase();
          const rowStatus = String(row.status || row.situacao || row.active_label || "").toLowerCase();
          const rowDate =
            parseDisplayDateValue(
              row._date ||
              row.vencimento ||
              row.end_date ||
              row.due_date ||
              row.expiry_date ||
              row.issue_date ||
              row.created_at ||
              row.end_date_label ||
              row.due_date_label ||
              row.expiry_date_label ||
              row.issue_date_label ||
              row.created_at_label ||
              row.vencimento_label
            );

          if (selectedVendorLabel && !rowVendor.includes(selectedVendorLabel.toLowerCase().split(" (")[0])) {
            return false;
          }
          if (selectedUnitLabel && !rowUnit.includes(selectedUnitLabel.toLowerCase().split(" - ")[0]) && !rowUnit.includes(selectedUnitLabel.toLowerCase().split(" - ").slice(1).join(" "))) {
            return false;
          }
          if (reportFilters.status) {
            const selectedStatusLabel = (explicitStatusLabels[reportFilters.status] || reportFilters.status).toLowerCase();
            if (!rowStatus.includes(selectedStatusLabel)) {
              return false;
            }
          }
          if (fromDate && (!rowDate || rowDate < fromDate)) {
            return false;
          }
          if (toDate && (!rowDate || rowDate > toDate)) {
            return false;
          }
          return true;
        });

        return {
          ...report,
          rows,
          metrics: [...report.metrics, { label: "Linhas exibidas", value: rows.length }]
        };
      });
  }, [reportDefinitions, reportFilters, selectOptions]);

  const currentRows = useMemo(() => {
    let list = [];
    if (activeTab === "users") {
      list = entities.users;
    } else if (activeTab === "files") {
      list = entities.files;
    } else if (activeTab === "vendors") {
      list = entities.vendors;
    } else if (activeTab === "avcb" || activeTab === "clcb") {
      list = entities.documents.filter((document) => document.document_type === activeTab.toUpperCase());
    } else {
      list = entities[activeTab] || [];
    }

    const term = deferredSearch.trim().toLowerCase();
    const filteredBySearch = term
      ? list.filter((item) => Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(term)))
      : list;

    const dueField =
      activeTab === "contracts"
        ? "end_date"
        : activeTab === "invoices"
          ? "due_date"
          : activeTab === "avcb" || activeTab === "clcb"
            ? "expiry_date"
            : null;

    const filtered = filteredBySearch.filter((item) =>
      currentFilterFields.every((field) => {
        if (field.filterType === "date-range") {
          return matchesDateRange(
            item[field.name],
            currentListFilters[`${field.name}_from`],
            currentListFilters[`${field.name}_to`]
          );
        }

        if (field.name === "due_state") {
          if (!currentListFilters.due_state) {
            return true;
          }
          const dueMeta = activeDataKey === "invoices" ? getInvoiceDueMeta(item) : getDueMeta(item[dueField]);
          return dueMeta.tone === currentListFilters.due_state;
        }

        return matchesFilterValue(item[field.name], currentListFilters[field.name], field.filterType);
      })
    );

    if (!dueField) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftMeta = activeTab === "invoices" ? getInvoiceDueMeta(left) : getDueMeta(left[dueField]);
      const rightMeta = activeTab === "invoices" ? getInvoiceDueMeta(right) : getDueMeta(right[dueField]);
      if (leftMeta.priority !== rightMeta.priority) {
        return leftMeta.priority - rightMeta.priority;
      }
      return leftMeta.sortValue - rightMeta.sortValue;
    });
  }, [activeTab, activeDataKey, currentFilterFields, currentListFilters, deferredSearch, entities]);

  function updateListFilter(section, name, value) {
    setListFilters((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [name]: value
      }
    }));
  }

  function clearListFilters(section) {
    setListFilters((current) => ({
      ...current,
      [section]: {}
    }));
  }

  function clearCurrentFilters() {
    if (activeTab === "reports") {
      clearReportFilters();
      return;
    }
    if (activeTab === "dashboard" || activeTab === "operations") {
      setListFilters(getInitialListFilters());
      return;
    }
    clearListFilters(activeDataKey);
  }

  function openDashboardList(section, options = {}) {
    const targetDataKey = section;
    setBanner("");
    setError("");
    setSearch((current) => ({ ...current, [targetDataKey]: "" }));
    setListFilters((current) => ({
      ...current,
      [targetDataKey]: options.filters || {}
    }));
    setListFilterPanels((current) => ({
      ...current,
      [targetDataKey]: Boolean(options.filters && Object.keys(options.filters).length)
    }));
    startTransition(() => setActiveTab(section));
  }

  function toggleListFilterPanel(section) {
    setListFilterPanels((current) => ({
      ...current,
      [section]: !current[section]
    }));
  }

  async function handleLogin(email, password) {
    setLoginError("");
    try {
      await login(email, password);
    } catch (authError) {
      setLoginError(authError.message);
    }
  }

  function openModal(section, item = null, options = {}) {
    setBanner("");
    setError("");
    setModalFieldErrors({});
    setSavingModal(false);
    const documentType = options.documentType || item?.document_type || null;
    const mode = options.mode || (item ? "edit" : "create");
    setModal({ section, item, documentType, mode });
    const nextForm = item ? { ...initialForms[section], ...item } : { ...initialForms[section] };
    if (section === "documents" && documentType) {
      nextForm.document_type = documentType;
    }
    setFormData(nextForm);
    setInitialModalFormData(nextForm);
  }

  function closeModal() {
    setModal({ section: null, item: null, documentType: null, mode: "edit" });
    setFormData({});
    setInitialModalFormData({});
    setModalFieldErrors({});
    setSavingModal(false);
    setDocumentAttachments(defaultDocumentAttachments);
  }

  function updateFormField(name, value) {
    if (error) {
      setError("");
    }
    setModalFieldErrors((current) => {
      if (!current[name]) {
        return current;
      }
      const next = { ...current };
      delete next[name];
      return next;
    });
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function updateUploadField(name, value) {
    setUploadForm((current) => ({ ...current, [name]: value }));
  }

  function updateDocumentAttachmentField(name, value) {
    setDocumentAttachments((current) => ({
      ...current,
      form: { ...current.form, [name]: value }
    }));
  }

  async function loadModalAttachments(section, itemId) {
    setDocumentAttachments((current) => ({ ...current, loading: true }));
    try {
      const path = section === "contracts"
        ? `/api/contracts/${itemId}/history`
        : `/api/regulatory-documents/${itemId}/history`;
      const payload = await api.get(path);
      setDocumentAttachments((current) => ({
        ...current,
        loading: false,
        files: payload.files || [],
        invoices: payload.invoices || [],
        history: payload.history || []
      }));
    } catch (historyError) {
      setDocumentAttachments((current) => ({
        ...current,
        loading: false,
        files: [],
        invoices: [],
        history: []
      }));
      setError(historyError.message);
    }
  }

  function normalizePayload(section, data, documentType) {
    const payload = { ...data };

    if (section === "users") {
      payload.active = Boolean(payload.active);
    }
    if (section === "units") {
      payload.active = Boolean(payload.active);
    }
    if (section === "contracts") {
      payload.vendor_id = Number(payload.vendor_id);
      payload.unit_id = Number(payload.unit_id);
      payload.value = parseCurrencyValue(payload.value);
      payload.renewal_alert_days = Number(payload.renewal_alert_days || 30);
    }
    if (section === "invoices") {
      payload.vendor_id = Number(payload.vendor_id);
      payload.unit_id = Number(payload.unit_id);
      payload.contract_id = payload.contract_id ? Number(payload.contract_id) : null;
      payload.total_amount = parseCurrencyValue(payload.total_amount);
      payload.tax_amount = parseCurrencyValue(payload.tax_amount);
    }
    if (section === "documents") {
      payload.document_type = documentType || payload.document_type || "AVCB";
      payload.unit_id = Number(payload.unit_id);
      payload.vendor_id = payload.vendor_id ? Number(payload.vendor_id) : null;
      payload.professional_id = null;
      payload.contract_id = payload.contract_id ? Number(payload.contract_id) : null;
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") {
        payload[key] = null;
      }
    });

    if (section === "vendors" && !payload.kind) {
      payload.kind = "service";
    }
    if (section === "vendors" && !payload.status) {
      payload.status = "active";
    }
    if (section === "contracts" && !payload.status) {
      payload.status = "active";
    }
    if (section === "invoices" && !payload.status) {
      payload.status = "pending";
    }
    if (section === "documents" && !payload.status) {
      payload.status = "in_progress";
    }
    if (section === "users" && !payload.role) {
      payload.role = "operator";
    }

    return payload;
  }

  function validateModalForm(section, data) {
    const fields = fieldsBySection[section] || [];
    const fieldErrors = {};

    fields
      .filter((field) => field.required)
      .forEach((field) => {
        const value = data[field.name];
        if (value === null || typeof value === "undefined" || String(value).trim() === "") {
          fieldErrors[field.name] = `${field.label} e obrigatorio.`;
        }
      });

    fields
      .filter((field) => field.type === "email" && !fieldErrors[field.name])
      .forEach((field) => {
        const value = String(data[field.name] || "").trim();
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          fieldErrors[field.name] = `Informe um e-mail valido.`;
        }
      });

    fields
      .filter((field) => field.mask && !fieldErrors[field.name])
      .forEach((field) => {
        const value = String(data[field.name] || "");
        const digits = value.replace(/\D/g, "");
        if (!digits) {
          return;
        }

        if (field.mask === "cpfCnpj" && digits.length !== 11 && digits.length !== 14) {
          fieldErrors[field.name] = "Informe CPF com 11 digitos ou CNPJ com 14 digitos.";
        }
        if (field.mask === "phone" && digits.length < 10) {
          fieldErrors[field.name] = "Informe telefone com DDD.";
        }
        if (field.mask === "accessKey" && digits.length !== 44) {
          fieldErrors[field.name] = "Informe a chave de acesso com 44 digitos.";
        }
      });

    const messages = Object.values(fieldErrors);
    if (messages.length) {
      return {
        formError: messages.length === 1 ? messages[0] : "Revise os campos destacados antes de salvar.",
        fieldErrors
      };
    }

    return { formError: "", fieldErrors: {} };
  }

  function normalizeFormSnapshot(value) {
    return JSON.stringify(value, Object.keys(value || {}).sort());
  }

  const modalHasUnsavedChanges = Boolean(modal.section) &&
    normalizeFormSnapshot(formData) !== normalizeFormSnapshot(initialModalFormData);

  async function saveCurrentItem(event) {
    event.preventDefault();
    if (!modal.section || modal.mode === "view" || savingModal) {
      return;
    }

    setBanner("");
    setError("");

    try {
      const validation = validateModalForm(modal.section, formData);
      if (validation.formError) {
        setModalFieldErrors(validation.fieldErrors);
        setError(validation.formError);
        return;
      }

      setModalFieldErrors({});
      setSavingModal(true);
      const payload = normalizePayload(modal.section, formData, modal.documentType);
      const basePath = entityPath[modal.section];
      if (modal.item?.id) {
        await api.put(`${basePath}/${modal.item.id}`, payload);
        setBanner("Registro atualizado com sucesso.");
      } else {
        await api.post(basePath, payload);
        setBanner("Registro criado com sucesso.");
      }
      closeModal();
      await loadAllData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingModal(false);
    }
  }

  function getDeleteLabel(item) {
    return item.name || item.title || item.invoice_number || item.document_number || item.request_number || item.original_name || "registro";
  }

  async function performDelete(section, item, elevation = null) {
    await api.delete(`${entityPath[section]}/${item.id}`, elevation);
    setBanner("Registro removido com sucesso.");
    await loadAllData();
  }

  async function removeItem(section, item) {
    const label = getDeleteLabel(item);
    if (user.role === "operator") {
      setDeleteElevation({
        open: true,
        section,
        item,
        email: "",
        password: "",
        loading: false
      });
      setBanner("");
      setError("");
      return;
    }

    if (!window.confirm(`Excluir "${label}"?`)) {
      return;
    }

    setBanner("");
    setError("");
    try {
      await performDelete(section, item);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  function closeDeleteElevation() {
    if (deleteElevation.loading) {
      return;
    }
    setDeleteElevation({
      open: false,
      section: null,
      item: null,
      email: "",
      password: "",
      loading: false
    });
  }

  async function submitDeleteElevation(event) {
    event.preventDefault();
    if (!deleteElevation.section || !deleteElevation.item) {
      return;
    }

    if (!window.confirm(`Excluir "${getDeleteLabel(deleteElevation.item)}" com elevacao administrativa?`)) {
      return;
    }

    setDeleteElevation((current) => ({ ...current, loading: true }));
    setBanner("");
    setError("");
    try {
      await performDelete(deleteElevation.section, deleteElevation.item, {
        email: deleteElevation.email,
        password: deleteElevation.password
      });
      closeDeleteElevation();
    } catch (deleteError) {
      setDeleteElevation((current) => ({ ...current, loading: false }));
      setError(deleteError.message);
    }
  }

  async function handleFileUpload(event) {
    event.preventDefault();
    if (!uploadForm.file) {
      setError("Selecione um arquivo antes de enviar.");
      return;
    }

    setUploadingFile(true);
    setBanner("");
    setError("");

    try {
      const form = new FormData();
      form.append("upload", uploadForm.file);
      form.append("category", uploadForm.category);
      form.append("notes", uploadForm.notes);
      form.append("vendor_id", uploadForm.vendor_id);
      form.append("unit_id", uploadForm.unit_id);
      form.append("contract_id", uploadForm.contract_id);
      form.append("invoice_id", uploadForm.invoice_id);
      form.append("regulatory_document_id", uploadForm.regulatory_document_id);

      await api.postForm("/api/files/upload", form);
      setUploadForm({
        file: null,
        import_format: "auto",
        category: "",
        notes: "",
        vendor_id: "",
        unit_id: "",
        contract_id: "",
        invoice_id: "",
        regulatory_document_id: ""
      });
      const fileInput = document.getElementById("file-upload-input");
      if (fileInput) {
        fileInput.value = "";
      }
      setBanner("Arquivo enviado com sucesso.");
      await loadAllData();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleDocumentAttachmentUpload() {
    if (!modal.item?.id) {
      setError("Salve o registro antes de anexar arquivos.");
      return;
    }

    if (!documentAttachments.form.file) {
      setError("Selecione um arquivo para anexar ao processo.");
      return;
    }

    setDocumentAttachments((current) => ({ ...current, uploading: true }));
    setBanner("");
    setError("");

    try {
      const form = new FormData();
      form.append("upload", documentAttachments.form.file);
      form.append("category", documentAttachments.form.category);
      form.append("notes", documentAttachments.form.notes);
      form.append("vendor_id", String(formData.vendor_id || modal.item.vendor_id || ""));
      form.append("unit_id", String(formData.unit_id || modal.item.unit_id || ""));
      form.append("contract_id", String(formData.contract_id || modal.item.contract_id || ""));
      if (modal.section === "contracts") {
        form.set("contract_id", String(modal.item.id));
      } else if (modal.section === "documents") {
        form.append("regulatory_document_id", String(modal.item.id));
      } else if (modal.section === "vendors") {
        form.set("vendor_id", String(modal.item.id));
      } else if (modal.section === "units") {
        form.set("unit_id", String(modal.item.id));
      } else if (modal.section === "invoices") {
        form.append("invoice_id", String(modal.item.id));
        form.set("vendor_id", String(modal.item.vendor_id || formData.vendor_id || ""));
        form.set("unit_id", String(modal.item.unit_id || formData.unit_id || ""));
        form.set("contract_id", String(modal.item.contract_id || formData.contract_id || ""));
      }

      await api.postForm("/api/files/upload", form);
      setDocumentAttachments((current) => ({
        ...current,
        uploading: false,
          form: {
            file: null,
            import_format: "auto",
            category: "",
            notes: ""
        }
      }));
      const fileInput = document.getElementById("document-attachment-input");
      if (fileInput) {
        fileInput.value = "";
      }
      setBanner("Anexo enviado com sucesso.");
      if (modal.section === "documents" || modal.section === "contracts") {
        await Promise.all([loadAllData(), loadModalAttachments(modal.section, modal.item.id)]);
      } else {
        await loadAllData();
      }
    } catch (uploadError) {
      setDocumentAttachments((current) => ({ ...current, uploading: false }));
      setError(uploadError.message);
    }
  }

  async function handleDownloadFile(file) {
    try {
      const { blob, fileName } = await api.download(`/api/files/${file.id}/download`);
      downloadBlobFile(blob, fileName);
      if (modal.section === "documents" && modal.item?.id && file.regulatory_document_id === modal.item.id) {
        await loadModalAttachments("documents", modal.item.id);
      }
      if (modal.section === "contracts" && modal.item?.id && file.contract_id === modal.item.id) {
        await loadModalAttachments("contracts", modal.item.id);
      }
    } catch (downloadError) {
      setError(downloadError.message);
    }
  }

  async function loadOperationsData() {
    if (!(user?.role === "adm" || user?.role === "superadm")) {
      return;
    }

    setBanner("");
    setError("");

    try {
      const [systemStatus, systemLogs, auditLogs] = await Promise.all([
        api.get("/api/system/status"),
        api.get("/api/system/logs?lines=120"),
        api.get("/api/system/audit-logs?limit=120")
      ]);

      setOperations({
        backup: systemStatus.backup,
        logs: {
          ...systemLogs,
          exists: systemStatus.logs?.exists ?? false,
          log_path: systemLogs?.log_path || systemStatus.logs?.log_path || ""
        },
        audit: auditLogs || defaultOperations.audit
      });
      setBanner("Painel operacional atualizado.");
    } catch (operationError) {
      setError(operationError.message);
    }
  }

  async function handleManualBackup() {
    setBanner("");
    setError("");

    try {
      const response = await api.post("/api/system/backups/run", {});
      setOperations((current) => ({
        ...current,
        backup: response.backup || current.backup
      }));
      setBanner(response.message || "Backup manual executado com sucesso.");
      await loadOperationsData();
    } catch (backupError) {
      setError(backupError.message);
    }
  }

  function updateReportFilter(name, value) {
    setReportFilters((current) => ({ ...current, [name]: value }));
  }

  function clearReportFilters() {
    setReportFilters({
      report_id: "",
      vendor_id: "",
      unit_id: "",
      status: "",
      date_from: "",
      date_to: ""
    });
  }

  function handleExportReport(report, format) {
    setBanner("");
    setError("");

    try {
      exportRowsByFormat({
        fileBase: report.fileBase,
        title: report.title,
        rows: report.rows,
        columns: report.columns,
        format,
        filterSummary: reportFilterSummary
      });
      setBanner(`Relatorio "${report.title}" extraido com sucesso em ${format.toUpperCase()}.`);
    } catch (reportError) {
      setError(reportError.message || "Nao foi possivel extrair o relatorio.");
    }
  }

  function handleExportCurrentRows() {
    if (!currentRows.length) {
      setError("Nao ha registros para extrair nesta tabela.");
      return;
    }

    setBanner("");
    setError("");

    try {
      exportRowsByFormat({
        fileBase: `repofiscal-${activeDataKey}`,
        title: sectionTitle,
        rows: currentRows,
        columns: columnsByView[activeDataKey] || [],
        format: tableExportFormat,
        filterSummary: activeListFilterCount ? ["Filtros aplicados na tabela"] : []
      });
      setBanner(`Tabela "${sectionTitle}" extraida com sucesso em ${tableExportFormat.toUpperCase()}.`);
    } catch (exportError) {
      setError(exportError.message || "Nao foi possivel extrair a tabela.");
    }
  }

  function getFormSectionFromDataKey(dataKey) {
    if (dataKey === "avcb" || dataKey === "clcb") {
      return "documents";
    }
    return dataKey;
  }

  function getExportTitleFromDataKey(dataKey) {
    if (dataKey === "avcb" || dataKey === "clcb") {
      return dataKey.toUpperCase();
    }
    return tabs.find((tab) => tab.id === dataKey)?.label || "Registro";
  }

  function getRecordDisplayName(record) {
    if (!record) {
      return "Nenhuma linha selecionada";
    }
    return (
      record.name ||
      record.title ||
      record.invoice_number ||
      record.document_number ||
      record.request_number ||
      record.original_name ||
      record.email ||
      `Registro ${record.id}`
    );
  }

  function rememberSelectedRecord(dataKey, item) {
    setSelectedRecords((current) => ({
      ...current,
      [dataKey]: item
    }));
  }

  function getDisplayValueForField(field, record) {
    const value = record[field.name];
    if (field.type === "select") {
      return field.options?.find((option) => String(option.value) === String(value))?.label || value || "";
    }
    if (field.type === "checkbox") {
      return value ? "Sim" : "Nao";
    }
    if (field.type === "currency") {
      return formatCurrency(parseCurrencyValue(value));
    }
    if (field.type === "date") {
      return value ? formatDate(value) : "";
    }
    return value ?? "";
  }

  function buildFormExportPayload(section, record, fallbackColumns = []) {
    if (!section || !record) {
      return { columns: [], rows: [], fields: [] };
    }

    const fields = fieldsBySection[section] || [];
    if (!fields.length) {
      const columns = normalizeExportColumns(fallbackColumns);
      const row = {};
      columns.forEach((column) => {
        row[column.key] = record[column.key] ?? "";
      });
      return {
        columns,
        rows: [row],
        fields: columns.map((column) => ({
          label: column.label,
          value: row[column.key],
          fullWidth: false,
          type: "text"
        }))
      };
    }

    const columns = fields.map((field) => ({ key: field.name, label: field.label }));
    const row = {};
    const printableFields = [];

    fields.forEach((field) => {
      const value = getDisplayValueForField(field, record);
      row[field.name] = value;
      printableFields.push({
        label: field.label,
        value,
        fullWidth: Boolean(field.fullWidth),
        type: field.type || "text"
      });
    });

    return { columns, rows: [row], fields: printableFields };
  }

  function getModalExportPayload() {
    if (!modal.section) {
      return { columns: [], rows: [] };
    }

    return buildFormExportPayload(modal.section, formData, columnsByView[modal.section] || []);
  }

  function handleExportModalRecord(format) {
    if (!modal.section) {
      return;
    }

    setBanner("");
    setError("");

    try {
      const payload = getModalExportPayload();
      const title = `${modalTitleMap[modal.section] || "Registro"} ${modal.item?.id || ""}`.trim();
      if (format === "pdf") {
        printForm(title, payload.fields, []);
      } else {
        exportRowsByFormat({
          fileBase: `repofiscal-${modal.section}-${modal.item?.id || "novo"}`,
          title,
          rows: payload.rows,
          columns: payload.columns,
          format,
          filterSummary: []
        });
      }
      setBanner(`Registro extraido com sucesso em ${format.toUpperCase()}.`);
    } catch (exportError) {
      setError(exportError.message || "Nao foi possivel extrair o registro.");
    }
  }

  function handleExportSelectedRecord() {
    const selectedRecord = selectedRecords[activeDataKey];
    if (!selectedRecord) {
      setError("Clique em uma linha da tabela antes de extrair o formulario.");
      setExtractDialogOpen(false);
      return;
    }

    const stillVisible = currentRows.some((row) => String(row.id) === String(selectedRecord.id));
    if (!stillVisible) {
      setError("A linha selecionada nao esta visivel com os filtros atuais. Clique novamente em uma linha da tabela.");
      setExtractDialogOpen(false);
      return;
    }

    const formSection = getFormSectionFromDataKey(activeDataKey);
    const payload = buildFormExportPayload(formSection, selectedRecord, columnsByView[activeDataKey] || []);

    if (!payload.rows.length) {
      setError("Esta pagina nao possui formulario para extrair.");
      setExtractDialogOpen(false);
      return;
    }

    setBanner("");
    setError("");

    try {
      const title = `${getExportTitleFromDataKey(activeDataKey)} ${selectedRecord.id}`.trim();
      if (tableExportFormat === "pdf") {
        printForm(title, payload.fields, ["Formulario da linha selecionada"]);
      } else {
        exportRowsByFormat({
          fileBase: `repofiscal-${activeDataKey}-formulario-${selectedRecord.id}`,
          title,
          rows: payload.rows,
          columns: payload.columns,
          format: tableExportFormat,
          filterSummary: ["Formulario da linha selecionada"]
        });
      }
      setBanner(`Formulario "${getExportTitleFromDataKey(activeDataKey)}" extraido com sucesso em ${tableExportFormat.toUpperCase()}.`);
    } catch (exportError) {
      setError(exportError.message || "Nao foi possivel extrair o formulario.");
    } finally {
      setExtractDialogOpen(false);
    }
  }

  function handleTopExtractChoice(type) {
    if (type === "list") {
      setExtractDialogOpen(false);
      handleExportCurrentRows();
      return;
    }
    handleExportSelectedRecord();
  }

  function currentCreateAction() {
    if (activeTab === "users") {
      return user.role === "superadm" ? () => openModal("users") : null;
    }
    if (activeTab === "files" || activeTab === "reports" || activeTab === "operations") {
      return null;
    }
    if (activeTab === "vendors") {
      return () => openModal("vendors");
    }
    if (activeTab === "avcb" || activeTab === "clcb") {
      return () => openModal("documents", null, { documentType: activeTab.toUpperCase() });
    }
    return () => openModal(activeTab);
  }

  function currentEditAction(item) {
    rememberSelectedRecord(activeDataKey, item);
    if (activeTab === "users") {
      openModal("users", item);
      return;
    }
    if (activeTab === "vendors") {
      openModal("vendors", item);
      return;
    }
    if (activeTab === "avcb" || activeTab === "clcb") {
      openModal("documents", item, { documentType: item.document_type });
      return;
    }
    openModal(activeTab, item);
  }

  function currentViewAction(item) {
    if (activeTab === "files" || activeTab === "reports" || activeTab === "operations") {
      return;
    }
    rememberSelectedRecord(activeDataKey, item);
    if (activeTab === "users") {
      openModal("users", item, { mode: "view" });
      return;
    }
    if (activeTab === "vendors") {
      openModal("vendors", item, { mode: "view" });
      return;
    }
    if (activeTab === "avcb" || activeTab === "clcb") {
      openModal("documents", item, { documentType: item.document_type, mode: "view" });
      return;
    }
    openModal(activeTab, item, { mode: "view" });
  }

  function currentDeleteAction(item) {
    if (activeTab === "users") {
      removeItem("users", item);
      return;
    }
    if (activeTab === "files") {
      removeItem("files", item);
      return;
    }
    if (activeTab === "vendors") {
      removeItem("vendors", item);
      return;
    }
    if (activeTab === "avcb" || activeTab === "clcb") {
      removeItem("documents", item);
      return;
    }
    removeItem(activeTab, item);
  }

  function getRowClassName(row) {
    if (activeTab === "contracts") {
      return dueRowClass(row.end_date);
    }
    if (activeTab === "invoices") {
      return dueRowClass(row.due_date, getInvoiceDueMeta(row));
    }
    if (activeTab === "avcb" || activeTab === "clcb") {
      return dueRowClass(row.expiry_date);
    }
    return "";
  }

  const columnsByView = {
    users: [
      { key: "name", label: "Usuario" },
      { key: "email", label: "E-mail" },
      {
        key: "role",
        label: "Perfil",
        render: (value) => (
          <span className={`status-badge status-badge--${value === "superadm" ? "danger" : value === "adm" ? "info" : "warning"}`}>
            {value === "superadm" ? "Superadm" : value === "adm" ? "Adm" : "Operador"}
          </span>
        )
      },
      { key: "active", label: "Status", render: (value) => statusBadge(value ? "active" : "inactive") },
      { key: "created_at", label: "Criado em", render: (value) => formatDateTime(value) }
    ],
    files: [
      { key: "original_name", label: "Arquivo" },
      { key: "extension", label: "Tipo" },
      { key: "category", label: "Categoria" },
      { key: "uploaded_by_name", label: "Enviado por" },
      { key: "created_at", label: "Data", render: (value) => formatDateTime(value) },
      { key: "size_bytes", label: "Tamanho", render: (value) => formatFileSize(value) },
      {
        key: "download",
        label: "Baixar",
        render: (_, row) => (
          <button type="button" className="ghost-button" onClick={() => handleDownloadFile(row)}>
            Download
          </button>
        )
      }
    ],
    vendors: [
      { key: "name", label: "Fornecedor" },
      { key: "kind", label: "Tipo", render: (value) => typeLabels[value] || value },
      { key: "document", label: "Documento" },
      { key: "contact_name", label: "Contato" },
      { key: "status", label: "Status", render: (value) => statusBadge(value) }
    ],
    units: [
      { key: "code", label: "Codigo" },
      { key: "name", label: "Unidade" },
      { key: "city", label: "Cidade" },
      { key: "state", label: "UF" },
      { key: "active", label: "Situacao", render: (value) => statusBadge(value ? "active" : "inactive") }
    ],
    contracts: [
      { key: "title", label: "Orcamento" },
      { key: "compliance_type", label: "Tipo" },
      { key: "vendor_name", label: "Fornecedor" },
      { key: "unit_name", label: "Unidade" },
      { key: "end_date", label: "Vencimento", render: (value) => dueCell(value) },
      { key: "value", label: "Valor", render: (value) => formatCurrency(value) },
      { key: "status", label: "Status", render: (value) => statusBadge(value) }
    ],
    invoices: [
      { key: "invoice_number", label: "NF" },
      { key: "vendor_name", label: "Fornecedor" },
      { key: "unit_name", label: "Unidade" },
      { key: "due_date", label: "Vencimento", render: (value, row) => dueCell(value, getInvoiceDueMeta(row)) },
      { key: "total_amount", label: "Valor", render: (value) => formatCurrency(value) },
      { key: "status", label: "Status", render: (value) => statusBadge(value) }
    ],
    avcb: [
      { key: "request_number", label: "Pedido" },
      { key: "document_number", label: "Documento" },
      { key: "unit_name", label: "Unidade" },
      { key: "vendor_name", label: "Fornecedor" },
      { key: "expiry_date", label: "Vencimento", render: (value) => dueCell(value) },
      { key: "status", label: "Status", render: (value) => statusBadge(value) }
    ],
    clcb: [
      { key: "request_number", label: "Pedido" },
      { key: "document_number", label: "Documento" },
      { key: "unit_name", label: "Unidade" },
      { key: "vendor_name", label: "Fornecedor" },
      { key: "expiry_date", label: "Vencimento", render: (value) => dueCell(value) },
      { key: "status", label: "Status", render: (value) => statusBadge(value) }
    ]
  };

  if (authLoading) {
    return <div className="loading-screen">Validando sessao...</div>;
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} loading={authLoading} error={loginError} theme={theme} onThemeChange={setTheme} />;
  }

  const modalTitleMap = {
    users: "Usuario",
    vendors: "Fornecedor",
    units: "Unidade",
    contracts: "Orcamento",
    invoices: "Nota fiscal",
    documents: modal.documentType || "Documento"
  };
  const modalReadOnly = modal.mode === "view";
  const modalActionTools = modal.section
    ? {
        enabled: modalReadOnly,
        format: modalExportFormat,
        formatOptions: exportFormatOptions,
        onFormatChange: setModalExportFormat,
        onExtract: handleExportModalRecord
      }
    : null;

  const attachmentEnabledSections = ["vendors", "units", "contracts", "invoices", "documents"];
  const modalAttachments =
    attachmentEnabledSections.includes(modal.section)
      ? {
          enabled: true,
          section: modal.section,
          documentId: modal.item?.id || null,
          files: modal.section === "documents" || modal.section === "contracts" ? documentAttachments.files : modalRelatedFiles,
          invoices: documentAttachments.invoices,
          history: documentAttachments.history,
          form: documentAttachments.form,
          uploading: documentAttachments.uploading,
          loading: documentAttachments.loading,
          title: modal.section === "contracts" ? "Repositorio do orcamento" : modal.section === "documents" ? "Solicitacao documental" : "Repositorio de anexos",
          saveMessage: modal.section === "contracts" ? "Salve o orcamento primeiro para liberar anexos, notas e historico." : "Salve o registro primeiro para liberar anexos.",
          uploadLabel: modal.section === "contracts" ? "Importar nota/documento" : "Importar documento",
          emptyFilesLabel: modal.section === "contracts" ? "Nenhum anexo vinculado a este orcamento." : "Nenhum anexo vinculado a este registro.",
          importFormatOptions,
          getImportAccept,
          onChange: updateDocumentAttachmentField,
          onUpload: handleDocumentAttachmentUpload,
          onDownload: handleDownloadFile,
          formatDateTime
        }
      : null;

  const searchPlaceholderMap = {
    operations: "Buscar operacoes...",
    reports: "Buscar relatorios...",
    users: "Buscar usuarios...",
    files: "Buscar arquivos...",
    vendors: "Buscar fornecedores...",
    units: "Buscar unidades...",
    contracts: "Buscar orcamentos...",
    invoices: "Buscar notas fiscais...",
    avcb: "Buscar pedidos ou documentos AVCB...",
    clcb: "Buscar pedidos ou documentos CLCB..."
  };

  const showListFilterPanel =
    activeTab !== "dashboard" &&
    activeTab !== "reports" &&
    activeTab !== "operations" &&
    Boolean(listFilterPanels[activeDataKey]);

  return (
    <div className={`app-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <img className="brand-block__logo" src={repofiscalLogo} alt="REPOFISCAL" />
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Abrir menu" : "Recolher menu"}
            title={sidebarCollapsed ? "Abrir menu" : "Recolher menu"}
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
        </div>

        <nav className="nav-tabs" aria-label="Navegacao principal">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab ${activeTab === tab.id ? "nav-tab--active" : ""}`}
              onClick={() => startTransition(() => setActiveTab(tab.id))}
              title={tab.label}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <ThemeSelector theme={theme} onChange={setTheme} />
          <button type="button" className="secondary-button secondary-button--dark" onClick={handleUserSwitch}>
            Deslogar
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Painel fiscal</span>
            <h2>{sectionTitle}</h2>
          </div>

          {activeTab !== "dashboard" && activeTab !== "reports" && activeTab !== "operations" ? (
            <div className="topbar-actions">
              {showListFilterPanel ? (
                <div className="topbar-filter-strip">
                  {currentFilterFields.map((field) =>
                    field.filterType === "date-range" ? (
                      <div key={field.name} className="field topbar-filter-field topbar-filter-field--range">
                        <span>{field.label}</span>
                        <div className="topbar-filter-range">
                          <input
                            type="date"
                            value={currentListFilters[`${field.name}_from`] || ""}
                            onChange={(event) => updateListFilter(activeDataKey, `${field.name}_from`, event.target.value)}
                          />
                          <input
                            type="date"
                            value={currentListFilters[`${field.name}_to`] || ""}
                            onChange={(event) => updateListFilter(activeDataKey, `${field.name}_to`, event.target.value)}
                          />
                        </div>
                      </div>
                    ) : field.filterType === "select" ? (
                      <label key={field.name} className="field topbar-filter-field" htmlFor={`filter-${activeDataKey}-${field.name}`}>
                        <span>{field.label}</span>
                        <select
                          id={`filter-${activeDataKey}-${field.name}`}
                          value={currentListFilters[field.name] || ""}
                          onChange={(event) => updateListFilter(activeDataKey, field.name, event.target.value)}
                        >
                          <option value="">Todos</option>
                          {(field.options || []).map((option) => (
                            <option key={`${field.name}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label key={field.name} className="field topbar-filter-field" htmlFor={`filter-${activeDataKey}-${field.name}`}>
                        <span>{field.label}</span>
                        <input
                          id={`filter-${activeDataKey}-${field.name}`}
                          type={field.filterType === "number" ? "number" : "text"}
                          value={currentListFilters[field.name] || ""}
                          onChange={(event) => updateListFilter(activeDataKey, field.name, event.target.value)}
                        />
                      </label>
                    )
                  )}
                  <button type="button" className="secondary-button topbar-filter-clear" onClick={() => clearListFilters(activeDataKey)}>
                    Limpar
                  </button>
                </div>
              ) : null}
              <input
                className="search-input"
                type="search"
                placeholder={searchPlaceholderMap[activeDataKey]}
                value={search[activeDataKey]}
                onChange={(event) => setSearch((current) => ({ ...current, [activeDataKey]: event.target.value }))}
              />
              <button
                type="button"
                className="secondary-button topbar-filter-button"
                onClick={() => toggleListFilterPanel(activeDataKey)}
              >
                {showListFilterPanel ? "Ocultar filtros" : `Filtros${activeListFilterCount ? ` (${activeListFilterCount})` : ""}`}
              </button>
              <button type="button" className="secondary-button topbar-filter-clear" onClick={clearCurrentFilters}>
                Limpar filtros
              </button>
              <div className="topbar-export-group">
                <select
                  aria-label="Tipo de extracao da tabela"
                  value={tableExportFormat}
                  onChange={(event) => setTableExportFormat(event.target.value)}
                >
                  {exportFormatOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button type="button" className="secondary-button" onClick={() => setExtractDialogOpen(true)}>
                  Extrair
                </button>
              </div>
              {currentCreateAction() ? (
                <button type="button" className="primary-button topbar-create-button" onClick={currentCreateAction()}>
                  Novo registro
                </button>
              ) : null}
            </div>
          ) : (
            <div className="topbar-actions topbar-actions--compact">
              <button type="button" className="secondary-button" onClick={loadAllData}>
                Atualizar dados
              </button>
              <button type="button" className="secondary-button topbar-filter-clear" onClick={clearCurrentFilters}>
                Limpar filtros
              </button>
            </div>
          )}
        </header>

        {banner ? <div className="banner banner--success">{banner}</div> : null}
        {error ? <div className="banner banner--error">{error}</div> : null}

        {activeTab === "dashboard" ? (
          <>
            <section className="card-grid card-grid--six">
              <StatCard title="Fornecedores" value={dashboard.counts.vendors} tone="info" detail="Servico e produto" onClick={() => openDashboardList("vendors", { vendorView: "vendors" })} />
              <StatCard title="Usuarios ativos" value={dashboard.counts.active_users} tone="info" detail="Acessos liberados" onClick={() => openDashboardList("users", { filters: { active: "true" } })} />
              <StatCard title="Arquivos" value={dashboard.counts.files} tone="info" detail="PDF, CSV, XML e Excel" onClick={() => openDashboardList("files")} />
              <StatCard title="Orcamentos ativos" value={dashboard.counts.active_contracts} tone="warning" detail="Com monitoramento" onClick={() => openDashboardList("contracts", { filters: { status: "active" } })} />
              <StatCard title="Notas pendentes" value={dashboard.counts.pending_invoices} tone="danger" detail="Pendente ou analise" onClick={() => openDashboardList("invoices", { filters: { status: "pending" } })} />
            </section>

            <section className="card-grid card-grid--single">
              <StatCard title="AVCB alerta" value={dashboard.counts.avcb_attention} tone="warning" detail="Ate 60 dias ou vencido" onClick={() => openDashboardList("avcb")} />
              <StatCard title="CLCB alerta" value={dashboard.counts.clcb_attention} tone="warning" detail="Ate 60 dias ou vencido" onClick={() => openDashboardList("clcb")} />
              <StatCard title="Notas pagas" value={formatCurrency(dashboard.counts.invoices_paid_total)} tone="success" detail="Total financeiro quitado" onClick={() => openDashboardList("invoices", { filters: { status: "paid" } })} />
            </section>

            <section className="panel-grid panel-grid--triple">
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Orcamentos</span>
                    <h3>Proximos vencimentos</h3>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: "title", label: "Orcamento" },
                    { key: "vendor_name", label: "Fornecedor" },
                    { key: "unit_name", label: "Unidade" },
                    { key: "end_date", label: "Vencimento", render: (value) => dueCell(value) }
                  ]}
                  rows={dashboard.upcoming_contracts}
                  emptyMessage="Nenhum orcamento com vencimento registrado."
                  getRowClassName={(row) => dueRowClass(row.end_date)}
                />
              </section>

              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Notas</span>
                    <h3>Financeiro a acompanhar</h3>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: "invoice_number", label: "NF" },
                    { key: "vendor_name", label: "Fornecedor" },
                    { key: "unit_name", label: "Unidade" },
                    { key: "due_date", label: "Vencimento", render: (value, row) => dueCell(value, getInvoiceDueMeta(row)) }
                  ]}
                  rows={dashboard.pending_invoices}
                  emptyMessage="Nenhuma nota pendente no momento."
                  getRowClassName={(row) => dueRowClass(row.due_date, getInvoiceDueMeta(row))}
                />
              </section>

              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Documentos</span>
                    <h3>AVCB e CLCB</h3>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: "document_type", label: "Tipo" },
                    { key: "request_number", label: "Pedido" },
                    { key: "unit_name", label: "Unidade" },
                    { key: "expiry_date", label: "Vencimento", render: (value) => dueCell(value) }
                  ]}
                  rows={dashboard.regulatory_alerts}
                  emptyMessage="Nenhum documento regulatorio com data registrada."
                  getRowClassName={(row) => dueRowClass(row.expiry_date)}
                />
              </section>

              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Arquivos</span>
                    <h3>Uploads recentes</h3>
                  </div>
                </div>
                <DataTable
                  columns={[
                    { key: "original_name", label: "Arquivo" },
                    { key: "extension", label: "Tipo" },
                    { key: "uploaded_by_name", label: "Usuario" },
                    { key: "created_at", label: "Data", render: (value) => formatDateTime(value) }
                  ]}
                  rows={dashboard.recent_files}
                  emptyMessage="Nenhum arquivo enviado ainda."
                />
              </section>
            </section>
          </>
        ) : activeTab === "operations" ? (
          <div className="stack-grid">
            <section className="card-grid operations-summary-grid">
              <StatCard title="Backup zip" value={operations.backup.archive_exists ? "Ativo" : "Pendente"} tone={operations.backup.archive_exists ? "success" : "warning"} detail="Arquivo unico em BKP" />
              <StatCard title="Snapshots" value={operations.backup.snapshots_count} tone="info" detail={`Retencao ${operations.backup.retention_days} dias`} />
              <StatCard title="Ultimo backup" value={operations.backup.last_backup_at ? formatDateTime(operations.backup.last_backup_at) : "-"} tone="neutral" detail="Execucao mais recente" />
              <StatCard title="Tamanho do zip" value={formatFileSize(operations.backup.archive_size_bytes)} tone="neutral" detail="Arquivo consolidado" />
            </section>

            <section className="operations-grid">
              <section className="panel operations-panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Backup</span>
                    <h3>Rotina automatica</h3>
                  </div>
                  <div className="panel-header-actions">
                    <button type="button" className="secondary-button" onClick={loadOperationsData}>
                      Atualizar painel
                    </button>
                    <button type="button" className="primary-button" onClick={handleManualBackup}>
                      Executar backup agora
                    </button>
                  </div>
                </div>

                <div className="report-metrics operations-metrics">
                  <article className="report-metric">
                    <span>Arquivo</span>
                    <strong>{operations.backup.archive_exists ? "Disponivel" : "Nao criado"}</strong>
                  </article>
                  <article className="report-metric">
                    <span>Caminho</span>
                    <strong>{operations.backup.archive_path || "-"}</strong>
                  </article>
                  <article className="report-metric">
                    <span>Ultimo snapshot</span>
                    <strong>{formatSnapshotKey(operations.backup.last_backup_snapshot)}</strong>
                  </article>
                  <article className="report-metric">
                    <span>Intervalo de verificacao</span>
                    <strong>{operations.backup.check_interval_seconds}s</strong>
                  </article>
                  <article className="report-metric">
                    <span>Snapshot mais antigo</span>
                    <strong>{formatSnapshotKey(operations.backup.oldest_snapshot)}</strong>
                  </article>
                  <article className="report-metric">
                    <span>Snapshot mais recente</span>
                    <strong>{formatSnapshotKey(operations.backup.newest_snapshot)}</strong>
                  </article>
                </div>
              </section>

              <section className="panel operations-panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Logs</span>
                    <h3>Monitoramento recente</h3>
                  </div>
                  <span className="panel__meta">{operations.logs.lines.length} linha(s) carregada(s)</span>
                </div>

                <div className="log-viewer">
                  {operations.logs.lines.length ? (
                    operations.logs.lines.map((line, index) => (
                      <div key={`log-${index}`} className="log-viewer__line">
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">Nenhum log disponivel.</div>
                  )}
                </div>
              </section>
            </section>

            <section className="panel operations-audit-panel">
              <div className="panel__header">
                <div>
                  <span className="eyebrow">Auditoria</span>
                  <h3>Historico de acoes</h3>
                </div>
                <span className="panel__meta">{operations.audit.entries.length} evento(s) recente(s)</span>
              </div>

              <DataTable
                columns={[
                  { key: "created_at", label: "Data", render: (value) => formatDateTime(value) },
                  { key: "user_name", label: "Usuario", render: (value, row) => value || row.user_email || "Sistema" },
                  { key: "action", label: "Acao" },
                  { key: "entity_type", label: "Entidade" },
                  { key: "description", label: "Descricao" }
                ]}
                rows={operations.audit.entries}
                emptyMessage="Nenhum evento de auditoria encontrado."
              />
            </section>
          </div>
        ) : activeTab === "reports" ? (
          <div className="stack-grid">
            <section className="card-grid report-summary-grid">
              <StatCard title="Tipos de relatorio" value={visibleReports.length} tone="info" detail="Extracao por modulo" />
              <StatCard title="Registros-base" value={Object.values(entities).reduce((sum, list) => sum + list.length, 0)} tone="neutral" detail="Dados carregados" />
              <StatCard title="Linhas exibidas" value={visibleReports.reduce((sum, report) => sum + report.rows.length, 0)} tone="warning" detail="Resultado filtrado" />
              <StatCard title="Filtros ativos" value={reportFilterSummary.length} tone="success" detail="Periodo, unidade, fornecedor e status" />
            </section>

            <section className="panel report-catalog-panel">
              <div className="panel__header">
                <div>
                  <span className="eyebrow">Extracao</span>
                  <h3>Central de relatorios</h3>
                </div>
                <span className="panel__meta">CSV, XML, TXT, Excel e PDF/impressao</span>
              </div>

              <div className="report-filter-grid">
                <label className="field" htmlFor="report-filter-report">
                  <span>Relatorio</span>
                  <select id="report-filter-report" value={reportFilters.report_id} onChange={(event) => updateReportFilter("report_id", event.target.value)}>
                    <option value="">Todos</option>
                    {reportDefinitions.map((report) => (
                      <option key={report.id} value={report.id}>{report.title}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="report-filter-vendor">
                  <span>Fornecedor</span>
                  <select id="report-filter-vendor" value={reportFilters.vendor_id} onChange={(event) => updateReportFilter("vendor_id", event.target.value)}>
                    <option value="">Todos</option>
                    {selectOptions.vendorOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="report-filter-unit">
                  <span>Unidade</span>
                  <select id="report-filter-unit" value={reportFilters.unit_id} onChange={(event) => updateReportFilter("unit_id", event.target.value)}>
                    <option value="">Todas</option>
                    {selectOptions.unitOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="report-filter-status">
                  <span>Status</span>
                  <select id="report-filter-status" value={reportFilters.status} onChange={(event) => updateReportFilter("status", event.target.value)}>
                    <option value="">Todos</option>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="signed">Assinado</option>
                    <option value="expiring">A vencer</option>
                    <option value="expired">Vencido</option>
                    <option value="pending">Pendente</option>
                    <option value="review">Em analise</option>
                    <option value="paid">Pago</option>
                    <option value="canceled">Cancelado</option>
                    <option value="in_progress">Em tramite</option>
                    <option value="issued">Emitido</option>
                    <option value="renewed">Renovado</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </label>
                <label className="field" htmlFor="report-filter-date-from">
                  <span>Data inicial</span>
                  <input id="report-filter-date-from" type="date" value={reportFilters.date_from} onChange={(event) => updateReportFilter("date_from", event.target.value)} />
                </label>
                <label className="field" htmlFor="report-filter-date-to">
                  <span>Data final</span>
                  <input id="report-filter-date-to" type="date" value={reportFilters.date_to} onChange={(event) => updateReportFilter("date_to", event.target.value)} />
                </label>
                <div className="report-filter-actions">
                  <button type="button" className="secondary-button" onClick={clearReportFilters}>
                    Limpar filtros
                  </button>
                </div>
              </div>

              {reportFilterSummary.length ? (
                <div className="report-filter-summary">
                  {reportFilterSummary.join(" | ")}
                </div>
              ) : null}

              <div className="report-catalog">
                {visibleReports.length ? visibleReports.map((report) => (
                  <article key={report.id} className="report-card">
                    <div className="report-card__header">
                      <div>
                        <span className="eyebrow">Relatorio</span>
                        <h3>{report.title}</h3>
                      </div>
                      <span className="status-badge status-badge--info">{report.rows.length} linha(s)</span>
                    </div>

                    <p className="report-card__description">{report.description}</p>

                    <div className="report-metrics">
                      {report.metrics.map((metric) => (
                        <article key={`${report.id}-${metric.label}`} className="report-metric">
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                        </article>
                      ))}
                    </div>

                    <ul className="report-card__list">
                      {report.highlights.map((item) => (
                        <li key={`${report.id}-${item}`}>{item}</li>
                      ))}
                    </ul>

                    <div className="report-card__actions">
                      <label className="field report-format-field" htmlFor={`report-format-${report.id}`}>
                        <span>Tipo</span>
                        <select
                          id={`report-format-${report.id}`}
                          value={reportExportFormats[report.id] || "csv"}
                          onChange={(event) => setReportExportFormats((current) => ({ ...current, [report.id]: event.target.value }))}
                        >
                          {exportFormatOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="primary-button" onClick={() => handleExportReport(report, reportExportFormats[report.id] || "csv")}>
                        Extrair
                      </button>
                    </div>
                  </article>
                )) : <div className="empty-state">Nenhum relatorio corresponde aos filtros aplicados.</div>}
              </div>
            </section>
          </div>
        ) : activeTab === "files" ? (
          <div className="stack-grid">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="eyebrow">Upload</span>
                  <h3>Repositorio de documentos</h3>
                </div>
                <span className="panel__meta">Tipos aceitos: {fileExtensionsLabel}</span>
              </div>

              <form className="upload-grid" onSubmit={handleFileUpload}>
                <label className="field field--full" htmlFor="file-upload-input">
                  <span>Arquivo</span>
                  <input
                    id="file-upload-input"
                    type="file"
                    accept={getImportAccept(uploadForm.import_format)}
                    onChange={(event) => updateUploadField("file", event.target.files?.[0] || null)}
                  />
                </label>
                <label className="field" htmlFor="upload-import-format">
                  <span>Tipo de importacao</span>
                  <select id="upload-import-format" value={uploadForm.import_format} onChange={(event) => updateUploadField("import_format", event.target.value)}>
                    {importFormatOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="upload-category">
                  <span>Categoria</span>
                  <input id="upload-category" value={uploadForm.category} onChange={(event) => updateUploadField("category", event.target.value)} />
                </label>
                <label className="field" htmlFor="upload-vendor">
                  <span>Fornecedor</span>
                  <select id="upload-vendor" value={uploadForm.vendor_id} onChange={(event) => updateUploadField("vendor_id", event.target.value)}>
                    <option value="">Selecione</option>
                    {selectOptions.vendorOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="upload-unit">
                  <span>Unidade</span>
                  <select id="upload-unit" value={uploadForm.unit_id} onChange={(event) => updateUploadField("unit_id", event.target.value)}>
                    <option value="">Selecione</option>
                    {selectOptions.unitOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="upload-contract">
                  <span>Orcamento</span>
                  <select id="upload-contract" value={uploadForm.contract_id} onChange={(event) => updateUploadField("contract_id", event.target.value)}>
                    <option value="">Selecione</option>
                    {selectOptions.contractOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="upload-invoice">
                  <span>Nota fiscal</span>
                  <select id="upload-invoice" value={uploadForm.invoice_id} onChange={(event) => updateUploadField("invoice_id", event.target.value)}>
                    <option value="">Selecione</option>
                    {selectOptions.invoiceOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="upload-regdoc">
                  <span>Documento regulatorio</span>
                  <select id="upload-regdoc" value={uploadForm.regulatory_document_id} onChange={(event) => updateUploadField("regulatory_document_id", event.target.value)}>
                    <option value="">Selecione</option>
                    {selectOptions.regulatoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field field--full" htmlFor="upload-notes">
                  <span>Observacoes</span>
                  <textarea id="upload-notes" rows={4} value={uploadForm.notes} onChange={(event) => updateUploadField("notes", event.target.value)} />
                </label>
                <div className="upload-actions field--full">
                  <button type="submit" className="primary-button" disabled={uploadingFile}>
                    {uploadingFile ? "Enviando..." : "Enviar arquivo"}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="eyebrow">Arquivos</span>
                  <h3>Biblioteca integrada</h3>
                </div>
                <span className="panel__meta">{currentRows.length} arquivo(s)</span>
              </div>
              <DataTable
                columns={columnsByView.files}
                rows={currentRows}
                emptyMessage="Nenhum arquivo encontrado."
                onRowSelect={(item) => rememberSelectedRecord(activeDataKey, item)}
                selectedRowId={selectedRecords[activeDataKey]?.id}
                onDelete={currentDeleteAction}
              />
            </section>
          </div>
        ) : (
          <section className="panel">
            <div className="panel__header panel__header--stack">
              <div className="panel-heading">
                <span className="eyebrow">Gestao</span>
                <h3>{sectionTitle}</h3>
              </div>

              <div className="panel-header-actions">
                <span className="panel__meta">{loadingData ? "Atualizando..." : `${currentRows.length} registro(s) visivel(is)`}</span>
              </div>
            </div>

            <DataTable
              columns={columnsByView[activeDataKey]}
              rows={currentRows}
              emptyMessage="Nenhum registro encontrado."
              onRowSelect={(item) => rememberSelectedRecord(activeDataKey, item)}
              selectedRowId={selectedRecords[activeDataKey]?.id}
              onView={currentViewAction}
              onEdit={activeDataKey === "users" && user.role !== "superadm" ? null : currentEditAction}
              onDelete={activeDataKey === "users" && user.role !== "superadm" ? null : currentDeleteAction}
              getRowClassName={getRowClassName}
            />
          </section>
        )}

        <FormModal
          open={Boolean(modal.section)}
          title={`${modalReadOnly ? "Visualizar" : modal.item ? "Editar" : "Novo"} ${modalTitleMap[modal.section] || ""}`}
          fields={modal.section ? fieldsBySection[modal.section] : []}
          formData={formData}
          onChange={updateFormField}
          onClose={closeModal}
          onSubmit={saveCurrentItem}
          submitLabel={modal.item ? "Salvar alteracoes" : "Criar registro"}
          report={modalReport}
          attachments={modalAttachments}
          readOnly={modalReadOnly}
          actions={modalActionTools}
          error={error}
          fieldErrors={modalFieldErrors}
          saving={savingModal}
          hasUnsavedChanges={modalHasUnsavedChanges}
        />

        {extractDialogOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setExtractDialogOpen(false)}>
            <div className="extract-choice-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="modal-card__header">
                <div>
                  <span className="eyebrow">Extrair</span>
                  <h3>O que voce quer extrair?</h3>
                </div>
                <button type="button" className="ghost-button" onClick={() => setExtractDialogOpen(false)}>
                  Fechar
                </button>
              </div>

              <div className="extract-choice-grid">
                <button type="button" className="extract-choice-button" onClick={() => handleTopExtractChoice("list")} disabled={!currentRows.length}>
                  <strong>Lista da tela</strong>
                  <span>Extrai exatamente a lista visivel nesta pagina, respeitando busca, filtros e o tipo escolhido.</span>
                  <small>{currentRows.length} registro(s) visivel(is)</small>
                </button>

                <button
                  type="button"
                  className="extract-choice-button"
                  onClick={() => handleTopExtractChoice("form")}
                  disabled={!selectedRecords[activeDataKey]}
                >
                  <strong>Formulario selecionado</strong>
                  <span>Extrai os campos do formulario da linha que voce clicou por ultimo.</span>
                  <small>{getRecordDisplayName(selectedRecords[activeDataKey])}</small>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteElevation.open ? (
          <div className="modal-backdrop" role="presentation" onClick={closeDeleteElevation}>
            <div className="elevation-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="modal-card__header">
                <div>
                  <h3>Elevacao para excluir</h3>
                  <p>Operador precisa de autorizacao de um administrador ou superadministrador.</p>
                </div>
                <button type="button" className="icon-button" onClick={closeDeleteElevation} disabled={deleteElevation.loading}>
                  Fechar
                </button>
              </div>
              <form className="elevation-form" onSubmit={submitDeleteElevation}>
                <div className="banner banner--warning">
                  Excluir: {deleteElevation.item ? getDeleteLabel(deleteElevation.item) : "registro"}
                </div>
                <label className="field" htmlFor="delete-elevation-email">
                  <span>E-mail do admin/superadmin</span>
                  <input
                    id="delete-elevation-email"
                    type="email"
                    value={deleteElevation.email}
                    onChange={(event) => setDeleteElevation((current) => ({ ...current, email: event.target.value }))}
                    autoFocus
                  />
                </label>
                <label className="field" htmlFor="delete-elevation-password">
                  <span>Senha</span>
                  <input
                    id="delete-elevation-password"
                    type="password"
                    value={deleteElevation.password}
                    onChange={(event) => setDeleteElevation((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closeDeleteElevation} disabled={deleteElevation.loading}>
                    Cancelar
                  </button>
                  <button type="submit" className="primary-button primary-button--danger" disabled={deleteElevation.loading}>
                    {deleteElevation.loading ? "Validando..." : "Entrar e excluir"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
