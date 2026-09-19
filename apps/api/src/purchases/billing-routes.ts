import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { withDatabase } from '../db/client';
import { purchaseBillItems, purchaseBills, purchaseOrderItems, purchaseOrders, purchasePayments, products, vendors } from '../db/schema';
import { requirePermission } from '../auth/permissions';

export type PurchaseBillingBindings = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };
export const purchaseBillingRoutes = new Hono<{ Bindings: PurchaseBillingBindings }>();

async function access(c: any, permission: 'purchases.read' | 'purchases.write' | 'purchases.post' | 'purchases.pay') { return requirePermission(c, permission); }

const billSchema = z.object({
  vendorId: z.string().uuid(), purchaseOrderId: z.string().uuid().optional().nullable(),
  vendorInvoiceNumber: z.string().trim().max(100).optional().nullable(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(z.object({ purchaseOrderItemId: z.string().uuid().optional().nullable(), purchaseReceiptItemId: z.string().uuid().optional().nullable(), productId: z.string().uuid().optional().nullable(), description: z.string().trim().min(1).max(250), quantity: z.number().positive().max(999999), unitCost: z.number().min(0).max(999999999), taxRate: z.number().min(0).max(100).default(0) })).min(1).max(200),
});
const paymentSchema = z.object({ billId: z.string().uuid(), paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().positive().max(999999999), paymentMethod: z.string().trim().min(1).max(50), reference: z.string().trim().max(150).optional().nullable(), notes: z.string().trim().max(1000).optional().nullable() });
function billNumber(){ const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14); return 'BILL-'+stamp+'-'+crypto.randomUUID().slice(0,8).toUpperCase(); }
function paymentNumber(){ const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14); return 'PAY-'+stamp+'-'+crypto.randomUUID().slice(0,8).toUpperCase(); }

purchaseBillingRoutes.get('/billing-orders', async c => {
  const auth = await access(c, 'purchases.read');
  if ('error' in auth) return auth.error;
  const rows = await withDatabase(c.env, db => db.select({
    id: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    vendorId: purchaseOrders.vendorId,
    vendorName: vendors.name,
    orderDate: purchaseOrders.orderDate,
    status: purchaseOrders.status,
    total: purchaseOrders.total,
  }).from(purchaseOrders).innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(and(eq(purchaseOrders.centerId, auth.user.centerId!), inArray(purchaseOrders.status, ['partially_received', 'received'])))
    .orderBy(desc(purchaseOrders.orderDate)));
  return c.json({ orders: rows });
});

purchaseBillingRoutes.get('/bills', async c => {
  const auth=await access(c,'purchases.read'); if('error' in auth) return auth.error; const status=c.req.query('status');
  const rows=await withDatabase(c.env,db=>db.select({id:purchaseBills.id,billNumber:purchaseBills.billNumber,vendorInvoiceNumber:purchaseBills.vendorInvoiceNumber,billDate:purchaseBills.billDate,dueDate:purchaseBills.dueDate,status:purchaseBills.status,vendorId:purchaseBills.vendorId,vendorName:vendors.name,purchaseOrderId:purchaseBills.purchaseOrderId,poNumber:purchaseOrders.poNumber,subtotal:purchaseBills.subtotal,tax:purchaseBills.tax,total:purchaseBills.total,paidAmount:purchaseBills.paidAmount,balanceDue:purchaseBills.balanceDue}).from(purchaseBills).innerJoin(vendors,eq(vendors.id,purchaseBills.vendorId)).leftJoin(purchaseOrders,eq(purchaseOrders.id,purchaseBills.purchaseOrderId)).where(status?and(eq(purchaseBills.centerId,auth.user.centerId!),eq(purchaseBills.status,status)):eq(purchaseBills.centerId,auth.user.centerId!)).orderBy(desc(purchaseBills.billDate),desc(purchaseBills.createdAt)));
  return c.json({bills:rows});
});

