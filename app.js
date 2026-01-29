/* ==========================================================
前端送單 - 修正版（已修正錯誤 / 加強健壯性 / 安全防護）
========================================================== */

/* ===================== 工具函式 ===================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const nt = n => `NT$ ${Number(n || 0).toLocaleString('zh-TW')}`;


const normalizeCaptcha = s => (s || '').trim().toUpperCase().replace(/\s+/g, '');

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


/* ===================== 全域狀態 ===================== */
const state = { cart: [], captchaText: '', orderId: '', total: 0, sending: false };
const GAS_URL = "https://script.google.com/macros/s/AKfycbwSM20hjmzkPw6u8wptBN1d8onzaaAPm3MT1dFIOrVNWraoRaSRVPLA6GOBBlEUwGZoEQ/exec";
/* ===================== 元素快取（在載入時查詢一次） ===================== */
const els = {
    cartList: $('#cart-list'),
    subtotal: $('#subtotal'),
    grand: $('#grand'),
    form: $('#offer-form') || $('#form'),
    confirmDlg: $('#confirm-dialog'),
    confirmBody: $('#confirm-body'),
    confirmCancel: $('#confirmCancel'),
    confirmSubmit: $('#confirmSubmit'),
    successDlg: $('#success-dialog'),
    successClose: $('#success-close'),
    captchaCanvas: $('#captchaCanvas'),
    captchaInput: $('#captchaInput'),
    refreshCaptcha: $('#refreshCaptcha'),
    agreeCheckbox: $('#agreeChk'),
    termsModal: $('#termsModal'),
    termsLink: $('#termsLink'),
    termsClose: $('#termsClose'),
    agreeBtn: $('#agreeBtn'),
    footerYear: $('#footerYear'),
    countryCode: $('#countryCode'),
    phoneInput: $('#phone'),
    phoneError: $('#phoneError'),
    hiddenPhone: $('#phone_info'),
    submitBtn: $('#submitBtn'),
    openDialogBtn: $('#open-dialog-btn'),
    cancelDlgBtn: $('#cancel-btn'),
    okDlgBtn: $('#ok-btn'),

};

/* ===================== 初始化 ===================== */
window.addEventListener('DOMContentLoaded', () => {
    try {

        // 渲染購物車
        renderCart();

        // 更新頁尾年份
        if (els.footerYear) els.footerYear.textContent = new Date().getFullYear();

        // 綁定 UI 事件
        bindUI();

        // 生成驗證碼（canvas 或 fallback）
        generateCaptcha();

        // 初始化電話資訊
        if (els.phoneInput && els.hiddenPhone && els.countryCode) updatePhoneInfo();
        // 預設台灣國碼（zh-TW）
        if (els.countryCode && !els.countryCode.value) {
            const lang = (navigator.language || '').toLowerCase();
            if (lang === 'zh-tw' || lang === 'zh_tw') {
                els.countryCode.value = '+886';
                updatePhoneInfo();
            }
        }

        // dialog polyfill（必要時）
        const needPoly = window.dialogPolyfill && els.confirmDlg && (!window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal);
        if (needPoly) {
            try { dialogPolyfill.registerDialog(els.confirmDlg); } catch (e) { console.warn('dialogPolyfill.registerDialog failed', e); }
        }
    } catch (err) {
        console.error('初始化 DOMContentLoaded 發生錯誤', err);
    }
});

