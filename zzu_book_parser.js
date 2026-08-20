// ==UserScript==
// @name         郑大教材书单解析器
// @namespace    https://jcxg.zzu.edu.cn/
// @version      1.2.0
// @match        https://jcxg.zzu.edu.cn/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      jcgl.zzu.edu.cn
// ==/UserScript==

(function () {
    'use strict';

    const API_HOST = 'https://jcgl.zzu.edu.cn';
    const TOKEN_KEY = 'zzu_jcgl_token';

    // ============================================================
    // Token
    // ============================================================

    function extractToken(url) {
        if (!url) return null;

        try {
            const parsed = new URL(url, location.href);
            const token = parsed.searchParams.get('token');

            if (
                token &&
                /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
            ) {
                return token;
            }
        } catch (_) {}

        const match = String(url).match(
            /[?&]token=(eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/
        );

        return match ? decodeURIComponent(match[1]) : null;
    }

    function saveToken(token, source = '') {
        if (!token) return;

        const old = GM_getValue(TOKEN_KEY, '');

        if (old !== token) {
            GM_setValue(TOKEN_KEY, token);

            console.log(
                '[郑大教材解析器] 捕获到新的 Token',
                source || '',
                token.slice(0, 15) + '...'
            );

            updateButtonState();
        }
    }

    function getSavedToken() {
        return GM_getValue(TOKEN_KEY, '') || '';
    }

    // ============================================================
    // 方法 1：监听 Performance
    // ============================================================

    function scanPerformance() {
        try {
            const resources = performance.getEntriesByType('resource');

            for (const resource of resources) {
                const token = extractToken(resource.name);

                if (token) {
                    saveToken(token, 'Performance');
                }
            }
        } catch (e) {
            console.warn('[郑大教材解析器] Performance 扫描失败', e);
        }
    }

    function observePerformance() {
        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    const token = extractToken(entry.name);

                    if (token) {
                        saveToken(token, 'PerformanceObserver');
                    }
                }
            });

            observer.observe({
                type: 'resource',
                buffered: true
            });
        } catch (e) {
            console.warn(
                '[郑大教材解析器] PerformanceObserver 不可用',
                e
            );
        }
    }

    // ============================================================
    // 方法 2：Hook fetch
    // ============================================================

    function hookFetch() {
        try {
            const win = unsafeWindow;

            if (!win || !win.fetch || win.__ZZU_FETCH_HOOKED__) {
                return;
            }

            win.__ZZU_FETCH_HOOKED__ = true;

            const originalFetch = win.fetch;

            win.fetch = function (...args) {
                try {
                    let url = '';

                    if (typeof args[0] === 'string') {
                        url = args[0];
                    } else if (args[0] && args[0].url) {
                        url = args[0].url;
                    }

                    const token = extractToken(url);

                    if (token) {
                        saveToken(token, 'fetch');
                    }
                } catch (_) {}

                return originalFetch.apply(this, args);
            };

            console.log('[郑大教材解析器] fetch 监听已开启');

        } catch (e) {
            console.warn('[郑大教材解析器] fetch Hook 失败', e);
        }
    }

    // ============================================================
    // 方法 3：Hook XMLHttpRequest
    // ============================================================

    function hookXHR() {
        try {
            const win = unsafeWindow;

            if (
                !win ||
                !win.XMLHttpRequest ||
                win.XMLHttpRequest.prototype.__ZZU_XHR_HOOKED__
            ) {
                return;
            }

            const proto = win.XMLHttpRequest.prototype;

            proto.__ZZU_XHR_HOOKED__ = true;

            const originalOpen = proto.open;

            proto.open = function (method, url, ...rest) {
                try {
                    const token = extractToken(url);

                    if (token) {
                        saveToken(token, 'XMLHttpRequest');
                    }
                } catch (_) {}

                return originalOpen.call(
                    this,
                    method,
                    url,
                    ...rest
                );
            };

            console.log(
                '[郑大教材解析器] XMLHttpRequest 监听已开启'
            );

        } catch (e) {
            console.warn(
                '[郑大教材解析器] XMLHttpRequest Hook 失败',
                e
            );
        }
    }

    // ============================================================
    // 也扫描 localStorage / sessionStorage
    // ============================================================

    function deepFindToken(value) {
        if (!value) return null;

        if (typeof value === 'string') {
            if (
                /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
                    value
                )
            ) {
                return value;
            }

            try {
                const json = JSON.parse(value);
                return deepFindToken(json);
            } catch (_) {
                const match = value.match(
                    /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
                );

                return match ? match[0] : null;
            }
        }

        if (typeof value === 'object') {
            for (const key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) {
                    continue;
                }

                const found = deepFindToken(value[key]);

                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

    function scanStorage() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);

                const token = deepFindToken(value);

                if (token) {
                    saveToken(token, 'localStorage:' + key);
                    return;
                }
            }
        } catch (_) {}

        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const value = sessionStorage.getItem(key);

                const token = deepFindToken(value);

                if (token) {
                    saveToken(token, 'sessionStorage:' + key);
                    return;
                }
            }
        } catch (_) {}
    }

    // ============================================================
    // 请求书单
    // ============================================================

    function requestBookList(token) {
        return new Promise((resolve, reject) => {
            const url =
                `${API_HOST}/jcglOrder/list` +
                `?token=${encodeURIComponent(token)}` +
                `&timestamp=${Date.now()}` +
                `&lastsession=`;

            GM_xmlhttpRequest({
                method: 'GET',
                url,

                headers: {
                    Accept: 'application/json, text/plain, */*'
                },

                onload(response) {
                    try {
                        const json = JSON.parse(
                            response.responseText
                        );

                        if (!json.success) {
                            reject(
                                new Error(
                                    json.message ||
                                    `接口返回失败：${json.code}`
                                )
                            );

                            return;
                        }

                        resolve(json);

                    } catch (e) {
                        reject(
                            new Error(
                                '接口返回的不是有效 JSON'
                            )
                        );
                    }
                },

                onerror() {
                    reject(
                        new Error(
                            '无法连接教材管理接口'
                        )
                    );
                }
            });
        });
    }

    // ============================================================
    // 解析书单
    // ============================================================

    function parseBooks(json) {
        const list = Array.isArray(json.result)
            ? json.result
            : [];

        return list.map(item => {
            const info = item.bookInfo || {};
            const order = item.stuOrder || {};

            const originalPrice =
                Number(info.bookPrice || 0);

            const discount =
                Number(info.bookDiscount ?? 1);

            let realPrice;

            if (
                order.bookRealPay !== null &&
                order.bookRealPay !== undefined &&
                order.bookRealPay !== ''
            ) {
                realPrice =
                    Number(order.bookRealPay);
            } else {
                realPrice =
                    originalPrice * discount;
            }

            const status =
                item.stuStatusDesc || '';

            const purchased =
                status &&
                !/未选购|未购买|未订购/.test(status)
                    ? '是'
                    : '否';

            return {
                courseName:
                    item.kcName || '',

                bookName:
                    item.bookName ||
                    info.bookName ||
                    '',

                author:
                    info.bookWriter || '',

                publisher:
                    info.pressName || '',

                isbn:
                    info.bookIsbn || '',

                edition:
                    info.bookEdition || '',

                originalPrice,
                discount,
                realPrice,
                purchased,
                status
            };
        });
    }

    // ============================================================
    // 辅助
    // ============================================================

    function money(value) {
        const n = Number(value);

        return Number.isFinite(n)
            ? `¥${n.toFixed(2)}`
            : '-';
    }

    function formatDiscount(value) {
        const n = Number(value);

        return Number.isFinite(n)
            ? `${(n * 10).toFixed(1)} 折`
            : '-';
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function copyText(text) {
        GM_setClipboard(String(text));
    }

    function makeText(books) {
        return books
            .map(book => [
                `课程名：${book.courseName}`,
                `书名：${book.bookName}`,
                `作者：${book.author}`,
                `出版社：${book.publisher}`,
                `ISBN：${book.isbn}`,
                `书籍原价：${money(book.originalPrice)}`,
                `郑大教材价：${money(book.realPrice)}`,
                `在郑大教材买了吗？：${book.purchased}`
            ].join('\n'))
            .join('\n\n');
    }

    function makeTSV(books) {
        return [
            [
                '课程名',
                '书名',
                '作者',
                '出版社',
                'ISBN',
                '书籍原价',
                '折扣',
                '郑大教材价',
                '是否购买'
            ],

            ...books.map(book => [
                book.courseName,
                book.bookName,
                book.author,
                book.publisher,
                book.isbn,
                money(book.originalPrice),
                formatDiscount(book.discount),
                money(book.realPrice),
                book.purchased
            ])

        ].map(row => row.join('\t'))
         .join('\n');
    }

    // ============================================================
    // GUI
    // ============================================================

    function showResult(books) {
        document
            .querySelector('#zzu-book-parser-modal')
            ?.remove();

        const modal =
            document.createElement('div');

        modal.id =
            'zzu-book-parser-modal';

        modal.innerHTML = `
            <div class="zzu-mask"></div>

            <div class="zzu-dialog">

                <div class="zzu-header">

                    <div>
                        <div class="zzu-title">
                            ZZU书单解析器
                        </div>

                        <div class="zzu-subtitle">
                            从郑大教材系统中提取到
                            ${books.length}
                            本教材
                        </div>
                    </div>

                    <button
                        type="button"
                        class="zzu-close"
                    >
                        ×
                    </button>

                </div>

                <div class="zzu-notice">

                    <div class="zzu-notice-icon">
                        💡
                    </div>

                    <div>

                        <strong>
                            教材购买提示
                        </strong>

                        <div>
                            下边这些是从“郑大教材”系统中提取到的教材订购信息，
                            你当然可以选择某东、某宝、某多多、孔夫子网等地方购买你的教材。
                            书号已经给你了，把 ISBN 书号复制到那些平台的搜索框里查找即可。
                        </div>

                    </div>

                </div>

                <div class="zzu-toolbar">

                    <span>
                        共
                        <strong>${books.length}</strong>
                        本
                    </span>

                    <div>
                        <button
                            id="zzu-copy-all-isbn"
                            class="zzu-tool-btn"
                        >
                           复制全部 ISBN
                        </button>

                        <button
                            id="zzu-copy-list"
                            class="zzu-tool-btn"
                        >
                            复制完整书单
                        </button>

                        <button
                            id="zzu-copy-excel"
                            class="zzu-tool-btn"
                        >
                            复制到 Excel
                        </button>
                    </div>

                </div>

                <div class="zzu-books">

                    ${books.map((book, index) => `
                        <div class="zzu-book">

                            <div class="zzu-index">
                                ${index + 1}
                            </div>

                            <div class="zzu-book-main">

                                <div class="zzu-book-top">

                                    <div>

                                        <div class="zzu-course">
                                            ${escapeHTML(book.courseName)}
                                        </div>

                                        <div class="zzu-book-name">
                                            ${escapeHTML(book.bookName)}
                                        </div>

                                    </div>

                                    <span class="
                                        zzu-state
                                        ${
                                            book.purchased === '是'
                                                ? 'yes'
                                                : 'no'
                                        }
                                    ">
                                        ${
                                            book.purchased === '是'
                                                ? '已选购'
                                                : '未选购'
                                        }
                                    </span>

                                </div>

                                <div class="zzu-info">

                                    <div>
                                        <label>作者</label>
                                        ${escapeHTML(book.author || '-')}
                                    </div>

                                    <div>
                                        <label>出版社</label>
                                        ${escapeHTML(book.publisher || '-')}
                                    </div>

                                    <div>
                                        <label>版本</label>
                                        ${
                                            book.edition
                                                ? escapeHTML(book.edition) + '版'
                                                : '-'
                                        }
                                    </div>

                                    <div>
                                        <label>折扣</label>
                                        ${formatDiscount(book.discount)}
                                    </div>

                                </div>

                                <div class="zzu-isbn-box">

                                    <div>
                                        <label>ISBN</label>

                                        <code>
                                            ${escapeHTML(book.isbn || '暂无')}
                                        </code>
                                    </div>

                                    ${
                                        book.isbn
                                            ? `
                                                <button
                                                    type="button"
                                                    class="zzu-copy-isbn"
                                                    data-isbn="${escapeHTML(book.isbn)}"
                                                >
                                                    📋 复制 ISBN
                                                </button>
                                            `
                                            : ''
                                    }

                                </div>

                                <div class="zzu-price">

                                    <span>
                                        原价
                                        <del>
                                            ${money(book.originalPrice)}
                                        </del>
                                    </span>

                                    <span class="zzu-price-arrow">
                                        →
                                    </span>

                                    <span>
                                        郑大教材价
                                        <strong>
                                            ${money(book.realPrice)}
                                        </strong>
                                    </span>

                                </div>

                            </div>

                        </div>
                    `).join('')}

                </div>

            </div>
        `;

        document.body.appendChild(modal);

        const style =
            document.createElement('style');

        style.textContent = `

            #zzu-book-parser-modal {
                position: fixed;
                inset: 0;
                z-index: 2147483647;

                font-family:
                    -apple-system,
                    BlinkMacSystemFont,
                    "Segoe UI",
                    "Microsoft YaHei",
                    sans-serif;

                color: #262626;
            }

            #zzu-book-parser-modal * {
                box-sizing: border-box;
            }

            #zzu-book-parser-modal .zzu-mask {
                position: absolute;
                inset: 0;

                background:
                    rgba(0, 0, 0, .5);

                backdrop-filter:
                    blur(3px);
            }

            #zzu-book-parser-modal .zzu-dialog {
                position: absolute;

                left: 50%;
                top: 50%;

                transform:
                    translate(-50%, -50%);

                width:
                    min(1050px, 94vw);

                max-height: 91vh;

                display: flex;
                flex-direction: column;

                overflow: hidden;

                border-radius: 15px;

                background:
                    #f6f7f9;

                box-shadow:
                    0 20px 60px
                    rgba(0, 0, 0, .3);
            }

            #zzu-book-parser-modal .zzu-header {
                padding:
                    18px 22px;

                display: flex;

                justify-content:
                    space-between;

                align-items:
                    center;

                background: white;

                border-bottom:
                    1px solid #eee;
            }

            #zzu-book-parser-modal .zzu-title {
                font-size: 20px;
                font-weight: 700;
            }

            #zzu-book-parser-modal .zzu-subtitle {
                margin-top: 4px;

                font-size: 12px;

                color: #999;
            }

            #zzu-book-parser-modal .zzu-close {
                width: 40px;
                height: 40px;

                border: 0;

                border-radius: 8px;

                background: transparent;

                font-size: 28px;

                cursor: pointer;
            }

            #zzu-book-parser-modal .zzu-close:hover {
                background: #eee;
            }

            #zzu-book-parser-modal .zzu-notice {
                margin:
                    15px 18px 8px;

                padding:
                    13px 15px;

                display: flex;

                gap: 10px;

                border:
                    1px solid #ffe58f;

                border-radius: 9px;

                background:
                    #fffbe6;

                font-size: 14px;

                line-height: 1.7;
            }

            #zzu-book-parser-modal .zzu-notice-icon {
                font-size: 18px;
            }

            #zzu-book-parser-modal .zzu-toolbar {
                padding:
                    8px 18px 13px;

                display: flex;

                justify-content:
                    space-between;

                align-items:
                    center;

                gap: 10px;

                font-size: 13px;
            }

            #zzu-book-parser-modal .zzu-tool-btn {
                padding:
                    7px 11px;

                margin-left: 6px;

                border:
                    1px solid #ddd;

                border-radius: 6px;

                background: white;

                cursor: pointer;
            }

            #zzu-book-parser-modal .zzu-tool-btn:hover {
                border-color:
                    #1677ff;

                color:
                    #1677ff;
            }

            #zzu-book-parser-modal .zzu-books {
                flex: 1;

                min-height: 0;

                overflow-y: auto;

                padding:
                    0 18px 18px;
            }

            #zzu-book-parser-modal .zzu-book {
                display: flex;

                gap: 14px;

                margin-bottom:
                    11px;

                padding:
                    17px;

                border:
                    1px solid #eee;

                border-radius:
                    11px;

                background: white;
            }

            #zzu-book-parser-modal .zzu-index {
                flex-shrink: 0;

                width: 29px;
                height: 29px;

                display: flex;

                justify-content:
                    center;

                align-items:
                    center;

                border-radius: 50%;

                background:
                    #e6f4ff;

                color:
                    #1677ff;

                font-size: 12px;

                font-weight: 700;
            }

            #zzu-book-parser-modal .zzu-book-main {
                flex: 1;
                min-width: 0;
            }

            #zzu-book-parser-modal .zzu-book-top {
                display: flex;

                justify-content:
                    space-between;

                gap: 15px;
            }

            #zzu-book-parser-modal .zzu-course {
                margin-bottom: 3px;

                font-size: 12px;

                color: #999;
            }

            #zzu-book-parser-modal .zzu-book-name {
                font-size: 17px;

                font-weight: 700;
            }

            #zzu-book-parser-modal .zzu-state {
                height: max-content;

                padding: 4px 9px;

                border-radius:
                    100px;

                font-size: 11px;

                font-weight: 600;
            }

            #zzu-book-parser-modal .zzu-state.no {
                color: #cf1322;

                background:
                    #fff1f0;

                border:
                    1px solid #ffa39e;
            }

            #zzu-book-parser-modal .zzu-state.yes {
                color: #389e0d;

                background:
                    #f6ffed;

                border:
                    1px solid #b7eb8f;
            }

            #zzu-book-parser-modal .zzu-info {
                display: grid;

                grid-template-columns:
                    repeat(2, 1fr);

                gap:
                    7px 18px;

                margin-top:
                    13px;

                font-size:
                    13px;
            }

            #zzu-book-parser-modal label {
                display: inline-block;

                min-width: 53px;

                margin-right:
                    8px;

                color: #999;
            }

            #zzu-book-parser-modal .zzu-isbn-box {
                margin-top:
                    13px;

                padding:
                    9px 11px;

                display: flex;

                justify-content:
                    space-between;

                align-items:
                    center;

                background:
                    #f7f9fc;

                border-radius:
                    7px;
            }

            #zzu-book-parser-modal code {
                font-size: 15px;

                font-weight: 700;

                color: #222;
            }

            #zzu-book-parser-modal .zzu-copy-isbn {
                min-width:
                    108px;

                height:
                    34px;

                border:
                    1px solid #1677ff;

                border-radius:
                    6px;

                background:
                    white;

                color:
                    #1677ff;

                cursor: pointer;
            }

            #zzu-book-parser-modal .zzu-copy-isbn:hover {
                background:
                    #1677ff;

                color: white;
            }

            #zzu-book-parser-modal .zzu-copy-isbn.copied {
                border-color:
                    #52c41a;

                background:
                    #f6ffed;

                color:
                    #389e0d;
            }

            #zzu-book-parser-modal .zzu-price {
                margin-top:
                    12px;

                padding-top:
                    11px;

                display: flex;

                align-items:
                    center;

                gap: 16px;

                border-top:
                    1px dashed #eee;

                color: #888;

                font-size:
                    13px;
            }

            #zzu-book-parser-modal .zzu-price strong {
                margin-left:
                    5px;

                color:
                    #f5222d;

                font-size:
                    18px;
            }

            #zzu-book-parser-modal .zzu-price-arrow {
                color: #bbb;
            }

            @media (max-width: 700px) {

                #zzu-book-parser-modal .zzu-info {
                    grid-template-columns:
                        1fr;
                }

                #zzu-book-parser-modal .zzu-toolbar {
                    flex-direction:
                        column;

                    align-items:
                        flex-start;
                }

                #zzu-book-parser-modal .zzu-tool-btn {
                    margin:
                        3px 3px 0 0;
                }

                #zzu-book-parser-modal .zzu-isbn-box {
                    flex-direction:
                        column;

                    align-items:
                        stretch;

                    gap:
                        8px;
                }

                #zzu-book-parser-modal .zzu-copy-isbn {
                    width: 100%;
                }

            }

        `;

        document.head.appendChild(style);

        const close = () => {
            modal.remove();
            style.remove();
        };

        modal
            .querySelector('.zzu-close')
            .addEventListener(
                'click',
                close
            );

        modal
            .querySelector('.zzu-mask')
            .addEventListener(
                'click',
                close
            );

        // 单个 ISBN
        modal
            .querySelectorAll('.zzu-copy-isbn')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        copyText(
                            button.dataset.isbn
                        );

                        button.textContent =
                            '✓ 已复制';

                        button.classList.add(
                            'copied'
                        );

                        setTimeout(() => {
                            button.textContent =
                                '复制 ISBN';

                            button.classList.remove(
                                'copied'
                            );
                        }, 1200);
                    }
                );

            });

        // 全部 ISBN
        modal
            .querySelector('#zzu-copy-all-isbn')
            .addEventListener(
                'click',
                event => {

                    const text = books
                        .map(book => book.isbn)
                        .filter(Boolean)
                        .join('\n');

                    copyText(text);

                    flashButton(
                        event.currentTarget,
                        '✓ 已复制全部 ISBN'
                    );
                }
            );

        // 完整书单
        modal
            .querySelector('#zzu-copy-list')
            .addEventListener(
                'click',
                event => {

                    copyText(
                        makeText(books)
                    );

                    flashButton(
                        event.currentTarget,
                        '✓ 已复制'
                    );
                }
            );

        // Excel
        modal
            .querySelector('#zzu-copy-excel')
            .addEventListener(
                'click',
                event => {

                    copyText(
                        makeTSV(books)
                    );

                    flashButton(
                        event.currentTarget,
                        '✓ 已复制'
                    );
                }
            );
    }

    function flashButton(button, text) {
        const old =
            button.textContent;

        button.textContent =
            text;

        setTimeout(() => {
            button.textContent =
                old;
        }, 1300);
    }

    // ============================================================
    // 主入口
    // ============================================================

    async function runParser() {
        const button =
            document.querySelector(
                '#zzu-book-parser-btn'
            );

        try {
            if (button) {
                button.disabled = true;
                button.textContent =
                    '正在获取书单...';
            }

            // 再扫描一次
            scanPerformance();
            scanStorage();

            let token =
                getSavedToken();

            if (!token) {
                token = prompt(
                    '暂时还没有捕获到登录 Token。\n\n' +
                    '请先在郑大教材网站中进入教材相关页面，' +
                    '让网站加载一次教材信息，然后再点击解析。\n\n' +
                    '也可以直接在这里粘贴 Token 或包含 token=xxx 的完整接口地址：'
                );

                if (!token) {
                    return;
                }

                const urlToken =
                    extractToken(token);

                if (urlToken) {
                    token =
                        urlToken;
                }

                token =
                    token.trim();

                saveToken(
                    token,
                    '手动输入'
                );
            }

            const json =
                await requestBookList(token);

            const books =
                parseBooks(json);

            console.log(
                '[郑大教材解析器] 原始响应',
                json
            );

            console.table(books);

            if (!books.length) {
                alert(
                    '接口请求成功，但没有找到教材信息。'
                );

                return;
            }

            showResult(books);

        } catch (e) {

            console.error(
                '[郑大教材解析器]',
                e
            );

            alert(
                '解析失败：\n' +
                (e?.message || e)
            );

        } finally {

            if (button) {
                button.disabled = false;

                updateButtonState();
            }

        }
    }

    // ============================================================
    // 页面按钮
    // ============================================================

    function updateButtonState() {
        const button =
            document.querySelector(
                '#zzu-book-parser-btn'
            );

        if (!button) return;

        if (getSavedToken()) {
            button.textContent =
                '查看教材书单';

            button.title =
                '已Get登录 Token';
        } else {
            button.textContent =
                '获取教材书单';

            button.title =
                '等待登录 Token';
        }
    }

    function createButton() {
        if (
            document.querySelector(
                '#zzu-book-parser-btn'
            )
        ) {
            return;
        }

        const button =
            document.createElement(
                'button'
            );

        button.id =
            'zzu-book-parser-btn';

        Object.assign(
            button.style,
            {
                position:
                    'fixed',

                right:
                    '22px',

                bottom:
                    '22px',

                zIndex:
                    '2147483646',

                padding:
                    '11px 18px',

                border:
                    'none',

                borderRadius:
                    '9px',

                background:
                    '#1677ff',

                color:
                    '#fff',

                fontSize:
                    '14px',

                fontWeight:
                    '600',

                boxShadow:
                    '0 5px 18px rgba(22,119,255,.3)',

                cursor:
                    'pointer'
            }
        );

        button.addEventListener(
            'click',
            runParser
        );

        document.body.appendChild(
            button
        );

        updateButtonState();
    }

    // ============================================================
    // 启动监听
    // ============================================================

    hookFetch();
    hookXHR();
    observePerformance();

    // 页面脚本执行过程中持续补扫
    const scanTimer =
        setInterval(() => {

            scanPerformance();
            scanStorage();

        }, 2000);

    // 30 秒后无需一直扫描
    setTimeout(() => {
        clearInterval(scanTimer);
    }, 30000);

    function initGUI() {
        if (!document.body) {
            setTimeout(
                initGUI,
                100
            );

            return;
        }

        scanPerformance();
        scanStorage();
        createButton();
    }

    initGUI();

})();
