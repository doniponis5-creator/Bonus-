interface Column { key: string; label: string; render?: (val: any, row: any) => React.ReactNode; }
interface Props { columns: Column[]; data: any[]; emptyText?: string; }

export default function DataTable({ columns, data, emptyText = 'Нет данных' }: Props) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>{emptyText}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>{columns.map(c => <td key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