/* ==========================================================
📌 統一事件綁定 bindUI
========================================================== */
function bindUI() {
    try {
        const scrollBtn = document.querySelector('[data-scroll="form"]');

        // 繳費方式變更 → 顯示 ATM 說明
        const payRadios = document.querySelectorAll('input[name="pay"]');
        const atmInfo = document.getElementById('atmInfo');

        payRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                toggleAtmInfo(radio.value);
            });
        });



        if (scrollBtn) scrollBtn.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector('#form');
            if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset, behavior: 'smooth' });
        });
        document.body.addEventListener('click', e => {
            const btn = e.target.closest('.add-item');
            if (btn) {
                const id = btn.dataset.id,
                    name = btn.dataset.name,
                    price = Number(btn.dataset.price || 0);
                if (!id || !name) return;
                addToCart({ id, name, price, qty: 1 });
            }
        });

        // 驗證碼刷新
        if (els.refreshCaptcha) els.refreshCaptcha.addEventListener('click', () => generateCaptcha());

        // 服務條款 modal
        if (els.termsLink && els.termsModal) {
            els.termsLink.addEventListener('click', e => {
                e.preventDefault();
                openTerms();
            });
            if (els.termsClose) els.termsClose.addEventListener('click', closeTerms);
            if (els.agreeBtn) els.agreeBtn.addEventListener('click', agreeTerms);
            // 點擊 overlay 外圍關閉
            els.termsModal.addEventListener('click', e => { if (e.target === els.termsModal) closeTerms(); });
        }

        // 表單送出
        if (els.form) {
            els.form.addEventListener('submit', e => {
                e.preventDefault();
                updatePhoneInfo();
                if (!validatePhone()) return showToast('請確認電話格式正確');
                handleFormSubmit();
            });

            // 自動 persistDraft：在 input / change 時存草稿（避免未保存）
            els.form.addEventListener('input', persistDraft);
            els.form.addEventListener('change', persistDraft);
        }

        // 電話驗證事件
        if (els.phoneInput) {
            els.phoneInput.addEventListener('input', validatePhone);
            els.phoneInput.addEventListener('blur', validatePhone);
        }
        if (els.countryCode) els.countryCode.addEventListener('change', () => {
            updatePhoneInfo();
            validatePhone();
        });

        // 確認視窗按鈕
        if (els.confirmCancel) els.confirmCancel.addEventListener('click', () => closeDialog(els.confirmDlg));
        if (els.confirmSubmit) els.confirmSubmit.addEventListener('click', () => {
            closeDialog(els.confirmDlg);
            submitOrder();
        });

        // 成功視窗
        if (els.successClose) els.successClose.addEventListener('click', () => closeDialog(els.successDlg));

        // optional standalone dialog buttons (if exist)
        if (els.openDialogBtn && els.confirmDlg) {
            els.openDialogBtn.addEventListener('click', () => {
                try {
                    if (typeof els.confirmDlg.showModal === 'function') els.confirmDlg.showModal();
                    else alert('開啟確認視窗');
                } catch (e) { console.warn(e); }
            });
        }
        if (els.cancelDlgBtn && els.confirmDlg) {
            els.cancelDlgBtn.addEventListener('click', () => { try { if (typeof els.confirmDlg.close === 'function') els.confirmDlg.close(); } catch (e) { console.warn(e); } });
        }
        if (els.okDlgBtn && els.confirmDlg) {
            els.okDlgBtn.addEventListener('click', () => {
                try {
                    if (typeof els.confirmDlg.close === 'function') els.confirmDlg.close();
                    alert('已送出');
                } catch (e) { console.warn(e); }
            });
        }
    } catch (err) {
        console.error('bindUI 發生錯誤', err);
    }
}

function closeDialog(dialog) {
    if (!dialog) return;
    try {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.style.display = 'none';
    } catch {
        try { dialog.style.display = 'none'; } catch (e) { /* ignore */ }
    }
}

/* ==========================================================
ATM 金額檢查函式
========================================================== */
function validateAtmLimit() {
    const pay = document.querySelector('input[name="pay"]:checked');
    const payError = document.getElementById('payError');

    if (!pay) return true; // 沒選繳費方式，交給其他驗證

    // 只限制 ATM
    if (pay.value !== 'ATM 轉帳') {
        payError.textContent = '';
        payError.style.display = 'none';
        return true;
    }

    const totals = calcTotals();
    const amount = Number(totals.grand || 0);

    if (amount > 49999) {
        payError.textContent = '⚠️ ATM 轉帳單筆金額上限為 49,999 元，請改用其他付款方式';
        payError.style.display = 'block';

        // 捲動回繳費方式
        payError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
    }

    // 通過
    payError.textContent = '';
    payError.style.display = 'none';
    return true;
}


