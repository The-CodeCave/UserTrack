/* UserTrack growth widget loader. <script async src="https://usertrack.dev/widget.js" data-slug="acme" data-type="users|growth|verified|chart" data-theme="auto|dark|light" data-window="30d|7d"></script> */
(function () {
  var s = document.currentScript;
  if (!s || !s.dataset.slug) return;
  var d = s.dataset;
  var base = new URL(s.src, location.href).origin;
  var type = d.type || "users";
  var q = "type=" + encodeURIComponent(type) + (d.theme ? "&theme=" + encodeURIComponent(d.theme) : "") + (d.window ? "&window=" + encodeURIComponent(d.window) : "");
  var chart = type === "chart";
  var f = document.createElement("iframe");
  f.src = base + "/embed/" + encodeURIComponent(d.slug) + "?" + q;
  f.title = (d.name || d.slug) + " on UserTrack";
  f.loading = "lazy";
  f.scrolling = "no";
  f.setAttribute("frameborder", "0");
  f.width = chart ? 320 : 200;
  f.height = chart ? 120 : 28;
  f.style.cssText = "border:0;overflow:hidden;max-width:100%;color-scheme:normal;" + (chart ? "display:block" : "display:inline-block;vertical-align:middle");
  window.addEventListener("message", function (e) {
    if (e.source !== f.contentWindow || !e.data || e.data.ut !== "size") return;
    f.width = e.data.w;
    f.height = e.data.h;
  });
  s.parentNode.insertBefore(f, s.nextSibling);
})();
