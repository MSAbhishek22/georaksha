/*
 * GeoRaksha stream adapters.
 *
 * The dashboard talks to ONE interface, whatever the source:
 *
 *   adapter.start(onEvent)  — begin delivering position events
 *   adapter.stop()          — stop
 *   adapter.describe()      — { name, live } for the UI source label
 *
 * A position event is a plain object:
 *   { assetId, kind, lat, lon, ts, speedKph, headingDeg }
 *
 * Swapping the local sample stream for the organisers' Condense stream is
 * a config change in app.js (STREAM_CONFIG), not a rewrite: build a
 * CondenseStreamAdapter with the workspace URL and a mapEvent function
 * that translates one raw generator message into the shape above.
 * See CONDENSE_HOOKUP.md for the exact steps.
 */
(function (global) {
  'use strict';

  /** Local stand-in stream. Labelled as a sample everywhere it appears. */
  function SampleStreamAdapter(generator, options) {
    var opts = options || {};
    this.generator = generator;
    this.intervalMs = typeof opts.intervalMs === 'number' ? opts.intervalMs : 1000;
    this.timer = null;
  }
  SampleStreamAdapter.prototype.describe = function () {
    return { name: 'Sample stream (local stand-in)', live: false };
  };
  SampleStreamAdapter.prototype.start = function (onEvent) {
    var self = this;
    this.stop();
    this.timer = setInterval(function () {
      var events = self.generator.tick(Date.now());
      for (var i = 0; i < events.length; i++) onEvent(events[i]);
    }, this.intervalMs);
  };
  SampleStreamAdapter.prototype.stop = function () {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  };

  /**
   * The real Condense hookup.
   *
   * config:
   *   url      — stream endpoint from the Condense workspace (ws://, wss://
   *              or http(s):// for server-sent events). Required.
   *   mode     — 'ws' (default) or 'sse'.
   *   mapEvent — function(rawMessage) -> position event | null.
   *              Write this on 26–27 Nov from the generator's actual
   *              output. Return null for messages that are not positions.
   *
   * Until a URL is configured, start() throws a plain-language error
   * instead of pretending to be connected.
   */
  function CondenseStreamAdapter(config) {
    this.config = config || {};
    this.socket = null;
    this.source = null;
  }
  CondenseStreamAdapter.prototype.describe = function () {
    return { name: 'Condense stream', live: true };
  };
  CondenseStreamAdapter.prototype.start = function (onEvent, onError) {
    var cfg = this.config;
    if (!cfg.url || typeof cfg.mapEvent !== 'function') {
      throw new Error('Condense stream is not configured yet: set STREAM_CONFIG.url and STREAM_CONFIG.mapEvent in js/app.js (see CONDENSE_HOOKUP.md).');
    }
    this.stop();
    var handle = function (raw) {
      var ev = null;
      try { ev = cfg.mapEvent(raw); } catch (e) { ev = null; }
      if (ev && typeof ev.lat === 'number' && typeof ev.lon === 'number') onEvent(ev);
    };
    if (cfg.mode === 'sse') {
      this.source = new EventSource(cfg.url);
      this.source.onmessage = function (msg) {
        var parsed = null;
        try { parsed = JSON.parse(msg.data); } catch (e) { parsed = null; }
        if (parsed) handle(parsed);
      };
      this.source.onerror = function (err) { if (onError) onError(err); };
    } else {
      this.socket = new WebSocket(cfg.url);
      this.socket.onmessage = function (msg) {
        var parsed = null;
        try { parsed = JSON.parse(msg.data); } catch (e) { parsed = null; }
        if (parsed) handle(parsed);
      };
      this.socket.onerror = function (err) { if (onError) onError(err); };
    }
  };
  CondenseStreamAdapter.prototype.stop = function () {
    if (this.socket) { try { this.socket.close(); } catch (e) {} this.socket = null; }
    if (this.source) { try { this.source.close(); } catch (e) {} this.source = null; }
  };

  var api = {
    SampleStreamAdapter: SampleStreamAdapter,
    CondenseStreamAdapter: CondenseStreamAdapter
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.StreamAdapters = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
