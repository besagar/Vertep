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
window.SITE = {$, banner, tableHTML};
})();
