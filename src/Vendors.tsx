import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';
import PurchaseWorkspaceNav from './PurchaseWorkspaceNav';

type Vendor = { id:string; code:string; name:string; taxNumber?:string|null; phone?:string|null; email?:string|null; address?:string|null; paymentTerms?:string|null; active:boolean };
type Product = { id:string; sku:string; name:string; purchaseCost:string };
type Order = { id:string; poNumber:string; status:string; orderDate:string; expectedDate?:string|null; subtotal:string; tax:string; total:string; vendorId:string; vendorName:string };
type OrderItem = { id:string; productId:string; productName:string; sku:string; quantity:string; receivedQuantity:string; returnedQuantity:string; unitCost:string; tax:string; lineTotal:string };
type ReceiptRow = { id:string; receiptNumber:string; receiptDate:string; status:string; poNumber:string; vendorName:string };
type ReturnRow = { id:string; returnNumber:string; status:string; returnDate:string; total:string; notes?:string|null; vendorId:string; vendorName:string; poNumber?:string|null };
type VendorDetail = { vendor:Vendor; orders:Pick<Order,'id'|'poNumber'|'status'|'orderDate'|'total'>[]; returns:Pick<ReturnRow,'id'|'returnNumber'|'returnDate'|'total'|'poNumber'>[]; totals:{orders:string;returns:string} };
type Dashboard = { activeVendors:number; openOrders:number; purchaseTotal:string; returnTotal:string; orderCounts:{draft:number;sent:number;confirmed:number;received:number;partial:number;cancelled:number;total:number} };

const statusLabel:Record<string,string>={draft:'مسودة',sent:'مرسل',confirmed:'مؤكد',partially_received:'استلام جزئي',received:'مستلم بالكامل',cancelled:'ملغي',posted:'مسجل'};
const statusClass:Record<string,string>={draft:'inactive',sent:'inactive',confirmed:'active',partially_received:'active',received:'active',cancelled:'inactive',posted:'active'};

