(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.BillTaxes = value;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const names = { gst:'GST', cgst:'CGST', sgst:'SGST', igst:'IGST', vat:'VAT', cess:'Cess', service:'Service charge' };
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function normalize(value = {}) {
    const rows = Object.keys(names).map(id => {
      const row = (value.rows || []).find(r => r.id === id) || {};
      const rate = Number(row.rate || 0);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100 || round(rate) !== rate) throw Error(`${names[id]} percentage must be 0–100, with at most 2 decimals`);
      if (row.enabled && rate <= 0) throw Error(`Enter a percentage for ${names[id]}`);
      return { id, name:names[id], enabled:row.enabled === true, rate };
    });
    const on = id => rows.some(r => r.id === id && r.enabled);
    if ([on('gst'), on('cgst') || on('sgst'), on('igst'), on('vat')].filter(Boolean).length > 1) throw Error('Choose one tax system: GST, CGST + SGST, IGST, or VAT. Do not charge them together.');
    if (on('cgst') !== on('sgst')) throw Error('Enable CGST and SGST together');
    if (on('cgst') && rows.find(r => r.id === 'cgst').rate !== rows.find(r => r.id === 'sgst').rate) throw Error('CGST and SGST percentages must match');
    const gstin = String(value.gstin || '').trim().toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw Error('Enter a valid 15-character GSTIN');
    return { rows, gstin, print: { area:value.print?.area !== false, cashier:value.print?.cashier !== false, payment:value.print?.payment !== false, token:value.print?.token !== false, table:value.print?.table !== false, gstin:value.print?.gstin !== false, footer:value.print?.footer !== false } };
  }
  function calculate(subtotal, discount = 0, config = {}) {
    subtotal = round(Number(subtotal)); discount = round(Number(discount));
    if (!Number.isFinite(subtotal) || !Number.isFinite(discount) || subtotal < 0 || discount < 0 || discount > subtotal) throw Error('Invalid subtotal or discount');
    const taxSettings = normalize(config), net = round(subtotal - discount);
    const service = taxSettings.rows.find(r => r.id === 'service' && r.enabled);
    const serviceAmount = service ? round(net * service.rate / 100) : 0;
    const base = round(net + serviceAmount);
    const charges = service ? [{ ...service, base:net, amount:serviceAmount }] : [];
    const taxes = taxSettings.rows.filter(r => r.enabled && r.id !== 'service').map(r => ({ ...r, base, amount:round(base * r.rate / 100) }));
    const taxTotal = round(taxes.reduce((s, r) => s + r.amount, 0));
    return { subtotal, discount, taxableAmount:base, taxes, charges, taxTotal, total:round(base + taxTotal), taxSettings, gstin:taxSettings.gstin, receiptFields:taxSettings.print };
  }
  return { names, normalize, calculate, round };
});
