document.addEventListener('alpine:init', () => {
Alpine.store('game', {
    // สถิติจริงต่อคลาส (ยังไม่มีข้อมูล = 0 → แสดง "ยังไม่ได้เชื่อมต่อ")
    sprint400: 0,
    best5k: 0,
    bestHalf: 0,
    longestKm: 0,
    stats: { totalKm: 0, runs: 0, totalCal: 0, avgHR: 0 },
    classOrder: ['sprint', 'mid', 'long', 'ultra'],
    classMeta: {
      overall: { icon: 'fa-trophy', name: 'Overall' },
      sprint: { icon: 'fa-bolt', name: 'สปรินเตอร์', desc: 'ระยะสั้น 400m' },
      mid: { icon: 'fa-person-running', name: 'นักวิ่งกลาง', desc: '5K–10K' },
      long: { icon: 'fa-water', name: 'นักวิ่งไกล', desc: 'ฮาล์ฟ–มาราธอน' },
      ultra: { icon: 'fa-mountain', name: 'อัลตร้า', desc: 'ระยะไกลสุด' },
    },
    overallTitles: ['🌱 มือใหม่', '🐣 ผู้เริ่มต้น', '🌿 นักวิ่งเพื่อสุขภาพ', '🍃 นักวิ่งสายฟิต', '⚡ ฟิตเนสรันเนอร์', '🏃 นักวิ่งมาตรฐาน', '💪 นักวิ่งกลาง', '🔥 นักแข่งสมัครเล่น', '🎯 นักวิ่งแข่ง', '🏅 แข่งระดับจังหวัด', '🥈 แข่งระดับประเทศ', '🇹🇭 ตัวแทนทีม', '⚔️ นักกีฬาอาชีพ', '🚀 อาชีพขั้นสูง', '🏆 ระดับนานาชาติ', '🌟 ระดับโลก', '👑 ตำนาน', '💎 ระดับตำนาน', '🏆 ผู้ท้าชิงสถิติโลก', '💎 ผู้ทำลายสถิติโลก', '🚀 เหนือมนุษย์', '🌌 ระดับจักรวาล', '👽 นักวิ่งต่างดาว', '⚡ เทพสายฟ้า', '🏆 เทพเจ้าแห่งการวิ่ง', '🌟 เซียนขั้นสุด', '💎 อมตะ', '🔥 ผู้ทำลายกำแพง', '⚡ แชมป์จักรวาล', '🏆 GOD TIER'],
    standards: rqBuildStandards(),
    // โปรไฟล์: สายที่แสดงอยู่ + สีตามสาย
    selectedClass: localStorage.getItem('runquest_selected_class') || 'overall',
    realData: false,
    apiLastSync: '',
    gradients: {
      overall: 'from-indigo-600 via-indigo-500 to-violet-600',
      sprint: 'from-amber-500 via-orange-500 to-rose-500',
      mid: 'from-sky-500 via-blue-500 to-indigo-500',
      long: 'from-emerald-500 via-teal-500 to-cyan-500',
      ultra: 'from-violet-500 via-purple-500 to-fuchsia-500',
    },
    chipStyle: {
      overall: 'border-indigo-600 bg-indigo-50 text-indigo-600',
      sprint: 'border-amber-500 bg-amber-50 text-amber-600',
      mid: 'border-sky-500 bg-sky-50 text-sky-600',
      long: 'border-emerald-500 bg-emerald-50 text-emerald-600',
      ultra: 'border-violet-500 bg-violet-50 text-violet-600',
    },
    chipOff: 'border-slate-100 bg-white text-slate-400',
    // รายการแข่งที่เปิดรับสมัคร (mock อิงเลเวลปัจจุบัน) + fact จำเพาะสาย
    classFactIdx: {},
    races: {
      sprint: [
        { name: 'Bangkok Sprint Series #3', date: '27 ก.ย. 2026', dists: [{ d: '100m', req: 4 }, { d: '200m', req: 5 }, { d: '400m', req: 6 }], deadline: 'ปิด 20 ก.ย.', fee: '500 บาท', why: '400m Lv.6 ขึ้นไปลงสบาย' },
        { name: 'Thailand Athletics Open', date: '18 ต.ค. 2026', dists: [{ d: '400m', req: 10 }], deadline: 'ปิด 5 ต.ค.', fee: '300 บาท', why: 'ระดับ Lv.10 ขึ้นไป — สายนักแข่ง' },
      ],
      mid: [
        { name: 'Bangkok 10K Run 2026', date: '13 ก.ย. 2026', dists: [{ d: '5K', req: 4 }, { d: '10K', req: 8 }], deadline: 'ปิด 7 ก.ย.', fee: '550 บาท', why: '5K Lv.4+ ลงสบาย, 10K แนะนำ Lv.8+' },
        { name: 'The One 5K Charity', date: '4 ต.ค. 2026', dists: [{ d: '5K', req: 4 }], deadline: 'ปิด 27 ก.ย.', fee: '450 บาท', why: '5K ใครก็ลงได้' },
        { name: 'Amazing Thailand Marathon (10K)', date: '15 พ.ย. 2026', dists: [{ d: '10K', req: 8 }], deadline: 'ปิด 1 พ.ย.', fee: '700 บาท', why: '10K แนะนำ 5K Lv.8 ขึ้นไป' },
      ],
      long: [
        { name: 'Bangkok Marathon 2026', date: '6 ธ.ค. 2026', dists: [{ d: 'ฮาล์ฟ', req: 7 }, { d: 'ฟูล', req: 10 }], deadline: 'ปิด 15 พ.ย.', fee: '900 บาท', why: 'ฮาล์ฟ Lv.7+, ฟูล แนะนำ Lv.10+' },
        { name: 'Bangsaen21 Half Marathon', date: '22 พ.ย. 2026', dists: [{ d: '10.5K', req: 5 }, { d: '21.1K', req: 7 }], deadline: 'ปิด 10 พ.ย.', fee: '800 บาท', why: '21.1K Lv.7 ขึ้นไป' },
      ],
      ultra: [
        { name: 'Phu Kradueng Trail 50K', date: '24 ม.ค. 2027', dists: [{ d: '50K', req: 15 }], deadline: 'ปิด 31 ธ.ค.', fee: '2,500 บาท', why: 'ต้องเคยวิ่งไกล 30K+ มาก่อน' },
        { name: 'Chiang Mai Ultra 100K', date: '7 ก.พ. 2027', dists: [{ d: '100K', req: 18 }], deadline: 'ปิด 10 ม.ค.', fee: '3,500 บาท', why: 'ระดับอัลตร้า Lv.18 ขึ้นไป' },
      ],
    },
    // Fun facts จำเพาะสาย (แสดงในตารางมาตรฐาน)
    classFacts: {
      sprint: [
        '400m sub-1:20 = เร็วกว่านักวิ่งเพื่อสุขภาพส่วนใหญ่ (1:30–2:00)',
        'Usain Bolt ถ้าวิ่ง 400m ด้วย pace 100m (9.58s) = ~38 วิ — เหลือเชื่อ',
        'สปรินต์ที่ดี = ก้าวถี่ (cadence) สูง + ออกแรงเต็มที่เฉพาะช่วงท้าย',
        '400m คือระยะที่โหดที่สุดในกรีฑา (นักวิ่งบอกเอง)',
        'ซ้อมสปรินต์ 2 ครั้ง/สัปดาห์ก็พอ — มากกว่านั้นเสี่ยงบาดเจ็บ',
        'วอร์มอัพก่อนสปรินต์ต้อง 30 นาทีขึ้นไป ไม่งั้นเสี่ยงดึง',
        'เทคนิค: วิ่งเขย่งปลายเท้าช่วง 50m แรก = ออกตัวดีขึ้น',
        '400m ระดับ Lv.10+ = อยู่ใน 1% แรกของนักวิ่งเพื่อสุขภาพ',
        'นักสปรินต์ระดับโลกก้าวยาว ~2.5m — เราก้าว ~1.2m แต่ไม่เป็นไร',
        'ซ้อม acceleration 3 × 30m สัปดาห์ละ 2 ครั้ง = 400m ดีขึ้นจริง',
        '400m แบ่งเป็น 4 ช่วง 100m — ช่วงสุดท้ายใครแบ่งแรงไว้ชนะ',
        'รองเท้าสปรินต์ควรมี spikes — แต่วิ่งถนนใช้รองเท้าปกติก็ได้',
        'ผู้หญิง WR 400m = 47.60 วิ (Marita Koch) — เก๋ากว่าผู้ชายหลายคน',
        'ปวดหลังส่วนล่างตอนสปรินต์ = แกนกลาง (core) อ่อนแอ ต้องซ้อม plank',
        'สปรินต์ 400m เผา ~80–100 kcal ต่อรอบ — สั้นแต่โหด',
        'ดื่มน้ำหลังซ้อมสปรินต์ 500ml ภายใน 30 นาที — ฟื้นตัวดีกว่า',
        'ถ้าวิ่ง 400m แล้วคลื่นไส้ = ออกแรงเกิน 80% แรก เก็บแรงไว้ก่อน',
        '400m ระดับ Lv.20 = ~53 วิ = ระดับแข่งขันชิงแชมป์จังหวัด',
        'นักสปรินต์ระดับโลกก้าวยาว ~2.5 เมตร — เราก้าว ~1.2 เมตร แต่สู้ได้ด้วยความถี่',
        'ซ้อมสปรินต์ 2 ครั้ง/สัปดาห์พอแล้ว — มากกว่านั้นเสี่ยงบาดเจ็บ',
        '400m เผา ~120 kcal ต่อรอบ — สั้นแต่โหดจริง',
        'การวอร์มอัพ 30 นาที ลดเสี่ยงฉีก 50%',
        'Cadence 180+ = ก้าวถี่ = เร็วขึ้นโดยไม่ต้องเร่งแรง',
        'รองเท้าสปรินต์ควรบาง+เบา — รองเท้าซัพพอร์ตหนักๆ ยิ่งช้า',
        '400m Lv.10 = ผ่านเกณฑ์คัดตัว 60 วิ — อยู่ใน 1% ของคนทั่วโลก',
        'นักวิ่ง 400m มืออาชีพซ้อม 5 วัน/สัปดาห์ ไม่ใช่ 7 วัน',
        'ถ้าปวดเอ็นร้อยหวายตอนสปรินต์ = พัก 3 วัน อย่าฝืน',
        '400m ช่วง 200m แรก ควรใช้แรง ~85% — ช่วงท้ายค่อยเร่ง',
        'สปรินต์ = ใช้กล้ามเนื้อ fast-twitch — วิ่งช้าเยอะไม่ได้ช่วย',
        '400m ระดับ Lv.30 = 43-44 วิ = ไล่บี้สถิติโลก (43.03)',
        'ดื่มน้ำก่อนซ้อม 400m 500ml ล่วงหน้า 2 ชม.',
        'สควอท + lunge สัปดาห์ละ 2 ครั้ง = 400m ดีขึ้นจริง',
        '400m ครั้งแรก อย่าออกตัวเต็มแรง — เจ็บกล้ามเนื้อวันถัดไปแน่',
        'ผู้หญิง 400m WR = 47.60 (Marita Koch) — เร็วจนน่าตกใจ',
        '400m กลางแจ้ง vs ในร่ม ต่างกัน ~1-2 วิ (ลู่ในร่มสั้นกว่า)',
        'ถ้าวิ่ง 400m แล้วเวียนหัว = ขาดน้ำหรือออกแรงเกิน 80% แรก',
        'วิ่ง 400m 3 รอบ/สัปดาห์ = หัวใจแข็งแรงขึ้นไว',
        '400m เหมาะกับคนที่ชอบความเร็วสั้นๆ ไม่ต้องอดทนนาน',
        'สปรินต์ 400m ใช้เวลา < 2 นาที แต่ร่างกายฟื้น 48 ชม.',
        'นักวิ่ง 400m ควรเช็คฟอร์มกระจก — แขนไขว้ = เสียแรง',
        '400m Lv.5 = ผ่าน 1:40 — เริ่มลงงานแข่งระดับท้องถิ่นได้',
      ],
      mid: [
        '5K ใต้ 30 นาที = ผ่านเกณฑ์ยอดฮิตของมือใหม่ทั่วโลก',
        '"5K 30 นาที" คือเป้าหมายยอดฮิตของมือใหม่ทั่วโลก',
        'Kipchoge วิ่ง 5K ได้ ~13 นาที — เร็วแบบคนต่างดาว แต่เขาซ้อมวันละ 2 รอบ',
        'pace 6:00/กม. = 10 กม./ชม. — เท่ากับจ็อกกิ้งเบาๆ',
        'เป้าหมายแรกของทุกคน: วิ่ง 5K ให้จบโดยไม่เดิน',
        'เจลพลังงานไม่จำเป็นสำหรับ 5K (ใช้กับ 10K+ ขึ้นไป)',
        'หายใจแบบ 2-2 (หายใจเข้า 2 ก้าว / ออก 2 ก้าว) ช่วยจังหวะคงที่',
        '5K Lv.8+ = อยู่ใน ~10% แรกของนักวิ่งสมัครเล่นโลก',
        'negative split (ครึ่งหลังเร็วกว่าครึ่งแรก) = 5K เร็วขึ้น ~1 นาที',
        'ซ้อม interval 6 × 800m = ทางลัด 5K PR ที่ได้ผลที่สุด',
        'วิ่ง 5K 3 ครั้ง/สัปดาห์ + พัก 1 วัน = โปรแกรมมือใหม่มาตรฐาน',
        '5K ครั้งแรก อย่าเร่ง — 90% ของคนที่จบไม่เดินคือคนออกตัวช้า',
        'เช็ค cadence: 170+ ก้าว/นาที = ประหยัดแรงและลดบาดเจ็บ',
        '5K เผา ~300–350 kcal — เท่ากับชานมไข่มุก 1 แก้วพอดีๆ',
        'วิ่งตอนเช้า 5K = เผาผลาญไขมันดีกว่าตอนเย็น ~20% (งานวิจัย)',
        'หลังวิ่ง 5K ควรยืดเหยียด 5 นาที — ลดปวดเมื่อยวันถัดไป',
        'เพลง 170–180 BPM = จังหวะก้าวที่ใช่สำหรับ 5K',
        '5K ระดับ Lv.20 = 13:30–14:24 = ระดับนักกีฬามหาวิทยาลัย',
        '5K Lv.30 = <12:49 = เทียบสถิติโลก (Aregawi 12:49)',
        '5K sub-20 นาที = อยู่ใน ~15% แรกของนักวิ่งสมัครเล่น',
        '5K = ระยะที่ "ทุกคนเริ่มต้นได้" — ไม่ต้องซ้อมยาวก็จบ',
        'negative split (ครึ่งหลังเร็วขึ้น) = เทคนิค 5K ที่โค้ชทุกคนสอน',
        '5K ซ้อม interval 1K × 5 = ทางลัด PR ที่ได้ผลที่สุด',
        'pace 5:00/กม. = 5K จบ 25 นาที — จำไว้ตั้งเป้า',
        '5K เผา ~300-350 kcal = ชานมไข่มุก 1 แก้วพอดี',
        'ถ้า 5K ทรงๆ ไม่ลง = เพิ่ม long run สัปดาห์ละ 1 ครั้ง',
        '5K วิ่ง 3 ครั้ง/สัปดาห์ก็พอ — ร่างกายฟื้นไวขึ้น',
        '5K ก่อนอาหารเช้า = เผาไขมันดีขึ้น (งานวิจัยรองรับ)',
        'เพลง BPM 170-180 = จังหวะก้าวที่ใช่สำหรับ 5K',
        '5K Lv.15 = ผ่าน cutoff 10K (1:30) — ต่อยอดได้เลย',
        '5K เร็วสุดของคุณ × 2 + 1 นาที ≈ เวลา 10K ที่ควรได้',
        'ถ้าปวดเข่าตอน 5K = ก้าวสั้นลง 10% ลดแรงกระแทก',
        '5K งานแข่ง = เร็วกว่าซ้อมคนเดียว ~30 วินาที (adrenaline)',
        'ดื่มกาแฟก่อน 5K 45 นาที = เร็วขึ้น ~2% (caffeine boost)',
        '5K กลางคืนในไทย = เย็นกว่า กลางวัน ~8°C = PR ง่าย',
        '5K Lv.8 = ผ่าน cutoff 40 นาที — งานวิ่งส่วนใหญ่รับ',
        'ซ้อม 5K ควรมี 1 วันพักเต็มๆ ต่อสัปดาห์',
        '5K รองเท้าเบา < 250g = ประหยัดแรงทุกก้าว',
        'หายใจ 2-2 (เข้า 2 ก้าว ออก 2 ก้าว) = จังหวะคงที่',
        '5K มือใหม่ อย่าเริ่มด้วย sprint — เริ่ม easy run ก่อน',
        '5K PR แล้วฉลอง 1 วัน แล้วค่อยตั้งเป้าใหม่ — สุขภาพจิตนักวิ่ง',
        '5K = ระยะที่วัด "ความจริงจัง" ของนักวิ่ง — เริ่มจากตรงนี้',
      ],
      long: [
        'ฮาล์ฟ sub-2 ชม. = เป้ายอดนิยมของนักวิ่งครึ่งมาราธอน',
        'ฮาล์ฟ = 21.0975 km — เศษ 97.5m นี่แหละที่ฆ่านักวิ่ง 555',
        'มาราธอน 42.195 km ตามตำนานมาจากระยะทางกรีก-มาราธอน',
        'pace 6:00 วิ่งฮาล์ฟ = จบ 2:06 — ลองคำนวณ pace ตัวเองดู',
        'ฮาล์ฟ sub-2 ชม. = คนทั่วไปซ้อมจริงจัง 3–4 เดือน',
        'คาร์โบโหลด 3 วันก่อนฮาล์ฟ = วิ่งง่ายขึ้นจริง (มีงานวิจัยรองรับ)',
        'ฮาล์ฟครั้งแรก อย่าออกตัวเร็วกว่าเป้า — 90% พังเพราะข้อนี้',
        'ฮาล์ฟ Lv.10+ = อยู่ใน ~5% แรกของนักวิ่งเพื่อสุขภาพโลก',
        'long run สัปดาห์ละ 1 ครั้ง ยาว 12–16 km = หัวใจแข็งแรงขึ้นจริง',
        'กินกล้วย 1 ลูกก่อนฮาล์ฟ 30 นาที = พลังงานพอดี ไม่ท้องอืด',
        'ฮาล์ฟเผา ~1,200 kcal — เตรียมกินหลังจบไว้ด้วย 555',
        'เดิน 1 นาที ทุก 4 กม. = ฮาล์ฟจบไวขึ้นโดยไม่รู้ตัว',
        'ฟูลมาราธอน 42.195 km เผา ~2,600 kcal = ข้าว 7 จาน',
        'ฮาล์ฟ 3 ครั้งต่อเดือน + long run = เพิ่มระยะได้ 10%/สัปดาห์',
        'เจลเจอ: กินก่อน 90 นาที และทุก 45 นาทีระหว่างวิ่ง',
        'ฟูลมาราธอน 90% คือการซ้อม long run — ที่เหลือคือหัวใจ',
        'ฮาล์ฟกลางคืนในไทย = ดีกว่ากลางวัน ~10°C = PR ได้ง่าย',
        'ฮาล์ฟ Lv.20 = 1:25–1:30 = ระดับตัวแทนทีมจังหวัด',
        'ฮาล์ฟ Lv.30 = <57:31 = เทียบสถิติโลก (57:31)',
        'ฮาล์ฟ sub-2 ชม. = อยู่ใน ~20% แรกของนักวิ่งครึ่งมาราธอน',
        'ฟูลมาราธอน Lv.16 = ผ่าน cutoff 6:30 — งานส่วนใหญ่รับ',
        'ฮาล์ฟ sub-1:45 = เกณฑ์นักวิ่ง "จริงจัง" ระดับประเทศ',
        'long run 16 km สัปดาห์ละ 1 ครั้ง = พื้นฐานฮาล์ฟที่แข็งแรง',
        'คาร์โบโหลด 3 วันก่อนฮาล์ฟ = ไกลโคเจนเต็มถัง',
        'ฮาล์ฟครั้งแรก อย่าออกตัวเร็วกว่าเป้า — 90% พังตรงนี้',
        'pace 6:00/กม. ฮาล์ฟ = จบ 2:06 — ลองคำนวณ pace ตัวเอง',
        'ฮาล์ฟ เผา ~1,200 kcal = เบอร์เกอร์ชุดใหญ่ 1 ชุด',
        'ฮาล์ฟ Lv.12 = ผ่าน cutoff 3:30 — งานแข่งไทยส่วนใหญ่',
        'ฟูลมาราธอน 42.195 km = ฮาล์ฟ 2 รอบ + อีก 1.1 km',
        'ซ้อมฮาล์ฟ 3 เดือน = ระยะทางรวม ~300-400 km',
        'ฮาล์ฟกลางคืนในไทย = เย็นกว่า กลางวัน ~10°C = PR ได้',
        'ถ้าวิ่งฮาล์ฟแล้วปวดน่อง = ลงเท้าหน้าเกินไป ลองกลางเท้า',
        'ฮาล์ฟ sub-1:30 = เข้าเกณฑ์นักวิ่งจริงจังระดับประเทศ',
        'หลังฮาล์ฟ พัก 1-2 สัปดาห์เต็ม — อย่ากลับมาวิ่งเร็ว',
        'ฮาล์ฟ 2 ชม. = pace 5:41/กม. — ตั้งเป้าง่ายๆ จากตรงนี้',
        'ฟูลมาราธอน ต้องซ้อม long run 30 km+ อย่างน้อย 3 ครั้ง',
        'ฮาล์ฟในงานแข่ง = มี pacers 2:00/1:45/1:30 ให้เกาะ',
        'ฮาล์ฟ Lv.7 = เริ่มลง 21.1K ได้ตามเกณฑ์ระบบนี้',
        'ถ้าฮาล์ฟแล้วตะคริว = ขาดเกลือ/แมกนีเซียม — กินกล้วย',
        'ฮาล์ฟ ดีกว่าฟูลสำหรับ "ครั้งแรก" — เจ็บน้อย ฟื้นไว',
      ],
      ultra: [
        'เป้าหมายอัลตร้าแรก: 30K → 50K → 100K ค่อยๆ เพิ่มทีละขั้น',
        'อัลตร้า 50K เผา ~4,000 kcal — กินระหว่างวิ่งสำคัญกว่าความเร็ว',
        'กฎเหล็กอัลตร้า: เดิน uphill, วิ่ง flat, ระวัง downhill',
        '100K นักวิ่งส่วนใหญ่ใช้ 12–16 ชม. — เตรียมใจไว้นานๆ',
        'Back-to-back long = วิ่งยาว 2 วันติด ไม่งั้นร่างกายไม่ชิน',
        'รองเท้าอัลตร้าควรเผื่อ +1 ไซส์ (เท้าบวมตอนวิ่งไกล)',
        'เกลือ + น้ำ = กันตะคริว ระยะ 50K+ ขาดไม่ได้',
        '50K Lv.15+ = อยู่ใน ~0.5% แรกของนักวิ่งโลก — เจ๋งมาก',
        '100K ต้องกิน ~200–300 kcal ต่อชั่วโมง — ขนมปัง/เจล/ผลไม้',
        'อัลตร้า = จิตใจ 70% ร่างกาย 30% — ครึ่งหลังสู้กับหัวตัวเอง',
        'ซ้อม 3 เดือนก่อน 50K: long run สัปดาห์ละ 25–35 km',
        'ตะคริวกลางอัลตร้า = ขาดเกลือ/แมกนีเซียม — พกเกลือเม็ด',
        'เดิน 5 นาที ทุก 1 ชม. = กันเข่าพังระยะไกล',
        'หลังจบ 100K ต้องพัก 2–3 สัปดาห์เต็ม — อย่ากลับมาวิ่งเร็ว',
        'อัลตร้า trail กลางคืน = ไฟหน้า 300+ ลูเมน + แบตสำรอง',
        'เท้าพุพอง = ศัตรูอันดับ 1 — ทา vaseline ก่อนออกตัว',
        '100K สถิติโลก ~6 ชม. (Aleksandr Sorokin) — เร็วแบบคนต่างดาว',
        'อัลตร้า Lv.20 = วิ่งได้ 60-75 km = ระดับนักอัลตร้าสายแข็ง',
        'อัลตร้า Lv.30 = 100 km+ = เทียบระดับนักอัลตร้าอาชีพ',
        '50K เผา ~4,000 kcal — กินระหว่างวิ่งสำคัญกว่าความเร็ว',
        '100K สถิติโลก ~6 ชม. (Aleksandr Sorokin) — เร็วแบบโหด',
        'อัลตร้า 50K Lv.22 = ผ่าน cutoff 10 ชม. — งานส่วนใหญ่รับ',
        'ซ้อม back-to-back (เสาร์ยาว + อาทิตย์ยาว) = หัวใจอัลตร้า',
        'เดิน uphill = กันแรง — นักอัลตร้าทุกคนเดินบ้าง',
        '100K ต้องกิน 200-300 kcal/ชม. — เจล/ขนมปัง/ผลไม้',
        'เกลือ + น้ำ = กันตะคริวระยะ 50K+ ขาดไม่ได้',
        'รองเท้าอัลตร้าเผื่อ +1 ไซส์ — เท้าบวมตอนวิ่งไกล',
        '50K แรกของใครหลายคน = ใช้เวลา 7-9 ชม. — เตรียมใจ',
        'หลังจบ 100K พัก 2-3 สัปดาห์เต็ม — อย่ารีบกลับมา',
        'อัลตร้า 30K+ = ต้องมี crew หรือ drop bag — อย่าหักโหม',
        'อัลตร้า Lv.27 = ผ่าน cutoff 100K (24 ชม.) — ระดับเทพ',
        'นักอัลตร้า 70% เดินบ้าง — เดินไม่ใช่การยอมแพ้',
        'อัลตร้า 100K เผา ~8,000 kcal = ข้าว 20 จาน',
        'ซ้อมอัลตร้า ควรเพิ่มระยะ 10% ต่อสัปดาห์เท่านั้น',
        'ถ้าปวดเข่าอัลตร้า = ลงเขาเร็วเกิน — เดินลงเขาบ้าง',
        'อัลตร้า trail = ต้องพกยาแก้ปวด + พลาสเตอร์ กันฉุกเฉิน',
        '50K กลางคืนในไทย = เย็นกว่า กลางวัน ~10°C = วิ่งไกลขึ้น',
        'อัลตร้าครั้งแรก เริ่มที่ 30K ก่อน แล้วค่อย 50K',
        'นักอัลตร้าตัวจริง = คนที่ "ไม่ยอมแพ้" มากกว่า "เร็ว"',
      ],
    },
    // อุปกรณ์ (mock)
    gear: [
      { icon: 'fa-clock', type: 'นาฬิกา', name: 'Amazfit GTR mini', note: 'ซิงก์ Zepp → Google Health', status: 'เชื่อมต่อ', color: 'bg-indigo-50 border-indigo-100 text-indigo-600' },
      { icon: 'fa-shoe-prints', type: 'รองเท้าวิ่ง', name: '2000KM 3.0 (สีขาว)', note: 'ใช้งาน 0 / 800 km', status: 'ใหม่', color: 'bg-sky-50 border-sky-100 text-sky-600' },
    ],
    gearPool: [
      { icon: 'fa-shoe-prints', type: 'รองเท้าวิ่ง', name: 'Asics Magic Speed 4', note: '0 / 600 km', status: 'ใหม่', color: 'bg-emerald-50 border-emerald-100 text-emerald-600' },
      { icon: 'fa-shoe-prints', type: 'รองเท้าสปรินท์', name: 'Adidas Adios 8', note: '0 / 400 km', status: 'ใหม่', color: 'bg-amber-50 border-amber-100 text-amber-600' },
      { icon: 'fa-stopwatch', type: 'สายคาด HR', name: 'Polar H10', note: 'ซิงก์ผ่าน Bluetooth', status: 'พร้อมใช้', color: 'bg-rose-50 border-rose-100 text-rose-600' },
      { icon: 'fa-shoe-prints', type: 'รองเท้าอัลตร้า', name: 'Hoka Mafate Speed 4', note: '0 / 700 km', status: 'ใหม่', color: 'bg-teal-50 border-teal-100 text-teal-600' },
    ],
    gearEditOpen: false,
    gearEditingIndex: null,
    gearEdit: { name: '', type: '', note: '' },
    gearConfirmIndex: null,
    // Fun facts (ขำๆ จากสถิติปัจจุบัน — ตัวเลขอ้างอิงจากข้อมูลจริง)
    funFacts: [
      { icon: 'fa-person-walking', text: 'วิ่งไกลสุดของคุณ = ชนะคนเดิน 10,000 ก้าว (≈7 km) แบบไม่เหนื่อย 🚶' },
      { icon: 'fa-dog', text: 'สปรินต์ 400m ชนะหมาปั๊กได้ (หมาวิ่งเร็วแต่ต้องพักทุก 100m 555) 🐶' },
      { icon: 'fa-robot', text: 'ฮาล์ฟ = ครึ่งทางของมาราธอน Elon Musk (4:20) — เสมอ Elon แบบครึ่งๆ กลางๆ 🚀' },
      { icon: 'fa-car', text: '5K = ชนะรถติดบนถนนพระราม 9 ในชั่วโมงเร่งด่วน แบบขาดลอย 🚗' },
      { icon: 'fa-bolt', text: 'สถิติโลก 5K 12:49 (Aregawi) — เร็วแบบคนต่างดาว แต่เราก็วิ่งของเราไปเรื่อยๆ 😂' },
      { icon: 'fa-bicycle', text: 'ปั่นจักรยานชิลๆ 15 กม./ชม. — วิ่งตามทันครึ่งทาง ก่อนโดนทิ้ง 🚲' },
      { icon: 'fa-stopwatch', text: '400m vs WR 43.03 วิ — ต่างกันเยอะ แต่สู้ๆ 💪' },
      { icon: 'fa-mountain', text: 'อัลตร้า 100 km = ต้องวิ่งเพิ่มอีกหลายเท่า แต่เป้าหมายเล็กๆ ไปก่อน 🏔️' },
      { icon: 'fa-trophy', text: 'Overall level — ถ้าเป็นมวยก็ไฟต์กลางๆ แล้ว แต่ยังไม่ใช่แชมป์โลก 555' },
      { icon: 'fa-chart-line', text: 'ซิงก์ทุกวัน ~4 km/วัน = ปีนึงได้ 1,460 km = กรุงเทพฯ-เชียงใหม่ไปกลับ! 📈' },
      { icon: 'fa-music', text: '5K = ฟังเพลง ~6 เพลงจบพอดี (เพลงละ ~4:40) 🎵' },
      { icon: 'fa-bowl-rice', text: 'วิ่ง 5K เผา ~300 kcal = กล้วย 2 ลูก หรือชานมไข่มุก 1/4 แก้ว 🍌' },
      { icon: 'fa-bed', text: 'นักวิ่งนอนหลับลึกกว่าคนนั่งทั้งวัน ~30% — วิ่ง = ยานอนหลับธรรมชาติ 🛏️' },
      { icon: 'fa-droplet', text: 'ควรดื่มน้ำ 500ml–1L ต่อการวิ่ง 1 ชม. — วันนี้ดื่มครบยัง? 💧' },
      { icon: 'fa-shoe-prints', text: 'รองเท้าควรเปลี่ยนทุก 600–800 km — อย่าลืมเช็คระยะรองเท้าตัวเอง 👟' },
      { icon: 'fa-socks', text: 'ถุงเท้า 2 คู่สลับกันใช้ ยืดอายุได้ 2 เท่า — เรื่องจริงจากช่างกีฬา 🧦' },
      { icon: 'fa-temperature-half', text: 'อุณหภูมิ 20–24°C = ช่วงวิ่งเร็วที่สุด — หน้าร้อนไทยลดเป้าไป 5% 🌡️' },
      { icon: 'fa-heart', text: 'วิ่ง 6 เดือน หัวใจแข็งแรงขึ้น = ชีพจรพักลดลง ~10 ครั้ง/นาที 🫀' },
      { icon: 'fa-brain', text: 'วิ่ง 30 นาที = ความจำดีขึ้นชั่วคราว 2 ชม. — วิ่งก่อนอ่านหนังสือเวิร์กจริง 🧠' },
      { icon: 'fa-bone', text: 'วิ่งเพิ่มความหนาแน่นกระดูก แต่พักไม่พอ = เสี่ยง stress fracture 🦴' },
      { icon: 'fa-khanda', text: 'ปวดเข่าทุกครั้งที่วิ่ง = เช็คฟอร์ม (ก้าวสั้น ลงเท้ากลาง) ก่อนโทษรองเท้า 🚫' },
      { icon: 'fa-headphones', text: 'เพลง BPM 160–180 ช่วยจังหวะก้าว (cadence) ให้คงที่ 🎧' },
      { icon: 'fa-moon', text: 'นอนไม่พอ 1 คืน = ประสิทธิภาพวิ่งลด ~10% — นอนสำคัญกว่าซ้อมเพิ่ม 🌙' },
      { icon: 'fa-stopwatch', text: 'คนไทย 10K เร็วสุด ~30 นาที — ยังห่าง แต่สู้ๆ ไปทีละเลเวล 🥇' },
      { icon: 'fa-save', text: 'การ์ดโปรไฟล์จำสายที่คุณเลือกไว้ได้ (localStorage) — ปิดแอปมาก็ยังอยู่ 💾' },
      { icon: 'fa-bag-shopping', text: 'อุปกรณ์ = แต้มต่อทางจิตใจ 90% (วิทยาศาสตร์ยังไม่ยืนยัน) 🎒' },
      { icon: 'fa-utensils', text: 'อัลตร้า 100K เผา ~8,000 kcal = ข้าว 20 จาน — กินระหว่างวิ่งเป็นสกิล 🍚' },
      { icon: 'fa-flag-checkered', text: 'ลงแข่งจริงครั้งแรก จำไว้ว่าทุกคนที่จบคือผู้ชนะ (สถิติส่วนตัวก็สำคัญ 555) 🏁' },
      { icon: 'fa-paw', text: 'หมาบางตัววิ่ง 5K ได้เร็วกว่าคุณ — แต่มันไม่ได้ซ้อมแบบมีวินัย 🐕' },
      { icon: 'fa-cloud-sun', text: 'ฝนตกหนัก = โอกาส PR ลดลง 20% — แต่ก็ยังดีกว่าวิ่งตอนเที่ยงไทย 🌧️' },
      { icon: 'fa-flag-checkered', text: 'Lv.4 = เริ่มลง 100m/5K ได้แล้ว — กดดูหัวข้อรายการแข่งได้เลย 🏁' },
      { icon: 'fa-ranking-star', text: 'ระดับ Lv.5+ = ดีกว่า ~30% ของนักวิ่งทั่วโลกในสายนั้นๆ 📊' },
      { icon: 'fa-people-group', text: 'คนไทยวิ่ง 5K เฉลี่ย ~35–40 นาที — แค่ Lv.6 ก็แซงกลุ่มใหญ่แล้ว 🇹🇭' },
      { icon: 'fa-fire', text: 'วิ่งทุกวันจันทร์-ศุกร์ ~3 km = สัปดาห์ละ 15 km = เดือนละ 60 km 🔥' },
      { icon: 'fa-stopwatch-20', text: 'ซ้อม 20 นาที/วัน ดีกว่านั่งดูมือถือ 1 ชม. — เริ่มจากตรงนี้ก่อน 💪' },
      { icon: 'fa-sun', text: 'วิ่งตอนเช้า 6 โมง = เจอแดดอ่อน + อากาศเย็น = วิ่งไกลขึ้น 10% ☀️' },
      { icon: 'fa-mug-hot', text: 'กาแฟดำ 1 แก้วก่อนวิ่ง 30 นาที = วิ่งง่ายขึ้นจริง (คาเฟอีน) ☕' },
      { icon: 'fa-battery-full', text: 'คาร์โบไฮเดรต = เชื้อเพลิงหลัก — ข้าวมื้อเช้าสำคัญกว่าที่คิด 🍚' },
      { icon: 'fa-weight-scale', text: 'ลด 1 kg = เร็วขึ้น ~2 วิ/กม. (แรงโน้มถ่วงน้อยลง) ⚖️' },
      { icon: 'fa-shield-heart', text: 'วิ่งสัปดาห์ละ 150 นาที = ลดเสี่ยงโรคหัวใจ 30%+ ❤️' },
      { icon: 'fa-stairs', text: 'วิ่งขึ้นบันได 10 ชั้น = ใกล้เทียบ 400m แล้ว — ลองดู 🪜' },
      { icon: 'fa-magnifying-glass-chart', text: 'ดูสถิติตัวเองย้อนหลัง = เห็นพัฒนาการ = มีกำลังใจวิ่งต่อ 📈' },
      { icon: 'fa-clock', text: 'พัก 1 วันต่อสัปดาห์ = กล้ามเนื้อโตขึ้น (ซ่อมตอนพัก ไม่ใช่ตอนวิ่ง) 😴' },
      { icon: 'fa-bullseye', text: 'ตั้งเป้าเล็กๆ เช่น 5K เร็วขึ้น 30 วิ = รู้สึกสำเร็จทุกเดือน 🎯' },
      { icon: 'fa-hand-holding-heart', text: 'วิ่งกับเพื่อน = ออกกำลังนานขึ้น ~30% (สังคมช่วยได้จริง) 👯' },
      { icon: 'fa-earth-asia', text: 'ระยะรวม 226 km = วิ่งข้ามจากกรุงเทพฯ ไปถึงอยุธยาแล้ว 🌏' },
      { icon: 'fa-meteor', text: 'นักวิ่งมือใหม่ส่วนใหญ่เลิกภายใน 3 เดือน — คุณผ่านมาแล้ว = เก่งแล้ว 🚀' },
      { icon: 'fa-couch', text: 'นั่งทั้งวัน = เสี่ยงเท่ากับสูบบุหรี่มวนนึง — ลุกขึ้นวิ่งเถอะ 🛋️' },
      { icon: 'fa-seedling', text: 'วิ่ง 1 ปี = หัวใจอายุน้อยลง ~4 ปี (งานวิจัยจริง) 🌱' },
      { icon: 'fa-ghost', text: 'กำแพง 30 นาที = จริงแค่ในหัว — ผ่านไปได้ถ้า pace ถูกต้อง 👻' },
      { icon: 'fa-dumbbell', text: 'เสริมเวท 2 วัน/สัปดาห์ = ป้องกันบาดเจ็บ 50% — อย่าข้าม 🏋️' },
      { icon: 'fa-water', text: 'เหงื่อ 1 ชม. = เสียน้ำ ~1 ลิตร — ดื่มชดเชยให้ทัน 💦' },
      { icon: 'fa-shoe-prints', text: 'รองเท้าคู่เก่า 800 km+ = ซับแรงกระแทกเหลือ 50% — เปลี่ยนเถอะ 👟' },
      { icon: 'fa-calendar-check', text: 'ซ้อมสม่ำเสมอ ดีกว่าซ้อมหนักๆ 2 วันจบ — ความสม่ำเสมอชนะเสมอ 📅' },
      { icon: 'fa-chart-simple', text: 'track ผลทุกครั้ง = pace ดีขึ้น ~5% ภายใน 2 เดือน (เห็นด้วยตาตัวเอง) 📊' },
      { icon: 'fa-music', text: 'เพลง 150–170 BPM = จังหวะวิ่งกำลังดี ไม่เร็วไม่ช้าไป 🎧' },
      { icon: 'fa-piggy-bank', text: 'วิ่งฟรีๆ แต่เซฟค่ารักษาพยาบาลปีละเป็นหมื่น — ROI สุดคุ้ม 🐷' },
      { icon: 'fa-paw', text: 'ถ้าสุนัขวิ่งตาม = อย่าวิ่งหนี — เดินช้าๆ มันจะหยุดเอง (จริง) 🐕' },
      { icon: 'fa-bed', text: 'นอน 7–8 ชม. = นักกีฬาแข่งดีกว่า 30% — นอนคือซ้อมที่ถูกที่สุด 🛏️' },
      { icon: 'fa-sparkles', text: 'รวมระยะทางคุณ 226 km = วิ่งจากกรุงเทพฯ ถึงอยุธยาแล้ว 🌏' },
      { icon: 'fa-sparkles', text: 'วิ่ง 1 ชม. = เผาเท่าปีนบันได 200 ชั้น 🪜' },
      { icon: 'fa-sparkles', text: 'นักวิ่งส่วนใหญ่ "pace ผิด" ในครั้งแรก — slow start wins 🐢' },
      { icon: 'fa-sparkles', text: 'รองเท้าวิ่ง 1 คู่ ซับแรงได้ ~600-800 km — หลังนั้นตายแล้ว 👟' },
      { icon: 'fa-sparkles', text: 'วิ่งสม่ำเสมอ = ลดเสี่ยงโรคหัวใจ 45% (เทียบคนนั่งทั้งวัน) ❤️' },
      { icon: 'fa-sparkles', text: 'วันพัก = วันที่กล้ามเนื้อโตจริง — อย่าข้าม 😴' },
      { icon: 'fa-sparkles', text: 'วิ่งแล้วปวดน่อง = ลงเท้าหน้าเกิน ลองลงกลางเท้า 🦶' },
      { icon: 'fa-sparkles', text: 'คาเฟอีนก่อนวิ่ง 30-45 นาที = เพิ่มพลัง ~3% ☕' },
      { icon: 'fa-sparkles', text: 'วิ่งกลางสายฝน = เย็น = PR ได้ (แต่ระวังลื่น) 🌧️' },
      { icon: 'fa-sparkles', text: 'ฟังเพลง 180 BPM = cadence 180 = จังหวะก้าวเพอร์เฟกต์ 🎵' },
      { icon: 'fa-sparkles', text: 'วิ่ง 10 นาทีหลังตื่น = สมองแล่นทั้งวัน ☀️' },
      { icon: 'fa-sparkles', text: 'ลด 5 kg = เร็วขึ้น ~20 วิ/กม. (แรงโน้มถ่วงน้อยลง) ⚖️' },
      { icon: 'fa-sparkles', text: 'ทุก 1 kg ที่ลด = หัวใจทำงานเบาลง ~2% ❤️' },
      { icon: 'fa-sparkles', text: 'นักวิ่งมือใหม่ 80% เลิกภายใน 3 เดือน — คุณผ่านมาแล้ว = เก่ง 💪' },
      { icon: 'fa-sparkles', text: 'วิ่งกับเพื่อน = วิ่งนานขึ้น ~30% (social proof จริง) 👯' },
      { icon: 'fa-sparkles', text: 'วิ่งเช้า 5K = นอนหลับคืนนั้นลึกขึ้น (งานวิจัย) 🌙' },
      { icon: 'fa-sparkles', text: '5K = ฟังเพลง ~6 เพลงจบพอดี (เพลงละ 4:40) 🎧' },
      { icon: 'fa-sparkles', text: 'นักวิ่งอายุ 60+ ที่วิ่งประจำ = หัวใจเท่าคน 40 😎' },
      { icon: 'fa-sparkles', text: 'วิ่ง 30 นาที = ความจำดีขึ้น 2 ชม. หลังวิ่ง 🧠' },
      { icon: 'fa-sparkles', text: 'ถ้าวิ่งแล้วข้างเขม่น = หายใจไม่สม่ำเสมอ — หายใจลึกๆ 🌬️' },
      { icon: 'fa-sparkles', text: 'วิ่ง 6 เดือน = ชีพจรพักลด ~10 ครั้ง/นาที 🫀' },
      { icon: 'fa-sparkles', text: 'รองเท้าผูกแน่นไป = เท้าชา — ผูกหลวมครึ่งนิ้วพอดี 👟' },
      { icon: 'fa-sparkles', text: 'วิ่ง 5K สัปดาห์ละ 3 ครั้ง = ผ่าน WHO 150 นาที/สัปดาห์ ✅' },
      { icon: 'fa-sparkles', text: 'อุณหภูมิ 20-24°C = ช่วง PR — หน้าร้อนไทยลดเป้า 5% 🌡️' },
      { icon: 'fa-sparkles', text: 'ถุงเท้า 2 คู่สลับกัน = ยืดอายุ 2 เท่า (ช่างกีฬาบอก) 🧦' },
    ],
    factIndex: 0,
    // แนวทางฝึกซ้อม + scale up + เตรียมตัวก่อนแข่ง ต่อคลาส
    guides: {
      sprint: {
        weekly: [
          { day: 'จันทร์', type: 'Speed', detail: '8 × 200m @ 85–90% พัก 2:00' },
          { day: 'พุธ', type: 'พลัง + เทคนิค', detail: 'Hill sprint 6 × 80m + plyo' },
          { day: 'ศุกร์', type: 'Speed', detail: '5 × 400m @ 90% พัก 3:00' },
          { day: 'เสาร์', type: 'พักฟื้น', detail: 'เดิน / โยคะเบาๆ 30 นาที' },
        ],
        scale: [
          'เพิ่มปริมาณไม่เกิน 10% ต่อสัปดาห์ (กฎ 10%)',
          'เพิ่มความเร็วทีละ ≤5% — อย่าเพิ่มพร้อมกันทั้งปริมาณและความเร็ว',
          'พักระหว่างเซต 2–3 เท่าของเวลาวิ่ง (400m 90 วิ → พัก ~3 นาที)',
          'ทุก 3–4 สัปดาห์ ลดปริมาณ 30% (deload) ให้ร่างกายฟื้น',
          'ปวดข้อ/เอ็น = หยุด 2–3 วัน อย่าฝืน (ไม่ใช่ปวดกล้ามเนื้อ)',
        ],
        race: [
          '7 วันก่อน: ลด volume 50% เหลือแค่ speed สั้นๆ 2 เซต',
          '3 วันก่อน: วิ่ง 3 × 100m strides เบาๆ เท่านั้น',
          'คืนก่อน: นอน 8 ชม. + มื้อเย็นคาร์โบฯ (ข้าว/พาสต้า)',
          'วันแข่ง: วอร์ม 30 นาที + strides ก่อนเรียกตัว 10 นาที',
        ],
      },
      mid: {
        weekly: [
          { day: 'จันทร์', type: 'Easy', detail: 'วิ่งเบา 30–40 นาที (pace ช้า +60s)' },
          { day: 'อังคาร', type: 'Tempo', detail: 'วอร์ม 10 นาที + 20 นาที @ 5K+20s' },
          { day: 'พฤหัส', type: 'Interval', detail: '6 × 800m @ 5K pace พัก 2:00' },
          { day: 'เสาร์', type: 'Long run', detail: '60–90 นาที วิ่งช้าๆ' },
        ],
        scale: [
          'กฎ 80/20: 80% ของสัปดาห์วิ่งง่าย 20% วิ่งหนัก',
          'เพิ่มระยะทางรวมไม่เกิน 10% ต่อสัปดาห์',
          'Long run เพิ่มครั้งละ 2–3 กม. เท่านั้น',
          'หนัก 3 สัปดาห์ → สัปดาห์ที่ 4 เบาลง (deload)',
          'จับเวลา 5K ใหม่ทุก 4–6 สัปดาห์เพื่อวัดผล',
        ],
        race: [
          '1 สัปดาห์ก่อน: Taper — ลดปริมาณ 40–50% แต่คงความเร็วไว้',
          '3 วันก่อน: วิ่งเบา 20 นาที + strides 4 × 100m',
          'คืนก่อน: นอน 8 ชม., กินอาหารปกติ ไม่ลองอะไรใหม่',
          'เช้าวันแข่ง: ข้าว/กล้วย 2–3 ชม. ก่อน, วอร์ม 20 นาที + 2 strides',
        ],
      },
      long: {
        weekly: [
          { day: 'จันทร์', type: 'Easy', detail: '45–60 นาที วิ่งช้า' },
          { day: 'อังคาร', type: 'Tempo/MP', detail: '25–35 นาที @ ฮาล์ฟ pace' },
          { day: 'พฤหัส', type: 'Interval', detail: '5 × 1K @ 10K pace พัก 2:30' },
          { day: 'เสาร์', type: 'Long run', detail: '90–150 นาที ค่อยๆ เพิ่ม' },
        ],
        scale: [
          'Long run เพิ่ม 10% ต่อสัปดาห์ หรือ +2–3 กม. ครั้งละ',
          'ทุก 3 สัปดาห์ ลด long run 30% (สัปดาห์ฟื้นฟู)',
          'วิ่งไกลเกิน 75 นาที ต้องกิน/ดื่มระหว่างทาง (เจล/เกลือ)',
          'ซ้อมช้าไว้ก่อน — ความอดทนมาก่อนความเร็ว',
          'เพิ่มระยะแล้วคงไว้ 2 สัปดาห์ ก่อนเพิ่มรอบถัดไป',
        ],
        race: [
          '3 สัปดาห์ก่อน: Long run ครั้งสุดท้าย (เป้าระยะ)',
          '2 สัปดาห์ก่อน: Taper ลดปริมาณ 30%',
          '1 สัปดาห์ก่อน: ลด 50% + คาร์โบโหลด 3 วันก่อนแข่ง',
          'วันแข่ง: แผน pace ไว้ก่อน อย่าออกเร็วเกิน + gel ทุก 45 นาที',
        ],
      },
      ultra: {
        weekly: [
          { day: 'จันทร์', type: 'Easy', detail: '60 นาที วิ่งช้า' },
          { day: 'อังคาร', type: 'Back-to-back A', detail: 'Long 2 ชม. เส้นเนิน' },
          { day: 'พุธ', type: 'Easy + Strength', detail: '45 นาที + เวท/แกนกลาง' },
          { day: 'พฤหัส', type: 'Back-to-back B', detail: 'Long 90 นาที (ขาเมื่อย = จำลอง race)' },
          { day: 'เสาร์', type: 'Long', detail: '3–4 ชม. เดินช่วง uphill' },
        ],
        scale: [
          'เพิ่ม volume รายสัปดาห์ไม่เกิน 10%',
          'Back-to-back long คือหัวใจของอัลตร้า — ซ้อมต่อเนื่อง 2 วัน',
          'เพิ่ม elevation gain ค่อยๆ — อย่าเพิ่มพร้อมระยะทาง',
          'ซ้อมเดิน+กินในจังหวะ race — nutrition เป็นสกิล',
          'ทุก 3–4 สัปดาห์ deload 30–40%',
        ],
        race: [
          '3–4 สัปดาห์ก่อน: Long run ใหญ่สุด แล้วเริ่ม taper',
          '2 สัปดาห์ก่อน: ลด volume 40%, ซ้อมกิน/ดื่มตามแผน race',
          '1 สัปดาห์ก่อน: ลด 60%, นอนสะสม (นอนให้ได้ 8 ชม./คืน)',
          'วันแข่ง: แผนเดิน-วิ่ง, เกลือ + gel ทุกชม., ทากันน้ำพองเท้า',
        ],
      },
    },
    recentRuns: [],
    healthConnected: false,
    healthSyncing: false,
    profileOpen: localStorage.getItem('runquest_profile_open') !== '0',
    classOpen: {},
    guideOpen: {},
    toast: '',
    _toastTimer: null,

    fmtTime(sec, hours) {
      if (hours) {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }
      const m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + String(s).padStart(2, '0');
    },
    best5kLabel() { return this.fmtTime(this.best5k, false); },
    bestPaceLabel() { return this.best5k > 0 ? this.fmtTime(Math.round(this.best5k / 5), false) + '/กม.' : '—'; },
    // เลเวลรายคลาสตามมาตรฐานของสายนั้นๆ
    classLevel(key) {
      const st = this.standards[key];
      const val = this[st.target];
      if (!val || val <= 0) {
        return { level: 1, lvObj: st.levels[0], pct: 0, pop: st.levels[0].pop, metric: 'ยังไม่มีข้อมูล' };
      }
      let lvObj, pct;
      if (st.dir === 'up') {
        lvObj = st.levels.find(l => val >= l.fast && val < l.slow) || st.levels[st.levels.length - 1];
        pct = Math.min(99, Math.max(2, Math.round(((val - lvObj.fast) / (lvObj.slow - lvObj.fast)) * 100)));
      } else {
        lvObj = st.levels.find(l => val <= l.slow && val > l.fast) || st.levels[st.levels.length - 1];
        pct = Math.min(99, Math.max(2, Math.round(((lvObj.slow - val) / (lvObj.slow - lvObj.fast)) * 100)));
      }
      const metric = st.unit + ': ' + (key === 'ultra' ? val + ' km' : this.fmtTime(val, key === 'long'));
      return { level: lvObj.lv, lvObj: lvObj, pct: pct, pop: lvObj.pop, top: lvObj.top, metric: metric };
    },
    // Overall = ค่าเฉลี่ยเลเวล 4 คลาส (สเกล 20)
    overall() {
      const cs = this.classOrder.map(k => this.classLevel(k));
      const level = Math.max(1, Math.min(30, Math.round(cs.reduce((s, c) => s + c.level, 0) / cs.length)));
      const popAvg = Math.round(cs.reduce((s, c) => s + c.pop, 0) / cs.length);
      const topAvg = 100 - popAvg;
      return { level: level, title: this.overallTitles[level - 1], pct: Math.max(2, Math.min(99, Math.round(cs.reduce((s, c) => s + c.pct, 0) / cs.length))), pop: popAvg, top: topAvg >= 1 ? String(topAvg) : String(Math.round(topAvg * 100) / 100) };
    },
    // cutoff ของแต่ละสาย (เลเวลที่ผ่านขั้นต่ำ)
    classCutoff(cls) {
      const cs = (this.standards[cls] && this.standards[cls].cutoffs) || [];
      if (!cs.length) return '—';
      return cs.map(c => 'Lv.' + c[0] + ' ' + c[1]).join(' • ');
    },
    // โปรไฟล์: สายที่เลือกแสดง
    setClass(k) { this.selectedClass = k; localStorage.setItem('runquest_selected_class', k); },
    visibleRaceClasses() { return this.selectedClass === 'overall' ? this.classOrder : [this.selectedClass]; },
    classFact(cls) {
      if (!this.realData) return 'ยังไม่ได้เชื่อมต่อ — กด "เชื่อม Google Health" เพื่อดูสถิติจริง';
      const facts = this.classFacts[cls]; return facts[(this.classFactIdx[cls] || 0) % facts.length];
    },
    nextClassFact(cls) { this.classFactIdx[cls] = ((this.classFactIdx[cls] || 0) + 1 + Math.floor(Math.random() * (this.classFacts[cls].length - 1))) % this.classFacts[cls].length; },
    // สถานะการลงแข่งของแต่ละรายการ (อิงเลเวลปัจจุบัน)
    distStatus(cls, d) {
      const lv = this.classLevel(cls).level;
      if (lv >= d.req) return '✅';
      if (lv >= d.req - 2) return '⚠️';
      return '❌';
    },
    raceStatus(cls, race) {
      const req = Math.min(...race.dists.map(x => x.req));
      const lv = this.classLevel(cls).level;
      if (lv >= req) return { badge: '✅ ลงได้เลย', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
      if (lv >= req - 2) return { badge: '⚠️ ท้าทาย', cls: 'bg-amber-50 text-amber-600 border-amber-100' };
      return { badge: '❌ ยังไม่พร้อม', cls: 'bg-rose-50 text-rose-500 border-rose-100' };
    },
    classReadyRaces(cls) {
      const ready = [];
      for (const r of this.races[cls]) {
        for (const d of r.dists) {
          if (this.classLevel(cls).level >= d.req) ready.push(d.d);
        }
      }
      return ready.length ? [...new Set(ready)].join(' • ') : 'ยังไม่มี — ดูรายการแข่งด้านล่าง';
    },
    selectedName() { return this.selectedClass === 'overall' ? 'Overall (รวมทุกสาย)' : this.classMeta[this.selectedClass].name; },
    selectedTitle() { return !this.realData ? 'ยังไม่ได้เชื่อมต่อ' : (this.selectedClass === 'overall' ? this.overall().title : this.classLevel(this.selectedClass).lvObj.title); },
    selectedLevel() { return !this.realData ? '—' : (this.selectedClass === 'overall' ? this.overall().level : this.classLevel(this.selectedClass).level); },
    selectedPct() { return !this.realData ? 0 : (this.selectedClass === 'overall' ? this.overall().pct : this.classLevel(this.selectedClass).pct); },
    selectedMetric() { return !this.realData ? 'กด "เชื่อม Google Health" เพื่อดึงข้อมูล' : (this.selectedClass === 'overall' ? 'ค่าเฉลี่ยเลเวล 4 คลาส' : this.classLevel(this.selectedClass).metric); },
    selectedPop() { return !this.realData ? 0 : (this.selectedClass === 'overall' ? this.overall().pop : this.classLevel(this.selectedClass).pop); },
    selectedTop() { return !this.realData ? 0 : (this.selectedClass === 'overall' ? this.overall().top : this.classLevel(this.selectedClass).top); },
    toggleClass(key) { this.classOpen[key] = !this.classOpen[key]; },
    toggleGuide(key) { this.guideOpen[key] = !this.guideOpen[key]; },
    // Fun facts
    currentFact() {
      if (!this.realData) return { icon: 'fa-plug', text: 'ยังไม่ได้เชื่อมต่อ — กด "เชื่อม Google Health" เพื่อดูสถิติจริง' };
      if (this.selectedClass !== 'overall') {
        const facts = this.classFacts[this.selectedClass];
        return { icon: 'fa-bolt', text: facts[(this.classFactIdx[this.selectedClass] || 0) % facts.length] };
      }
      return this.funFacts[this.factIndex];
    },
    nextFact() {
      if (this.selectedClass !== 'overall') { this.nextClassFact(this.selectedClass); return; }
      this.factIndex = (this.factIndex + 1 + Math.floor(Math.random() * (this.funFacts.length - 1))) % this.funFacts.length;
    },
    toggleProfile() { this.profileOpen = !this.profileOpen; localStorage.setItem('runquest_profile_open', this.profileOpen ? '1' : '0'); },
    // Gear CRUD
    addGear() {
      const pool = this.gearPool.filter(p => !this.gear.some(g => g.name === p.name));
      if (!pool.length) { this.showToast('🎒 มีอุปกรณ์ครบแล้ว!'); return; }
      const g = pool[Math.floor(Math.random() * pool.length)];
      this.gear.unshift(g);
      this.showToast('🎒 เพิ่มอุปกรณ์: ' + g.name);
    },
    openGearEdit(i) {
      this.gearEditingIndex = i;
      const g = this.gear[i];
      this.gearEdit = { name: g.name, type: g.type, note: g.note };
      this.gearEditOpen = true;
    },
    saveGear() {
      if (this.gearEditingIndex !== null) {
        Object.assign(this.gear[this.gearEditingIndex], { name: this.gearEdit.name || this.gear[this.gearEditingIndex].name, type: this.gearEdit.type || this.gear[this.gearEditingIndex].type, note: this.gearEdit.note || this.gear[this.gearEditingIndex].note });
      }
      this.gearEditOpen = false;
      this.gearEditingIndex = null;
      this.showToast('✅ อัปเดตอุปกรณ์แล้ว');
    },
    removeGear(i) { this.gearConfirmIndex = i; },
    confirmRemoveGear() {
      if (this.gearConfirmIndex !== null) this.gear.splice(this.gearConfirmIndex, 1);
      this.gearConfirmIndex = null;
      this.showToast('🗑️ ลบอุปกรณ์แล้ว');
    },
    async loadRealStats() {
      try {
        const res = await fetch('/api/runquest/stats', { cache: 'no-store' });
        if (!res.ok) return false;
        const d = await res.json();
        if (!d.run_count || d.run_count <= 0) return false;
        this.realData = true;
        this.stats.totalKm = Math.round(d.total_km * 100) / 100;
        this.stats.runs = d.run_count;
        this.stats.totalCal = Math.round(d.total_cal || 0);
        this.stats.avgHR = Math.round(d.avg_hr || 0);
        if (d.best_5k_sec > 0) this.best5k = Math.round(d.best_5k_sec);
        if (d.best_half_sec > 0) this.bestHalf = Math.round(d.best_half_sec);
        if (d.sprint_400_sec > 0) this.sprint400 = Math.round(d.sprint_400_sec);
        if (d.longest_km > 0) this.longestKm = Math.round(d.longest_km * 100) / 100;
        this.recentRuns = (d.recent || []).slice(0, 6).map(r => ({
          date: this.fmtApiDate(r.start_date),
          km: r.distance_km,
          pace: r.distance_km > 0 ? this.fmtTime(Math.round(r.duration_sec / r.distance_km), false) : '—',
          dur: Math.round(r.duration_sec / 60) + ' นาที' + (r.calories ? ' • 🔥' + Math.round(r.calories) : '') + (r.avg_hr ? ' • HR ' + Math.round(r.avg_hr) : ''),
        }));
        this.apiLastSync = this.fmtApiDate((d.recent && d.recent[0]) ? d.recent[0].start_date : null);
        return true;
      } catch (e) { return false; }
    },
    async checkHealth() {
      try {
        const res = await fetch('/api/runquest/health/status', { cache: 'no-store' });
        if (res.ok) { const d = await res.json(); this.healthConnected = !!d.connected; }
      } catch (e) {}
    },
    async healthSync() {
      if (!this.healthConnected) {
        window.location.href = '/api/runquest/health/connect';
        return;
      }
      if (this.healthSyncing) return;
      this.healthSyncing = true;
      try {
        const res = await fetch('/api/runquest/health/sync', { cache: 'no-store' });
        const d = await res.json();
        if (!res.ok) { this.showToast('⚠️ ' + (d.error || 'ซิงก์ไม่สำเร็จ')); return; }
        this.showToast('✅ ซิงก์ Google Health: นำเข้า ' + d.imported + ' รายการ' + (d.skipped ? ' (ข้ามซ้ำ ' + d.skipped + ')' : ''));
        if (Alpine.store('logs')) Alpine.store('logs').log('game', 'ซิงก์ Google Health', 'นำเข้า ' + d.imported + ' รายการ');
        await this.loadRealStats();
      } catch (e) { this.showToast('⚠️ เกิดข้อผิดพลาด'); }
      finally { this.healthSyncing = false; }
    },
    fmtApiDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' • ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    },
    async healthDisconnect() {
      try {
        const res = await fetch('/api/runquest/health/disconnect', { cache: 'no-store' });
        if (res.ok) {
          this.healthConnected = false;
          this.showToast('🔌 ยกเลิกการเชื่อมต่อ Google Health แล้ว');
          await this.loadRealStats();
        }
      } catch (e) { this.showToast('⚠️ เกิดข้อผิดพลาด'); }
    },
    showToast(msg) {
      this.toast = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toast = ''; }, 3500);
    },
    // --- ตั้งค่าลำดับหัวข้อ (ลาก grip จัด) ---
    sectionOrder: (() => { try { const o = JSON.parse(localStorage.getItem('rq_section_order')); if (Array.isArray(o) && o.length) return o; } catch (e) {} return ['profile', 'health', 'stats', 'fun', 'gear', 'guides', 'races', 'recent']; })(),
    gameSettingsOpen: false,
    rqDraggedIndex: null,
    rqHoverIndex: null,
    sectionIndex(key) { const i = this.sectionOrder.indexOf(key); return i === -1 ? 99 : i + 1; },
    toggleGameSettings() { this.gameSettingsOpen = !this.gameSettingsOpen; },
    initRqDragHandles() {
      // grip ใช้ Alpine @touchmove/@dragstart อยู่แล้ว — ไม่ต้อง attach เพิ่ม
    },
    onRqDragStart(i) { this.rqDraggedIndex = i; this.rqHoverIndex = i; },
    onRqDragOver(i) { if (this.rqDraggedIndex !== null && this.rqHoverIndex !== i) this.rqHoverIndex = i; },
    onRqDragEnd() {
      if (this.rqDraggedIndex !== null && this.rqHoverIndex !== null && this.rqDraggedIndex !== this.rqHoverIndex) {
        const item = this.sectionOrder.splice(this.rqDraggedIndex, 1)[0];
        this.sectionOrder.splice(this.rqHoverIndex, 0, item);
        localStorage.setItem('rq_section_order', JSON.stringify(this.sectionOrder));
      }
      this.rqDraggedIndex = null;
      this.rqHoverIndex = null;
    },
    onRqTouchStart(e, i) { this.rqDraggedIndex = i; this.rqHoverIndex = i; },
    onRqTouchMove(e) {
      if (this.rqDraggedIndex === null) return;
      const t = e.touches[0]; if (!t) return;
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const card = el && el.closest('[data-rq-index]');
      if (card) {
        const idx = parseInt(card.getAttribute('data-rq-index'), 10);
        if (!isNaN(idx) && idx >= 0 && idx < this.sectionOrder.length && this.rqHoverIndex !== idx) this.rqHoverIndex = idx;
      }
    },
    onRqTouchEnd() { this.onRqDragEnd(); },
    // --- ประวัติวิ่งทั้งหมด (modal) ---
    allRuns: [],
    runsModalOpen: false,
    fmtKm(km) { return (km || 0).toFixed(2); },
    async loadAllRuns() {
      try {
        const res = await fetch('/api/runquest/runs', { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          this.allRuns = (d.runs || []).map(r => ({
            date: this.fmtApiDate(r.start_date),
            km: r.distance_km,
            pace: r.distance_km > 0 ? this.fmtTime(Math.round(r.duration_sec / r.distance_km), false) : '—',
            dur: Math.round(r.duration_sec / 60) + ' นาที',
            cal: r.calories,
            hr: r.avg_hr,
          }));
        }
      } catch (e) {}
    },
    openRuns() { this.runsModalOpen = true; this.loadAllRuns(); },
    closeRuns() { this.runsModalOpen = false; },
  });
});
