export type ZatcaInvoiceLine = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
  taxCode: string | null;
  taxRate: number;
  categoryCode: string;
  exemptionReasonCode: string | null;
};

export type ZatcaInvoiceInput = {
  invoiceNumber: string;
  uuid: string;
  invoiceType: 'simplified' | 'standard';
  issueDate: Date;
  icv: number;
  previousInvoiceHash: string;
  seller: {
    legalName: string;
    vatNumber: string;
    street: string;
    buildingNumber: string;
    city: string;
    postalCode: string;
    countryCode: string;
  };
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  lines: ZatcaInvoiceLine[];
};

function xml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function money(value: number) {
  return value.toFixed(2);
}

function base64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Text(value: string) {
  return base64(new TextEncoder().encode(value));
}

async function sha256Base64(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64(new Uint8Array(digest));
}

function tlv(tag: number, value: string) {
  const bytes = new TextEncoder().encode(value);
  const length = bytes.length;
  const header = new Uint8Array([tag, length]);
  const result = new Uint8Array(header.length + bytes.length);
  result.set(header, 0);
  result.set(bytes, header.length);
  return result;
}

function buildQrCode(input: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: number;
  tax: number;
  invoiceHash: string;
  publicKey: string;
  signature: string;
  certificateSignature: string;
}) {
  const parts = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, input.timestamp),
    tlv(4, money(input.total)),
    tlv(5, money(input.tax)),
    tlv(6, input.invoiceHash),
    tlv(7, input.publicKey),
    tlv(8, input.signature),
    ...(input.certificateSignature ? [tlv(9, input.certificateSignature)] : []),
  ];
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const payload = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    payload.set(part, offset);
    offset += part.length;
  }
  return base64(payload);
}

function taxCategory(line: ZatcaInvoiceLine) {
  if (line.categoryCode === 'Z') return '<cac:ClassifiedTaxCategory><cbc:ID>Z</cbc:ID><cbc:Percent>' + money(line.taxRate) + '</cbc:Percent></cac:ClassifiedTaxCategory>';
  if (line.categoryCode === 'E') return '<cac:ClassifiedTaxCategory><cbc:ID>E</cbc:ID><cbc:Percent>0.00</cbc:Percent><cbc:TaxExemptionReasonCode>' + xml(line.exemptionReasonCode) + '</cbc:TaxExemptionReasonCode></cac:ClassifiedTaxCategory>';
  if (line.categoryCode === 'O') return '<cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cbc:Percent>0.00</cbc:Percent></cac:ClassifiedTaxCategory>';
  return '<cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>' + money(line.taxRate) + '</cbc:Percent></cac:ClassifiedTaxCategory>';
}

