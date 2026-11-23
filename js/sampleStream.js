/*
 * GeoRaksha SAMPLE stream generator.
 *
 * This is a local stand-in for the organisers' Condense data generator.
 * It exists so the dashboard and engine can be built and tested before the
 * Condense workspace is available (26–27 Nov). It produces position events
 * in the shape the real generator is expected to produce:
 *
 *   { assetId, kind, lat, lon, ts, speedKph, headingDeg }
 *
 * Everything in this file is sample data. It is labelled as such in the UI
 * and must be replaced by the Condense stream for the final filing —
 * see CONDENSE_HOOKUP.md. Nothing here is presented as real event data.
 *
 * The map area is a few streets around (12.9700, 77.5900). Four assets run
 * fixed routes at steady speeds. VAN-03 is scripted to stop reporting for
 * a stretch so silence detection can be seen working.
 */
(function (global) {
  'use strict';

  function toRad(d) { return (d * Math.PI) / 180; }

  function haversineM(a, b) {
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lon - a.lon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function bearingDeg(a, b) {
    var y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
    var x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
      Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Routes are waypoint loops. Coordinates are illustrative sample data.
  var ROUTES = [
    {
      assetId: 'VAN-01', kind: 'vehicle', label: 'Delivery van 1', speedMps: 9,
      waypoints: [
        { lat: 12.9668, lon: 77.5858 }, { lat: 12.9668, lon: 77.5900 },
        { lat: 12.9700, lon: 77.5900 }, { lat: 12.9728, lon: 77.5900 },
        { lat: 12.9728, lon: 77.5942 }, { lat: 12.9668, lon: 77.5942 }
      ]
    },
    {
      assetId: 'VAN-02', kind: 'vehicle', label: 'Delivery van 2', speedMps: 8,
      waypoints: [
        { lat: 12.9735, lon: 77.5870 }, { lat: 12.9705, lon: 77.5870 },
        { lat: 12.9705, lon: 77.5925 }, { lat: 12.9680, lon: 77.5925 },
        { lat: 12.9680, lon: 77.5955 }, { lat: 12.9735, lon: 77.5955 }
      ]
    },
    {
      assetId: 'TECH-01', kind: 'person', label: 'Field technician', speedMps: 1.6,
      waypoints: [
        { lat: 12.9694, lon: 77.5894 }, { lat: 12.9706, lon: 77.5894 },
        { lat: 12.9706, lon: 77.5906 }, { lat: 12.9694, lon: 77.5906 }
      ]
    },
    {
      assetId: 'VAN-03', kind: 'vehicle', label: 'Delivery van 3', speedMps: 10,
      // Goes quiet between t=45s and t=85s of every 120 s cycle.
      silentWindows: [{ fromS: 45, toS: 85, cycleS: 120 }],
      waypoints: [
        { lat: 12.9675, lon: 77.5960 }, { lat: 12.9675, lon: 77.5865 },
        { lat: 12.9715, lon: 77.5865 }, { lat: 12.9715, lon: 77.5960 }
      ]
    }
  ];

  /**
   * options.startDistances — optional array of starting distances (metres
   * along each route, in ROUTES order). The dashboard omits it so assets
   * start scattered; tests pass [0,0,0,0] to be deterministic.
   */
  function createSampleGenerator(options) {
    var opts = options || {};
    var assets = ROUTES.map(function (r, idx) {
      // Precompute segment lengths and total loop length.
      var segs = [];
      var total = 0;
      for (var i = 0; i < r.waypoints.length; i++) {
        var a = r.waypoints[i];
        var b = r.waypoints[(i + 1) % r.waypoints.length];
        var len = haversineM(a, b);
        segs.push({ a: a, b: b, len: len, start: total });
        total += len;
      }
      var startDist = (opts.startDistances && typeof opts.startDistances[idx] === 'number')
        ? opts.startDistances[idx]
        : Math.random() * total; // dashboard: start each asset at a different point
      return {
        def: r, segs: segs, totalLen: total,
        dist: startDist,
        pos: null, heading: 0
      };
    });

    function positionAt(asset, dist) {
      var d = ((dist % asset.totalLen) + asset.totalLen) % asset.totalLen;
      for (var i = 0; i < asset.segs.length; i++) {
        var s = asset.segs[i];
        if (d >= s.start && d <= s.start + s.len) {
          var t = s.len === 0 ? 0 : (d - s.start) / s.len;
          return {
            lat: s.a.lat + (s.b.lat - s.a.lat) * t,
            lon: s.a.lon + (s.b.lon - s.a.lon) * t,
            heading: bearingDeg(s.a, s.b)
          };
        }
      }
      var last = asset.segs[asset.segs.length - 1];
      return { lat: last.b.lat, lon: last.b.lon, heading: 0 };
    }

    function isSilent(asset, elapsedS) {
      var windows = asset.def.silentWindows || [];
      for (var i = 0; i < windows.length; i++) {
        var w = windows[i];
        var t = elapsedS % w.cycleS;
        if (t >= w.fromS && t < w.toS) return true;
      }
      return false;
    }

    var startTs = null;
    var lastTs = null;

    /**
     * Advance the sample world to `nowMs` and return the position events
     * for this step (one per reporting asset). Call at a steady interval.
     */
    function tick(nowMs) {
      if (startTs === null) { startTs = nowMs; lastTs = nowMs; }
      // Clamp the step so a paused tab does not teleport the assets.
      var dtS = Math.min(2, Math.max(0, (nowMs - lastTs) / 1000));
      lastTs = nowMs;
      var elapsedS = (nowMs - startTs) / 1000;
      var events = [];
      assets.forEach(function (asset) {
        asset.dist += asset.def.speedMps * dtS;
        if (isSilent(asset, elapsedS)) return; // no event: the asset is quiet
        var p = positionAt(asset, asset.dist);
        asset.pos = p;
        events.push({
          assetId: asset.def.assetId,
          kind: asset.def.kind,
          label: asset.def.label,
          lat: p.lat,
          lon: p.lon,
          ts: nowMs,
          speedKph: Math.round(asset.def.speedMps * 3.6),
          headingDeg: Math.round(p.heading)
        });
      });
      return events;
    }

    function assetDefs() {
      return ROUTES.map(function (r) {
        return { assetId: r.assetId, kind: r.kind, label: r.label };
      });
    }

    return { tick: tick, assetDefs: assetDefs };
  }

  var api = { createSampleGenerator: createSampleGenerator };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SampleStream = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
