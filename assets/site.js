/* Вертепный ящик — общие куски страниц. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
function banner(el) {
  const ch = V.changed(); if (!ch.length || !el) return;
  const list = ch.map(r => `${r[1]} ${V.fmt(V.P[r[0]])} (в v0.1 — ${V.fmt(V.DEF[r[0]])})`).join(', ');
  el.insertAdjacentHTML('beforeend', `<div class="banner"><span>Размеры изменены на главной странице: ${V.esc(list)}. Всё ниже посчитано по изменённым размерам.</span><button type="button" id="resetP">Вернуть v0.1</button></div>`);
  $('#resetP').addEventListener('click', () => { V.resetP(); location.reload(); });
}
function tableHTML(t) {
  return `<div class="card"><h3>${V.esc(t.title)}</h3><div class="tbl-wrap"><table><thead><tr>${t.cols.map((c, i) => `<th${i ? ' class="n"' : ''}>${V.esc(c)}</th>`).join('')}</tr></thead><tbody>${
    t.rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${V.esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
/* Две версии конструкции: основная (на шипах) в корне сайта, прежняя (на брусках) — в папке bruski/. */
const VARIANTS = [
  {id:'shipy', l:'На шипах', s:'фанера 10 мм, ЧПУ, без брусков', dir:'', zip:'vertep-shipy.zip'},
  {id:'bruski', l:'На брусках', s:'фанера 9 мм, бруски и саморезы', dir:'bruski/', zip:'vertep-bruski.zip'}];
const CUR = () => V.VARIANT || 'bruski', ROOT = () => CUR() === 'bruski' ? '../' : '';
function variant(el) {
  if (!el) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  el.innerHTML = `<div class="variant" role="group" aria-label="Конструкция">${VARIANTS.map(v => {
    const inner = `<b>${v.l}</b><small>${v.s}</small>`;
    return v.id === CUR() ? `<span class="vopt" aria-current="true">${inner}</span>` : `<a class="vopt" href="${ROOT()}${v.dir}${page}${location.search}${location.hash}">${inner}</a>`; }).join('')}</div>`;
}
function downloads(el) {
  if (!el) return;
  el.innerHTML = VARIANTS.map(v => `<a class="dl${v.id === CUR() ? ' cur' : ''}" href="${ROOT()}downloads/${v.zip}" download><b>Архив: ${v.l.toLowerCase()}</b><small>DXF и SVG для станка, 3D-модель OBJ, листы чертежей</small></a>`).join('');
}
window.SITE = {$, banner, tableHTML, variant, downloads, VARIANTS};
})();