purchaseBillingRoutes.get('/bills/:id', async c => {
  const auth=await access(c,'purchases.read'); if('error' in auth) return auth.error;
  const rows=await withDatabase(c.env,db=>db.select({id:purchaseBills.id,billNumber:purchaseBills.billNumber,vendorInvoiceNumber:purchaseBills.vendorInvoiceNumber,billDate:purchaseBills.billDate,dueDate:purchaseBills.dueDate,status:purchaseBills.status,vendorId:purchaseBills.vendorId,vendorName:vendors.name,purchaseOrderId:purchaseBills.purchaseOrderId,poNumber:purchaseOrders.poNumber,subtotal:purchaseBills.subtotal,tax:purchaseBills.tax,total:purchaseBills.total,paidAmount:purchaseBills.paidAmount,balanceDue:purchaseBills.balanceDue,notes:purchaseBills.notes}).from(purchaseBills).innerJoin(vendors,eq(vendors.id,purchaseBills.vendorId)).leftJoin(purchaseOrders,eq(purchaseOrders.id,purchaseBills.purchaseOrderId)).where(and(eq(purchaseBills.id,c.req.param('id')),eq(purchaseBills.centerId,auth.user.centerId!))).limit(1));
  if(!rows[0]) return c.json({error:{code:'NOT_FOUND',message:'فاتورة المورد غير موجودة'}},404);
  const items=await withDatabase(c.env,db=>db.select({id:purchaseBillItems.id,purchaseOrderItemId:purchaseBillItems.purchaseOrderItemId,purchaseReceiptItemId:purchaseBillItems.purchaseReceiptItemId,productId:purchaseBillItems.productId,description:purchaseBillItems.description,productName:products.name,quantity:purchaseBillItems.quantity,unitCost:purchaseBillItems.unitCost,taxRate:purchaseBillItems.taxRate,taxAmount:purchaseBillItems.taxAmount,lineTotal:purchaseBillItems.lineTotal}).from(purchaseBillItems).leftJoin(products,eq(products.id,purchaseBillItems.productId)).where(eq(purchaseBillItems.purchaseBillId,c.req.param('id'))));
  const payments=await withDatabase(c.env,db=>db.select().from(purchasePayments).where(and(eq(purchasePayments.billId,c.req.param('id')),eq(purchasePayments.centerId,auth.user.centerId!))).orderBy(desc(purchasePayments.paymentDate),desc(purchasePayments.createdAt)));
  return c.json({bill:rows[0],items,payments});
});

purchaseBillingRoutes.get('/bills/candidates/:orderId', async c => {
  const auth=await access(c,'purchases.read'); if('error' in auth) return auth.error;
  const order=await withDatabase(c.env,db=>db.select({id:purchaseOrders.id,vendorId:purchaseOrders.vendorId,vendorName:vendors.name,poNumber:purchaseOrders.poNumber,status:purchaseOrders.status,orderDate:purchaseOrders.orderDate}).from(purchaseOrders).innerJoin(vendors,eq(vendors.id,purchaseOrders.vendorId)).where(and(eq(purchaseOrders.id,c.req.param('orderId')),eq(purchaseOrders.centerId,auth.user.centerId!))).limit(1));
  if(!order[0]) return c.json({error:{code:'NOT_FOUND',message:'أمر الشراء غير موجود'}},404);
  const rows=await withDatabase(c.env,db=>db.select({id:purchaseOrderItems.id,productId:purchaseOrderItems.productId,productName:products.name,description:purchaseOrderItems.description,ordered:purchaseOrderItems.quantity,received:purchaseOrderItems.receivedQuantity,returned:purchaseOrderItems.returnedQuantity,unitCost:purchaseOrderItems.unitCost}).from(purchaseOrderItems).innerJoin(products,eq(products.id,purchaseOrderItems.productId)).where(eq(purchaseOrderItems.purchaseOrderId,c.req.param('orderId'))));
  const items=[]; for(const x of rows){ const billed=await withDatabase(c.env,db=>db.select({quantity:purchaseBillItems.quantity}).from(purchaseBillItems).innerJoin(purchaseBills,eq(purchaseBills.id,purchaseBillItems.purchaseBillId)).where(and(eq(purchaseBillItems.purchaseOrderItemId,x.id),eq(purchaseBills.centerId,auth.user.centerId!)))); const alreadyBilled=billed.reduce((n,v)=>n+Number(v.quantity),0); items.push({...x,alreadyBilled,availableToBill:Math.max(0,Number(x.received)-Number(x.returned)-alreadyBilled)}); }
  return c.json({order:order[0],items});
});

