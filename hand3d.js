// hand3d.js — 2×2 grid 3D hand card scene for 하나빼기
import * as THREE from 'three';

const EMOJI_MAP = { '가위': '✌️', '바위': '✊', '보': '🖐️' };

function makeCardTexture(emojiKey, rowLabel) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');

  const isOpp = rowLabel === '상대방';
  const g = ctx.createLinearGradient(0, 0, 0, S);
  if (isOpp) {
    g.addColorStop(0, '#241050'); g.addColorStop(1, '#160a38');
  } else {
    g.addColorStop(0, '#0e2e1c'); g.addColorStop(1, '#071a10');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(12, 12, S - 24, S - 24, 64);
  else ctx.rect(12, 12, S - 24, S - 24);
  ctx.fill();

  // Border
  ctx.strokeStyle = isOpp ? 'rgba(167,139,250,0.55)' : 'rgba(52,211,153,0.55)';
  ctx.lineWidth = 10;
  ctx.stroke();

  // Top label chip
  const cW = 240, cH = 76, cX = S / 2 - cW / 2, cY = 32;
  ctx.fillStyle = isOpp ? 'rgba(167,139,250,0.15)' : 'rgba(52,211,153,0.15)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cX, cY, cW, cH, 38);
  else ctx.rect(cX, cY, cW, cH);
  ctx.fill();
  ctx.fillStyle = isOpp ? 'rgba(167,139,250,0.95)' : 'rgba(52,211,153,0.95)';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rowLabel, S / 2, cY + cH / 2);

  // Emoji
  ctx.font = '520px serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(EMOJI_MAP[emojiKey] || '❓', S / 2, S / 2 + 28);

  // Hand name
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 70px sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(emojiKey || '', S / 2, S - 28);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  return tex;
}

