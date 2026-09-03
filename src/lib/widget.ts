import { escapeXml as esc } from "@/lib/badge";
import { WIDGET_REFRESH_MS, type WidgetParams } from "@/lib/embed";

// Payload of public.widget; `undefined` numbers mean the founder keeps that metric private.
export interface WidgetData {
  slug: string;
  name: string;
  totalUsers?: number;
  newUsers7d?: number;
  newUsers30d?: number;
  growth7dPct?: number;
  growth30dPct?: number;
  trust: "verified" | "unverified" | "pending";
  trustLabel: string;
  trendingRank?: number;
  lastSyncedAt?: number;
  spark: number[];
}

const CSS = `
:root{--bg:#0b0c0e;--fg:#ffffff;--muted:#8b8f98;--line:rgba(255,255,255,.2);--grid:rgba(255,255,255,.06);--pink:#fb0184;color-scheme:dark}
:root[data-theme=light]{--bg:#ffffff;--fg:#111111;--muted:#6b7280;--line:rgba(0,0,0,.15);--grid:rgba(0,0,0,.06);color-scheme:light}
@media(prefers-color-scheme:light){:root[data-theme=auto]{--bg:#ffffff;--fg:#111111;--muted:#6b7280;--line:rgba(0,0,0,.15);--grid:rgba(0,0,0,.06);color-scheme:light}}
html,body{margin:0;padding:0;background:transparent}
a{text-decoration:none;color:var(--fg);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1;-webkit-font-smoothing:antialiased}
.pill{display:inline-flex;align-items:stretch;height:28px;box-sizing:border-box;background:var(--bg);border:1px solid var(--line);white-space:nowrap}
.pill:hover,.card:hover{border-color:var(--pink)}
.brand{display:flex;align-items:center;gap:6px;padding:0 8px}
.bars rect{fill:var(--pink)}
.val{display:flex;align-items:center;gap:5px;padding:0 8px;border-left:1px solid var(--line);font-variant-numeric:tabular-nums}
.users .val{background:var(--pink);color:#fff;border-left:0}
.growth .val{color:var(--pink)}
.verified{border-color:var(--pink)}.verified .val{border-left-color:var(--pink);letter-spacing:.08em;font-size:11px}
.verified .shield{stroke:var(--pink)}
.verified.plain{border-color:var(--line)}.verified.plain .val{border-left-color:var(--line);color:var(--muted)}
.nf .val{color:var(--muted)}
.card{display:block;position:relative;width:100%;max-width:320px;height:120px;box-sizing:border-box;background:var(--bg);border:1px solid var(--line);padding:14px;overflow:hidden}
.name{font-size:11px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase}
.big{margin-top:8px;font:600 30px/1 Geist,Inter,ui-sans-serif,system-ui,sans-serif;font-variant-numeric:tabular-nums}
.delta{margin-top:8px;font-size:11px;color:var(--pink)}
.foot{position:absolute;left:14px;bottom:10px;display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:1px;color:var(--muted)}
.foot .ago{margin-left:6px;letter-spacing:0}
.spark{position:absolute;right:12px;top:14px}
.spark .wash{fill:var(--pink);fill-opacity:.12}.spark .ln{fill:none;stroke:var(--fg);stroke-width:1.5;stroke-linejoin:round}.spark .g{stroke:var(--grid)}.spark .dot{fill:var(--pink);stroke:var(--bg);stroke-width:1.5}.spark .flat{stroke:var(--line);stroke-dasharray:2 3}
@media(prefers-reduced-motion:no-preference){.pill,.card{transition:border-color .15s}}
`;

