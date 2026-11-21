/* Pure calculation logic — no DOM.
   convention '30'     : every month = 30 days, year = 360 days
   convention 'max30'  : real calendar days, but a month never counts more than 30 (the 31st is skipped);
                         February stays 28/29; year = 360 days
   convention 'actual' : real calendar days (28/29/30/31), year = 365 days
   incl (default true) : both the From day and the To day earn interest (+1 day)  */
(function (root) {
  const DAY = 864e5, BASIS = 365;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const utc = s => { const p = parse(s); return Date.UTC(p.y, p.m - 1, p.d); };
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const diff = (a, b) => Math.round((b - a) / DAY);

  function days360(a, b) {
    let { y: y1, m: m1, d: d1 } = parse(a), { y: y2, m: m2, d: d2 } = parse(b);
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
  }
  function addMonths(startStr, k) {            // anchored on the start date, day clamped to month length
    const { y, m, d } = parse(startStr), tot = m - 1 + k;
    const ny = y + Math.floor(tot / 12), nm = ((tot % 12) + 12) % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return Date.UTC(ny, nm, Math.min(d, last));
  }

  function count31(a, b) {                     // number of 31st-of-month days inside [a, b)
    let n = 0, d = new Date(a), y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (;; m++) {
      const t = Date.UTC(y, m, 31);
      if (t >= b) break;
      if (new Date(t).getUTCDate() === 31 && t >= a) n++;
    }
    return n;
  }

  function calc(o) {
    const incl = o.incl !== false, conv = ['actual', 'max30'].includes(o.convention) ? o.convention : '30';
    const dc = (a, b) => diff(a, b) - (conv === 'max30' ? count31(a, b) : 0);
    const YEAR = conv === 'actual' ? BASIS : 360;
    const P = o.P, R = o.ratePA, rows = [];
    if (utc(o.to) < utc(o.from)) return { error: 'To date must be after From date.' };
    let days, interest;

    if (conv === '30') {
      days = days360(o.from, o.to) + (incl ? 1 : 0);
      if (o.mode === 'compound') {
        const step = 30 * o.n, k = Math.floor(days / step), rem = days - k * step, i = R * o.n / 1200;
        let bal = P;
        for (let j = 1; j <= k; j++) { const it = bal * i; rows.push({ label: 'Period ' + j, days: step, opening: bal, interest: it, closing: bal + it }); bal += it; }
        if (rem > 0) { const it = bal * R * rem / 36000; rows.push({ label: 'Last part', days: rem, opening: bal, interest: it, closing: bal + it }); bal += it; }
        interest = bal - P;
      } else interest = P * R * days / 36000;
    } else {
      const start = utc(o.from), endEx = utc(o.to) + (incl ? DAY : 0);   // end is exclusive
      days = dc(start, endEx);
      if (o.mode === 'compound') {
        let bal = P, prev = start, j = 0;
        while (j < 2000) {
          const pe = addMonths(o.from, (j + 1) * o.n);
          if (pe > endEx) break;
          j++;
          const pd = dc(prev, pe);                       // days in this period, counted exactly like simple interest
          const it = bal * R * pd / (100 * YEAR);
          rows.push({ label: 'Period ' + j, days: pd, opening: bal, interest: it, closing: bal + it, from: iso(prev), to: iso(pe - DAY) });
          bal += it; prev = pe;
        }
        const rem = dc(prev, endEx);
        if (rem > 0) { const it = bal * R * rem / (100 * YEAR); rows.push({ label: 'Last part', days: rem, opening: bal, interest: it, closing: bal + it, from: iso(prev), to: iso(endEx - DAY) }); bal += it; }
        interest = bal - P;
      } else interest = P * R * days / (100 * YEAR);
    }
    return { days, interest, total: P + interest, rows, convention: conv, incl };
  }
  const api = { days360, calc };
  if (typeof module !== 'undefined') module.exports = api; else root.LoanCore = api;
})(this);