function makeCard(emojiKey, rowLabel, scene) {
  const tex = makeCardTexture(emojiKey, rowLabel);
  const geo = new THREE.BoxGeometry(1.3, 1.75, 0.08);
  const mats = [
    new THREE.MeshLambertMaterial({ color: 0x080818 }),
    new THREE.MeshLambertMaterial({ color: 0x080818 }),
    new THREE.MeshLambertMaterial({ color: 0x080818 }),
    new THREE.MeshLambertMaterial({ color: 0x080818 }),
    new THREE.MeshLambertMaterial({ map: tex }),
    new THREE.MeshLambertMaterial({ color: 0x0e0e28 }),
  ];
  const mesh = new THREE.Mesh(geo, mats);
  scene.add(mesh);
  return mesh;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn3(t)  { return t * t * t; }

export function createHandScene(canvas) {
  const cssW = canvas.offsetWidth || 320;
  const cssH = Math.round(cssW * 0.75);   // 4:3
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);   // no cap — max quality
  renderer.setSize(cssW, cssH);
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, cssW / cssH, 0.1, 50);
  camera.position.z = 5.5;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xbbbbff, 1.1);
  dir.position.set(1, 4, 6);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0x34d399, 0.6);
  rim.position.set(-5, -2, 3);
  scene.add(rim);

  // Divider
  const divGeo = new THREE.BoxGeometry(4.0, 0.025, 0.01);
  const divMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.7 });
  scene.add(new THREE.Mesh(divGeo, divMat));

  // VS sprite
  const vsC = document.createElement('canvas');
  vsC.width = 256; vsC.height = 128;
  { const ctx = vsC.getContext('2d'); ctx.fillStyle = 'rgba(100,116,139,0.9)'; ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', 128, 64); }
  const vsTex = new THREE.CanvasTexture(vsC); vsTex.anisotropy = 8;
  const vs = new THREE.Sprite(new THREE.SpriteMaterial({ map: vsTex, transparent: true, opacity: 0 }));
  vs.scale.set(0.75, 0.375, 1);
  scene.add(vs);

  const POSITIONS = {
    oppLeft:  new THREE.Vector3(-0.72,  1.0, 0),
    oppRight: new THREE.Vector3( 0.72,  1.0, 0),
    myLeft:   new THREE.Vector3(-0.72, -1.0, 0),
    myRight:  new THREE.Vector3( 0.72, -1.0, 0),
  };

  let cards    = {};
  let anims    = {};
  let animId   = null;
  let disposed = false;

  // Interaction state
  const raycaster     = new THREE.Raycaster();
  let selectionEnabled = false;
  let hoveredKey       = null;
  let selectedKey      = null;
  let onSelectCb       = null;
  let bounceProg       = -1;   // 0→1 bounce after selection

  function startAnim(key, tgt, opts = {}) {
    const card = cards[key];
    if (!card) return;
    const curOp = card.material[4]?.opacity ?? 1;
    anims[key] = {
      sx: card.position.x, sy: card.position.y, sz: card.position.z,
      tx: tgt.x ?? card.position.x,
      ty: tgt.y ?? card.position.y,
      tz: tgt.z ?? card.position.z,
      sRY: card.rotation.y, tRY: tgt.rotY ?? card.rotation.y,
      sRZ: card.rotation.z, tRZ: tgt.rotZ ?? card.rotation.z,
      sOp: curOp, tOp: tgt.opacity ?? curOp,
      t: 0, speed: opts.speed ?? 1.8, easeIn: !!opts.easeIn,
    };
  }

  function tick() {
    if (disposed) return;
    animId = requestAnimationFrame(tick);

    // Position / rotation animations
    Object.entries(anims).forEach(([key, s]) => {
      const card = cards[key];
      if (!card || s.t >= 1) return;
      s.t = Math.min(1, s.t + 0.016 * s.speed);
      const e = s.easeIn ? easeIn3(s.t) : easeOut3(s.t);
      card.position.set(lerp(s.sx,s.tx,e), lerp(s.sy,s.ty,e), lerp(s.sz,s.tz,e));
      card.rotation.y = lerp(s.sRY, s.tRY, e);
      card.rotation.z = lerp(s.sRZ, s.tRZ, e);
      const op = lerp(s.sOp, s.tOp, e);
      card.material.forEach(m => { m.transparent = true; m.opacity = op; });
    });

    // Hover scale (my cards only)
    ['myLeft', 'myRight'].forEach(key => {
      const card = cards[key];
      if (!card || selectedKey) return;
      const tgt = (selectionEnabled && key === hoveredKey) ? 1.1 : 1.0;
      card.scale.x += (tgt - card.scale.x) * 0.15;
      card.scale.y += (tgt - card.scale.y) * 0.15;
    });

    // Selected card bounce
    if (selectedKey && bounceProg >= 0 && bounceProg < 1) {
      bounceProg = Math.min(1, bounceProg + 0.035);
      const b = Math.sin(bounceProg * Math.PI) * 0.22 + 1.0;
      if (cards[selectedKey]) cards[selectedKey].scale.set(b, b, 1);
    }

    renderer.render(scene, camera);
  }

  // ── Raycasting helper ──
  function hitMyCard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const meshes = ['myLeft', 'myRight'].filter(k => cards[k]).map(k => cards[k]);
    const hits = raycaster.intersectObjects(meshes);
    if (!hits.length) return null;
    return hits[0].object === cards.myLeft ? 'myLeft' : 'myRight';
  }

  function doSelect(key) {
    if (!key || selectedKey) return;
    selectedKey = key;
    selectionEnabled = false;
    bounceProg = 0;
    canvas.style.cursor = 'default';
    hoveredKey = null;

    const otherKey  = key === 'myLeft' ? 'myRight' : 'myLeft';
    const otherSide = otherKey === 'myLeft' ? 'left' : 'right';
    removeHand('my', otherSide);

    const side = key === 'myLeft' ? 'left' : 'right';
    onSelectCb?.(side);
  }

  function onMouseMove(e) {
    if (!selectionEnabled || selectedKey) return;
    const key = hitMyCard(e.clientX, e.clientY);
    if (key !== hoveredKey) {
      hoveredKey = key;
      canvas.style.cursor = key ? 'pointer' : 'default';
    }
  }
  function onClick(e)   { if (selectionEnabled && !selectedKey) doSelect(hitMyCard(e.clientX, e.clientY)); }
  function onTouchEnd(e) {
    if (!selectionEnabled || selectedKey) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    doSelect(hitMyCard(t.clientX, t.clientY));
  }

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });

  // ── Public API ──

  function showHands(myHands, oppHands) {
    Object.values(cards).forEach(card => {
      card.geometry.dispose();
      card.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      scene.remove(card);
    });
    cards = {}; anims = {};
    selectedKey = null; hoveredKey = null; bounceProg = -1;
    selectionEnabled = false;
    vs.material.opacity = 0;
    canvas.style.cursor = 'default';

    cards.oppLeft  = makeCard(oppHands.left,  '상대방', scene);
    cards.oppRight = makeCard(oppHands.right, '상대방', scene);
    cards.myLeft   = makeCard(myHands.left,   '나',     scene);
    cards.myRight  = makeCard(myHands.right,  '나',     scene);

    // Start positions
    Object.keys(POSITIONS).forEach(key => {
      const isOpp = key.startsWith('opp');
      cards[key].position.set(POSITIONS[key].x, isOpp ? 5.0 : -5.0, 0);
      cards[key].rotation.y = isOpp ? Math.PI / 2 : -Math.PI / 2;
      cards[key].material.forEach(m => { m.transparent = true; m.opacity = 0; });
    });

    const delays = { oppLeft: 0, oppRight: 150, myLeft: 300, myRight: 450 };
    Object.entries(POSITIONS).forEach(([key, pos]) => {
      setTimeout(() => {
        if (disposed || !cards[key]) return;
        startAnim(key, { x: pos.x, y: pos.y, z: 0, rotY: 0, opacity: 1 }, { speed: 2.0 });
      }, delays[key]);
    });

    // VS fade
    setTimeout(() => {
      if (disposed) return;
      const f = () => { vs.material.opacity = Math.min(1, vs.material.opacity + 0.05); if (vs.material.opacity < 1) requestAnimationFrame(f); };
      f();
    }, 600);

    if (!animId) tick();
  }

  function enableSelection(onSelect) {
    onSelectCb = onSelect;
    selectionEnabled = true;
  }

  function disableSelection() {
    selectionEnabled = false;
    canvas.style.cursor = 'default';
  }

  function removeHand(who, side) {
    const key = `${who}${side === 'left' ? 'Left' : 'Right'}`;
    if (!cards[key]) return;
    const isOpp = who === 'opp';
    startAnim(key, {
      y: isOpp ? 5.0 : -5.0,
      z: -2.5,
      rotY: isOpp ? -Math.PI * 0.75 : Math.PI * 0.75,
      rotZ: isOpp ? -0.45 : 0.45,
      opacity: 0,
    }, { speed: 2.8, easeIn: true });
  }

  function dispose() {
    disposed = true;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('touchend', onTouchEnd);
    Object.values(cards).forEach(card => {
      card.geometry.dispose();
      card.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      scene.remove(card);
    });
    [vs].forEach(s => { s.material.map?.dispose(); s.material.dispose(); scene.remove(s); });
    divGeo.dispose(); divMat.dispose();
    vsTex.dispose();
    renderer.dispose();
  }

  function triggerSelect(side) {
    doSelect(side === 'left' ? 'myLeft' : 'myRight');
  }

  tick();
  return { showHands, enableSelection, disableSelection, removeHand, triggerSelect, dispose };
}
