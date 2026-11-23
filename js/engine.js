/*
 * GeoRaksha geofence engine — pure logic.
 * No DOM, no timers, no I/O. The same file runs in the browser dashboard
 * and in the Node test suite (see the UMD export at the bottom).
 *
 * A zone is one of:
 *   { id, name, type: 'polygon', points: [{lat, lon}, ...] }   (>= 3 points)
 *   { id, name, type: 'circle',  center: {lat, lon}, radiusM: number }
 *
 * A position event is:
 *   { assetId, lat, lon, ts }   // ts = epoch milliseconds
 *
 * The engine tracks, per asset and zone, whether the asset was inside at
 * its last event. Crossings produce ENTER / EXIT alerts. An asset that
 * sends nothing for longer than its silence limit produces one SILENCE
 * alert (and a RECOVERED alert when it reports again).
 */
(function (global) {
  'use strict';

  var EARTH_RADIUS_M = 6371000;

  function toRad(deg) { return (deg * Math.PI) / 180; }

  /** Great-circle distance between two {lat, lon} points, in metres. */
  function haversineM(a, b) {
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lon - a.lon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /**
   * Is point P on segment AB (within epsilon)? Used so a point exactly on
   * a polygon edge counts as inside instead of flickering with the ray cast.
   */
  function pointOnSegment(p, a, b, eps) {
    var cross = (p.lat - a.lat) * (b.lon - a.lon) - (p.lon - a.lon) * (b.lat - a.lat);
    if (Math.abs(cross) > eps) return false;
    var dot = (p.lon - a.lon) * (p.lon - b.lon) + (p.lat - a.lat) * (p.lat - b.lat);
    return dot <= eps;
  }

  /**
   * Point-in-polygon by ray casting (lon = x, lat = y).
   * Points on an edge or vertex count as INSIDE.
   */
  function pointInPolygon(point, polygon) {
    var pts = polygon;
    var n = pts.length;
    if (n < 3) return false;
    var i, j;
    for (i = 0, j = n - 1; i < n; j = i++) {
      if (pointOnSegment(point, pts[j], pts[i], 1e-12)) return true;
    }
    var inside = false;
    var x = point.lon, y = point.lat;
    for (i = 0, j = n - 1; i < n; j = i++) {
      var xi = pts[i].lon, yi = pts[i].lat;
      var xj = pts[j].lon, yj = pts[j].lat;
      var crosses = (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  /** Is a point inside a zone (either shape)? */
  function pointInZone(point, zone) {
    if (!zone || !point) return false;
    if (zone.type === 'circle') {
      return haversineM(point, zone.center) <= zone.radiusM;
    }
    if (zone.type === 'polygon') {
      return pointInPolygon(point, zone.points);
    }
    return false;
  }

  /**
   * Create a monitor: feed it events, it hands back alerts.
   *
   * options:
   *   silenceMs — default silence limit per asset (ms without an event).
   *               Can be overridden per asset via setSilenceLimit().
   *
   * Alert shape:
   *   { type: 'ENTER' | 'EXIT' | 'SILENCE' | 'RECOVERED',
   *     assetId, zoneId (null for SILENCE/RECOVERED), zoneName,
   *     ts, lat, lon (null for SILENCE) }
   */
  function createMonitor(options) {
    var opts = options || {};
    var defaultSilenceMs = typeof opts.silenceMs === 'number' ? opts.silenceMs : 30000;

    var zones = new Map();          // zoneId -> zone
    var membership = new Map();     // assetId -> Map(zoneId -> bool)
    var lastSeen = new Map();       // assetId -> ts of last event
    var silenceLimits = new Map();  // assetId -> ms
    var silentAssets = new Set();   // assetIds currently flagged silent

    function addZone(zone) {
      zones.set(zone.id, zone);
      // A new zone starts as "outside" for every known asset; the next
      // event from an asset already inside will raise ENTER. That is the
      // honest behaviour: the engine only knows what the stream told it.
    }

    function removeZone(zoneId) {
      zones.delete(zoneId);
      membership.forEach(function (perAsset) { perAsset.delete(zoneId); });
    }

    function setSilenceLimit(assetId, ms) { silenceLimits.set(assetId, ms); }

    function silenceLimitFor(assetId) {
      return silenceLimits.has(assetId) ? silenceLimits.get(assetId) : defaultSilenceMs;
    }

    /** Feed one position event. Returns the alerts it produced (may be []). */
    function ingest(event) {
      var alerts = [];
      if (!event || typeof event.lat !== 'number' || typeof event.lon !== 'number') {
        return alerts;
      }
      var assetId = event.assetId;
      var ts = typeof event.ts === 'number' ? event.ts : Date.now();

      if (silentAssets.has(assetId)) {
        silentAssets.delete(assetId);
        alerts.push({
          type: 'RECOVERED', assetId: assetId, zoneId: null, zoneName: null,
          ts: ts, lat: event.lat, lon: event.lon
        });
      }
      lastSeen.set(assetId, ts);

      var perAsset = membership.get(assetId);
      if (!perAsset) { perAsset = new Map(); membership.set(assetId, perAsset); }

      zones.forEach(function (zone) {
        var inside = pointInZone(event, zone);
        var was = perAsset.get(zone.id) === true;
        if (inside && !was) {
          alerts.push({
            type: 'ENTER', assetId: assetId, zoneId: zone.id, zoneName: zone.name,
            ts: ts, lat: event.lat, lon: event.lon
          });
        } else if (!inside && was) {
          alerts.push({
            type: 'EXIT', assetId: assetId, zoneId: zone.id, zoneName: zone.name,
            ts: ts, lat: event.lat, lon: event.lon
          });
        }
        perAsset.set(zone.id, inside);
      });

      return alerts;
    }

    /**
     * Check silence at time `now` (epoch ms). Returns one SILENCE alert per
     * asset that has crossed its limit since the last check and has not
     * already been flagged. Assets that have never reported are unknown to
     * the engine and are not flagged.
     */
    function checkSilence(now) {
      var alerts = [];
      lastSeen.forEach(function (ts, assetId) {
        if (silentAssets.has(assetId)) return;
        if (now - ts > silenceLimitFor(assetId)) {
          silentAssets.add(assetId);
          alerts.push({
            type: 'SILENCE', assetId: assetId, zoneId: null, zoneName: null,
            ts: now, lat: null, lon: null
          });
        }
      });
      return alerts;
    }

    /** Snapshot of current state, for dashboards and tests. */
    function state() {
      var assets = {};
      membership.forEach(function (perAsset, assetId) {
        var insideZones = [];
        perAsset.forEach(function (inside, zoneId) { if (inside) insideZones.push(zoneId); });
        assets[assetId] = {
          insideZones: insideZones,
          lastSeen: lastSeen.get(assetId),
          silent: silentAssets.has(assetId)
        };
      });
      return { assets: assets, zoneCount: zones.size };
    }

    return {
      addZone: addZone,
      removeZone: removeZone,
      setSilenceLimit: setSilenceLimit,
      ingest: ingest,
      checkSilence: checkSilence,
      state: state
    };
  }

  var api = {
    haversineM: haversineM,
    pointInPolygon: pointInPolygon,
    pointInZone: pointInZone,
    createMonitor: createMonitor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.GeoEngine = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