export default function Vendors(){
  const [tab,setTab]=useState<'overview'|'vendors'|'orders'|'receipts'|'returns'>('overview');
  const [vendors,setVendors]=useState<Vendor[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [orders,setOrders]=useState<Order[]>([]);
  const [returnRows,setReturnRows]=useState<ReturnRow[]>([]);
  const [receiptRows,setReceiptRows]=useState<ReceiptRow[]>([]);
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [selected,setSelected]=useState<{order:Order;items:OrderItem[]}|null>(null);
  const [vendorDetail,setVendorDetail]=useState<VendorDetail|null>(null);
  const [vendorSearch,setVendorSearch]=useState('');
  const [orderFilter,setOrderFilter]=useState('all');
  const [vendor,setVendor]=useState({code:'',name:'',taxNumber:'',phone:'',email:'',address:'',paymentTerms:''});
  const [order,setOrder]=useState({vendorId:'',orderDate:new Date().toISOString().slice(0,10),expectedDate:'',notes:''});
  const [lines,setLines]=useState<{productId:string;quantity:string;unitCost:string;tax:string}[]>([]);
  const [receive,setReceive]=useState<Record<string,string>>({});
  const [returns,setReturns]=useState<Record<string,string>>({});
  const [returnDate,setReturnDate]=useState(new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');

  async function load(){
    try{
      const [v,p,o,d,r,g]=await Promise.all([
        apiFetch<{vendors:Vendor[]}>('/purchases/vendors'),
        apiFetch<{products:Product[]}>('/staff/products'),
        apiFetch<{orders:Order[]}>('/purchases/orders'),
        apiFetch<Dashboard>('/purchases/dashboard'),
        apiFetch<{returns:ReturnRow[]}>('/purchases/returns'),
        apiFetch<{receipts:ReceiptRow[]}>('/purchases/receipts')
      ]);
      setVendors(v.vendors); setProducts(p.products); setOrders(o.orders); setDashboard(d); setReturnRows(r.returns); setReceiptRows(g.receipts);
      if(!order.vendorId && v.vendors[0]) setOrder(x=>({...x,vendorId:v.vendors[0].id}));
    }catch(e){setError(e instanceof Error?e.message:'تعذر تحميل بيانات المشتريات');}
  }
  useEffect(()=>{void load()},[]);

  const filteredVendors=useMemo(()=>vendors.filter(v=>(v.name+' '+v.code+' '+(v.taxNumber||'')).toLowerCase().includes(vendorSearch.toLowerCase())),[vendors,vendorSearch]);
  const filteredOrders=useMemo(()=>orderFilter==='all'?orders:orders.filter(o=>o.status===orderFilter),[orders,orderFilter]);

  async function createVendor(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      await apiFetch('/purchases/vendors',{method:'POST',body:JSON.stringify({...vendor,taxNumber:vendor.taxNumber||null,phone:vendor.phone||null,email:vendor.email||null,address:vendor.address||null,paymentTerms:vendor.paymentTerms||null})});
      setVendor({code:'',name:'',taxNumber:'',phone:'',email:'',address:'',paymentTerms:''});setMessage('تم حفظ المورد.');await load();
    }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ المورد');}finally{setBusy(false)}
  }
  function addLine(){if(products[0])setLines(x=>[...x,{productId:products[0].id,quantity:'1',unitCost:products[0].purchaseCost||'0',tax:'0'}])}
  async function createOrder(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      const items=lines.filter(x=>x.productId&&Number(x.quantity)>0).map(x=>({productId:x.productId,quantity:Number(x.quantity),unitCost:Number(x.unitCost),tax:Number(x.tax||0)}));
      if(!items.length)throw new Error('أضف بندًا واحدًا على الأقل.');
      const result=await apiFetch<{order:{poNumber:string}}>('/purchases/orders',{method:'POST',body:JSON.stringify({...order,expectedDate:order.expectedDate||null,notes:order.notes||null,items})});
      setLines([]);setOrder(x=>({...x,notes:'',expectedDate:''}));setMessage('تم إنشاء أمر الشراء '+result.order.poNumber+' كمسودة.');await load();setTab('orders');
    }catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء أمر الشراء');}finally{setBusy(false)}
  }
  async function status(id:string,status:'sent'|'confirmed'|'cancelled'){
    try{await apiFetch('/purchases/orders/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})});setMessage('تم تحديث حالة أمر الشراء.');await load();if(selected)void openOrder(id)}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحديث الحالة')}
  }
  async function openOrder(id:string){
    try{const r=await apiFetch<{order:Order;items:OrderItem[]}>('/purchases/orders/'+id);setSelected(r);setReceive(Object.fromEntries(r.items.map(x=>[x.id,''])));setReturns({});}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل أمر الشراء')}
  }
  async function openVendor(id:string){
    try{setVendorDetail(await apiFetch<VendorDetail>('/purchases/vendors/'+id));}
    catch(e){setError(e instanceof Error?e.message:'تعذر تحميل بطاقة المورد')}
  }
  async function returnOrder(e:FormEvent){
    e.preventDefault();if(!selected)return;setBusy(true);setError('');setMessage('');
    try{
      const items=selected.items.map(x=>({purchaseOrderItemId:x.id,quantity:Number(returns[x.id]||0)})).filter(x=>x.quantity>0);
      if(!items.length)throw new Error('حدد كمية مرتجعة واحدة على الأقل.');
      const r=await apiFetch<{returnNumber:string;total:string}>('/purchases/returns',{method:'POST',body:JSON.stringify({returnDate,items})});
      setMessage('تم تسجيل المرتجع '+r.returnNumber+' وتخفيض المخزون بقيمة '+Number(r.total).toFixed(2)+' ر.س.');await load();await openOrder(selected.order.id);setReturns({});
    }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل مرتجع الشراء')}finally{setBusy(false)}
  }
  async function receiveOrder(e:FormEvent){
    e.preventDefault();if(!selected)return;setBusy(true);setError('');setMessage('');
    try{
      const items=selected.items.map(x=>({itemId:x.id,quantity:Number(receive[x.id]||0)})).filter(x=>x.quantity>0);
      if(!items.length)throw new Error('حدد كمية مستلمة واحدة على الأقل.');
      const r=await apiFetch<{status:string}>('/purchases/orders/'+selected.order.id+'/receive',{method:'POST',body:JSON.stringify({items})});
      setMessage(r.status==='received'?'تم استلام أمر الشراء بالكامل وتحديث المخزون.':'تم تسجيل الاستلام الجزئي وتحديث المخزون.');await load();await openOrder(selected.order.id);
    }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل الاستلام')}finally{setBusy(false)}
  }

  return <main className="app-shell"><div className="odoo-workspace"><PurchaseWorkspaceNav /><div className="odoo-workspace-main">
    <header className="app-header">
      <div><span className="eyebrow">إدارة المشتريات</span><h1>المشتريات والموردون</h1><p>دورة شراء منظمة: مورد ← طلب عرض/مسودة ← أمر شراء ← استلام ← مرتجع.</p></div>
      <Link className="secondary-button" to="/admin/operations">المخزون والمنتجات</Link>
    </header>
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}

    <nav className="portal-choice-actions" aria-label="أقسام المشتريات">
      {(['overview','vendors','orders','receipts','returns'] as const).map(x=><button key={x} className={'secondary-button '+(tab===x?'active':'')} onClick={()=>setTab(x)}>{x==='overview'?'نظرة عامة':x==='vendors'?'الموردون':x==='orders'?'عروض الأسعار وطلبات الشراء':x==='receipts'?'الاستلامات':'المرتجعات'}</button>)}
    </nav>

    {tab==='overview'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">نظرة عامة على المشتريات</p><h2>مركز المشتريات</h2><p>هذه الصفحة هي نقطة التحكم اليومية في دورة الشراء، وليست مجرد شاشة إدخال.</p>
        <div className="stats-grid">
          <div className="stat-card"><span>الموردون النشطون</span><strong>{dashboard?.activeVendors??'—'}</strong></div>
          <div className="stat-card"><span>طلبات مفتوحة</span><strong>{dashboard?.openOrders??'—'}</strong></div>
          <div className="stat-card"><span>إجمالي المشتريات</span><strong>{dashboard?Number(dashboard.purchaseTotal).toFixed(2):'—'} ر.س</strong></div>
          <div className="stat-card"><span>إجمالي المرتجعات</span><strong>{dashboard?Number(dashboard.returnTotal).toFixed(2):'—'} ر.س</strong></div>
        </div>
      </section>
      <section className="panel"><p className="eyebrow">دورة العمل</p><h2>حالات دورة الشراء</h2>
        <div className="portal-choice-actions"><button className="secondary-button" onClick={()=>{setTab('orders');setOrderFilter('draft')}}>طلبات عروض الأسعار {dashboard?.orderCounts.draft??0}</button><button className="secondary-button" onClick={()=>{setTab('orders');setOrderFilter('confirmed')}}>مؤكد {dashboard?.orderCounts.confirmed??0}</button><button className="secondary-button" onClick={()=>{setTab('orders');setOrderFilter('partially_received')}}>استلام جزئي {dashboard?.orderCounts.partial??0}</button><button className="secondary-button" onClick={()=>{setTab('orders');setOrderFilter('received')}}>مكتمل {dashboard?.orderCounts.received??0}</button></div>
      </section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">إجراءات سريعة</p><h2>إجراءات سريعة</h2></div></div>
        <div className="portal-choice-actions"><button className="primary-action button" onClick={()=>setTab('vendors')}>إدارة الموردين</button><button className="secondary-button" onClick={()=>setTab('orders')}>إنشاء أمر شراء</button><button className="secondary-button" onClick={()=>setTab('returns')}>مراجعة المرتجعات</button></div>
      </section>
    </section>}

    {tab==='vendors'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">دليل الموردين</p><h2>مورد جديد</h2><form className="form-stack" onSubmit={createVendor}>
        <div className="form-row"><label>كود المورد<input required value={vendor.code} onChange={e=>setVendor({...vendor,code:e.target.value})}/></label><label>اسم المورد<input required value={vendor.name} onChange={e=>setVendor({...vendor,name:e.target.value})}/></label></div>
        <div className="form-row"><label>الرقم الضريبي<input value={vendor.taxNumber} onChange={e=>setVendor({...vendor,taxNumber:e.target.value})}/></label><label>الجوال<input value={vendor.phone} onChange={e=>setVendor({...vendor,phone:e.target.value})}/></label><label>البريد<input type="email" value={vendor.email} onChange={e=>setVendor({...vendor,email:e.target.value})}/></label></div>
        <label>العنوان<textarea value={vendor.address} onChange={e=>setVendor({...vendor,address:e.target.value})}/></label><label>شروط الدفع<input value={vendor.paymentTerms} onChange={e=>setVendor({...vendor,paymentTerms:e.target.value})} placeholder="مثال: 30 يوم"/></label>
        <button className="primary-action button" disabled={busy}>{busy?'جارٍ الحفظ...':'حفظ المورد'}</button>
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">الموردون</p><h2>بطاقات الموردين</h2></div><button className="secondary-button" onClick={()=>void load()}>تحديث</button></div>
        <label>بحث المورد<input value={vendorSearch} onChange={e=>setVendorSearch(e.target.value)} placeholder="الاسم أو الكود أو الرقم الضريبي"/></label>
        <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الكود</th><th>المورد</th><th>الضريبة</th><th>الجوال</th><th>شروط الدفع</th><th>الحالة</th><th></th></tr></thead><tbody>{filteredVendors.map(v=><tr key={v.id}><td>{v.code}</td><td>{v.name}</td><td>{v.taxNumber||'—'}</td><td>{v.phone||'—'}</td><td>{v.paymentTerms||'—'}</td><td><span className={'status-badge '+(v.active?'active':'inactive')}>{v.active?'نشط':'موقوف'}</span></td><td><button className="secondary-button" onClick={()=>void openVendor(v.id)}>بطاقة المورد</button></td></tr>)}</tbody></table></div>
      </section>
    </section>}

    {vendorDetail&&<section className="panel"><div className="panel-heading-row"><div><span className="eyebrow">بطاقة المورد</span><h2>{vendorDetail.vendor.name}</h2><p>{vendorDetail.vendor.code} · {vendorDetail.vendor.phone||'بدون جوال'} · {vendorDetail.vendor.paymentTerms||'بدون شروط دفع'}</p></div><button className="secondary-button" onClick={()=>setVendorDetail(null)}>إغلاق</button></div>
      <div className="stats-grid"><div className="stat-card"><span>المشتريات</span><strong>{Number(vendorDetail.totals.orders).toFixed(2)} ر.س</strong></div><div className="stat-card"><span>المرتجعات</span><strong>{Number(vendorDetail.totals.returns).toFixed(2)} ر.س</strong></div><div className="stat-card"><span>الصافي التشغيلي</span><strong>{(Number(vendorDetail.totals.orders)-Number(vendorDetail.totals.returns)).toFixed(2)} ر.س</strong></div></div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>أمر الشراء</th><th>التاريخ</th><th>الحالة</th><th>الإجمالي</th><th></th></tr></thead><tbody>{vendorDetail.orders.map(x=><tr key={x.id}><td>{x.poNumber}</td><td>{x.orderDate}</td><td>{statusLabel[x.status]??x.status}</td><td>{Number(x.total).toFixed(2)} ر.س</td><td><button className="secondary-button" onClick={()=>{setTab('orders');void openOrder(x.id)}}>فتح</button></td></tr>)}</tbody></table></div>
    </section>}

    {tab==='orders'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">طلب شراء</p><h2>إنشاء طلب شراء</h2><p>يحفظ أولًا كمسودة، ثم يتم تأكيده قبل الاستلام.</p><form className="form-stack" onSubmit={createOrder}>
        <div className="form-row"><label>المورد<select required value={order.vendorId} onChange={e=>setOrder({...order,vendorId:e.target.value})}>{vendors.map(v=><option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}</select></label><label>تاريخ الطلب<input type="date" required value={order.orderDate} onChange={e=>setOrder({...order,orderDate:e.target.value})}/></label><label>التاريخ المتوقع<input type="date" value={order.expectedDate} onChange={e=>setOrder({...order,expectedDate:e.target.value})}/></label></div>
        {lines.map((line,i)=><div className="form-row" key={i}><label>المنتج<select required value={line.productId} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,productId:e.target.value}:v))}>{products.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label><label>الكمية<input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,quantity:e.target.value}:v))}/></label><label>تكلفة الوحدة<input type="number" min="0" step="0.01" value={line.unitCost} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,unitCost:e.target.value}:v))}/></label><label>الضريبة<input type="number" min="0" step="0.01" value={line.tax} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,tax:e.target.value}:v))}/></label><button type="button" className="secondary-button" onClick={()=>setLines(x=>x.filter((_,j)=>j!==i))}>حذف</button></div>)}
        <div className="portal-choice-actions"><button type="button" className="secondary-button" onClick={addLine}>إضافة منتج</button><button className="primary-action button" disabled={busy||!lines.length}>{busy?'جارٍ الحفظ...':'حفظ كمسودة'}</button></div>
        <label>ملاحظات<textarea value={order.notes} onChange={e=>setOrder({...order,notes:e.target.value})}/></label>
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">أوامر الشراء</p><h2>سجل طلبات الشراء</h2></div><select value={orderFilter} onChange={e=>setOrderFilter(e.target.value)}><option value="all">كل الحالات</option>{Object.entries(statusLabel).filter(([k])=>k!=='posted').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
        <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الأمر</th><th>المورد</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{filteredOrders.map(o=><tr key={o.id}><td>{o.poNumber}</td><td>{o.vendorName}</td><td>{o.orderDate}</td><td>{Number(o.total).toFixed(2)} ر.س</td><td><span className={'status-badge '+(statusClass[o.status]??'inactive')}>{statusLabel[o.status]??o.status}</span></td><td><button className="secondary-button" onClick={()=>void openOrder(o.id)}>فتح</button>{o.status==='draft'&&<button className="text-link button-link" onClick={()=>void status(o.id,'sent')}>إرسال عرض السعر</button>}{o.status==='sent'&&<button className="text-link button-link" onClick={()=>void status(o.id,'confirmed')}>تأكيد الطلب</button>}{(o.status==='confirmed'||o.status==='partially_received')&&<button className="text-link button-link" onClick={()=>void openOrder(o.id)}>استلام</button>}{o.status!=='received'&&o.status!=='cancelled'&&<button className="text-link button-link" onClick={()=>void status(o.id,'cancelled')}>إلغاء</button>}</td></tr>)}</tbody></table></div>
      </section>
    </section>}

    {selected&&<section className="panel"><div className="panel-heading-row"><div><span className="eyebrow">أمر الشراء</span><h2>{selected.order.poNumber} · {selected.order.vendorName}</h2><p>{selected.order.orderDate}{selected.order.expectedDate?' · متوقع '+selected.order.expectedDate:''}</p></div><button className="secondary-button" onClick={()=>setSelected(null)}>إغلاق</button></div>
      <div className="odoo-statusbar" aria-label="حالة أمر الشراء">
        {['draft','sent','confirmed','partially_received','received'].map(stage=><span key={stage} className={selected.order.status===stage?'current':''}>{statusLabel[stage]}</span>)}
      </div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>المنتج</th><th>المطلوب</th><th>المستلم</th><th>مرتجع</th><th>المتاح للمرتجع</th><th>تكلفة الوحدة</th><th>استلام الآن</th></tr></thead><tbody>{selected.items.map(x=><tr key={x.id}><td>{x.productName}<small>{x.sku}</small></td><td>{Number(x.quantity).toFixed(3)}</td><td>{Number(x.receivedQuantity).toFixed(3)}</td><td>{Number(x.returnedQuantity).toFixed(3)}</td><td>{Math.max(0,Number(x.receivedQuantity)-Number(x.returnedQuantity)).toFixed(3)}</td><td>{Number(x.unitCost).toFixed(2)} ر.س</td><td><input type="number" min="0" max={Math.max(0,Number(x.quantity)-Number(x.receivedQuantity))} step="0.001" disabled={selected.order.status!=='confirmed'&&selected.order.status!=='partially_received'} value={receive[x.id]??''} onChange={e=>setReceive(v=>({...v,[x.id]:e.target.value}))}/></td></tr>)}</tbody></table></div>
      {(selected.order.status==='confirmed'||selected.order.status==='partially_received')&&<form className="form-stack" onSubmit={receiveOrder}><button className="primary-action button" disabled={busy}>{busy?'جارٍ التسجيل...':'تسجيل الاستلام وتحديث المخزون'}</button></form>}
      {selected.items.some(x=>Number(x.receivedQuantity)>Number(x.returnedQuantity))&&<form className="form-stack" onSubmit={returnOrder}><div className="form-row"><label>تاريخ المرتجع<input type="date" required value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></label></div><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>المنتج</th><th>متاح للمرتجع</th><th>المرتجع الآن</th></tr></thead><tbody>{selected.items.filter(x=>Number(x.receivedQuantity)>Number(x.returnedQuantity)).map(x=><tr key={x.id}><td>{x.productName}</td><td>{Math.max(0,Number(x.receivedQuantity)-Number(x.returnedQuantity)).toFixed(3)}</td><td><input type="number" min="0" max={Math.max(0,Number(x.receivedQuantity)-Number(x.returnedQuantity))} step="0.001" value={returns[x.id]??''} onChange={e=>setReturns(v=>({...v,[x.id]:e.target.value}))}/></td></tr>)}</tbody></table></div><button className="secondary-button button" disabled={busy}>{busy?'جارٍ التسجيل...':'تسجيل مرتجع جزئي'}</button></form>}
    </section>}

    {tab==='receipts'&&<section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">استلام المشتريات</p><h2>الاستلامات</h2><p>كل استلام أصبح مستندًا مستقلًا مرتبطًا بأمر الشراء وحركات المخزون.</p></div><button className="secondary-button" onClick={()=>void load()}>تحديث</button></div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>رقم الاستلام</th><th>التاريخ</th><th>أمر الشراء</th><th>المورد</th><th>الحالة</th></tr></thead><tbody>{receiptRows.map(x=><tr key={x.id}><td>{x.receiptNumber}</td><td>{x.receiptDate}</td><td>{x.poNumber}</td><td>{x.vendorName}</td><td><span className="status-badge active">{statusLabel[x.status]||x.status}</span></td></tr>)}{!receiptRows.length&&<tr><td colSpan={5}>لا توجد استلامات حتى الآن.</td></tr>}</tbody></table></div>
    </section>}

    {tab==='returns'&&<section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">مرتجعات المشتريات</p><h2>سجل مرتجعات الموردين</h2><p>كل مرتجع مرتبط بالمورد وأمر الشراء وحركة المخزون.</p></div><button className="secondary-button" onClick={()=>void load()}>تحديث</button></div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>المرتجع</th><th>المورد</th><th>أمر الشراء</th><th>التاريخ</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>{returnRows.map(r=><tr key={r.id}><td>{r.returnNumber}</td><td>{r.vendorName}</td><td>{r.poNumber||'—'}</td><td>{r.returnDate}</td><td>{Number(r.total).toFixed(2)} ر.س</td><td><span className={'status-badge '+(statusClass[r.status]??'active')}>{statusLabel[r.status]??r.status}</span></td></tr>)}</tbody></table></div>
    </section>}
  </div></div></main>;
}
