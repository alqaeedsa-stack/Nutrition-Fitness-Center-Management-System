import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './lib/api';
import PurchaseWorkspaceNav from './PurchaseWorkspaceNav';

type BillingOrder={id:string;poNumber:string;vendorId:string;vendorName:string;orderDate:string;status:string;total:string};
type Candidate={id:string;productId:string;productName:string;description:string|null;ordered:string;received:string;returned:string;unitCost:string;alreadyBilled:number;availableToBill:number};
type Bill={id:string;billNumber:string;vendorInvoiceNumber:string|null;billDate:string;dueDate:string|null;status:string;vendorId:string;vendorName:string;poNumber:string|null;subtotal:string;tax:string;total:string;paidAmount:string;balanceDue:string};
type Payment={id:string;paymentNumber:string;paymentDate:string;amount:string;paymentMethod:string;reference:string|null;vendorName:string;billNumber:string|null};
type Statement={vendor:{id:string;code:string;name:string};summary:{totalBills:string;totalPaid:string;balanceDue:string};ledger:Array<{type:string;id:string;number:string;date:string;description:string;debit:number;credit:number;balance:string;billNumber?:string|null}>};
type LineState={quantity:string;unitCost:string;taxRate:string};

const statusLabel:Record<string,string>={draft:'مسودة',posted:'مرحّلة',partially_paid:'مدفوعة جزئيًا',paid:'مدفوعة',cancelled:'ملغاة'};
const today=new Date().toISOString().slice(0,10);

