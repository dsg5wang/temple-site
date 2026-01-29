/* ===== 出生日曆 + 農曆 ===== */
const yearSelect = document.getElementById('year');
const monthSelect = document.getElementById('month');
const daySelect = document.getElementById('day');
const hourSelect = document.getElementById('hour');
const result = document.getElementById('result');
const birthdayInfoEl = document.getElementById('birthday_info');

// 生肖簡體 → 繁體
const shengxiaoMap = {
    "鼠": "鼠",
    "牛": "牛",
    "虎": "虎",
    "兔": "兔",
    "龙": "龍",
    "蛇": "蛇",
    "马": "馬",
    "羊": "羊",
    "猴": "猴",
    "鸡": "雞",
    "狗": "狗",
    "猪": "豬"
};

// 地支與時段
const zhiNames = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const hourRanges = [
    [23, 0],
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [17, 18],
    [19, 20],
    [21, 22]
];
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const pad = n => n.toString().padStart(2, '0');
const toTraditional = text => text.replace(/[闰腊]/g, ch => ({ "闰": "閏", "腊": "臘" }[ch] || ch));

// 更新天數
function updateDays() {
    const y = parseInt(yearSelect.value, 10);
    const m = parseInt(monthSelect.value, 10);
    if (Number.isNaN(y) || Number.isNaN(m)) return;
    const daysInMonth = new Date(y, m, 0).getDate();
    const prev = parseInt(daySelect.value, 10);
    daySelect.innerHTML = "";
    for (let i = 1; i <= daysInMonth; i++) {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = i;
        daySelect.appendChild(opt);
    }
    daySelect.value = (Number.isInteger(prev) && prev <= daysInMonth) ? prev : 1;
}

// 顯示結果
function updateDisplay() {
    const y = parseInt(yearSelect.value, 10);
    const m = parseInt(monthSelect.value, 10);
    const d = parseInt(daySelect.value, 10);
    const h = hourSelect.value;

    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d) || !h) {
        result.innerText = "請輸入日期";
        birthdayInfoEl.value = "";
        return;
    }

    try {
        let displayText = "",
            infoText = "";
        let date = new Date(y, m - 1, d);
        if (h !== "吉時") date.setHours(parseInt(h, 10));

        let lunarText = "",
            shengXiao = "";
        try {
            const lunar = Lunar.fromDate(date);
            lunarText = toTraditional(`${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`);
            shengXiao = shengxiaoMap[lunar.getYearShengXiao()] || lunar.getYearShengXiao();
        } catch (e) {
            lunarText = "農曆計算失敗";
        }

        const gy = date.getFullYear();
        const gm = date.getMonth() + 1;
        const gd = date.getDate();
        const rocYear = gy - 1911;
        const weekText = `星期${weekdays[date.getDay()]}`;

        if (h === "吉時") {
            displayText = `國曆：${gy} 年 (民國 ${rocYear}) ${gm} 月 ${gd} 日 ${weekText}\n` +
                `農曆：${lunarText} ${shengXiao?`(${shengXiao}年)`:""}\n時辰：吉時`;
            infoText = `${gy}/${gm}/${gd} ${weekText}｜農曆 ${lunarText} ${shengXiao?`(${shengXiao}年)`:""}｜吉時`;
        }else{
            const hNum = parseInt(h,10);
            let zhiIndex = hourRanges.findIndex(range=>{
                if(range[0]<=range[1]) return hNum>=range[0]&&hNum<=range[1];
                return hNum>=range[0]||hNum<=range[1];
            });
            if(zhiIndex===-1) zhiIndex=0;
            const zhiName = zhiNames[zhiIndex];
            const range = hourRanges[zhiIndex];
            const rangeText = `${pad(range[0])}:00–${pad(range[1])}:59`;

            displayText = `國曆：${gy} 年 (民國 ${rocYear}) ${gm} 月 ${gd} 日 ${weekText}\n`+
                          `農曆：${lunarText} ${shengXiao?`(${shengXiao}年)`:""}\n`+
                          `時辰：${zhiName}時 (${rangeText})`;
            infoText = `${gy}/${gm}/${gd} ${weekText}｜農曆 ${lunarText} ${shengXiao?`(${shengXiao}年)`:""}｜${zhiName}時 (${rangeText})`;
        }

        result.innerText = displayText;
        birthdayInfoEl.value = infoText;
    }catch(err){
        console.error(err);
        result.innerText="⚠️ 日期換算失敗，請確認輸入或稍後再試。";
        birthdayInfoEl.value="";
    }
}

// 填充年份
for(let y=1900;y<=2100;y++){
    const opt = document.createElement('option');
    const rocText = y>=1912?`民國 ${y-1911} 年`:`民國前 ${1911-y+1} 年`;
    opt.value = y;
    opt.textContent = `${y} 年 (${rocText})`;
    yearSelect.appendChild(opt);
}
// 填充月份
for(let m=1;m<=12;m++){
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    monthSelect.appendChild(opt);
}

// 填充時辰
function fillHourSelect(){
    hourSelect.innerHTML="";
    const optAll = document.createElement('option');
    optAll.value="吉時";
    optAll.textContent="吉時";
    hourSelect.appendChild(optAll);
    for(let i=0;i<12;i++){
        const [start,end] = hourRanges[i];
        const opt = document.createElement('option');
        opt.value=start;
        opt.textContent=`${zhiNames[i]}時 (${pad(start)}:00–${pad(end)}:59)`;
        hourSelect.appendChild(opt);
    }
}
fillHourSelect();

// 綁定事件
yearSelect.addEventListener("change",()=>{updateDays();updateDisplay();});
monthSelect.addEventListener("change",()=>{updateDays();updateDisplay();});
daySelect.addEventListener("change",updateDisplay);
hourSelect.addEventListener("change",updateDisplay);

// 初始化
(function init(){
    const today = new Date();

    // 設定年/月/日
    yearSelect.value = today.getFullYear();
    monthSelect.value = today.getMonth()+1;
    updateDays();
    daySelect.value = Math.min(today.getDate(), daySelect.options.length);

    // 設定時辰
    const hNow = today.getHours();
    let zhiIndex = hourRanges.findIndex(range=>{
        if(range[0]<=range[1]) return hNow>=range[0]&&hNow<=range[1];
        return hNow>=range[0]||hNow<=range[1];
    });
    if(zhiIndex===-1) zhiIndex=0;
    const startHour = hourRanges[zhiIndex][0];
    const optionFound = Array.from(hourSelect.options).find(o=>o.value===String(startHour));
    hourSelect.value = optionFound?optionFound.value:"吉時";

    updateDisplay();
})();