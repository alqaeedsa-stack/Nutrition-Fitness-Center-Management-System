import { sql } from 'drizzle-orm';
import { customerSubscriptions, subscriptionRevenueSchedules } from '../db/schema';
import { recognizeSubscriptionRevenue } from './service';

function parseDate(value: string) {
  const [y,m,d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function isoDate(d: Date) { return d.toISOString().slice(0,10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth()+n); return x; }
function endOfMonth(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)); }
function daysInclusive(a: Date,b: Date) { return Math.floor((b.getTime()-a.getTime())/86400000)+1; }

export function buildMonthlySchedule(startDate:string,endDate:string,totalAmount:number,dailyProration=true) {
  const start=parseDate(startDate), end=parseDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error('INVALID_SUBSCRIPTION_DATE_RANGE');
  const totalDays=daysInclusive(start,end);
  const rows:{periodStart:string;periodEnd:string;recognitionDate:string;amount:number}[]=[];
  let cursor=new Date(start);
  let allocated=0;
  while(cursor<=end){
    const periodStart=new Date(cursor);
    const monthEnd=endOfMonth(cursor);
    const periodEnd=monthEnd<end?monthEnd:new Date(end);
    const days=daysInclusive(periodStart,periodEnd);
    const amount=dailyProration ? Math.round(totalAmount*(days/totalDays)*100)/100 : 0;
    rows.push({periodStart:isoDate(periodStart),periodEnd:isoDate(periodEnd),recognitionDate:isoDate(periodEnd),amount});
    allocated += amount;
    cursor=addDays(periodEnd,1);
  }
  if(!dailyProration){
    const equal=Math.round((totalAmount/rows.length)*100)/100;
    allocated=0;
    rows.forEach(r=>{r.amount=equal;allocated+=equal;});
  }
  if(rows.length && Math.abs(allocated-totalAmount)>0.005) rows[rows.length-1].amount=Math.round((rows[rows.length-1].amount+(totalAmount-allocated))*100)/100;
  return rows;
}

export async function createCustomerSubscription(tx:any,args:{
  centerId:string; customerId:string; productId:string; saleId:string; startDate:string; endDate:string;
  unitPrice:number; deferredRevenueAccountId?:string|null; revenueAccountId?:string|null; recognitionMethod:string;
  createdBy:string;
}) {
  const sub=(await tx.insert(customerSubscriptions).values({
    centerId:args.centerId,customerId:args.customerId,productId:args.productId,saleId:args.saleId,
    startDate:args.startDate,endDate:args.endDate,status:'active',unitPrice:args.unitPrice.toFixed(2),
    deferredRevenueAccountId:args.deferredRevenueAccountId ?? null,revenueAccountId:args.revenueAccountId ?? null,
    recognitionMethod:args.recognitionMethod,recognizedAmount:'0',createdBy:args.createdBy,updatedBy:args.createdBy,
  }).returning({id:customerSubscriptions.id}))[0];
  if(!sub) throw new Error('SUBSCRIPTION_CREATE_FAILED');
  return {subscriptionId:sub.id,scheduleCount:0};
}

export async function createSubscriptionSchedule(tx:any,args:{
  centerId:string; customerId:string; productId:string; saleId:string; startDate:string; endDate:string;
  unitPrice:number; deferredRevenueAccountId:string; revenueAccountId:string; recognitionMethod:string;
  dailyProration:boolean; createdBy:string;
}) {
  const rows=buildMonthlySchedule(args.startDate,args.endDate,args.unitPrice,args.dailyProration);
  const sub=await createCustomerSubscription(tx,args);
  await tx.insert(subscriptionRevenueSchedules).values(rows.map(row=>({
    centerId:args.centerId,subscriptionId:sub.subscriptionId,periodStart:row.periodStart,periodEnd:row.periodEnd,
    recognitionDate:row.recognitionDate,amount:row.amount.toFixed(2),status:'pending',
  })));
  return {subscriptionId:sub.subscriptionId,scheduleCount:rows.length};
}

export async function activateSubscription(tx:any,args:{centerId:string;subscriptionId:string;createdBy:string}) {
  const sub=(await tx.execute(sql`select id,customer_id as "customerId",product_id as "productId",sale_id as "saleId",start_date as "startDate",end_date as "endDate",unit_price as "unitPrice",deferred_revenue_account_id as "deferredRevenueAccountId",revenue_account_id as "revenueAccountId",recognition_method as "recognitionMethod",status from customer_subscriptions where id=${args.subscriptionId} and center_id=${args.centerId} for update`)).rows[0] as any;
  if(!sub) throw new Error('SUBSCRIPTION_NOT_FOUND');
  if(sub.status==='cancelled') throw new Error('SUBSCRIPTION_CANCELLED');
  await tx.execute(sql`update customer_subscriptions set status='active',updated_by=${args.createdBy},updated_at=now() where id=${args.subscriptionId} and center_id=${args.centerId}`);
  return sub;
}

export async function recognizeDueSubscriptionSchedules(tx:any,asOfDate:string,createdBy:string|null) {
  const rows=(await tx.execute(sql`select s.id,s.center_id as "centerId",s.subscription_id as "subscriptionId",s.recognition_date as "recognitionDate",s.amount,s.status,cs.deferred_revenue_account_id as "deferredRevenueAccountId",cs.revenue_account_id as "revenueAccountId",cs.customer_id as "customerId",cs.product_id as "productId",p.name as "productName",sa.sale_number as "saleNumber" from subscription_revenue_schedules s join customer_subscriptions cs on cs.id=s.subscription_id join products p on p.id=cs.product_id left join sales sa on sa.id=cs.sale_id where s.status='pending' and s.recognition_date<=${asOfDate} order by s.recognition_date,s.id for update`)).rows as any[];
  let recognized=0;
  for(const row of rows){
    if(!row.deferredRevenueAccountId || !row.revenueAccountId) throw new Error('ACCOUNTING_SETUP_REQUIRED: حسابات الإيراد المؤجل وإيراد الاشتراك غير مُهيأة');
    const entry=await recognizeSubscriptionRevenue(tx,{centerId:row.centerId,scheduleId:row.id,subscriptionId:row.subscriptionId,date:row.recognitionDate,amount:Number(row.amount),deferredAccountId:row.deferredRevenueAccountId,revenueAccountId:row.revenueAccountId,createdBy:createdBy,description:`اعتراف إيراد اشتراك ${row.saleNumber??row.subscriptionId} — ${row.productName}`});
    await tx.execute(sql`update subscription_revenue_schedules set status='posted',journal_entry_id=${entry.id},updated_at=now() where id=${row.id} and status='pending'`);
    await tx.execute(sql`update customer_subscriptions set recognized_amount=coalesce(recognized_amount,0)+${row.amount},updated_at=now() where id=${row.subscriptionId}`);
    recognized++;
  }
  return {recognized};
}


export async function cancelPendingSubscriptionSchedulesForSale(tx:any,args:{centerId:string;saleId:string;updatedBy:string}) {
  const result = await tx.execute(sql`
    update subscription_revenue_schedules s
    set status='cancelled', updated_at=now()
    where s.status='pending'
      and s.subscription_id in (
        select id from customer_subscriptions
        where center_id=${args.centerId} and sale_id=${args.saleId}
      )
  `);
  await tx.execute(sql`
    update customer_subscriptions
    set status='cancelled', updated_by=${args.updatedBy}, updated_at=now()
    where center_id=${args.centerId} and sale_id=${args.saleId} and status<>'cancelled'
  `);
  return {cancelledSchedules:Number(result.rowCount ?? 0)};
}
