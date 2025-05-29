// ==UserScript==
// @name         AutoPilot
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Импорт карточек с лимитом, логированием, уведомлениями в Telegram, учётом успешных импортов и сбросом в 00:00 по МСК
// @author       KeepDistance
// @match        https://sellerpilot.ru/catalog-v2*
// @updateURL    https://github.com/KeepDistanceWW/AutoPilot/raw/refs/heads/main/script.user.js
// @downloadURL  https://github.com/KeepDistanceWW/AutoPilot/raw/refs/heads/main/script.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BLOCK_REPEAT_COUNT = 200;
  const IMPORTS_PER_BLOCK = 5;
  const LONG_PAUSE_MS = 2 * 60 * 1000;
  const MIN_DELAY = 400;
  const MAX_DELAY = 800;
  const MAX_IMPORTS_PER_DAY = 1000;
  const NOTIFY_AT = [250, 500, 750, 1000];

  const MAX_LENGTH = 50;
  const MAX_WIDTH = 50;
  const MAX_HEIGHT = 50;
  const MAX_WEIGHT = 10;

  let stopScript = false;

  const delay = ms => new Promise(res => setTimeout(res, ms));
  const humanDelay = () => delay(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));

  function getImportButtons() {
    return Array.from(document.querySelectorAll('vaadin-button[theme~="icon"]'));
  }

  function getValueFromModalField(labelText) {
    const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes(labelText));
    if (!label) return 0;
    const inputId = label.getAttribute('for');
    const input = inputId ? document.getElementById(inputId) : null;
    return input ? parseFloat(input.value.replace(',', '.')) || 0 : 0;
  }

  function getDimensionsFromModal() {
    return {
      length: getValueFromModalField('Длина'),
      width: getValueFromModalField('Ширина'),
      height: getValueFromModalField('Высота'),
      weight: getValueFromModalField('Вес'),
    };
  }

  function isWithinLimits({ length, width, height, weight }) {
    return length <= MAX_LENGTH && width <= MAX_WIDTH && height <= MAX_HEIGHT && weight <= MAX_WEIGHT;
  }

  function closeModal() {
    const overlay = document.querySelector('vaadin-dialog-overlay');
    if (overlay) {
      ['mousedown', 'mouseup', 'click'].forEach(evtName => {
        overlay.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true }));
      });
      console.log('❌ Импорт отменён');
    }
  }

  async function waitForModalToClose(timeoutMs = 10000) {
    const interval = 200;
    const maxTries = timeoutMs / interval;
    for (let i = 0; i < maxTries; i++) {
      const modal = document.querySelector('vaadin-dialog-overlay');
      if (!modal) return true;
      await delay(interval);
    }
    return false;
  }

  function clickNextPage() {
    const nextBtn = Array.from(document.querySelectorAll('vaadin-button'))
      .find(btn => btn.querySelector('vaadin-icon[icon="vaadin:angle-right"]'));
    if (nextBtn) nextBtn.click();
  }

  function clickPrevPage() {
    const prevBtn = Array.from(document.querySelectorAll('vaadin-button'))
      .find(btn => btn.querySelector('vaadin-icon[icon="vaadin:angle-left"]') && !btn.hasAttribute('disabled'));
    if (prevBtn) prevBtn.click();
  }

  function clearBrandField() {
    const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Бренд'));
    if (!label) return;
    const inputId = label.getAttribute('for');
    const input = inputId ? document.getElementById(inputId) : null;
    if (!input) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }

  function setDuplicates() {
    const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Дубликатов'));
    if (!label) return;
    const inputId = label.getAttribute('for');
    const input = inputId ? document.getElementById(inputId) : null;
    if (!input) return;
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }

  async function sendTelegramMessage(text) {
    const token = localStorage.getItem('tg_bot_token');
    const chatId = localStorage.getItem('tg_chat_id');
    if (!token || !chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    } catch (e) {
      console.error('Ошибка отправки в Telegram:', e);
    }
  }

  function resetDailyCounterIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    const lastDate = localStorage.getItem('last_import_date');
    if (lastDate !== today) {
      localStorage.setItem('successful_imports', '0');
      localStorage.setItem('last_import_date', today);
    }
  }

  async function askTelegramCredentials() {
    if (localStorage.getItem('tg_bot_token') && localStorage.getItem('tg_chat_id')) return;
    return new Promise(resolve => {
      const modal = document.createElement('div');
      Object.assign(modal.style, {
        position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999999,
      });
      const box = document.createElement('div');
      Object.assign(box.style, {
        backgroundColor: '#fff', padding: '20px', borderRadius: '8px', width: '320px',
        fontFamily: 'Arial, sans-serif', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', textAlign: 'center'
      });
      const tokenInput = document.createElement('input');
      const chatIdInput = document.createElement('input');
      tokenInput.placeholder = 'Bot Token';
      chatIdInput.placeholder = 'Chat ID';
      tokenInput.style.width = chatIdInput.style.width = '100%';
      tokenInput.style.marginBottom = chatIdInput.style.marginBottom = '15px';
      const btn = document.createElement('button');
      btn.textContent = 'Сохранить и начать';
      btn.onclick = () => {
        if (!tokenInput.value || !chatIdInput.value) return alert('Заполните оба поля');
        localStorage.setItem('tg_bot_token', tokenInput.value);
        localStorage.setItem('tg_chat_id', chatIdInput.value);
        modal.remove(); resolve();
      };
      box.append('Введите данные Telegram', document.createElement('br'), tokenInput, chatIdInput, btn);
      modal.appendChild(box);
      document.body.appendChild(modal);
    });
  }

  async function runAutomation() {
    resetDailyCounterIfNeeded();
    await sendTelegramMessage(`🚀 Скрипт запущен. Осталось импортов: ${MAX_IMPORTS_PER_DAY - getSuccessfulImports()}`);
    console.log('⏳ Ожидание 20 секунд перед запуском...');
    await delay(20000);

    for (let block = 0; block < BLOCK_REPEAT_COUNT; block++) {
      if (stopScript) break;
      console.log(`▶️ Блок ${block + 1}`);
      let importedThisBlock = 0;
      let btnIndex = 0;

      while (importedThisBlock < IMPORTS_PER_BLOCK) {
        const total = getSuccessfulImports();
        if (total >= MAX_IMPORTS_PER_DAY) {
          await sendTelegramMessage('✅ Достигнут дневной лимит в 1000 импортов. Скрипт завершает работу.');
          stopScript = true;
          break;
        }

        const buttons = getImportButtons();
        const button = buttons[btnIndex];
        if (!button) break;

        await delay(1000 + Math.random() * 200);
        button.click();
        await delay(1500);
        await humanDelay();

        const dims = getDimensionsFromModal();
        if (!isWithinLimits(dims)) {
          closeModal();
          await delay(1500);
          btnIndex++;
          continue;
        }

        clearBrandField();
        setDuplicates();

        const confirmBtn = Array.from(document.querySelectorAll('vaadin-button')).find(btn => btn.textContent.trim() === 'Импортировать');
        if (confirmBtn) {
          confirmBtn.click();
          const modalGone = await waitForModalToClose(1000);
          if (modalGone) {
            console.log(`✅ Импорт #${getSuccessfulImports() + 1} успешен`);
            incrementSuccessfulImports();
            const now = getSuccessfulImports();
            if (NOTIFY_AT.includes(now)) await sendTelegramMessage(`📦 Импортов выполнено: ${now}/1000`);
            importedThisBlock++;
          } else {
            console.log('❌ Ошибка при импорте');
            closeModal();
          }
        }
        await humanDelay();
        btnIndex++;
      }

      // Меняем страницы после каждого блока
      clickNextPage(); await delay(3000);
      clickPrevPage(); await delay(3000);

      console.log(`⏸️ Блок завершён. Пауза...`);
      await delay(LONG_PAUSE_MS);
    }

    if (!stopScript) await sendTelegramMessage('🏁 Скрипт завершил работу.');
  }

  function getSuccessfulImports() {
    return parseInt(localStorage.getItem('successful_imports') || '0');
  }

  function incrementSuccessfulImports() {
    const current = getSuccessfulImports();
    localStorage.setItem('successful_imports', (current + 1).toString());
  }

  window.addEventListener('beforeunload', () => {
    if (!stopScript) sendTelegramMessage('⚠️ Скрипт остановлен (страница перезагружена или закрыта). Запустите его вручную.');
  });

  window.addEventListener('load', async () => {
    await askTelegramCredentials();
    setTimeout(runAutomation, 200);
  });
})();

