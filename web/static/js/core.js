
  // --- Haptic feedback (light tap like iPhone keyboard) ---
  // iOS Safari ไม่มี Web Haptics API → ใช้ navigator.vibrate (Android) + CSS press animation (ทั้งคู่)
  function hapticTap() {
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  }
  document.addEventListener('pointerdown', function(e) {
    const t = e.target && e.target.closest ? e.target.closest('button, [role="button"], a, label') : null;
    if (t) hapticTap();
  }, true);

  // --- Auth Store ---
// ===== RunVerse builders (สร้างมาตรฐาน 20 เลเวล/คลาส จาก thresholds จริง) =====
  function rqFmt(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
  function rqFmtH(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
  function rqBuildStandards() {
    const cfg = {
      sprint: { dir: 'down', fmt: 'time', prefix: '400m', wr: 'WR 43.03s', pace: false, unit: '400m เร็วสุด', target: 'sprint400',
        slowEdges: [999, 150, 140, 132, 125, 119, 114, 110, 106, 102, 98, 95, 92, 89, 86, 83, 80, 77, 74, 71, 68, 65, 62, 59, 56, 53, 50, 48, 46, 44.5], fastLast: 43,
        bands: [[1, 6, '🌱 มือใหม่สปรินท์'], [7, 12, '🌿 สายฟิต'], [13, 18, '⚡ นักแข่งสมัครเล่น'], [19, 24, '🏅 ตัวแทนทีม'], [25, 30, '💎 ระดับโลก']],
        popCurve: [5, 8, 11, 14, 17, 20, 24, 28, 32, 36, 40, 45, 50, 55, 60, 65, 70, 75, 80, 84, 88, 91, 94, 96, 97.5, 98.7, 99.3, 99.7, 99.9, 99.97],
        unlocks: [[6, '100m'], [9, '200m'], [12, '400m'], [16, '400m ระดับแข่ง']],
        cutoffs: [[9, 'คัดตัว 100m'], [12, 'คัดตัว 400m']] },
      mid: { dir: 'down', fmt: 'time', prefix: '5K', wr: 'WR 12:49', pace: true, unit: 'เวลา 5K เร็วสุด', target: 'best5k',
        slowEdges: [999, 3300, 3200, 3100, 3000, 2900, 2800, 2700, 2600, 2500, 2400, 2280, 2160, 2040, 1920, 1800, 1710, 1620, 1530, 1440, 1350, 1275, 1200, 1125, 1050, 990, 930, 870, 820, 780], fastLast: 770,
        bands: [[1, 6, '🌱 มือใหม่หัดวิ่ง'], [7, 12, '🌿 นักวิ่งเพื่อสุขภาพ'], [13, 18, '⚡ นักแข่งสมัครเล่น'], [19, 24, '🏅 ตัวแทนทีม'], [25, 30, '💎 ระดับโลก']],
        popCurve: [6, 9, 12, 15, 18, 22, 26, 30, 34, 38, 43, 48, 53, 58, 63, 68, 73, 78, 83, 87, 90, 93, 95, 97, 98.2, 99, 99.5, 99.8, 99.93, 99.99],
        unlocks: [[6, '5K'], [12, '10K'], [20, '10K ระดับแข่ง']],
        cutoffs: [[8, 'ผ่าน cutoff 5K (40 นาที)'], [15, 'ผ่าน cutoff 10K (1:30)']] },
      long: { dir: 'down', fmt: 'half', prefix: 'ฮาล์ฟ', wr: 'WR 57:31', pace: true, unit: 'เวลาฮาล์ฟมาราธอน', target: 'bestHalf',
        slowEdges: [999, 16200, 15300, 14400, 13500, 12600, 11700, 10800, 10200, 9600, 9000, 8400, 7950, 7500, 7050, 6600, 6150, 5700, 5400, 5100, 4800, 4500, 4200, 3900, 3600, 3450, 3300, 3180, 3060, 2970], fastLast: 0,
        bands: [[1, 6, '🌱 มือใหม่ไกล'], [7, 12, '🌿 นักวิ่งเพื่อสุขภาพ'], [13, 18, '⚡ นักแข่งสมัครเล่น'], [19, 24, '🏅 ตัวแทนทีม'], [25, 30, '💎 ระดับโลก']],
        popCurve: [4, 7, 10, 13, 16, 19, 23, 27, 31, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 84, 88, 91, 94, 96, 97.5, 98.7, 99.3, 99.7, 99.9, 99.98],
        unlocks: [[8, '10.5K'], [12, 'ฮาล์ฟ 21.1K'], [16, 'ฟูลมาราธอน']],
        cutoffs: [[12, 'ผ่าน cutoff ฮาล์ฟ (3:30)'], [16, 'ผ่าน cutoff ฟูล (6:30)']] },
      ultra: { dir: 'up', fmt: 'km', unit: 'ระยะไกลสุด', target: 'longestKm',
        slowEdges: [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21.1, 23, 25, 28, 30, 35, 42.2, 50, 60, 75, 100],
        bands: [[1, 6, '🌱 มือใหม่'], [7, 12, '🌿 นักวิ่งไกล'], [13, 18, '⚡ นักวิ่งระยะไกล'], [19, 24, '🏅 นักอัลตร้า'], [25, 30, '💎 ระดับอัลตร้า']],
        popCurve: [3, 5, 8, 11, 14, 17, 21, 25, 29, 33, 38, 43, 48, 53, 58, 63, 68, 73, 78, 82, 86, 89, 92, 95, 97, 98.5, 99.2, 99.7, 99.9, 99.97],
        unlocks: [[22, '50K อัลตร้า'], [27, '100K อัลตร้า']],
        cutoffs: [[22, 'ผ่าน cutoff 50K (10 ชม.)'], [27, 'ผ่าน cutoff 100K (24 ชม.)']] },
    };
    const out = {};
    for (const [key, c] of Object.entries(cfg)) {
      const levels = c.slowEdges.map((edge, i) => {
        const lv = i + 1;
        const nextEdge = i + 1 < c.slowEdges.length ? c.slowEdges[i + 1] : (c.dir === 'up' ? 999 : c.fastLast);
        const slow = c.dir === 'up' ? nextEdge : edge;
        const fast = c.dir === 'up' ? edge : nextEdge;
        const band = c.bands.find(b => lv >= b[0] && lv <= b[1]);
        const popPct = (c.popCurve || [])[i];
        const unlockNow = (c.unlocks || []).find(u => u[0] === lv);
        const maxLv = c.slowEdges.length;
        const cutNow = (c.cutoffs || []).find(u => u[0] === lv);
        const topRaw = 100 - (popPct != null ? popPct : 0);
        const topStr = topRaw >= 1 ? String(Math.round(topRaw)) : String(Math.round(topRaw * 100) / 100);
        let ref;
        if (c.fmt === 'time') {
          ref = lv === 1 ? `${c.prefix} > ${rqFmt(slow)}` : lv === maxLv ? `${c.prefix} < ${rqFmt(slow)} (${c.wr})` : `${c.prefix} ${rqFmt(fast)}–${rqFmt(slow)}`;
          if (c.pace && lv > 1 && lv < maxLv) ref += ` • pace ${rqFmt(Math.round(fast / 5))}–${rqFmt(Math.round(slow / 5))}/กม.`;
        } else if (c.fmt === 'half') {
          ref = lv === 1 ? 'ฮาล์ฟ > 3:00:00' : lv === maxLv ? `< 57:31 (${c.wr})` : `ฮาล์ฟ ${rqFmtH(fast)}–${rqFmtH(slow)}`;
          if (lv > 1 && lv < maxLv) ref += ` • pace ${rqFmt(Math.round(fast / 21.1))}–${rqFmt(Math.round(slow / 21.1))}/กม.`;
        } else {
          ref = lv === 1 ? '< 5 km' : lv === maxLv ? '100 km+' : `${fast}–${slow} km`;
        }
        return { lv: lv, slow: slow, fast: fast, title: band[2], ref: ref, pop: popPct != null ? popPct : 0, top: topStr, unlock: unlockNow ? unlockNow[1] : '', cut: cutNow ? cutNow[1] : '' };
      });
      out[key] = { unit: c.unit, target: c.target, dir: c.dir, levels: levels, cutoffs: c.cutoffs || [] };
    }
    return out;
  }