purchaseBillingRoutes.post('/bills', async c => {
  const auth=await access(c,'purchases.write'); if('error' in auth) return auth.error; const parsed=billSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return c.json({error:{code:'VALIDATION_ERROR',message:'بيانات فاتورة المورد غير صحيحة',details:parsed.error.flatten()}},400); const input=parsed.data;
  const result=await withDatabase(c.env,db=>db.transaction(async tx=>{
    const vendor=await tx.select({id:vendors.id}).from(vendors).where(and(eq(vendors.id,input.vendorId),eq(vendors.centerId,auth.user.centerId!))).limit(1); if(!vendor[0]) throw new Error('المورد غير موجود');
    if(input.purchaseOrderId){ const order=await tx.select({id:purchaseOrders.id,vendorId:purchaseOrders.vendorId}).from(purchaseOrders).where(and(eq(purchaseOrders.id,input.purchaseOrderId),eq(purchaseOrders.centerId,auth.user.centerId!))).limit(1); if(!order[0]) throw new Error('أمر الشراء غير موجود'); if(order[0].vendorId!==input.vendorId) throw new Error('المورد لا يطابق أمر الشراء'); }
    const normalized:any[]=[]; let subtotal=0,tax=0;
    for(const item of input.items){ let productId=item.productId??null,description=item.description,unitCost=item.unitCost;
      if(item.purchaseOrderItemId){ const row=await tx.select({productId:purchaseOrderItems.productId,description:purchaseOrderItems.description,received:purchaseOrderItems.receivedQuantity,returned:purchaseOrderItems.returnedQuantity,unitCost:purchaseOrderItems.unitCost}).from(purchaseOrderItems).innerJoin(purchaseOrders,eq(purchaseOrders.id,purchaseOrderItems.purchaseOrderId)).where(and(eq(purchaseOrderItems.id,item.purchaseOrderItemId),eq(purchaseOrders.centerId,auth.user.centerId!))).limit(1); if(!row[0]) throw new Error('بند أمر الشراء غير موجود'); productId=row[0].productId; description=row[0].description||item.description; unitCost=item.unitCost;
        const billed=await tx.select({quantity:purchaseBillItems.quantity}).from(purchaseBillItems).innerJoin(purchaseBills,eq(purchaseBills.id,purchaseBillItems.purchaseBillId)).where(and(eq(purchaseBillItems.purchaseOrderItemId,item.purchaseOrderItemId),eq(purchaseBills.centerId,auth.user.centerId!))); const already=billed.reduce((n,v)=>n+Number(v.quantity),0); const available=Math.max(0,Number(row[0].received)-Number(row[0].returned)-already); if(item.quantity>available+0.000001) throw new Error('الكمية المفوترة تتجاوز الكمية المستلمة غير المفوترة'); }
      const lineSubtotal=Math.round(item.quantity*unitCost*100)/100; const lineTax=Math.round(lineSubtotal*(item.taxRate/100)*100)/100; subtotal+=lineSubtotal; tax+=lineTax; normalized.push({...item,productId,description,unitCost,taxAmount:lineTax,lineTotal:lineSubtotal+lineTax});
    }
    subtotal=Math.round(subtotal*100)/100; tax=Math.round(tax*100)/100; const total=Math.round((subtotal+tax)*100)/100; const number=billNumber();
    const inserted=await tx.insert(purchaseBills).values({centerId:auth.user.centerId!,vendorId:input.vendorId,purchaseOrderId:input.purchaseOrderId??null,billNumber:number,vendorInvoiceNumber:input.vendorInvoiceNumber??null,billDate:input.billDate,dueDate:input.dueDate??null,status:'draft',subtotal:subtotal.toFixed(2),tax:tax.toFixed(2),total:total.toFixed(2),paidAmount:'0',balanceDue:total.toFixed(2),notes:input.notes??null,createdBy:auth.user.userId}).returning({id:purchaseBills.id,billNumber:purchaseBills.billNumber});
    for(const item of normalized) await tx.insert(purchaseBillItems).values({purchaseBillId:inserted[0].id,purchaseOrderItemId:item.purchaseOrderItemId??null,purchaseReceiptItemId:item.purchaseReceiptItemId??null,productId:item.productId,description:item.description,quantity:item.quantity.toString(),unitCost:item.unitCost.toFixed(2),taxRate:item.taxRate.toFixed(4),taxAmount:item.taxAmount.toFixed(2),lineTotal:item.lineTotal.toFixed(2)});
    return {id:inserted[0].id,billNumber:inserted[0].billNumber,total};
  })); return c.json({bill:result},201);
});

