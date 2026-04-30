export default function DataTable({
  columns,
  rows,
  emptyMessage,
  onView,
  onEdit,
  onDelete,
  getRowClassName
}) {
  if (!rows.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
            {(onEdit || onDelete) && <th className="data-table__actions">Acoes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`${getRowClassName ? getRowClassName(row) : ""} ${onView ? "data-table__row--clickable" : ""}`}
              onClick={onView ? () => onView(row) : undefined}
            >
              {columns.map((column) => (
                <td key={`${row.id}-${column.key}`}>
                  {column.render ? column.render(row[column.key], row) : row[column.key] || "-"}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="table-actions">
                  {onEdit ? (
                    <button type="button" className="ghost-button" onClick={(event) => {
                      event.stopPropagation();
                      onEdit(row);
                    }}>
                      Editar
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      className="ghost-button ghost-button--danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(row);
                      }}
                    >
                      Excluir
                    </button>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
