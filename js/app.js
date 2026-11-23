/*
 * GeoRaksha dashboard wiring.
 *
 * Pipeline: stream adapter -> geofence engine -> alerts -> this dashboard.
 * All geofence decisions are made by js/engine.js. This file only draws
 * what the engine decided and forwards what the stream delivered.
 *
 * === CONDENSE SWAP POINT ===
 * At the event (26–27 Nov), set STREAM_CONFIG.source to 'condense' and
 * fill in url + mapEvent from the Condense workspace. Nothing else in
 * this file changes. See CONDENSE_HOOKUP.md.
 */
(function () {
  'use strict';

  var STREAM_CONFIG = {
    source: 'sample', // 'sample' | 'condense'
    url: '',          // Condense stream endpoint (ws/wss or SSE http url)
    mode: 'ws',       // 'ws' | 'sse'
    mapEvent: null    // function(raw) -> {assetId, kind, lat, lon, ts, ...}
  };

  // ---------- world ----------
  var BOUNDS = { minLat: 12.9658, maxLat: 12.9748, minLon: 77.5848, maxLon: 77.5972 };
  var ROAD_LATS = [12.9675, 12.9690, 12.9705, 12.9720, 12.9735];
  var ROAD_LONS = [77.5870, 77.5890, 77.5905, 77.5925, 77.5945, 77.5960];

  var DEFAULT_ZONES = [
    {
      id: 'yard', name: 'Central Yard', type: 'polygon',
      points: [
        { lat: 12.9690, lon: 77.5890 }, { lat: 12.9690, lon: 77.5910 },
        { lat: 12.9710, lon: 77.5910 }, { lat: 12.9710, lon: 77.5890 }
      ]
    },
    {
      id: 'depot', name: 'Depot', type: 'circle',
      center: { lat: 12.9705, lon: 77.5925 }, radiusM: 130
    }
  ];

  // ---------- state ----------
  var monitor = null;
  var adapter = null;
  var generator = null;
  var zones = [];              // mirror of the zones given to the engine
  var latest = new Map();      // assetId -> last event
  var trails = new Map();      // assetId -> [{lat, lon}, ...] (max 24)
  var assetDefs = new Map();   // assetId -> {kind, label}
  var alertCounts = { ENTER: 0, EXIT: 0, SILENCE: 0, RECOVERED: 0 };
  var silenceMs = 20000;
  var running = false;
  var drawMode = 'idle';       // 'idle' | 'polygon' | 'circle'
  var draftPoints = [];
  var zoneSeq = 3;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- dom ----------
  function $(id) { return document.getElementById(id); }
  var canvas = $('map');
  var ctx = canvas.getContext('2d');
  var hintEl = $('mapHint');
  var feedEl = $('feed');
  var tickerEl = $('ticker');

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- projection ----------
  function project(p) {
    var x = ((p.lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * canvas.width;
    var y = (1 - (p.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * canvas.height;
    return { x: x, y: y };
  }
  function unproject(x, y) {
    return {
      lon: BOUNDS.minLon + (x / canvas.width) * (BOUNDS.maxLon - BOUNDS.minLon),
      lat: BOUNDS.minLat + (1 - y / canvas.height) * (BOUNDS.maxLat - BOUNDS.minLat)
    };
  }
  function metresToPxY(m) {
    var latSpan = BOUNDS.maxLat - BOUNDS.minLat;
    return (m / (latSpan * 110600)) * canvas.height;
  }

  // ---------- engine + stream ----------
  function buildWorld() {
    monitor = GeoEngine.createMonitor({ silenceMs: silenceMs });
    zones = [];
    DEFAULT_ZONES.forEach(function (z) { addZoneToWorld(z, true); });
    generator = SampleStream.createSampleGenerator();
    generator.assetDefs().forEach(function (d) {
      assetDefs.set(d.assetId, d);
      monitor.setSilenceLimit(d.assetId, silenceMs);
    });
    if (STREAM_CONFIG.source === 'condense') {
      adapter = new StreamAdapters.CondenseStreamAdapter(STREAM_CONFIG);
    } else {
      adapter = new StreamAdapters.SampleStreamAdapter(generator, { intervalMs: 1000 });
    }
    var d = adapter.describe();
    $('sourceChip').textContent = 'Source: ' + d.name;
    $('sourceChip').classList.toggle('sample', !d.live);
  }

  function addZoneToWorld(zone, silent) {
    zones.push(zone);
    monitor.addZone(zone);
    if (!silent) renderZoneList();
  }

  function startStream() {
    try {
      adapter.start(onStreamEvent, function () {
        hint('Stream error — check the source connection.', true);
      });
      running = true;
    } catch (err) {
      hint(err.message, true);
      running = false;
    }
    $('pauseBtn').textContent = running ? 'Pause stream' : 'Start stream';
  }

  function stopStream() {
    if (adapter) adapter.stop();
    running = false;
    $('pauseBtn').textContent = 'Start stream';
  }

  function onStreamEvent(ev) {
    if (ev.label || ev.kind) {
      assetDefs.set(ev.assetId, { kind: ev.kind || 'vehicle', label: ev.label || ev.assetId });
    }
    latest.set(ev.assetId, ev);
    var trail = trails.get(ev.assetId) || [];
    trail.push({ lat: ev.lat, lon: ev.lon });
    while (trail.length > 24) trail.shift();
    trails.set(ev.assetId, trail);

    var alerts = monitor.ingest(ev);
    alerts.forEach(pushAlert);
    tickerEl.innerHTML = 'Last event: <b>' + esc(ev.assetId) + '</b> at ' +
      ev.lat.toFixed(5) + ', ' + ev.lon.toFixed(5) + ' · ' +
      (ev.speedKph != null ? ev.speedKph + ' km/h · ' : '') + fmtTime(ev.ts);
    renderAssets();
    renderZoneList();
  }

  function pushAlert(alert) {
    alertCounts[alert.type] = (alertCounts[alert.type] || 0) + 1;
    renderCounts();
    var empty = feedEl.querySelector('.feed-empty');
    if (empty) empty.remove();
    var div = document.createElement('div');
    div.className = 'alert ' + alert.type.toLowerCase();
    var text;
    if (alert.type === 'ENTER') text = esc(alert.assetId) + ' entered ' + esc(alert.zoneName);
    else if (alert.type === 'EXIT') text = esc(alert.assetId) + ' left ' + esc(alert.zoneName);
    else if (alert.type === 'SILENCE') text = esc(alert.assetId) + ' has gone silent — no report for ' + Math.round(silenceMs / 1000) + ' s';
    else text = esc(alert.assetId) + ' is reporting again';
    div.innerHTML = '<div class="ahead"><span class="stamp ' + alert.type.toLowerCase() + '">' +
      alert.type + '</span><span class="atime">' + fmtTime(alert.ts) + '</span></div>' +
      '<div class="atext">' + text + '</div>';
    feedEl.prepend(div);
    while (feedEl.children.length > 60) feedEl.removeChild(feedEl.lastChild);
  }

  function renderCounts() {
    $('feedCounts').innerHTML =
      '<span class="chip">Enter ' + alertCounts.ENTER + '</span>' +
      '<span class="chip">Exit ' + alertCounts.EXIT + '</span>' +
      '<span class="chip">Silence ' + alertCounts.SILENCE + '</span>' +
      '<span class="chip">Recovered ' + alertCounts.RECOVERED + '</span>';
  }

  // ---------- panels ----------
  function renderZoneList() {
    var st = monitor ? monitor.state() : { assets: {} };
    var insideCount = {};
    Object.keys(st.assets).forEach(function (assetId) {
      st.assets[assetId].insideZones.forEach(function (zid) {
        insideCount[zid] = (insideCount[zid] || 0) + 1;
      });
    });
    var el = $('zoneList');
    if (!zones.length) {
      el.innerHTML = '<p class="feed-empty">No zones yet. Draw one on the map.</p>';
      return;
    }
    el.innerHTML = zones.map(function (z) {
      var meta = z.type === 'polygon'
        ? 'Polygon · ' + z.points.length + ' corners'
        : 'Circle · ' + z.radiusM + ' m radius';
      var n = insideCount[z.id] || 0;
      return '<div class="zone-row"><div class="zrow2"><span class="zname">' + esc(z.name) +
        '</span><button data-del-zone="' + esc(z.id) + '" aria-label="Delete zone ' + esc(z.name) + '">Delete</button></div>' +
        '<div class="zmeta">' + meta + ' · ' + n + ' inside now</div></div>';
    }).join('');
    el.querySelectorAll('[data-del-zone]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del-zone');
        zones = zones.filter(function (z) { return z.id !== id; });
        monitor.removeZone(id);
        renderZoneList();
      });
    });
  }

  function renderAssets() {
    var st = monitor ? monitor.state() : { assets: {} };
    var el = $('assetList');
    var ids = Array.from(assetDefs.keys());
    el.innerHTML = ids.map(function (id) {
      var def = assetDefs.get(id);
      var a = st.assets[id];
      var ev = latest.get(id);
      var status, cls;
      if (a && a.silent) { status = 'Silent'; cls = 'silent'; }
      else if (a && a.insideZones.length) {
        var names = a.insideZones.map(function (zid) {
          var z = zones.find(function (zz) { return zz.id === zid; });
          return z ? z.name : zid;
        });
        status = 'Inside ' + names.join(', '); cls = 'inside';
      } else { status = 'Outside all zones'; cls = ''; }
      var ago = ev ? Math.max(0, Math.round((Date.now() - ev.ts) / 1000)) + ' s ago' : 'no report yet';
      return '<div class="asset-row"><div class="arow"><span class="aid">' + esc(id) +
        '</span><span class="status ' + cls + '">' + esc(status) + '</span></div>' +
        '<div class="ameta">' + esc(def.label || '') + ' · last report ' + ago + '</div></div>';
    }).join('');
  }

  // ---------- map drawing ----------
  function drawMap(now) {
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // blocks
    var latEdges = [BOUNDS.minLat].concat(ROAD_LATS, [BOUNDS.maxLat]);
    var lonEdges = [BOUNDS.minLon].concat(ROAD_LONS, [BOUNDS.maxLon]);
    for (var i = 0; i < latEdges.length - 1; i++) {
      for (var j = 0; j < lonEdges.length - 1; j++) {
        var a = project({ lat: latEdges[i + 1], lon: lonEdges[j] });
        var b = project({ lat: latEdges[i], lon: lonEdges[j + 1] });
        var shade = ((i * 7 + j * 13) % 5) * 3;
        ctx.fillStyle = 'rgb(' + (15 + shade) + ',' + (21 + shade) + ',' + (31 + shade) + ')';
        ctx.fillRect(a.x + 3, a.y + 3, b.x - a.x - 6, b.y - a.y - 6);
      }
    }
    // roads
    ctx.strokeStyle = '#232f45';
    ctx.lineWidth = 7;
    ROAD_LATS.forEach(function (lat) {
      var p1 = project({ lat: lat, lon: BOUNDS.minLon });
      var p2 = project({ lat: lat, lon: BOUNDS.maxLon });
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });
    ROAD_LONS.forEach(function (lon) {
      var p1 = project({ lat: BOUNDS.minLat, lon: lon });
      var p2 = project({ lat: BOUNDS.maxLat, lon: lon });
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(232,230,223,0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ROAD_LATS.forEach(function (lat) {
      var p1 = project({ lat: lat, lon: BOUNDS.minLon });
      var p2 = project({ lat: lat, lon: BOUNDS.maxLon });
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });
    ROAD_LONS.forEach(function (lon) {
      var p1 = project({ lat: BOUNDS.minLat, lon: lon });
      var p2 = project({ lat: BOUNDS.maxLat, lon: lon });
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // zones
    zones.forEach(function (z) { drawZone(z, 'rgba(45,212,191,0.13)', '#2dd4bf'); });
    // draft polygon
    if (drawMode === 'polygon' && draftPoints.length) {
      ctx.strokeStyle = '#f2b33d'; ctx.fillStyle = '#f2b33d'; ctx.lineWidth = 2;
      ctx.beginPath();
      draftPoints.forEach(function (p, idx) {
        var q = project(p);
        if (idx === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
      draftPoints.forEach(function (p) {
        var q = project(p);
        ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill();
      });
    }

    var st = monitor ? monitor.state() : { assets: {} };

    // trails
    trails.forEach(function (trail, id) {
      if (trail.length < 2) return;
      ctx.strokeStyle = 'rgba(232,230,223,0.28)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      trail.forEach(function (p, idx) {
        var q = project(p);
        if (idx === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
    });

    // assets
    latest.forEach(function (ev, id) {
      var q = project(ev);
      var a = st.assets[id];
      var silent = a && a.silent;
      var inside = a && a.insideZones.length > 0;
      if (silent) {
        var alpha = reducedMotion ? 0.85 : 0.45 + 0.35 * Math.sin(now / 320);
        ctx.strokeStyle = 'rgba(229,72,77,' + alpha.toFixed(2) + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, 13, 0, Math.PI * 2); ctx.stroke();
      } else if (inside) {
        ctx.strokeStyle = 'rgba(45,212,191,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = ev.kind === 'person' ? '#2dd4bf' : '#f2b33d';
      ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0e13';
      ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(232,230,223,0.92)';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText(id, q.x + 10, q.y - 8);
    });
  }

  function drawZone(z, fill, stroke) {
    ctx.beginPath();
    if (z.type === 'polygon') {
      z.points.forEach(function (p, idx) {
        var q = project(p);
        if (idx === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
    } else {
      var c = project(z.center);
      ctx.arc(c.x, c.y, metresToPxY(z.radiusM), 0, Math.PI * 2);
    }
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
    // zone label
    var anchor = z.type === 'polygon' ? z.points[0] : z.center;
    var q = project(anchor);
    ctx.fillStyle = 'rgba(45,212,191,0.95)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(z.name.toUpperCase(), q.x + 6, q.y - 6);
  }

  // ---------- hint ----------
  function hint(msg, active) {
    hintEl.textContent = msg;
    hintEl.classList.toggle('active', !!active);
  }
  var HINT_IDLE = 'Tip: “Draw polygon zone”, then click corners on the map. “Add circle zone”, then click its centre.';
  var HINT_POLY = 'Drawing a polygon: click each corner on the map, then “Finish zone”. “Cancel” throws it away.';
  var HINT_CIRCLE = 'Adding a circle: click the map once to place its centre.';

  // ---------- controls ----------
  function setDrawMode(mode) {
    drawMode = mode;
    draftPoints = [];
    $('drawPolyBtn').classList.toggle('toggle', mode === 'polygon');
    $('drawPolyBtn').setAttribute('aria-pressed', mode === 'polygon' ? 'true' : 'false');
    $('addCircleBtn').classList.toggle('toggle', mode === 'circle');
    $('addCircleBtn').setAttribute('aria-pressed', mode === 'circle' ? 'true' : 'false');
    $('finishZoneBtn').disabled = true;
    $('cancelDrawBtn').disabled = mode === 'idle';
    hint(mode === 'polygon' ? HINT_POLY : mode === 'circle' ? HINT_CIRCLE : HINT_IDLE, mode !== 'idle');
  }

  function zoneName() {
    var v = $('zoneName').value.trim();
    return v || ('Zone ' + zoneSeq);
  }

  function wireControls() {
    $('pauseBtn').addEventListener('click', function () {
      if (running) stopStream(); else startStream();
    });
    $('resetBtn').addEventListener('click', function () {
      stopStream();
      latest.clear(); trails.clear();
      alertCounts = { ENTER: 0, EXIT: 0, SILENCE: 0, RECOVERED: 0 };
      feedEl.innerHTML = '<p class="feed-empty">No alerts yet. Alerts appear here the moment the engine sees a crossing or a silence.</p>';
      renderCounts();
      buildWorld();
      renderZoneList(); renderAssets();
      tickerEl.textContent = 'Waiting for the first event…';
      startStream();
    });
    $('clearFeedBtn').addEventListener('click', function () {
      feedEl.innerHTML = '<p class="feed-empty">Feed cleared. New alerts will appear here.</p>';
      alertCounts = { ENTER: 0, EXIT: 0, SILENCE: 0, RECOVERED: 0 };
      renderCounts();
    });
    $('drawPolyBtn').addEventListener('click', function () {
      setDrawMode(drawMode === 'polygon' ? 'idle' : 'polygon');
    });
    $('addCircleBtn').addEventListener('click', function () {
      setDrawMode(drawMode === 'circle' ? 'idle' : 'circle');
    });
    $('finishZoneBtn').addEventListener('click', function () {
      if (draftPoints.length < 3) return;
      var zone = {
        id: 'zone-' + Date.now(), name: zoneName(), type: 'polygon',
        points: draftPoints.slice()
      };
      zoneSeq += 1;
      addZoneToWorld(zone);
      setDrawMode('idle');
      // Judge the assets' current positions against the new zone right away.
      latest.forEach(function (ev) { monitor.ingest(ev).forEach(pushAlert); });
      renderAssets(); renderZoneList();
    });
    $('cancelDrawBtn').addEventListener('click', function () { setDrawMode('idle'); });
    $('silenceSel').addEventListener('change', function () {
      silenceMs = parseInt($('silenceSel').value, 10);
      assetDefs.forEach(function (_, id) { monitor.setSilenceLimit(id, silenceMs); });
      latest.forEach(function (_, id) { monitor.setSilenceLimit(id, silenceMs); });
    });
    $('motionBtn').addEventListener('click', function () {
      reducedMotion = !reducedMotion;
      applyMotionPref();
    });

    canvas.addEventListener('click', function (evt) {
      if (drawMode === 'idle') return;
      var rect = canvas.getBoundingClientRect();
      var x = (evt.clientX - rect.left) * (canvas.width / rect.width);
      var y = (evt.clientY - rect.top) * (canvas.height / rect.height);
      var p = unproject(x, y);
      if (drawMode === 'polygon') {
        draftPoints.push(p);
        $('finishZoneBtn').disabled = draftPoints.length < 3;
      } else if (drawMode === 'circle') {
        var radius = parseInt($('radiusSel').value, 10);
        var zone = {
          id: 'zone-' + Date.now(), name: zoneName(), type: 'circle',
          center: p, radiusM: radius
        };
        zoneSeq += 1;
        addZoneToWorld(zone);
        setDrawMode('idle');
        latest.forEach(function (ev) { monitor.ingest(ev).forEach(pushAlert); });
        renderAssets(); renderZoneList();
      }
    });
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && drawMode !== 'idle') setDrawMode('idle');
    });
  }

  function applyMotionPref() {
    document.documentElement.setAttribute('data-motion', reducedMotion ? 'reduced' : 'full');
    var btn = $('motionBtn');
    btn.setAttribute('aria-pressed', reducedMotion ? 'true' : 'false');
    btn.textContent = reducedMotion ? 'Motion: reduced' : 'Motion: full';
    if (!reducedMotion) document.documentElement.classList.add('js-motion');
    else document.documentElement.classList.remove('js-motion');
  }

  // ---------- reveal ----------
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  // ---------- boot ----------
  buildWorld();
  wireControls();
  applyMotionPref();
  renderZoneList();
  renderAssets();
  renderCounts();
  hint(HINT_IDLE, false);
  startStream();
  initReveal();

  setInterval(function () { drawMap(Date.now()); }, 200);
  setInterval(function () {
    if (!running || !monitor) return;
    monitor.checkSilence(Date.now()).forEach(pushAlert);
    renderAssets();
  }, 1000);
})();