purchaseBillingRoutes.post('/bills/:id/post', async c => { const auth=await access(c,'purchases.post'); if('error' in auth) return auth.error; const result=await withDatabase(c.env,db=>db.transaction(async tx=>{ const rows=await tx.select().from(purchaseBills).where(and(eq(purchaseBills.id,c.req.param('id')),eq(purchaseBills.centerId,auth.user.centerId!))).limit(1); const bill=rows[0]; if(!bill) throw new Error('فاتورة المورد غير موجودة'); if(bill.status!=='draft') throw new Error('لا يمكن ترحيل الفاتورة من حالتها الحالية'); await tx.update(purchaseBills).set({status:'posted',updatedAt:new Date()}).where(eq(purchaseBills.id,bill.id)); return {id:bill.id,billNumber:bill.billNumber,status:'posted'}; })); return c.json({bill:result}); });

purchaseBillingRoutes.post('/payments', async c => { const auth=await access(c,'purchases.pay'); if('error' in auth) return auth.error; const parsed=paymentSchema.safeParse(await c.req.json().catch(()=>null)); if(!parsed.success) return c.json({error:{code:'VALIDATION_ERROR',message:'بيانات الدفعة غير صحيحة',details:parsed.error.flatten()}},400); const input=parsed.data;
  const result=await withDatabase(c.env,db=>db.transaction(async tx=>{ const rows=await tx.select().from(purchaseBills).where(and(eq(purchaseBills.id,input.billId),eq(purchaseBills.centerId,auth.user.centerId!))).limit(1); const bill=rows[0]; if(!bill) throw new Error('فاتورة المورد غير موجودة'); if(!['posted','partially_paid'].includes(bill.status)) throw new Error('لا يمكن الدفع إلا لفاتورة مورد مرحّلة'); const balance=Number(bill.balanceDue); if(input.amount>balance+0.005) throw new Error('قيمة الدفعة تتجاوز الرصيد المستحق'); const number=paymentNumber(); const payment=await tx.insert(purchasePayments).values({centerId:auth.user.centerId!,vendorId:bill.vendorId,billId:bill.id,paymentNumber:number,paymentDate:input.paymentDate,amount:input.amount.toFixed(2),paymentMethod:input.paymentMethod,reference:input.reference??null,notes:input.notes??null,status:'posted',createdBy:auth.user.userId}).returning({paymentNumber:purchasePayments.paymentNumber}); const paid=Math.round((Number(bill.paidAmount)+input.amount)*100)/100; const remaining=Math.max(0,Math.round((Number(bill.total)-paid)*100)/100); const status=remaining<=0.005?'paid':'partially_paid'; await tx.update(purchaseBills).set({paidAmount:paid.toFixed(2),balanceDue:remaining.toFixed(2),status,updatedAt:new Date()}).where(eq(purchaseBills.id,bill.id)); return {paymentNumber:payment[0].paymentNumber,billNumber:bill.billNumber,amount:input.amount,remaining}; })); return c.json({payment:result},201);
});

