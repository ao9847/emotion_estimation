// ラッセルの感情円環 (Valence × Arousal) — iPad Safari向け Canvas 実装
// 元のPython (Tkinter + Matplotlib) の機能を概ね移植:
// ・スナップモード: free / circle / labels
// ・タッチ/ドラッグで履歴を記録 (press/move/release)
// ・Undo / Clear / CSV保存
// ・右側パネルで状態と履歴件数を表示

(function(){
  const canvas = document.getElementById('circumplex');
  const ctx = canvas.getContext('2d');
  // Retina対応
  function setupCanvas(c){
    const ratio = window.devicePixelRatio || 1;
    const w = c.width; const h = c.height;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  setupCanvas(canvas);

  const center = { x: canvas.width / (window.devicePixelRatio||1) / 2, y: canvas.height / (window.devicePixelRatio||1) / 2 };
  const R = Math.min(center.x, center.y) - 40; // 主円の半径
  const rPoint = 0.92; // labelsモードの点の半径(単位: 正規化)
  const rText = 1.05;  // ラベルテキスト位置

  const emotions = [
    ["警戒", 75],["興奮",45],["有頂天",25],["幸福",10],
    ["満足",-15],["リラックス",-35],["穏やか",-60],["眠い",-90],
    ["退屈",-120],["抑うつ",-140],["悲しみ",-160],["不快",180],
    ["いら立ち",160],["怒り",140],["緊張",120],["不安",100]
  ];

  // 状態
  let snapMode = 'free';
  let dragging = false;
  let lastLogTime = null; // ms
  const logEveryMs = 40;
  let selected = null;
  const history = []; // {timestamp, phase, valence, arousal, angle_deg, label, snap_mode, chosen_label}
  const trail = [];   // [{x,y}] + NaN区切り

  const statusEl = document.getElementById('status');
  const readoutEl = document.getElementById('readout');
  const countEl = document.getElementById('count');

  // UI wires
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => {
      snapMode = r.value;
      redrawReadout(selected);
      statusEl.textContent = `スナップモードを ${snapMode} に変更しました。`;
      drawAll();
    });
  });
  document.getElementById('undo').addEventListener('click', onUndo);
  document.getElementById('clear').addEventListener('click', onClear);
  document.getElementById('saveCsv').addEventListener('click', onSaveCsv);
  document.getElementById('quit').addEventListener('click', () => {
    statusEl.textContent = '終了しました（ブラウザタブを閉じてください）。';
  });

  // 座標変換: 正規化座標(-1..1) ↔ キャンバス座標(px)
  function normToPx(x,y){ return { x: center.x + x*R, y: center.y - y*R }; }
  function pxToNorm(px,py){ return { x: (px - center.x)/R, y: -(py - center.y)/R }; }

  // 角度と最寄りラベル
  function angleDeg(x,y){ return Math.atan2(y, x) * 180/Math.PI; }
  function nearestLabel(angle){
    function dist(a,b){ let d = Math.abs(a-b)%360; return Math.min(d, 360-d); }
    let best = emotions[0], bestD = Infinity;
    for(const e of emotions){ const d = dist(angle, e[1]); if(d < bestD){ bestD = d; best = e; } }
    return best; // [name, deg]
  }

  // スナップ適用
  function applySnap(x,y){
    let chosen = null;
    if(snapMode === 'circle'){
      const r = Math.hypot(x,y);
      if(r === 0){ x = 1.0; y = 0.0; } else { x /= r; y /= r; }
    } else if(snapMode === 'labels'){
      const ang = angleDeg(x,y);
      const [name, deg] = nearestLabel(ang);
      const th = deg * Math.PI/180;
      x = rPoint * Math.cos(th);
      y = rPoint * Math.sin(th);
      chosen = name;
    } else {
      const r = Math.hypot(x,y);
      if(r > 1.0){ x/=r; y/=r; }
    }
    return {x,y,chosen_label: chosen};
  }

  // ログ + リードアウト + トレイル
  function logAndDraw(x,y,chosen_label=null,phase='click'){
    const ang = angleDeg(x,y);
    const [nearestName] = nearestLabel(ang);
    selected = {
      timestamp: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      valence: x, arousal: y, angle_deg: ang,
      label: chosen_label || nearestName, chosen_label,
      snap_mode: snapMode, phase
    };
    history.push({...selected});
    trail.push({x,y});
    if(phase === 'release'){ trail.push({x: NaN, y: NaN}); }
    redrawReadout(selected);
    drawAll();
  }

  function redrawReadout(sel){
    if(!sel){
      readoutEl.textContent = `Valence(x) : -\nArousal(y) : -\nAngle(°) : -\nSnap mode : ${snapMode}\nChosen lbl : -\nNearest lbl : -`;
    } else {
      const [nearestName] = nearestLabel(sel.angle_deg);
      readoutEl.textContent = `Valence(x) : ${sel.valence.toFixed(2)}\nArousal(y) : ${sel.arousal.toFixed(2)}\nAngle(°) : ${sel.angle_deg.toFixed(1)}\nSnap mode : ${snapMode}\nChosen lbl : ${sel.chosen_label || '-'}\nNearest lbl : ${nearestName}`;
    }
    countEl.textContent = `履歴: ${history.length} 点`;
  }

  // 描画
  function drawAll(){
    const w = canvas.width/(window.devicePixelRatio||1), h = canvas.height/(window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);

    // 背景円
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2);
    ctx.fillStyle = '#f8f9fb'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#bfc7d5'; ctx.stroke();

    // 軸線
    ctx.lineWidth = 1.1; ctx.strokeStyle = '#9aa4b2';
    ctx.beginPath(); ctx.moveTo(-R,0); ctx.lineTo(R,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-R); ctx.lineTo(0,R); ctx.stroke();

    // 補助リング
    for(const r of [0.5,0.75]){
      ctx.beginPath(); ctx.arc(0,0,R*r,0,Math.PI*2);
      ctx.lineWidth = 1; ctx.strokeStyle = '#e3e7ef'; ctx.stroke();
    }

    // ラベル点+テキスト
    ctx.font = '11px -apple-system, Hiragino Sans, Yu Gothic, Meiryo, sans-serif';
    ctx.fillStyle = '#2b3148';
    for(const [label, deg] of emotions){
      const th = deg * Math.PI/180;
      const x = R * rPoint * Math.cos(th);
      const y = - R * rPoint * Math.sin(th);
      // point
      ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fillStyle = '#566cd6'; ctx.fill();
      // text
      const tx = R * rText * Math.cos(th);
      const ty = - R * rText * Math.sin(th);
      ctx.fillStyle = '#2b3148';
      // テキスト位置調整
      const ha = Math.cos(th) >= 0 ? 'left' : 'right';
      const va = Math.sin(th) >= 0 ? 'top' : 'bottom';
      ctx.textAlign = ha; ctx.textBaseline = va;
      ctx.fillText(label, tx, ty);
      // connector
      ctx.strokeStyle = '#c8cfde'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(tx,ty); ctx.stroke();
    }
    ctx.restore();

    // トレイル線
    ctx.save();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#e4572e'; ctx.globalAlpha = 0.7;
    ctx.beginPath();
    let started = false;
    for(const p of trail){
      if(Number.isNaN(p.x) || Number.isNaN(p.y)){ started = false; continue; }
      const {x,y} = normToPx(p.x, p.y);
      if(!started){ ctx.moveTo(x,y); started = true; }
      else { ctx.lineTo(x,y); }
    }
    ctx.stroke();
    ctx.restore();

    // 選択点
    if(selected){
      const {x,y} = normToPx(selected.valence, selected.arousal);
      // outline
      ctx.beginPath(); ctx.arc(x,y,10,0,Math.PI*2);
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#e4572e'; ctx.stroke();
      // dot
      ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2);
      ctx.fillStyle = '#e4572e'; ctx.fill();
    }
  }

  // 入力 (マウス + タッチ)
  function getCanvasPos(evt){
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if(evt.touches && evt.touches.length){ clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY; }
    else { clientX = evt.clientX; clientY = evt.clientY; }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onPress(evt){
    evt.preventDefault();
    const p = getCanvasPos(evt);
    const n = pxToNorm(p.x, p.y);
    const {x,y,chosen_label} = applySnap(n.x, n.y);
    dragging = true; lastLogTime = performance.now();
    logAndDraw(x,y,chosen_label,'press');
  }
  function onMove(evt){
    if(!dragging) return; evt.preventDefault();
    const p = getCanvasPos(evt);
    const n = pxToNorm(p.x, p.y);
    const {x,y,chosen_label} = applySnap(n.x, n.y);
    const now = performance.now();
    if(!lastLogTime || (now - lastLogTime) >= logEveryMs){
      lastLogTime = now; logAndDraw(x,y,chosen_label,'move');
    } else {
      // 描画だけ更新
      selected = { timestamp: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
                   valence: x, arousal: y, angle_deg: angleDeg(x,y),
                   label: (chosen_label || nearestLabel(angleDeg(x,y))[0]), chosen_label,
                   snap_mode: snapMode, phase: 'move' };
      redrawReadout(selected); drawAll();
    }
  }
  function onRelease(evt){
    if(!dragging) return; evt.preventDefault();
    const p = getCanvasPos(evt);
    const n = pxToNorm(p.x, p.y);
    const {x,y,chosen_label} = applySnap(n.x, n.y);
    logAndDraw(x,y,chosen_label,'release');
    dragging = false; lastLogTime = null;
  }

  canvas.addEventListener('mousedown', onPress);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onRelease);
  canvas.addEventListener('touchstart', onPress, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onRelease, { passive: false });

  // Undo / Clear / CSV
  function onUndo(){
    if(history.length === 0) return;
    history.pop();
    // 再構築
    trail.length = 0;
    for(const row of history){
      trail.push({x: row.valence, y: row.arousal});
      if(row.phase === 'release') trail.push({x: NaN, y: NaN});
    }
    selected = history.length ? history[history.length-1] : null;
    redrawReadout(selected); drawAll();
    statusEl.textContent = '最後の点を取り消しました。';
  }
  function onClear(){
    if(history.length === 0) return;
    if(!confirm('履歴をすべて削除しますか？')) return;
    history.length = 0; trail.length = 0; selected = null;
    redrawReadout(null); drawAll();
    statusEl.textContent = '履歴をクリアしました。';
  }
  function onSaveCsv(){
    if(history.length === 0){ alert('保存する履歴がありません。'); return; }
    const header = ['index','timestamp','phase','valence','arousal','angle_deg','label','snap_mode'];
    const lines = [header.join(',')];
    history.forEach((row,i) => {
      lines.push([
        i+1,
        row.timestamp,
        row.phase || '',
        row.valence.toFixed(6),
        row.arousal.toFixed(6),
        row.angle_deg.toFixed(6),
        row.label,
        row.snap_mode
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')+'\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const fname = `circumplex_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
    a.href = url; a.download = fname; document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); a.remove();
    statusEl.textContent = `CSV を保存しました: ${fname}`;
  }

  // 初期描画
  redrawReadout(null);
  drawAll();

  // 履歴件数の定期更新（UI反映）
  setInterval(() => { countEl.textContent = `履歴: ${history.length} 点`; }, 250);
})();