/* ==========================================================
🛒 購物車管理（含 localStorage）
========================================================== */
function persistCart() {
    try {
        localStorage.setItem('orderCart', JSON.stringify(state.cart || []));
    } catch (e) {
        console.warn('persistCart fail', e);
    }
}

function restoreCart() {
    try {
        const raw = localStorage.getItem('orderCart');
        if (!raw) { state.cart = []; return; }
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) state.cart = arr;
        else state.cart = [];
    } catch (e) {
        console.warn('restoreCart fail, clearing cart', e);
        state.cart = [];
    }
}

function addToCart(item) {
    const found = state.cart.find(c => c.id === item.id);
    if (found) found.qty = Math.max(1, (found.qty || 0) + (item.qty || 1));
    else state.cart.push({...item });
    persistCart();
    renderCart();
}

function calcTotals() {
    try {
        // 防止 undefined / null ✔防止字串✔ 防止 NaN
        const subtotal = state.cart.reduce((s, i) => s + (Number(i.price || 0) * Number(i.qty || 0)), 0);
        state.total = subtotal;
        return { subtotal, grand: subtotal };
    } catch (e) {
        console.warn('calcTotals error', e);
        state.total = 0;
        return { subtotal: 0, grand: 0 };
    }
}

function renderCart() {
    if (!els.cartList) return;
    els.cartList.innerHTML = '';
    state.cart.forEach(item => {
        const li = document.createElement('li');
        li.className = 'cart-item';
        const qty = Number(item.qty || 1);
        const price = Number(item.price || 0);
        li.innerHTML = `
                <div class="cart-left">
                    <div class="cart-name">${escapeHtml(item.name)}</div>
                    <div class="cart-price-small">${nt(price)}</div>
                </div>
                <div class="cart-right">
                    <div class="qty">
                        <button class="qty-minus" aria-label="減少">-</button>
                        <input class="qty-input" type="number" min="1" value="${qty}" />
                        <button class="qty-plus" aria-label="增加">+</button>
                    </div>
                    <div class="cart-price">${nt(price * qty)}</div>
                    <button class="cart-remove">移除</button>
                </div>`;
        const minus = li.querySelector('.qty-minus');
        const plus = li.querySelector('.qty-plus');
        const input = li.querySelector('.qty-input');
        const rem = li.querySelector('.cart-remove');

        minus && minus.addEventListener('click', () => {
            item.qty = Math.max(1, (item.qty || 1) - 1);
            persistCart();
            renderCart();
        });
        plus && plus.addEventListener('click', () => {
            item.qty = (item.qty || 0) + 1;
            persistCart();
            renderCart();
        });
        input && input.addEventListener('change', e => {
            item.qty = Math.max(1, parseInt(e.target.value || 1, 10));
            persistCart();
            renderCart();
        });
        rem && rem.addEventListener('click', () => {
            state.cart = state.cart.filter(c => c.id !== item.id);
            persistCart();
            renderCart();
        });
        els.cartList.appendChild(li);
    });

    const totals = calcTotals();
    if (els.subtotal) els.subtotal.textContent = nt(totals.subtotal);
    if (els.grand) els.grand.textContent = nt(totals.grand);
}

/* ==========================================================
💾 localStorage 草稿（表單資料）
========================================================== */
function persistDraft() {
    if (!els.form) return;
    try {
        const fd = new FormData(els.form);
        const draft = {};
        // 支援多值欄位（checkbox / multiple select）
        for (const [k, v] of fd.entries()) {
            if (draft.hasOwnProperty(k)) {
                if (!Array.isArray(draft[k])) draft[k] = [draft[k]];
                draft[k].push(v);
            } else {
                draft[k] = v;
            }
        }
        localStorage.setItem('orderDraft', JSON.stringify(draft));
    } catch (e) {
        console.warn('persistDraft fail', e);
    }
}