purchaseBillingRoutes.get('/payments', async c => { const auth=await access(c,'purchases.read'); if('error' in auth) return auth.error; const rows=await withDatabase(c.env,db=>db.select({id:purchasePayments.id,paymentNumber:purchasePayments.paymentNumber,paymentDate:purchasePayments.paymentDate,amount:purchasePayments.amount,paymentMethod:purchasePayments.paymentMethod,reference:purchasePayments.reference,vendorId:purchasePayments.vendorId,vendorName:vendors.name,billId:purchasePayments.billId,billNumber:purchaseBills.billNumber}).from(purchasePayments).innerJoin(vendors,eq(vendors.id,purchasePayments.vendorId)).leftJoin(purchaseBills,eq(purchaseBills.id,purchasePayments.billId)).where(eq(purchasePayments.centerId,auth.user.centerId!)).orderBy(desc(purchasePayments.paymentDate),desc(purchasePayments.createdAt))); return c.json({payments:rows}); });

purchaseBillingRoutes.get('/vendors/:vendorId/statement', async c => { const auth=await access(c,'purchases.read'); if('error' in auth) return auth.error; const vendorId=c.req.param('vendorId'); const vendor=await withDatabase(c.env,db=>db.select({id:vendors.id,code:vendors.code,name:vendors.name}).from(vendors).where(and(eq(vendors.id,vendorId),eq(vendors.centerId,auth.user.centerId!))).limit(1)); if(!vendor[0]) return c.json({error:{code:'NOT_FOUND',message:'المورد غير موجود'}},404);
  const bills=await withDatabase(c.env,db=>db.select({id:purchaseBills.id,number:purchaseBills.billNumber,date:purchaseBills.billDate,status:purchaseBills.status,total:purchaseBills.total}).from(purchaseBills).where(and(eq(purchaseBills.vendorId,vendorId),eq(purchaseBills.centerId,auth.user.centerId!))).orderBy(purchaseBills.billDate));
  const payments=await withDatabase(c.env,db=>db.select({id:purchasePayments.id,number:purchasePayments.paymentNumber,date:purchasePayments.paymentDate,amount:purchasePayments.amount,billId:purchasePayments.billId,billNumber:purchaseBills.billNumber}).from(purchasePayments).leftJoin(purchaseBills,eq(purchaseBills.id,purchasePayments.billId)).where(and(eq(purchasePayments.vendorId,vendorId),eq(purchasePayments.centerId,auth.user.centerId!))).orderBy(purchasePayments.paymentDate));
  const entries=[...bills.map(x=>({type:'bill',id:x.id,number:x.number,date:x.date,description:'فاتورة مورد',debit:0,credit:Number(x.total),impact:Number(x.total)})),...payments.map(x=>({type:'payment',id:x.id,number:x.number,date:x.date,description:'دفعة للمورد',debit:Number(x.amount),credit:0,impact:-Number(x.amount),billId:x.billId,billNumber:x.billNumber}))].sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.number.localeCompare(b.number));
  let balance=0; const ledger=entries.map(x=>({...x,balance:(balance+=x.impact).toFixed(2)})); const totalBills=bills.reduce((n,x)=>n+Number(x.total),0); const totalPaid=payments.reduce((n,x)=>n+Number(x.amount),0);
  return c.json({vendor:vendor[0],summary:{totalBills:totalBills.toFixed(2),totalPaid:totalPaid.toFixed(2),balanceDue:(totalBills-totalPaid).toFixed(2)},ledger});
});