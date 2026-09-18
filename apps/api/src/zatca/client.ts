type ZatcaEnvironment = 'simulation' | 'production';

export type ZatcaSubmitInput = {
  environment: ZatcaEnvironment;
  binarySecurityToken: string;
  secret: string;
  invoiceHash: string;
  uuid: string;
  xml: string;
  mode: 'reporting' | 'clearance';
};

function baseUrl(environment: ZatcaEnvironment) {
  return environment === 'production'
    ? 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core'
    : 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation';
}

function endpoint(environment: ZatcaEnvironment, mode: ZatcaSubmitInput['mode']) {
  return `${baseUrl(environment)}/invoices/${mode}/single`;
}

function basicAuth(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export async function submitZatcaInvoice(input: ZatcaSubmitInput) {
  const response = await fetch(endpoint(input.environment, input.mode), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-version': 'V2',
      'accept-language': 'EN',
      authorization: basicAuth(input.binarySecurityToken, input.secret),
      'content-type': 'application/json',
      ...(input.mode === 'reporting' ? { 'clearance-status': '0' } : {}),
    },
    body: JSON.stringify({
      invoiceHash: input.invoiceHash,
      uuid: input.uuid,
      invoice: btoa(unescape(encodeURIComponent(input.xml))),
    }),
  });

  const raw = await response.text();
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { body = { raw }; }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}
