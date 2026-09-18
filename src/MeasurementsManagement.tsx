import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type Customer = {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
};

type MeasurementType = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
};

type MeasurementRow = {
  id: string;
  customerId: string;
  customerName: string;
  customerLastName: string;
  value: string;
  measuredAt: string;
  notes?: string | null;
  typeId: string;
  typeName: string;
  unit?: string | null;
};

export default function MeasurementsManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [types, setTypes] = useState<MeasurementType[]>([]);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [measuredAt, setMeasuredAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [customerResponse, typeResponse, measurementResponse] = await Promise.all([
        apiFetch<{ customers: Customer[] }>('/customers?limit=500'),
        apiFetch<{ types: MeasurementType[] }>('/measurements/types'),
        apiFetch<{ measurements: MeasurementRow[] }>(
          '/measurements' +
            (customerId ? '?customerId=' + encodeURIComponent(customerId) : ''),
        ),
      ]);

      setCustomers(customerResponse.customers);
      setTypes(typeResponse.types);
      setRows(measurementResponse.measurements);

      if (!customerId && customerResponse.customers[0]) {
        setCustomerId(customerResponse.customers[0].id);
      }

      if (!typeId && typeResponse.types[0]) {
        setTypeId(typeResponse.types[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل القياسات');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await apiFetch('/measurements', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          measurementTypeId: typeId,
          value,
          measuredAt: measuredAt ? new Date(measuredAt).toISOString() : undefined,
          notes: notes || null,
        }),
      });

      setValue('');
      setNotes('');
      setMessage('تم حفظ القياس');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ القياس');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('حذف هذا القياس؟')) {
      return;
    }

    try {
      await apiFetch('/measurements/' + id, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف القياس');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">MEASUREMENTS</span>
          <h1>القياسات الصحية</h1>
        </div>
        <Link className="secondary-button" to="/admin/dashboard">
          لوحة الإدارة
        </Link>
      </header>

      {error && <div className="info-strip warning">{error}</div>}
      {message && <div className="info-strip">{message}</div>}

      <section className="panel">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">RECORD</p>
            <h2>تسجيل قياس جديد</h2>
          </div>
        </div>

        <form className="form-stack" onSubmit={save}>
          <div className="form-row">
            <label>
              العميل
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customerNumber} — {customer.firstName} {customer.lastName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              نوع القياس
              <select
                required
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.unit ? ' (' + type.unit + ')' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              القيمة
              <input
                type="number"
                step="0.01"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>

            <label>
              وقت القياس
              <input
                type="datetime-local"
                value={measuredAt}
                onChange={(e) => setMeasuredAt(e.target.value)}
              />
            </label>
          </div>

          <label>
            ملاحظات
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <button className="primary-action button" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ القياس'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">HISTORY</p>
            <h2>سجل القياسات</h2>
          </div>
          <button className="secondary-button" onClick={() => void load()}>
            تحديث
          </button>
        </div>

        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>القياس</th>
                <th>القيمة</th>
                <th>الوحدة</th>
                <th>التاريخ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.customerName} {row.customerLastName}
                  </td>
                  <td>{row.typeName}</td>
                  <td>{row.value}</td>
                  <td>{row.unit ?? '—'}</td>
                  <td>{new Date(row.measuredAt).toLocaleString('ar-SA')}</td>
                  <td>
                    <button
                      className="secondary-button"
                      onClick={() => void remove(row.id)}
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