export default function VendorBilling(){
  const [tab,setTab]=useState<'bills'|'payments'|'statement'>('bills');
  const [orders,setOrders]=useState<BillingOrder[]>([]);
  const [bills,setBills]=useState<Bill[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [statement,setStatement]=useState<Statement|null>(null);
  const [selectedOrder,setSelectedOrder]=useState('');
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [lines,setLines]=useState<Record<string,LineState>>({});
  const [vendorInvoiceNumber,setVendorInvoiceNumber]=useState('');
  const [billDate,setBillDate]=useState(today);
  const [dueDate,setDueDate]=useState('');
  const [notes,setNotes]=useState('');
  const [paymentBill,setPaymentBill]=useState('');
  const [paymentAmount,setPaymentAmount]=useState('');
  const [paymentDate,setPaymentDate]=useState(today);
  const [paymentMethod,setPaymentMethod]=useState('تحويل بنكي');
  const [paymentReference,setPaymentReference]=useState('');
  const [statementVendor,setStatementVendor]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const vendors=useMemo(()=>Array.from(new Map([...orders.map(o=>[o.vendorId,{id:o.vendorId,name:o.vendorName}] as const),...bills.map(b=>[b.vendorId,{id:b.vendorId,name:b.vendorName}] as const)]).values()),[orders,bills]);

  async function load(){
    setError('');
    try{
      const [o,b,p]=await Promise.all([
        apiFetch<{orders:BillingOrder[]}>('/purchases/billing-orders'),
        apiFetch<{bills:Bill[]}>('/purchases/bills'),
        apiFetch<{payments:Payment[]}>('/purchases/payments')
      ]);
      setOrders(o.orders);setBills(b.bills);setPayments(p.payments);
      if(!selectedOrder&&o.orders[0]) setSelectedOrder(o.orders[0].id);
      if(!paymentBill){const open=b.bills.find(x=>['posted','partially_paid'].includes(x.status));if(open)setPaymentBill(open.id);}
      if(!statementVendor && o.orders[0]) setStatementVendor(o.orders[0].vendorId);
    }catch(e){setError(e instanceof Error?e.message:'تعذر تحميل المشتريات المالية');}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{ if(selectedOrder) void openCandidates(selectedOrder); },[selectedOrder]);

  async function openCandidates(orderId:string){
    try{
      const r=await apiFetch<{items:Candidate[]}>('/purchases/bills/candidates/'+orderId);
      setCandidates(r.items);setLines(Object.fromEntries(r.items.filter(x=>x.availableToBill>0).map(x=>[x.id,{quantity:String(x.availableToBill),unitCost:String(x.unitCost),taxRate:''}])));
    }catch(e){setError(e instanceof Error?e.message:'تعذر تحميل البنود القابلة للفوترة');}
  }

  async function createBill(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      const order=orders.find(x=>x.id===selectedOrder);if(!order)throw new Error('اختر أمر شراء.');
      const items=candidates.map(x=>{const l=lines[x.id];return l&&Number(l.quantity)>0?{purchaseOrderItemId:x.id,productId:x.productId,description:x.description||x.productName,quantity:Number(l.quantity),unitCost:Number(l.unitCost),taxRate:Number(l.taxRate||0)}:null}).filter(Boolean);
      if(!items.length)throw new Error('حدد بندًا واحدًا على الأقل.');
      const r=await apiFetch<{bill:{billNumber:string;total:number}}>('/purchases/bills',{method:'POST',body:JSON.stringify({vendorId:order.vendorId,purchaseOrderId:order.id,vendorInvoiceNumber:vendorInvoiceNumber||null,billDate,dueDate:dueDate||null,notes:notes||null,items})});
      setMessage('تم إنشاء فاتورة المورد '+r.bill.billNumber+' كمسودة بقيمة '+Number(r.bill.total).toFixed(2)+' ر.س.');setVendorInvoiceNumber('');setNotes('');await load();await openCandidates(order.id);
    }catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء الفاتورة')}finally{setBusy(false)}
  }

  async function postBill(id:string){
    setBusy(true);setError('');setMessage('');
    try{const r=await apiFetch<{bill:{billNumber:string}}>('/purchases/bills/'+id+'/post',{method:'POST'});setMessage('تم ترحيل '+r.bill.billNumber+' وأصبح المبلغ مستحقًا على المورد.');await load();}
    catch(e){setError(e instanceof Error?e.message:'تعذر ترحيل الفاتورة')}finally{setBusy(false)}
  }

  async function pay(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(!paymentBill)throw new Error('اختر فاتورة.');
      const r=await apiFetch<{payment:{paymentNumber:string;remaining:number}}>('/purchases/payments',{method:'POST',body:JSON.stringify({billId:paymentBill,paymentDate,amount:Number(paymentAmount),paymentMethod,reference:paymentReference||null})});
      setMessage('تم تسجيل الدفعة '+r.payment.paymentNumber+' والمتبقي '+Number(r.payment.remaining).toFixed(2)+' ر.س.');setPaymentAmount('');setPaymentReference('');await load();
    }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل الدفعة')}finally{setBusy(false)}
  }

  async function loadStatement(vendorId:string){
    setStatementVendor(vendorId);
    if(!vendorId)return;
    try{setStatement(await apiFetch<Statement>('/purchases/vendors/'+vendorId+'/statement'));}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل كشف المورد')}
  }

  const openBills=bills.filter(x=>['posted','partially_paid'].includes(x.status));

  return <main className="app-shell"><div className="odoo-workspace"><PurchaseWorkspaceNav /><div className="odoo-workspace-main">
    <header className="app-header">
      <div><span className="eyebrow">VENDOR ACCOUNTING</span><h1>فواتير الموردين والمدفوعات</h1><p>فصل واضح بين الاستلام التشغيلي والفاتورة والالتزام المالي والدفع.</p></div>
    </header>
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}
    <nav className="portal-choice-actions" aria-label="الحسابات الدائنة">
      <button className={'secondary-button '+(tab==='bills'?'active':'')} onClick={()=>setTab('bills')}>فواتير الموردين</button>
      <button className={'secondary-button '+(tab==='payments'?'active':'')} onClick={()=>setTab('payments')}>مدفوعات الموردين</button>
      <button className={'secondary-button '+(tab==='statement'?'active':'')} onClick={()=>setTab('statement')}>كشف حساب المورد</button>
    </nav>

    {tab==='bills'&&<section className="staff-management-grid">
      <section className="panel">
        <p className="eyebrow">VENDOR BILL</p><h2>فاتورة مورد جديدة</h2><div className="odoo-statusbar" aria-label="دورة فاتورة المورد"><span className="current">مسودة</span><span>مرحّلة</span><span>مدفوعة جزئيًا</span><span>مدفوعة</span></div>
        <p>لا يمكن فوترة كمية أكبر من الكمية المستلمة غير المفوترة.</p>
        <form className="form-stack" onSubmit={createBill}>
          <div className="form-row"><label>أمر الشراء<select value={selectedOrder} onChange={e=>setSelectedOrder(e.target.value)}><option value="">اختر</option>{orders.map(o=><option key={o.id} value={o.id}>{o.poNumber} — {o.vendorName}</option>)}</select></label><label>رقم فاتورة المورد<input value={vendorInvoiceNumber} onChange={e=>setVendorInvoiceNumber(e.target.value)} placeholder="رقم المورد إن وجد"/></label></div>
          <div className="form-row"><label>تاريخ الفاتورة<input type="date" value={billDate} onChange={e=>setBillDate(e.target.value)}/></label><label>تاريخ الاستحقاق<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></div>
          <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>المنتج</th><th>مستلم غير مفوتر</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الضريبة %</th></tr></thead><tbody>{candidates.map(x=>{const l=lines[x.id];return <tr key={x.id}><td>{x.productName}</td><td>{x.availableToBill.toFixed(3)}</td><td><input type="number" min="0" max={x.availableToBill} step="0.001" value={l?.quantity??''} onChange={e=>setLines(v=>({...v,[x.id]:{...(v[x.id]||{unitCost:String(x.unitCost),taxRate:''}),quantity:e.target.value}}))}/></td><td><input type="number" min="0" step="0.01" value={l?.unitCost??x.unitCost} onChange={e=>setLines(v=>({...v,[x.id]:{...(v[x.id]||{quantity:'',taxRate:''}),unitCost:e.target.value}}))}/></td><td><input type="number" min="0" step="0.01" value={l?.taxRate??''} onChange={e=>setLines(v=>({...v,[x.id]:{...(v[x.id]||{quantity:'',unitCost:String(x.unitCost)}),taxRate:e.target.value}}))}/></td></tr>})}</tbody></table></div>
          <label>ملاحظات<textarea value={notes} onChange={e=>setNotes(e.target.value)}/></label>
          <button className="primary-action button" disabled={busy||!selectedOrder}>{busy?'جارٍ الحفظ...':'حفظ فاتورة كمسودة'}</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">VENDOR BILLS</p><h2>فواتير الموردين</h2></div><button className="secondary-button" onClick={()=>void load()}>تحديث</button></div>
        <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الفاتورة</th><th>المورد</th><th>أمر الشراء</th><th>التاريخ</th><th>الإجمالي</th><th>مدفوع</th><th>متبقي</th><th>الحالة</th><th></th></tr></thead><tbody>{bills.map(b=><tr key={b.id}><td>{b.billNumber}<small>{b.vendorInvoiceNumber||'بدون رقم مورد'}</small></td><td>{b.vendorName}</td><td>{b.poNumber||'—'}</td><td>{b.billDate}</td><td>{Number(b.total).toFixed(2)}</td><td>{Number(b.paidAmount).toFixed(2)}</td><td>{Number(b.balanceDue).toFixed(2)}</td><td><span className="status-badge active">{statusLabel[b.status]||b.status}</span></td><td>{b.status==='draft'&&<button className="secondary-button" disabled={busy} onClick={()=>void postBill(b.id)}>ترحيل</button>}</td></tr>)}{!bills.length&&<tr><td colSpan={9}>لا توجد فواتير موردين.</td></tr>}</tbody></table></div>
      </section>
    </section>}

    {tab==='payments'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">PAYMENT</p><h2>تسجيل دفعة للمورد</h2><form className="form-stack" onSubmit={pay}>
        <label>الفاتورة<select required value={paymentBill} onChange={e=>setPaymentBill(e.target.value)}><option value="">اختر</option>{openBills.map(b=><option key={b.id} value={b.id}>{b.billNumber} — {b.vendorName} — متبقي {Number(b.balanceDue).toFixed(2)} ر.س</option>)}</select></label>
        <div className="form-row"><label>التاريخ<input type="date" required value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label><label>المبلغ<input type="number" min="0.01" step="0.01" required value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label>طريقة الدفع<input required value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}/></label></div>
        <label>مرجع العملية<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder="رقم التحويل / المرجع"/></label>
        <button className="primary-action button" disabled={busy}>{busy?'جارٍ التسجيل...':'تسجيل الدفعة'}</button>
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">PAYMENT HISTORY</p><h2>سجل المدفوعات</h2></div><button className="secondary-button" onClick={()=>void load()}>تحديث</button></div>
        <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الدفعة</th><th>التاريخ</th><th>المورد</th><th>الفاتورة</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{p.paymentNumber}</td><td>{p.paymentDate}</td><td>{p.vendorName}</td><td>{p.billNumber||'—'}</td><td>{Number(p.amount).toFixed(2)} ر.س</td><td>{p.paymentMethod}</td><td>{p.reference||'—'}</td></tr>)}{!payments.length&&<tr><td colSpan={7}>لا توجد مدفوعات.</td></tr>}</tbody></table></div>
      </section>
    </section>}

    {tab==='statement'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">VENDOR STATEMENT</p><h2>كشف حساب المورد</h2><label>المورد<select value={statementVendor} onChange={e=>void loadStatement(e.target.value)}><option value="">اختر</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        {statement&&<div className="stats-grid"><div className="stat-card"><span>إجمالي الفواتير</span><strong>{Number(statement.summary.totalBills).toFixed(2)} ر.س</strong></div><div className="stat-card"><span>إجمالي المدفوع</span><strong>{Number(statement.summary.totalPaid).toFixed(2)} ر.س</strong></div><div className="stat-card"><span>الرصيد المستحق</span><strong>{Number(statement.summary.balanceDue).toFixed(2)} ر.س</strong></div></div>}
      </section>
      <section className="panel">{statement&&<><div className="panel-heading-row"><div><p className="eyebrow">LEDGER</p><h2>{statement.vendor.name}</h2></div></div><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>التاريخ</th><th>المستند</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>{statement.ledger.map(x=><tr key={x.type+x.id}><td>{x.date}</td><td>{x.number}</td><td>{x.description}</td><td>{x.debit.toFixed(2)}</td><td>{x.credit.toFixed(2)}</td><td>{x.balance}</td></tr>)}</tbody></table></div></>}{!statement&&<p>اختر موردًا لعرض كشف الحساب.</p>}</section>
    </section>}
  </div></div></main>;
}