function restoreDraft() {
    // 還原繳費方式後同步顯示 ATM 說明
    const checkedPay = document.querySelector('input[name="pay"]:checked');
    if (checkedPay) toggleAtmInfo(checkedPay.value);



    if (!els.form) return;
    try {
        const raw = localStorage.getItem('orderDraft');
        if (!raw) return;
        const draft = JSON.parse(raw);
        Object.keys(draft).forEach(k => {
            const el = els.form.querySelector(`[name="${k}"]`);
            if (!el) return;
            const val = draft[k];
            if (el.type === 'checkbox') {
                // 若是陣列，設定多個
                if (Array.isArray(val)) {
                    // 找到同名 checkbox 並設定 checked
                    const boxes = els.form.querySelectorAll(`input[name="${k}"]`);
                    boxes.forEach(b => { b.checked = val.includes(b.value); });
                } else {
                    el.checked = !!val;
                }
            } else if (el.type === 'radio') {
                const radios = els.form.querySelectorAll(`input[name="${k}"]`);
                radios.forEach(r => { r.checked = r.value === val; });
            } else {
                el.value = Array.isArray(val) ? val[0] : val;
            }
        });
    } catch (e) {
        console.warn('restoreDraft fail', e);
    }
}

/* ==========================================================
🔢 驗證碼（Canvas） + fallback
========================================================== */
function generateCaptcha() {
    try {
        const canvas = els.captchaCanvas;
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let txt = '';
        for (let i = 0; i < 4; i++) txt += chars.charAt(Math.floor(Math.random() * chars.length));
        state.captchaText = txt.toUpperCase();

        if (!canvas) {
            if (els.captchaInput) els.captchaInput.placeholder = '請輸入驗證碼: ' + state.captchaText;
            return;
        }
        canvas.width = 120;
        canvas.height = 36;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 6; i++) {
            ctx.strokeStyle = `rgba(180,80,30,${Math.random()*0.25})`;
            ctx.beginPath();
            ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
            ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
            ctx.stroke();
        }
        const fonts = ['24px Arial', '26px serif', '22px Georgia'];
        for (let i = 0; i < state.captchaText.length; i++) {
            ctx.save();
            const x = 12 + i * 28;
            const y = 24 + (Math.random() * 6 - 3);
            const angle = (Math.random() - 0.5) * 0.4;
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.font = fonts[i % fonts.length];
            ctx.fillStyle = '#7a2a0a';
            ctx.fillText(state.captchaText[i], 0, 0);
            ctx.restore();
        }
    } catch (e) {
        console.warn('generateCaptcha error', e);
    }
}




