/* GeoRaksha — 3D geofence terrain (hero).
 * Classic script, Three.js r160 UMD from jsDelivr (window.THREE).
 * Auto-inits on first load. Drag to rotate. One still frame under
 * prefers-reduced-motion (or the page's Reduce motion toggle);
 * pauses off-screen. Guarded no-op if the CDN or WebGL is
 * unavailable. This is a stylised picture of the watch floor — the
 * live map below runs on the labelled sample stream; nothing here
 * is live data. Engine, adapters and sample stream are untouched. */
(function () {
  'use strict';
  var canvas = document.getElementById('hero3d');
  if (!canvas || typeof THREE === 'undefined') return;
  function motionReduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.getAttribute('data-motion') === 'reduced';
  }
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 6.4, 8.6);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  var key = new THREE.DirectionalLight(0xffe6b0, 1.2);
  key.position.set(4, 8, 5);
  scene.add(key);

  var world = new THREE.Group();
  scene.add(world);

  /* Extruded ground plane + grid. */
  var ground = new THREE.Mesh(
    new THREE.BoxGeometry(7.4, 0.3, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.9 })
  );
  ground.position.y = -0.15;
  world.add(ground);
  var grid = new THREE.GridHelper(7, 14, 0x2a4a63, 0x1d3245);
  grid.position.y = 0.01;
  world.add(grid);

  /* Glowing polygon fence: translucent walls + bright top edge. */
  var fencePts = [
    [-2.6, -1.4], [-0.6, -1.9], [1.8, -1.2], [2.7, 0.4],
    [1.4, 1.7], [-1.2, 1.8], [-2.8, 0.6]
  ];
  var wallMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
  var edgeMat = new THREE.LineBasicMaterial({ color: 0xffc84d });
  var topPts = [];
  fencePts.forEach(function (p, i) {
    var q = fencePts[(i + 1) % fencePts.length];
    var wallGeo = new THREE.BufferGeometry();
    wallGeo.setFromPoints([
      new THREE.Vector3(p[0], 0, p[1]),
      new THREE.Vector3(q[0], 0, q[1]),
      new THREE.Vector3(q[0], 0.85, q[1]),
      new THREE.Vector3(p[0], 0.85, p[1])
    ]);
    wallGeo.setIndex([0, 1, 2, 0, 2, 3]);
    wallGeo.computeVertexNormals();
    world.add(new THREE.Mesh(wallGeo, wallMat));
    topPts.push(new THREE.Vector3(p[0], 0.86, p[1]));
  });
  topPts.push(topPts[0].clone());
  world.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(topPts), edgeMat
  ));
  /* Fence corner posts. */
  fencePts.forEach(function (p) {
    var post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc84d })
    );
    post.position.set(p[0], 0.45, p[1]);
    world.add(post);
  });

  /* Moving asset dots on patrol loops. */
  var assets = [];
  var assetDefs = [
    { color: 0x7dd3fc, r: 2.6, speed: 0.35, phase: 0, y: 0.12 },
    { color: 0x86efac, r: 1.9, speed: -0.5, phase: 2.1, y: 0.12 },
    { color: 0xfbbf24, r: 3.1, speed: 0.22, phase: 4.0, y: 0.12 }
  ];
  assetDefs.forEach(function (d) {
    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      new THREE.MeshBasicMaterial({ color: d.color })
    );
    dot.position.y = d.y;
    world.add(dot);
    assets.push({ mesh: dot, def: d });
  });

  /* Red breach pulse at the north-east fence corner. */
  var breach = new THREE.Group();
  breach.position.set(2.7, 0.05, 0.4);
  var breachRing = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.3, 40),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  breachRing.rotation.x = -Math.PI / 2;
  breach.add(breachRing);
  var breachLight = new THREE.PointLight(0xff3b30, 8, 6);
  breachLight.position.y = 0.6;
  breach.add(breachLight);
  world.add(breach);

  var rotY = 0, targetRotY = 0, dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    targetRotY += (e.clientX - lastX) * 0.008;
    lastX = e.clientX;
  });
  function endDrag() { dragging = false; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function resize() {
    var w = canvas.clientWidth || 800, h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }, { threshold: 0.02 }).observe(canvas);
  }

  var clock = new THREE.Clock();
  var raf = null;
  var wasReduced = motionReduced();
  function frame() {
    raf = null;
    var t = clock.getElapsedTime();
    if (!dragging) targetRotY += 0.0016;
    rotY += (targetRotY - rotY) * 0.08;
    world.rotation.y = rotY;
    assets.forEach(function (a) {
      var ang = a.def.phase + t * a.def.speed;
      a.mesh.position.x = Math.cos(ang) * a.def.r * 0.9;
      a.mesh.position.z = Math.sin(ang) * a.def.r * 0.62;
    });
    /* Breach pulse: a ring that grows and fades every ~4 seconds. */
    var cycle = (t % 4) / 4;
    var s = 1 + cycle * 4;
    breachRing.scale.set(s, s, 1);
    breachRing.material.opacity = 0.9 * (1 - cycle);
    breachLight.intensity = 8 * (1 - cycle) + 1;
    renderer.render(scene, camera);
    if (!motionReduced() && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (raf === null) { clock.getDelta(); raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  /* The page's motion toggle flips data-motion; re-check it. */
  var motionBtn = document.getElementById('motionBtn');
  if (motionBtn) motionBtn.addEventListener('click', function () {
    setTimeout(function () {
      if (motionReduced()) { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } frame(); }
      else kick();
    }, 60);
  });
  if (wasReduced) { frame(); } else { kick(); }
  window.__georaksha3DReady = true;
})();
