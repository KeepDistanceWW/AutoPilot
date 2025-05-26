// ==UserScript==
// @name         AutoPilot с фильтром по габаритам и обновлением страниц
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Импорт карточек с фильтрацией габаритов и обновлением страницы каждые 3 блока импорта.
// @author       KeepDistance
// @match        https://sellerpilot.ru/catalog-v2*
// @updateURL    https://github.com/KeepDistanceWW/AutoPilot/raw/refs/heads/main/script.user.js
// @downloadURL  https://github.com/KeepDistanceWW/AutoPilot/raw/refs/heads/main/script.user.js
// @grant        none
// ==/UserScript==
///VLAD LOX
(function () {
  'use strict';

  const BLOCK_REPEAT_COUNT = 200;
  const IMPORTS_PER_BLOCK = 15;
  const LONG_PAUSE_MS = 2 * 60 * 1000;
  const MIN_DELAY = 400;
  const MAX_DELAY = 800;

  const MAX_LENGTH = 100;
  const MAX_WIDTH = 50;
  const MAX_HEIGHT = 40;
  const MAX_WEIGHT = 9.4;

  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  const humanDelay = () => delay(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));
  const getImportButtons = () => Array.from(document.querySelectorAll('vaadin-button[theme~="icon"]'));

  const getValueFromModalField = (labelText) => {
    const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes(labelText));
    if (!label) return 0;
    const inputId = label.getAttribute('for');
    const input = inputId ? document.getElementById(inputId) : null;
    return input ? parseFloat(input.value.replace(',', '.')) || 0 : 0;
  };

  const getDimensionsFromModal = () => {
    return {
      length: getValueFromModalField('Длина'),
      width: getValueFromModalField('Ширина'),
      height: getValueFromModalField('Высота'),
      weight: getValueFromModalField('Вес'),
    };
  };

  const isWithinLimits = ({ length, width, height, weight }) =>
    length <= MAX_LENGTH && width <= MAX_WIDTH && height <= MAX_HEIGHT && weight <= MAX_WEIGHT;

  const closeModal = () => {
    const overlay = document.querySelector('vaadin-dialog-overlay');
    if (overlay) {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      overlay.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      console.log('❌ Импорт отменён — модалка закрыта кликом в область');
    } else {
      console.warn('⚠️ Модальное окно не найдено');
    }
  };

  const clickNextPage = () => {
    const nextBtn = Array.from(document.querySelectorAll('vaadin-button'))
      .find(btn => btn.querySelector('vaadin-icon[icon="vaadin:angle-right"]'));
    if (nextBtn) {
      nextBtn.click();
      console.log('➡️ Перешли на следующую страницу');
    } else {
      console.warn('⛔ Кнопка "Следующая страница" не найдена');
    }
  };

  const clickPrevPage = () => {
    const prevBtn = Array.from(document.querySelectorAll('vaadin-button'))
      .find(btn => btn.querySelector('vaadin-icon[icon="vaadin:angle-left"]') && !btn.hasAttribute('disabled'));
    if (prevBtn) {
      prevBtn.click();
      console.log('⬅️ Вернулись на предыдущую страницу');
    } else {
      console.warn('⛔ Кнопка "Предыдущая страница" не найдена или отключена');
    }
  };

  async function runAutomation() {
    console.log('⏳ Ожидание 15 секунд перед запуском...');
    await delay(15000);

    for (let block = 0; block < BLOCK_REPEAT_COUNT; block++) {
      console.log(`▶️ Блок ${block + 1} из ${BLOCK_REPEAT_COUNT}`);

      let importedThisBlock = 0;
      let btnIndex = 0;

      while (importedThisBlock < IMPORTS_PER_BLOCK) {
        const buttons = getImportButtons();
        const button = buttons[btnIndex];
        if (!button) {
          console.warn(`⛔ Кнопка импорта #${btnIndex + 1} не найдена`);
          break;
        }

        // Рандомная задержка перед кликом
        const importDelay = 1000 + Math.random() * 2000;
        console.log(`⏳ Задержка перед импортом: ${Math.round(importDelay)} мс`);
        await delay(importDelay);

        button.click();
        console.log(`🖱️ Клик по кнопке импорта #${btnIndex + 1}`);
        await delay(1500); // время на открытие модального окна
        await humanDelay();

        const dims = getDimensionsFromModal();
        console.log(`📦 Габариты: Д=${dims.length}, Ш=${dims.width}, В=${dims.height}, Вес=${dims.weight}`);

        if (!isWithinLimits(dims)) {
          closeModal();
          await delay(1500); // время на закрытие
          btnIndex++;
          continue;
        }

        const confirmButtons = Array.from(document.querySelectorAll('vaadin-button'));
        const confirmBtn = confirmButtons.find(btn => btn.textContent.trim() === 'Импортировать');

        if (confirmBtn) {
          confirmBtn.click();
          console.log('✅ Импорт выполнен');
          importedThisBlock++;
          await delay(2000);
        } else {
          console.warn('⚠️ Кнопка "Импортировать" не найдена');
        }

        await humanDelay();
        btnIndex++;
      }

      // После каждого третьего блока обновляем карточки
      if ((block + 1) % 3 === 0) {
        console.log('🔄 Обновление карточек через переключение страниц...');
        clickNextPage();
        await delay(5000);
        clickPrevPage();
        await delay(5000);
      }

      console.log(`⏸️ Блок ${block + 1} завершён. Пауза 2 минуты...`);
      await delay(LONG_PAUSE_MS);
    }

    console.log(`🏁 Импорт завершён. Всего карточек: ${BLOCK_REPEAT_COUNT * IMPORTS_PER_BLOCK}`);
  }

  window.addEventListener('load', () => {
    setTimeout(runAutomation, 200);
  });
})();