/* ==========================================================
📜 服務條款 modal
========================================================== */
function openTerms() {
    if (!els.termsModal) return;
    els.termsModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeTerms() {
    if (!els.termsModal) return;
    els.termsModal.style.display = 'none';
    document.body.style.overflow = '';
}

function agreeTerms() {
    if (!els.agreeCheckbox) return;
    els.agreeCheckbox.checked = true;
    closeTerms();
}

/* ==========================================================
☎ 國碼 + 電話驗證
========================================================== */
function updatePhoneInfo() {
    if (!els.hiddenPhone || !els.phoneInput || !els.countryCode) return;
    try {
        let num = String(els.phoneInput.value || '').trim();
        const code = String(els.countryCode.value || '').trim();
        if (code === '+886') num = num.replace(/^0+/, '');
        if (num) {
            els.hiddenPhone.value = code + num;
        } else {
            els.hiddenPhone.value = '';
        }
    } catch (e) { console.warn('updatePhoneInfo error', e); }
}

function setInvalidPhone(msg) {
    if (!els.phoneError || !els.phoneInput) return;
    els.phoneError.textContent = msg;
    els.phoneError.style.display = 'block';
    els.phoneInput.classList.add('invalid');
}

function setValidPhone() {
    if (!els.phoneError || !els.phoneInput) return;
    els.phoneError.textContent = '';
    els.phoneError.style.display = 'none';
    els.phoneInput.classList.remove('invalid');
}

function validatePhone() {
    if (!els.phoneInput || !els.countryCode) return true;
    const phone = String(els.phoneInput.value || '').trim();
    const code = String(els.countryCode.value || '').trim();

    // 空號視為無效
    if (!code) { setInvalidPhone('請選擇國家'); return false; }
    if (code === '+886') {
        if (!/^09\d{8}$/.test(phone)) { setInvalidPhone('⚠️台灣電話需09開頭，共10碼'); return false; }
    } else {
        if (!/^\d{6,15}$/.test(phone)) { setInvalidPhone('⚠️國際號碼需6–15位數字'); return false; }
    }
    setValidPhone();
    updatePhoneInfo();
    return true;
}

/* ==========================================================
🧾 表單送出流程
========================================================== */
async function handleFormSubmit() {

    // 👇 原本的付款方式驗證
    if (!validatePay()) return;

    // 👇 新增 ATM 金額限制
    if (!validateAtmLimit()) return;


    const { captchaInput, agreeCheckbox } = els;
    if (!captchaInput) { showToast('系統錯誤：驗證碼欄位遺失'); return; }
    if (!state.captchaText) {
        showToast('系統錯誤：驗證碼尚未生成');
        generateCaptcha();
        return;
    }
    if (normalizeCaptcha(captchaInput.value) !== normalizeCaptcha(state.captchaText)) {
        showToast('❌ 驗證碼錯誤，請重新輸入');
        generateCaptcha();
        captchaInput.value = '';
        captchaInput.focus();
        return;
    }
    if (!state.cart.length) { showToast('⚠️ 請先加入燈種'); return; }
    if (agreeCheckbox && !agreeCheckbox.checked) { showToast('⚠️ 請同意服務條款'); return; }

    state.orderId = generateOrderId();
    prepareConfirmBody();

    try {
        if (els.confirmDlg && typeof els.confirmDlg.showModal === 'function') {
            els.confirmDlg.showModal();
        } else {
            const ok = confirm('確認送出？');
            if (ok) submitOrder();
        }
    } catch (err) {
        console.error(err);
        if (confirm('確認送出？')) submitOrder();
    }
}

function showToast(msg) { // 簡化：使用 alert 或替換為自訂 toast
    try { alert(msg); } catch (e) { console.log(msg); }
}

/* ==========================================================
🪧 確認視窗內容
========================================================== */
function prepareConfirmBody() {
    if (!els.confirmBody) return;
    const itemsHtml = state.cart.map(i => `<li>${escapeHtml(i.name)} × ${i.qty} — <strong>${escapeHtml(nt(Number(i.price || 0) * Number(i.qty || 0)))}</strong></li>`).join('');
    const totals = calcTotals();
    const fd = new FormData(els.form || document.createElement('form'));
    const map = Object.fromEntries(fd.entries());
    const addr = getAddressText(map) || {};

    els.confirmBody.innerHTML = `
            <div class="muted">請再次確認資料無誤：</div>
            <div>建立時間：<strong>${new Date().toLocaleString()}</strong></div>
            <div>訂單編號：<strong>${state.orderId}</strong></div>
            <h6>善信大德資料</h6>
            <div>姓名：${escapeHtml(map.name||'-')}</div>
            <div>性別：${escapeHtml(map.gender||'-')}</div>
            <div>生日資訊：${escapeHtml(map.birthday_info||'-')}</div>
            <div>聯絡電話：${escapeHtml(map.phone_info||'-')}</div>
            <div>Email：${escapeHtml(map.email||'-')}</div>
            <div>LINE_ID：${escapeHtml(map.line_id||'-')}</div>
            <div>地址：${escapeHtml(addr.fullText || '-')}</div>
            <h6>購物車內容</h6>
            <ul>${itemsHtml}</ul>
            <div>到期通知：${escapeHtml(map.notice||'-')}</div>
            <div>繳費方式：${escapeHtml(map.pay||'-')}</div>
            <div>小計：<strong>${nt(totals.subtotal)}</strong></div>
            <div>總計：<strong>${nt(totals.grand)}</strong></div><hr/>
            <div>備註：${escapeHtml(map.remark.replace(/\n/g, '<br>')||'-')}</div>`;
}


/* ==========================================================
✅ 永不 CORS + 前端送單到 GAS（記錄 + 綠界）
========================================================== */
async function submitOrder() {
    if (!els || !els.form) return;

    const submitBtn = els.submitBtn || document.querySelector('#submitBtn');
    state.sending = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
        /* ========= 1️⃣ 表單 + 金額 ========= */
        const fd = new FormData(els.form);
        const map = Object.fromEntries(fd.entries());
        const totals = calcTotals();

        if (!state.cart || state.cart.length === 0) {
            throw new Error('購物車是空的');
        }

        const amount = Math.floor(Number(totals.grand || 0));
        if (amount <= 0) throw new Error('金額錯誤');

        /* ========= 2️⃣ 訂單編號 ========= */
        const orderId = state.orderId || generateOrderId();
        state.orderId = orderId;

        /* ========= 3️⃣ 地址 ========= */
        const addr = typeof getAddressText === 'function' ?
            getAddressText(map) : { fullText: '' };

        /* ========= 4️⃣ 記錄訂單 ========= */
        const recordPayload = {
            action: 'recordOrder',
            formName: document.title || '點燈登記',
            rowData: {
                建立時間: new Date().toLocaleString('zh-TW'),
                訂單編號: orderId,
                姓名: map.name || '',
                性別: map.gender || '',
                生日資訊: map.birthday_info || '',
                連絡電話: map.phone_info || '',
                Email: map.email || '',
                LINE_ID: map.line_id ? "'" + map.line_id : '',
                地址: addr.fullText || '',
                購物車內容: state.cart.map(i => `${i.name} x ${i.qty}`).join('、'),
                到期通知: map.notice || '',
                繳費方式: map.pay || '',
                金額: amount,
                備註: map.remark || ''
            }
        };

        const recordRes = await fetch(GAS_URL, {
            method: 'POST',
            body: new URLSearchParams({
                payload: JSON.stringify(recordPayload)
            })
        });

        const recordJson = await recordRes.json();
        if (!recordJson.success) {
            throw new Error(recordJson.message || '訂單紀錄失敗');
        }

        /* ========= 5️⃣ 統一付款方式 ========= */
        let payType = 'ALL';
        switch ((map.pay || '').trim()) {
            case 'ATM 轉帳':
                payType = 'ATM';
                break;
            case '超商繳費':
                payType = 'CVS';
                break;
            case 'LINE Pay':
                payType = 'LinePay';
                break;
            case '線上刷卡':
                payType = 'Credit';
                break;
        }


        /* ========= 7️⃣ 建立綠界訂單 ========= */
        const ecpayPayload = {
            action: 'createEcpay',
            env: map.env || 'prod',
            orderId,
            amount,
            cart: state.cart,
            pay: map.pay,
            customer: {
                name: map.name || '',
                phone: map.phone_info || '',
                email: map.email || ''
            }
        };

        const ecpayRes = await fetch(GAS_URL, {
            method: 'POST',
            body: new URLSearchParams({
                payload: JSON.stringify(ecpayPayload)
            })
        });

        const ecpayJson = await ecpayRes.json();
        if (!ecpayJson.success) {
            throw new Error(ecpayJson.message || '建立綠界訂單失敗');
        }

        /* ========= 8️⃣ 導向綠界 ========= */
        const { ecpay, paymentUrl } = ecpayJson;
        redirectToEcpay(ecpay, paymentUrl);

    } catch (err) {
        console.error(err);
        alert('❌ 系統錯誤：' + err.message);
    } finally {
        state.sending = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}


/* ==========================================================
   直接送 form 給綠界付款頁面
========================================================== */
function redirectToEcpay(ecpay, paymentUrl) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = paymentUrl;

    Object.keys(ecpay).forEach(key => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = ecpay[key];
        form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
}

/* ==========================================================
✅ 共用地址處理
========================================================== */
function getAddressText(map) {
    const countryMap = {
        TW: '台灣',
        CN: '中國',
        HK: '香港',
        JP: '日本',
        US: '美國',
        OTHER: '其他國家'
    };
    const countryCode = map.country || '';
    const countryName = countryMap[countryCode] || '';

    // 國外地址
    if (countryCode && countryCode !== 'TW') {
        const fullText = countryName + ' ' + (map.foreignAddress || '');

        return {
            countryCode,
            countryName,
            city: '',
            district: '',
            detail: '',
            foreignAddress: map.foreignAddress || '',
            fullText: fullText.trim()
        };
    }

    // 台灣地址
    const parts = [
        countryName,
        map.city,
        map.district,
        map.detail
    ].filter(Boolean);

    return {
        countryCode,
        countryName,
        city: map.city || '',
        district: map.district || '',
        detail: map.detail || '',
        foreignAddress: '',
        fullText: parts.join('')
    };
}

/* ==========================================================
✅ 訂單編號生成
========================================================== */
function generateOrderId(templeCode = 'DSG') {
    const d = new Date();

    // 民國年
    const rocYear = d.getFullYear() - 1911;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    const dateStr = `${rocYear}${month}${day}`; // 例：1121225

    // 流水號 key
    const key = `order_counter_${dateStr}`;
    let counter = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, counter);

    // 流水號補 3 位數
    const counterStr = String(counter).padStart(3, '0');

    return `${templeCode}${dateStr}${counterStr}`;
}

