// Starts downloading the current chapter's text while the app's JavaScript loads, so a chapter
// link opens fast on a cold visit. Same-origin app data only; nothing about the visitor is read or kept.
(function () {
  var m = /^\/(read|interlinear)\/([1-3a-z]{3})\/(\d+)/i.exec(location.pathname);
  if (!m) return;
  var tr = /[?&]tr=(\w+)/.exec(location.search);
  tr = tr ? tr[1] : 'kjv';
  var book = m[2].toUpperCase();
  var add = function (href) {
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  };
  if (m[1] === 'interlinear' || tr === 'orig') add('/data/stepbible/orig/' + book + '/' + m[3] + '.json');
  if (m[1] === 'interlinear' || tr === 'kjv' || tr === 'par') add('/data/kjv/' + book + '/' + m[3] + '.json');
  if (tr === 'asv' || tr === 'par') add('/data/asv/' + book + '/' + m[3] + '.json');
})();
