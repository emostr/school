// Тема ставится до отрисовки, иначе светлая страница мигнёт тёмной.
// Отдельным файлом, а не встроенным скриптом: политика CSP встроенные запрещает.
try {
  if (localStorage.getItem('es-theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch (e) {
  // Приватный режим: остаётся тёмная тема по умолчанию.
}