/* ==========================================================
⏰ 付款到期時間計算
========================================================== */
function getPayExpireAt(orderTime, payType) {
    const base = new Date(orderTime || Date.now());

    switch (payType) {
        case 'ATM 轉帳':
            base.setHours(base.getHours() + 24);
            break;
        case '超商繳費':
            base.setHours(base.getHours() + 48);
            break;
        default:
            return null; // 即時或不限制
    }
    return base;
}

/* ==========================================================
✅ 1️⃣ 取得選到的 pay 值
========================================================== */
function getSelectedPay() {
    const checked = document.querySelector('input[name="pay"]:checked');
    return checked ? checked.value : '';
}
/* ==========================================================
✅ 2️⃣ 驗證是否有選（顯示錯誤）
========================================================== */
function validatePay() {
    const pay = getSelectedPay();
    const err = document.getElementById('payError');

    if (!pay) {
        err.textContent = '⚠️ 請選擇繳費方式';
        err.style.display = 'block';
        return false;
    }

    err.textContent = '';
    err.style.display = 'none';
    return true;
}
/* ==========================================================
2️⃣ ATM 帳號說明區塊顯示 / 隱藏邏輯
========================================================== */
function toggleAtmInfo(payValue) {
    const atmInfo = document.getElementById('atmInfo');
    if (!atmInfo) return;

    // ⭐ 付款提示
    updatePayHint(payValue);

    if (payValue === 'ATM 轉帳') {
        atmInfo.classList.add('show');
        atmInfo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (!state.orderId) {
            state.orderId = generateOrderId();
        }

        const atm = generateAtmAccount(state.orderId);
        document.getElementById('atmBank').textContent = atm.bankCode;
        document.getElementById('atmAccount').textContent = atm.account;
        // ⭐ 即時檢查金額
        validateAtmLimit();
    } else {
        atmInfo.classList.remove('show');
    }
}