function buildInvoiceXml(input: ZatcaInvoiceInput, qrCode: string) {
  const issueDate = input.issueDate.toISOString();
  const date = issueDate.slice(0, 10);
  const time = issueDate.slice(11, 19) + 'Z';
  const typeCode = '388';
  const subtype = input.invoiceType === 'simplified' ? '0200000' : '0100000';

  const lines = input.lines.map((line, index) => {
    const taxable = Math.max(0, line.quantity * line.unitPrice - line.discount);
    const discountXml = line.discount > 0
      ? '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="SAR">' + money(line.discount) + '</cbc:Amount></cac:AllowanceCharge>'
      : '';
    return '<cac:InvoiceLine>' +
      '<cbc:ID>' + (index + 1) + '</cbc:ID>' +
      '<cbc:InvoicedQuantity unitCode="PCE">' + line.quantity + '</cbc:InvoicedQuantity>' +
      '<cbc:LineExtensionAmount currencyID="SAR">' + money(taxable) + '</cbc:LineExtensionAmount>' +
      discountXml +
      '<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">' + money(line.tax) + '</cbc:TaxAmount></cac:TaxTotal>' +
      '<cac:Item><cbc:Name>' + xml(line.productName) + '</cbc:Name><cac:ClassifiedTaxCategory>' +
      taxCategory(line).replace('<cac:ClassifiedTaxCategory>', '').replace('</cac:ClassifiedTaxCategory>', '') +
      '</cac:ClassifiedTaxCategory></cac:Item>' +
      '<cac:Price><cbc:PriceAmount currencyID="SAR">' + money(line.unitPrice) + '</cbc:PriceAmount></cac:Price>' +
      '</cac:InvoiceLine>';
  }).join('');

  const allowance = input.discount > 0
    ? '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason><cbc:Amount currencyID="SAR">' + money(input.discount) + '</cbc:Amount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>0.00</cbc:Percent></cac:TaxCategory></cac:AllowanceCharge>'
    : '';

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">' +
    '<cbc:UBLVersionID>2.1</cbc:UBLVersionID>' +
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:zatca:sa:invoice:1.0</cbc:CustomizationID>' +
    '<cbc:ProfileID>reporting:1.0</cbc:ProfileID>' +
    '<cbc:ID>' + xml(input.invoiceNumber) + '</cbc:ID>' +
    '<cbc:UUID>' + xml(input.uuid) + '</cbc:UUID>' +
    '<cbc:IssueDate>' + date + '</cbc:IssueDate>' +
    '<cbc:IssueTime>' + time + '</cbc:IssueTime>' +
    '<cbc:InvoiceTypeCode name="' + subtype + '">' + typeCode + '</cbc:InvoiceTypeCode>' +
    '<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>' +
    '<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>' +
    '<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>' + input.icv + '</cbc:UUID></cac:AdditionalDocumentReference>' +
    '<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">' + xml(input.previousInvoiceHash) + '</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>' +
    '<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">' + xml(qrCode) + '</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>' +
    '<cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="VAT">' + xml(input.seller.vatNumber) + '</cbc:ID></cac:PartyIdentification><cac:PostalAddress>' +
    '<cbc:StreetName>' + xml(input.seller.street) + '</cbc:StreetName>' +
    '<cbc:BuildingNumber>' + xml(input.seller.buildingNumber) + '</cbc:BuildingNumber>' +
    '<cbc:CityName>' + xml(input.seller.city) + '</cbc:CityName>' +
    '<cbc:PostalZone>' + xml(input.seller.postalCode) + '</cbc:PostalZone>' +
    '<cac:Country><cbc:IdentificationCode>' + xml(input.seller.countryCode) + '</cbc:IdentificationCode></cac:Country>' +
    '</cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>' + xml(input.seller.vatNumber) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>' +
    '<cac:PartyLegalEntity><cbc:RegistrationName>' + xml(input.seller.legalName) + '</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>' +
    allowance +
    '<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">' + money(input.tax) + '</cbc:TaxAmount></cac:TaxTotal>' +
    lines +
    '<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="SAR">' + money(input.subtotal - input.discount) + '</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="SAR">' + money(input.subtotal - input.discount) + '</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="SAR">' + money(input.total) + '</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount currencyID="SAR">' + money(input.discount) + '</cbc:AllowanceTotalAmount><cbc:PayableAmount currencyID="SAR">' + money(input.total) + '</cbc:PayableAmount></cac:LegalMonetaryTotal>' +
    '</Invoice>';
}

export async function generateZatcaInvoice(input: ZatcaInvoiceInput) {
  const issueDate = input.issueDate.toISOString();
  const unsignedWithoutQr = buildInvoiceXml(input, '');
  const invoiceHash = await sha256Base64(unsignedWithoutQr);
  // Tags 7-9 require the cryptographic stamp generated from the EGS certificate.
  // Until a real CSID/certificate and XAdES signer are configured, do not fabricate
  // cryptographic values. The QR remains explicitly unsigned and submission is blocked.
  const qrCode = buildQrCode({
    sellerName: input.seller.legalName,
    vatNumber: input.seller.vatNumber,
    timestamp: issueDate,
    total: input.total,
    tax: input.tax,
    invoiceHash,
    publicKey: '',
    signature: '',
    certificateSignature: '',
  });
  const xml = buildInvoiceXml(input, qrCode);
  return { xml, invoiceHash, qrCode };
}

export const firstInvoicePreviousHash = base64Text('0');