// Everything the widget shows is rendered by this script (first paint from the inlined data, then every refresh).
const JS = `
(function(){
var C=window.__UT_CFG,D=window.__UT_DATA,root=document.getElementById('w');
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var cf=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}),ff=new Intl.NumberFormat('en');
function fc(n){return Math.abs(n)<1e4?ff.format(n):cf.format(n)}
function fd(n){return n===0?'\\u00b10':(n>0?'+':'\\u2212')+fc(Math.abs(n))}
function fp(n){return (n>0?'+':'')+n.toFixed(1)+'%'}
function ago(t){var s=Math.max(0,(Date.now()-t)/1e3);if(s<60)return 'just now';var m=s/60|0;if(m<60)return m+'m ago';var h=m/60|0;if(h<48)return h+'h ago';return (h/24|0)+'d ago'}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var BARS='<svg class="bars" width="11" height="10" viewBox="0 0 11 10" aria-hidden="true"><rect x="0" y="6" width="2" height="4"/><rect x="3" y="4" width="2" height="6"/><rect x="6" y="2" width="2" height="8"/><rect x="9" y="0" width="2" height="10"/></svg>';
var SHIELD='<svg class="shield" width="11" height="12" viewBox="0 0 24 26" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l9 4v6c0 6-4 10-9 12C7 22 3 18 3 12V6z"/><path d="M8 13l3 3 5-6"/></svg>';
function spark(v){var W=140,H=54,gy=2,gh=H-4;var out='<svg class="spark" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">';
[0.25,0.5,0.75].forEach(function(f){out+='<line class="g" x1="0" y1="'+(gy+gh*f).toFixed(1)+'" x2="'+W+'" y2="'+(gy+gh*f).toFixed(1)+'"/>'});
if(v.length<2)return out+'<line class="flat" x1="0" y1="'+(gy+gh-2)+'" x2="'+W+'" y2="'+(gy+gh-2)+'"/></svg>';
var mn=Math.min.apply(null,v),mx=Math.max.apply(null,v),sp=mx-mn||1;
var p=v.map(function(y,i){return [(i/(v.length-1))*(W-4)+2,gy+gh-((y-mn)/sp)*gh]});
var d=p.map(function(q,i){return (i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)}).join(' ');
var l=p[p.length-1];
return out+'<path class="wash" d="'+d+' L'+l[0].toFixed(1)+' '+(gy+gh)+' L'+p[0][0].toFixed(1)+' '+(gy+gh)+' Z"/><path class="ln" d="'+d+'"/><circle class="dot" cx="'+l[0].toFixed(1)+'" cy="'+l[1].toFixed(1)+'" r="3"/></svg>'}
var prev=null;
function countUp(){var el=root.querySelector('[data-n]');if(!el)return;var to=+el.getAttribute('data-n'),full=el.hasAttribute('data-full'),from=prev==null?0:prev;prev=to;
if(rm||from===to)return;var t0=performance.now(),dur=prev==null?900:700;
(function f(t){var k=Math.min(1,(t-t0)/dur);k=1-Math.pow(1-k,3);var n=Math.round(from+(to-from)*k);el.textContent=full?ff.format(n):fc(n);if(k<1)requestAnimationFrame(f)})(t0)}
function post(){var r=root.getBoundingClientRect();try{parent.postMessage({ut:'size',w:C.type==='chart'?320:Math.ceil(r.width),h:Math.ceil(r.height)},'*')}catch(e){}}
function render(d){
if(!d){root.className='pill nf';root.innerHTML='<span class="brand">'+BARS+'UserTrack</span><span class="val">not found</span>';post();return}
var w=C.window,delta=w==='7d'?d.newUsers7d:d.newUsers30d,pct=w==='7d'?d.growth7dPct:d.growth30dPct;
var synced=d.lastSyncedAt?'synced '+ago(d.lastSyncedAt):'no sync yet';
root.title=d.name+' on UserTrack \\u00b7 '+synced;
if(C.type==='chart'){root.className='card';var nm=d.name.length>18?d.name.slice(0,17)+'\\u2026':d.name;
root.innerHTML='<div class="name">'+esc(nm)+'</div><div class="big">'+(d.totalUsers==null?'\\u2014':'<span data-n="'+d.totalUsers+'">'+fc(d.totalUsers)+'</span>')+'</div><div class="delta">'+(delta==null?'growth private':fd(delta)+' \\u00b7 '+fp(pct||0)+' \\u00b7 '+w)+'</div><div class="foot">'+BARS+'<span>USERTRACK</span><span class="ago">'+esc(synced)+'</span></div>'+spark(d.spark||[])}
else{root.className='pill '+C.type+(C.type==='verified'&&d.trust!=='verified'?' plain':'');var val=C.type==='users'?(d.totalUsers==null?'\\u2014 users':'<span data-n="'+d.totalUsers+'" data-full>'+ff.format(d.totalUsers)+'</span> users')
:C.type==='growth'?(pct==null?'\\u2014 \\u00b7 '+w:fp(pct)+' \\u00b7 '+w):(d.trust==='verified'?SHIELD:'')+esc(d.trustLabel.toUpperCase());
root.innerHTML='<span class="brand">'+BARS+'UserTrack</span><span class="val">'+val+'</span>'}
countUp();post()}
render(D);
if(window.ResizeObserver)new ResizeObserver(post).observe(root);
if(C.json&&D)setInterval(function(){if(document.visibilityState!=='visible')return;fetch(C.json,{cache:'no-cache'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.data)render(j.data)}).catch(function(){})},C.refreshMs);
})();
`;

const inline = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

// Self-contained document for the /embed/[slug] iframe: theme CSS, inlined data, one renderer for first paint + refresh.
export function renderWidgetHtml(o: WidgetParams & { data: WidgetData | null; jsonUrl: string; pageUrl: string; homeUrl: string }) {
  const title = o.data ? `${o.data.name} on UserTrack` : "Not found on UserTrack";
  const cfg = { type: o.type, window: o.window, json: o.data ? o.jsonUrl : null, refreshMs: WIDGET_REFRESH_MS };
  return `<!doctype html><html lang="en" data-theme="${o.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="${o.theme === "auto" ? "dark light" : o.theme}"><title>${esc(title)}</title><style>${CSS}</style></head>` +
    `<body><a id="w" href="${esc(o.data ? o.pageUrl : o.homeUrl)}" target="_blank" rel="noopener" aria-label="${esc(title)}"></a>` +
    `<script>window.__UT_CFG=${inline(cfg)};window.__UT_DATA=${inline(o.data)};</script><script>${JS}</script></body></html>`;
}
