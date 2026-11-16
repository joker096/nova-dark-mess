export default async function run(page, ui) {
  const shots = [];
  const H = await page.evaluate(() => document.body.scrollHeight);
  const stops = [0.12, 0.3, 0.5, 0.72, 0.95];
  for (let i = 0; i < stops.length; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.floor(H * stops[i]));
    await page.waitForTimeout(900);
    const p = `.e2e/audit-d${i}.png`;
    await page.screenshot({ path: p, fullPage: false });
    shots.push(p);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '.e2e/audit-m0.png' });
  for (let i = 1; i <= 3; i++) {
    await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), [0.3, 0.6, 0.95][i - 1]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `.e2e/audit-m${i}.png` });
  }
  // audit data
  const audit = await page.evaluate(() => {
    const out = { tinyText: [], contrast: [], brokenImgs: [], h1: document.querySelector('h1')?.innerText };
    document.querySelectorAll('body *').forEach(el => {
      if (el.children.length) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 10) out.tinyText.push({ tag: el.tagName, cls: el.className, fs, text: (el.innerText || '').slice(0, 40) });
    });
    document.querySelectorAll('img').forEach(img => { if (!img.complete || img.naturalWidth === 0) out.brokenImgs.push(img.src); });
    return out;
  });
  // Contrast audit on leaf text nodes (composite fg over effective bg).
  const contrast = await page.evaluate(() => {
    const lum = (r, g, b) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const pc = (s) => { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = pc(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.05) return c;
        n = n.parentElement;
      }
      return { r: 12, g: 13, b: 17, a: 1 };
    };
    const res = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (el.children.length || !(el.textContent || '').trim()) return;
      const cs = getComputedStyle(el);
      const fg = pc(cs.color); if (!fg) return;
      const bg = bgOf(el);
      const mix = (a, b) => fg.a * a + (1 - fg.a) * b;
      const L1 = lum(mix(fg.r, bg.r), mix(fg.g, bg.g), mix(fg.b, bg.b));
      const L2 = lum(bg.r, bg.g, bg.b);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const fs = parseFloat(cs.fontSize);
      const large = fs >= 18 || (fs >= 14 && parseInt(cs.fontWeight, 10) >= 700);
      if (ratio < (large ? 3 : 4.5)) res.push({ text: el.textContent.trim().slice(0, 40), fs, ratio: +ratio.toFixed(2), cls: String(el.className).slice(0, 60) });
    });
    return res.slice(0, 25);
  });
  return { shots, H, lowContrast: contrast };
}
