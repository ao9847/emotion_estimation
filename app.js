// ラッセルの感情円環 (Valence × Arousal) — iPad Safari向け Canvas 実装
// 全画面キャンバス + フローティングコントロール

(function(){
  const canvas = document.getElementById('circumplex');
  const ctx = canvas.getContext('2d');
  
  // キャンバスをウィンドウサイズに合わせる
  function resizeCanvas(){
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    
    // 中心と半径を再計算
    center.x = window.innerWidth / 2;
    center.y = window.innerHeight / 2;
    R = Math.min(center.x, center.y) - 60;
    
    drawAll();
  }
  
  let center = { x: 0, y: 0 };
  let R = 0;
  const rPoint = 0.92;
  const rText = 1.08;

  const emotions16 = [
    ["警戒", 75],["興奮",45],["有頂天",25],["幸福",10],
    ["満足",-15],["リラックス",-35],["穏やか",-60],["眠い",-90],
    ["退屈",-120],["抑うつ",-140],["悲しみ",-160],["不快",180],
    ["いら立ち",160],["怒り",140],["緊張",120],["不安",100]
  ];

  const emotions4 = [
    ["喜", 45],   // 第1象限: Valence+, Arousal+
    ["怒", 135],  // 第2象限: Valence-, Arousal+
    ["哀", -135], // 第3象限: Valence-, Arousal-
    ["楽", -45]   // 第4象限: Valence+, Arousal-
  ];

  let labelMode = 'normal';
  let emotions = emotions16;

  let snapMode = 'free';
  let dragging = false;
  let lastLogTime = null;
  const logEveryMs = 40;
  let selected = null;
  const history = [];
  const trail = [];

  const statusEl = document.getElementById('status');
  const infoEl = document.getElementById('info');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const toggleBtn = document.getElementById('toggleLabelMode');
  toggleBtn.addEventListener('click', () => {
    labelMode = labelMode === 'normal' ? 'simple' : 'normal';
    emotions = labelMode === 'simple' ? emotions4 : emotions16;
    toggleBtn.textContent = labelMode === 'simple' ? '通常モード (16)' : '簡易モード (4)';
    toggleBtn.style.background = labelMode === 'simple' ? 'rgba(86, 108, 214, 0.15)' : 'rgba(255, 255, 255, 0.95)';
    updateInfo();
    statusEl.textContent = `ラベルモード: ${labelMode === 'simple' ? '簡易 (4)' : '通常 (16)'}`;
    drawAll();
  });

  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => {
      snapMode = r.value;
      updateInfo();
      statusEl.textContent = `モード: ${snapMode}`;
      drawAll();
    });
  });
  
  document.getElementById('undo').addEventListener('click', onUndo);
  document.getElementById('clear').addEventListener('click', onClear);
  document.getElementById('saveCsv').addEventListener('click', onSaveCsv);

  function normToPx(x,y){ return { x: center.x + x*R, y: center.y - y*R }; }
  function pxToNorm(px,py){ return { x: (px - center.x)/R, y: -(py - center.y)/R }; }
  function angleDeg(x,y){ return Math.atan2(y, x) * 180/Math.PI; }
  
  function nearestLabel(angle){
    function dist(a,b){ let d = Math.abs(a-b)%360; return Math.min(d, 360-d); }
    let best = emotions[0], bestD = Infinity;
    for(const e of emotions){ const d = dist(angle, e[1]); if(d < bestD){ bestD = d; best = e; } }
    return best;
  }

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
    updateInfo();
    drawAll();
  }

  function updateInfo(){
    const labelText = labelMode === 'simple' ? '簡易(4)' : '通常(16)';
    infoEl.innerHTML = `履歴: ${history.length} 点<br>ラベル: ${labelText}<br>Mode: ${snapMode}`;
  }

  function drawAll(){
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(center.x, center.y);

    // 背景円
    ctx.beginPath();
    ctx.arc(0,0,R,0,Math.PI*2);
    ctx.fillStyle = '#f8f9fb';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#bfc7d5';
    ctx.stroke();

    // 簡易モード: 4象限の背景色とラベル
    if(labelMode === 'simple'){
      const quadrants = [
        { label: '喜', angle: 45, colors: ['rgba(255, 223, 0, 0.1)', 'rgba(255, 223, 0, 0.2)', 'rgba(255, 223, 0, 0.3)'] },   // 黄色 - 喜
        { label: '怒', angle: 135, colors: ['rgba(255, 87, 51, 0.1)', 'rgba(255, 87, 51, 0.2)', 'rgba(255, 87, 51, 0.3)'] },  // 赤色 - 怒
        { label: '哀', angle: 225, colors: ['rgba(99, 155, 255, 0.1)', 'rgba(99, 155, 255, 0.2)', 'rgba(99, 155, 255, 0.3)'] }, // 青色 - 哀
        { label: '楽', angle: 315, colors: ['rgba(102, 204, 153, 0.1)', 'rgba(102, 204, 153, 0.2)', 'rgba(102, 204, 153, 0.3)'] } // 緑色 - 楽
      ];

      // 3段階のグラデーション（内側→外側で濃くなる）
      for(const q of quadrants){
        const startAngle = (q.angle - 45) * Math.PI / 180;
        const endAngle = (q.angle + 45) * Math.PI / 180;

        // 3段階のリング（補助リングの位置と一致: 0-50%, 50-75%, 75-100%）
        const rings = [
          { inner: 0, outer: R * 0.5, color: q.colors[0] },
          { inner: R * 0.5, outer: R * 0.75, color: q.colors[1] },
          { inner: R * 0.75, outer: R, color: q.colors[2] }
        ];

        for(const ring of rings){
          ctx.beginPath();
          ctx.moveTo(ring.inner * Math.cos(-startAngle), ring.inner * Math.sin(-startAngle));
          ctx.arc(0, 0, ring.inner, -startAngle, -endAngle, true);
          ctx.lineTo(ring.outer * Math.cos(-endAngle), ring.outer * Math.sin(-endAngle));
          ctx.arc(0, 0, ring.outer, -endAngle, -startAngle, false);
          ctx.closePath();
          ctx.fillStyle = ring.color;
          ctx.fill();
        }

        // 象限の外側にラベル
        const labelAngle = q.angle * Math.PI / 180;
        const labelDist = R * 0.7;
        const lx = labelDist * Math.cos(labelAngle);
        const ly = -labelDist * Math.sin(labelAngle);

        ctx.font = `bold ${Math.max(40, R / 6)}px -apple-system, Hiragino Sans, Yu Gothic, Meiryo, sans-serif`;
        ctx.fillStyle = 'rgba(43, 49, 72, 0.25)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(q.label, lx, ly);
      }

      // 中心に「普」ラベル
      ctx.font = `bold ${Math.max(36, R / 7)}px -apple-system, Hiragino Sans, Yu Gothic, Meiryo, sans-serif`;
      ctx.fillStyle = 'rgba(43, 49, 72, 0.2)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('普', 0, 0);
    }

    // 軸線
    ctx.lineWidth = 1.5; 
    ctx.strokeStyle = '#9aa4b2';
    ctx.beginPath(); 
    ctx.moveTo(-R,0); 
    ctx.lineTo(R,0); 
    ctx.stroke();
    ctx.beginPath(); 
    ctx.moveTo(0,-R); 
    ctx.lineTo(0,R); 
    ctx.stroke();

    // 補助リング
    for(const r of [0.5,0.75]){
      ctx.beginPath(); 
      ctx.arc(0,0,R*r,0,Math.PI*2);
      ctx.lineWidth = 1; 
      ctx.strokeStyle = '#e3e7ef'; 
      ctx.stroke();
    }

    // ラベル（円周上の点とテキスト）- 通常モードのみ
    if(labelMode === 'normal'){
      const fontSize = Math.max(12, Math.min(16, R / 20));
      ctx.font = `${fontSize}px -apple-system, Hiragino Sans, Yu Gothic, Meiryo, sans-serif`;

      for(const [label, deg] of emotions){
        const th = deg * Math.PI/180;
        const x = R * rPoint * Math.cos(th);
        const y = - R * rPoint * Math.sin(th);

        // 点
        ctx.beginPath();
        ctx.arc(x,y,6,0,Math.PI*2);
        ctx.fillStyle = '#566cd6';
        ctx.fill();

        // テキスト
        const tx = R * rText * Math.cos(th);
        const ty = - R * rText * Math.sin(th);
        ctx.fillStyle = '#2b3148';
        const ha = Math.cos(th) >= 0 ? 'left' : 'right';
        const va = Math.sin(th) >= 0 ? 'top' : 'bottom';
        ctx.textAlign = ha;
        ctx.textBaseline = va;
        ctx.fillText(label, tx, ty);

        // 接続線
        ctx.strokeStyle = '#c8cfde';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x,y);
        ctx.lineTo(tx,ty);
        ctx.stroke();
      }
    }
    ctx.restore();

    // トレイル
    ctx.save();
    ctx.lineWidth = 2; 
    ctx.strokeStyle = '#e4572e'; 
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    let started = false;
    for(const p of trail){
      if(Number.isNaN(p.x) || Number.isNaN(p.y)){ 
        started = false; 
        continue; 
      }
      const {x,y} = normToPx(p.x, p.y);
      if(!started){ 
        ctx.moveTo(x,y); 
        started = true; 
      } else { 
        ctx.lineTo(x,y); 
      }
    }
    ctx.stroke();
    ctx.restore();

    // 選択点
    if(selected){
      const {x,y} = normToPx(selected.valence, selected.arousal);
      ctx.beginPath(); 
      ctx.arc(x,y,12,0,Math.PI*2);
      ctx.lineWidth = 2; 
      ctx.strokeStyle = '#e4572e'; 
      ctx.stroke();
      ctx.beginPath(); 
      ctx.arc(x,y,8,0,Math.PI*2);
      ctx.fillStyle = '#e4572e'; 
      ctx.fill();
    }
  }

  function getCanvasPos(evt){
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if(evt.touches && evt.touches.length){ 
      clientX = evt.touches[0].clientX; 
      clientY = evt.touches[0].clientY; 
    } else { 
      clientX = evt.clientX; 
      clientY = evt.clientY; 
    }
    // CSSピクセル単位での座標を返す
    return { 
      x: clientX - rect.left, 
      y: clientY - rect.top 
    };
  }

  function onPress(evt){
    evt.preventDefault();
    const p = getCanvasPos(evt);
    const n = pxToNorm(p.x, p.y);
    const {x,y,chosen_label} = applySnap(n.x, n.y);
    dragging = true; 
    lastLogTime = performance.now();
    logAndDraw(x,y,chosen_label,'press');
  }
  
  function onMove(evt){
    if(!dragging) return; 
    evt.preventDefault();
    const p = getCanvasPos(evt);
    const n = pxToNorm(p.x, p.y);
    const {x,y,chosen_label} = applySnap(n.x, n.y);
    const now = performance.now();
    if(!lastLogTime || (now - lastLogTime) >= logEveryMs){
      lastLogTime = now; 
      logAndDraw(x,y,chosen_label,'move');
    } else {
      selected = { 
        timestamp: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        valence: x, arousal: y, angle_deg: angleDeg(x,y),
        label: (chosen_label || nearestLabel(angleDeg(x,y))[0]), chosen_label,
        snap_mode: snapMode, phase: 'move' 
      };
      drawAll();
    }
  }
  
  function onRelease(evt){
    if(!dragging) return; 
    evt.preventDefault();
    const p = getCanvasPos(evt);
    const n = pxToNorm(p.x, p.y);
    const {x,y,chosen_label} = applySnap(n.x, n.y);
    logAndDraw(x,y,chosen_label,'release');
    dragging = false; 
    lastLogTime = null;
  }

  canvas.addEventListener('mousedown', onPress);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onRelease);
  canvas.addEventListener('touchstart', onPress, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onRelease, { passive: false });
  canvas.addEventListener('touchcancel', onRelease, { passive: false });
  
  // コンテキストメニューを無効化
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function onUndo(){
    if(history.length === 0) return;
    history.pop();
    trail.length = 0;
    for(const row of history){
      trail.push({x: row.valence, y: row.arousal});
      if(row.phase === 'release') trail.push({x: NaN, y: NaN});
    }
    selected = history.length ? history[history.length-1] : null;
    updateInfo();
    drawAll();
    statusEl.textContent = '最後の点を取り消しました';
  }
  
  function onClear(){
    if(history.length === 0) return;
    if(!confirm('履歴をすべて削除しますか？')) return;
    history.length = 0; 
    trail.length = 0; 
    selected = null;
    updateInfo();
    drawAll();
    statusEl.textContent = '履歴をクリアしました';
  }
  
  function onSaveCsv(){
    if(history.length === 0){ 
      alert('保存する履歴がありません'); 
      return; 
    }
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
    a.href = url; 
    a.download = fname; 
    document.body.appendChild(a); 
    a.click();
    URL.revokeObjectURL(url); 
    a.remove();
    statusEl.textContent = `CSVを保存: ${fname}`;
  }

  updateInfo();
  drawAll();
})();