// 每種付款方式的提示文字

const PAY_HINTS = {
    '線上刷卡': `
        💳 <strong>線上刷卡</strong><br>
        支援 Visa / Master / JCB / 銀聯。<br>
        付款完成後即刻入帳，請於LINE通知小編。
    `,
    'LINE Pay': `
        💚 <strong>LINE Pay</strong><br>
        將跳轉至 LINE App 進行付款。<br>
        請於畫面完成付款流程。
    `,
    '超商繳費': `
        🏪 <strong>超商繳費</strong><br>
        系統將產生繳費代碼。<br>
        請於期限內至超商櫃檯或機台完成繳費。
    `,
    'ATM 轉帳': `
        🏧 <strong>ATM 轉帳</strong><br>
        請使用下方顯示之「專屬虛擬帳號」進行轉帳。<br>
        轉帳時請務必填寫訂單編號。
    `,
    '現場繳費': `
        🧧 <strong>現場繳費</strong><br>
        請於服務時間內親至本宮繳費。<br>
        可出示訂單編號以利查詢。
    `
};
// 切換提示（核心邏輯）
function updatePayHint(payValue) {
    const hint = document.getElementById('payHint');
    if (!hint) return;

    const html = PAY_HINTS[payValue];

    if (html) {
        hint.innerHTML = html;
        hint.classList.add('show');
    } else {
        hint.innerHTML = '';
        hint.classList.remove('show');
    }
}