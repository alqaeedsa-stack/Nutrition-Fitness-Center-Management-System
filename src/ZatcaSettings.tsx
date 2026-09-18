import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type TaxRate = { id:string; code:string; name:string; rate:string; categoryCode:string; exemptionReasonCode?:string|null; active:boolean };
type ZatcaSettings = { id:string; environment:'simulation'|'production'; vatNumber?:string|null; legalName?:string|null; invoiceTypeCode:string; deviceSerial?:string|null; sellerStreet?:string|null; sellerBuildingNumber?:string|null; sellerCity?:string|null; sellerPostalCode?:string|null; sellerCountryCode?:string|null; pih?:string|null; lastIcv:number; status:string; lastError?:string|null };
type EInvoice = { id:string; invoiceNumber:string; invoiceType:string; status:string; responseCode?:string|null; createdAt:string; submittedAt?:string|null };

export default function ZatcaSettings() {
 const [settings,setSettings]=useState<ZatcaSettings|null>(null);
 const [taxRates,setTaxRates]=useState<TaxRate[]>([]);
 const [invoices,setInvoices]=useState<EInvoice[]>([]);
 const [form,setForm]=useState({environment:'simulation' as 'simulation'|'production',vatNumber:'',legalName:'',invoiceTypeCode:'0200000',deviceSerial:'',sellerStreet:'',sellerBuildingNumber:'',sellerCity:'',sellerPostalCode:'',sellerCountryCode:'SA',pih:''});
 const [taxForm,setTaxForm]=useState({code:'',name:'',rate:'',categoryCode:'S',exemptionReasonCode:''});
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');

 async function load(){ setLoading(true); setError(''); try {
  const [s,t,i]=await Promise.all([apiFetch<{settings:ZatcaSettings|null}>('/zatca/settings'),apiFetch<{taxRates:TaxRate[]}>('/zatca/tax-rates'),apiFetch<{invoices:EInvoice[]}>('/zatca/invoices')]);
  setSettings(s.settings); setTaxRates(t.taxRates); setInvoices(i.invoices);
  if(s.settings)setForm({environment:s.settings.environment,vatNumber:s.settings.vatNumber??'',legalName:s.settings.legalName??'',invoiceTypeCode:s.settings.invoiceTypeCode,deviceSerial:s.settings.deviceSerial??'',sellerStreet:s.settings.sellerStreet??'',sellerBuildingNumber:s.settings.sellerBuildingNumber??'',sellerCity:s.settings.sellerCity??'',sellerPostalCode:s.settings.sellerPostalCode??'',sellerCountryCode:s.settings.sellerCountryCode??'SA',pih:s.settings.pih??''});
 } catch(e){setError(e instanceof Error?e.message:'تعذر تحميل إعدادات ZATCA');} finally{setLoading(false);} }
 useEffect(()=>{void load()},[]);

 async function saveSettings(e:FormEvent){ e.preventDefault(); setSaving(true); setError(''); setMessage(''); try {
  const r=await apiFetch<{settings:ZatcaSettings}>('/zatca/settings',{method:'PUT',body:JSON.stringify({...form,vatNumber:form.vatNumber.trim()||null,legalName:form.legalName.trim()||null,deviceSerial:form.deviceSerial.trim()||null,sellerStreet:form.sellerStreet.trim()||null,sellerBuildingNumber:form.sellerBuildingNumber.trim()||null,sellerCity:form.sellerCity.trim()||null,sellerPostalCode:form.sellerPostalCode.trim()||null,sellerCountryCode:form.sellerCountryCode.trim().toUpperCase()||'SA',pih:form.pih.trim()||null})});
  setSettings(r.settings); setMessage('تم حفظ إعدادات ZATCA');
 } catch(e){setError(e instanceof Error?e.message:'تعذر حفظ الإعدادات');} finally{setSaving(false);} }

 async function createTaxRate(e:FormEvent){ e.preventDefault(); setSaving(true); setError(''); setMessage(''); try {
  await apiFetch('/zatca/tax-rates',{method:'POST',body:JSON.stringify({...taxForm,rate:Number(taxForm.rate),exemptionReasonCode:taxForm.exemptionReasonCode.trim()||null,active:true})});
  setTaxForm({code:'',name:'',rate:'',categoryCode:'S',exemptionReasonCode:''}); setMessage('تمت إضافة كود الضريبة'); await load();
 } catch(e){setError(e instanceof Error?e.message:'تعذر إضافة كود الضريبة');} finally{setSaving(false);} }

 async function toggleTaxRate(rate:TaxRate){setError('');setMessage('');try{await apiFetch('/zatca/tax-rates/'+rate.id,{method:'PATCH',body:JSON.stringify({active:!rate.active})});await load();setMessage('تم تحديث حالة كود الضريبة')}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث الضريبة')}}

 return <main className='app-shell'>
  <header className='app-header'><div><span className='eyebrow'>ZATCA / FATOORA</span><h1>إعدادات الفوترة الإلكترونية والضرائب</h1><p>إدارة البيئة الضريبية وأكواد الضرائب ومتابعة حالة الفواتير الإلكترونية.</p></div><Link className='secondary-button' to='/admin/dashboard'>لوحة الإدارة</Link></header>
  {error&&<div className='info-strip warning'>{error}</div>}{message&&<div className='info-strip'>{message}</div>}
  {loading?<section className='panel'><p>جارٍ تحميل الإعدادات...</p></section>:<>
   <section className='staff-management-grid'>
    <section className='panel'><p className='eyebrow'>ZATCA CONFIGURATION</p><h2>إعدادات المنشأة</h2><form className='form-stack' onSubmit={saveSettings}>
     <label>بيئة الإرسال<select value={form.environment} onChange={e=>setForm(v=>({...v,environment:e.target.value as 'simulation'|'production'}))}><option value='simulation'>المحاكاة — Simulation</option><option value='production'>الإنتاج — Production</option></select></label>
     <label>الرقم الضريبي<input dir='ltr' value={form.vatNumber} onChange={e=>setForm(v=>({...v,vatNumber:e.target.value}))} placeholder='الرقم الضريبي' /></label>
     <label>الاسم القانوني للمنشأة<input value={form.legalName} onChange={e=>setForm(v=>({...v,legalName:e.target.value}))}/></label>
     <label>Invoice Type Code<input dir='ltr' value={form.invoiceTypeCode} onChange={e=>setForm(v=>({...v,invoiceTypeCode:e.target.value}))}/></label>
     <label>الرقم التسلسلي للجهاز<input dir='ltr' value={form.deviceSerial} onChange={e=>setForm(v=>({...v,deviceSerial:e.target.value}))}/></label>
     <div className='form-row'><label>الشارع<input value={form.sellerStreet} onChange={e=>setForm(v=>({...v,sellerStreet:e.target.value}))}/></label><label>رقم المبنى<input dir='ltr' value={form.sellerBuildingNumber} onChange={e=>setForm(v=>({...v,sellerBuildingNumber:e.target.value}))}/></label></div>
     <div className='form-row'><label>المدينة<input value={form.sellerCity} onChange={e=>setForm(v=>({...v,sellerCity:e.target.value}))}/></label><label>الرمز البريدي<input dir='ltr' value={form.sellerPostalCode} onChange={e=>setForm(v=>({...v,sellerPostalCode:e.target.value}))}/></label></div>
     <label>رمز الدولة<input dir='ltr' maxLength={2} value={form.sellerCountryCode} onChange={e=>setForm(v=>({...v,sellerCountryCode:e.target.value}))}/></label>
     <label>PIH السابق<input dir='ltr' value={form.pih} onChange={e=>setForm(v=>({...v,pih:e.target.value}))}/></label>
     <button className='primary-action button' disabled={saving}>{saving?'جارٍ الحفظ...':'حفظ الإعدادات'}</button>
    </form>{settings&&<div className='cart-note'>الحالة: <strong>{settings.status}</strong> · ICV الحالي: <strong>{settings.lastIcv}</strong>{settings.lastError?' · آخر خطأ: '+settings.lastError:''}</div>}</section>
    <section className='panel'><p className='eyebrow'>TAX RATES</p><h2>أكواد الضرائب</h2>
     <form className='form-stack' onSubmit={createTaxRate}><label>الكود<input dir='ltr' required value={taxForm.code} onChange={e=>setTaxForm(v=>({...v,code:e.target.value}))} placeholder='VAT15'/></label>
      <label>الاسم<input required value={taxForm.name} onChange={e=>setTaxForm(v=>({...v,name:e.target.value}))} placeholder='ضريبة القيمة المضافة'/></label>
      <div className='form-row'><label>النسبة %<input type='number' min='0' max='100' step='0.01' required value={taxForm.rate} onChange={e=>setTaxForm(v=>({...v,rate:e.target.value}))}/></label>
      <label>الفئة<select value={taxForm.categoryCode} onChange={e=>setTaxForm(v=>({...v,categoryCode:e.target.value}))}><option value='S'>S — خاضعة</option><option value='Z'>Z — صفرية</option><option value='E'>E — معفاة</option><option value='O'>O — خارج النطاق</option></select></label></div>
      <label>رمز سبب الإعفاء<input dir='ltr' value={taxForm.exemptionReasonCode} onChange={e=>setTaxForm(v=>({...v,exemptionReasonCode:e.target.value}))}/></label>
      <button className='secondary-button' disabled={saving}>إضافة كود ضريبة</button></form>
     <div className='staff-table-wrap'><table className='staff-table'><thead><tr><th>الكود</th><th>الاسم</th><th>النسبة</th><th>الفئة</th><th>الحالة</th><th></th></tr></thead><tbody>{taxRates.map(t=><tr key={t.id}><td dir='ltr'>{t.code}</td><td>{t.name}</td><td>{t.rate}%</td><td>{t.categoryCode}</td><td>{t.active?'نشط':'موقوف'}</td><td><button className='secondary-button' type='button' onClick={()=>void toggleTaxRate(t)}>{t.active?'إيقاف':'تفعيل'}</button></td></tr>)}</tbody></table></div>
    </section>
   </section>
   <section className='panel'><div className='panel-heading-row'><div><p className='eyebrow'>E-INVOICES</p><h2>الفواتير الإلكترونية</h2></div><button className='secondary-button' type='button' onClick={()=>void load()}>تحديث</button></div>
    {!invoices.length?<p className='empty-state'>لا توجد فواتير إلكترونية حتى الآن.</p>:<div className='staff-table-wrap'><table className='staff-table'><thead><tr><th>رقم الفاتورة</th><th>النوع</th><th>الحالة</th><th>كود الاستجابة</th><th>التاريخ</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td dir='ltr'>{i.invoiceNumber}</td><td>{i.invoiceType}</td><td>{i.status}</td><td>{i.responseCode??'—'}</td><td>{new Date(i.createdAt).toLocaleString('ar-SA')}</td></tr>)}</tbody></table></div>}</section>
  </>}
 </main>;
}