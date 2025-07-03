// --- Генератор судоку ---
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isSafe(grid, row, col, num) {
  for (let x = 0; x < 9; x++) if (grid[row][x] === num || grid[x][col] === num) return false;
  const startRow = row - row % 3, startCol = col - col % 3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (grid[startRow + r][startCol + c] === num) return false;
  return true;
}

function fillGrid(grid) {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        let nums = [1,2,3,4,5,6,7,8,9];
        shuffle(nums);
        for (let n of nums) {
          if (isSafe(grid, row, col, n)) {
            grid[row][col] = n;
            if (fillGrid(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function copyGrid(grid) {
  return grid.map(row => row.slice());
}

function countSolutions(grid) {
  let count = 0;
  function solve(g) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (g[row][col] === 0) {
          for (let n = 1; n <= 9; n++) {
            if (isSafe(g, row, col, n)) {
              g[row][col] = n;
              solve(g);
              g[row][col] = 0;
            }
          }
          return;
        }
      }
    }
    count++;
  }
  solve(copyGrid(grid));
  return count;
}

function generateSudoku(emptyCells = 40) {
  let grid = Array.from({length:9},()=>Array(9).fill(0));
  fillGrid(grid);
  let solution = copyGrid(grid);
  // Удаляем ровно emptyCells клеток, чтобы оставить только одну решаемую головоломку
  let removed = 0;
  while (removed < emptyCells) {
    let row = Math.floor(Math.random()*9);
    let col = Math.floor(Math.random()*9);
    if (grid[row][col] === 0) continue;
    let backup = grid[row][col];
    grid[row][col] = 0;
    let gridCopy = copyGrid(grid);
    if (countSolutions(gridCopy) === 1) {
      removed++;
    } else {
      grid[row][col] = backup;
    }
  }
  return { puzzle: grid, solution };
}

// --- Пример фиксированной головоломки (0 — пусто) ---
let puzzle = null;
let solution = null;

const difficultySelect = document.getElementById('difficulty');

function newRandomSudoku() {
  let emptyCells = 44;
  if (difficultySelect) {
    // Новые значения: Easy=36, Medium=44, Hard=52
    let val = parseInt(difficultySelect.value, 10);
    if (val === 36 || val === 44 || val === 52) emptyCells = val;
    else emptyCells = 44;
  }
  const generated = generateSudoku(emptyCells);
  puzzle = generated.puzzle;
  solution = generated.solution;
}

let board = [];
let prefilled = [];
let errors = 0;
const maxErrors = 3;
let selectedCell = null;

const boardDiv = document.getElementById('sudoku-board');
const newBtn = document.getElementById('new-btn');
const message = document.getElementById('sudoku-message');
const errorSpan = document.createElement('span');
errorSpan.id = 'error-count';
errorSpan.style.margin = '18px 0 0 0';
errorSpan.style.display = 'block';
errorSpan.style.fontSize = '1.2em';
errorSpan.style.fontWeight = 'bold';
errorSpan.style.color = '#d32f2f';
errorSpan.style.fontFamily = 'inherit';
document.getElementById('sudoku-ui').insertBefore(errorSpan, message);
const numpadDiv = document.getElementById('sudoku-numpad');

function initBoard() {
  newRandomSudoku();
  board = puzzle.map(row => row.slice());
  prefilled = puzzle.map(row => row.map(cell => cell !== 0));
  boardDiv.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      let cellClass = 'cell';
      if (prefilled[r][c]) cellClass += ' prefilled';
      if (r % 3 === 0) cellClass += ' block-top';
      if (c % 3 === 0) cellClass += ' block-left';
      if (r === 8) cellClass += ' block-bottom';
      if (c === 8) cellClass += ' block-right';
      input.className = cellClass;
      input.value = board[r][c] ? board[r][c] : '';
      input.readOnly = true;
      input.dataset.r = r;
      input.dataset.c = c;
      input.addEventListener('mousedown', selectCell);
      input.addEventListener('touchstart', selectCell);
      boardDiv.appendChild(input);
    }
  }
  message.textContent = '';
  errors = 0;
  updateErrors();
  renderNumpad();
  selectedCell = null;
  // Скрыть WIN! overlay при старте
  const winOverlay = document.getElementById('win-overlay');
  if (winOverlay) winOverlay.style.display = 'none';
  // --- Сброс лимита подсказок и обработчик ---
  let hintsLeft = 3;
  const hintBtn = document.getElementById('hint-btn');
  const hintSup = document.getElementById('hint-sup');
  if (hintBtn && hintSup) {
    hintBtn.disabled = false;
    hintBtn.style.opacity = '1';
    hintSup.textContent = '3';
    hintBtn.onclick = () => {
      if (hintsLeft <= 0) return;
      // Найти все пустые клетки
      let empty = [];
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        if (!prefilled[r][c] && !board[r][c]) empty.push([r, c]);
      }
      if (empty.length === 0) return;
      // Случайная пустая клетка
      let [r, c] = empty[Math.floor(Math.random() * empty.length)];
      board[r][c] = solution[r][c];
      // Визуально подсветить на 1 сек
      const cells = boardDiv.querySelectorAll('.cell');
      const idx = r * 9 + c;
      cells[idx].classList.add('hinted');
      setTimeout(() => cells[idx].classList.remove('hinted'), 1000);
      cells[idx].value = solution[r][c];
      cells[idx].classList.add('filled');
      renderNumpad();
      // Лимит подсказок
      hintsLeft--;
      hintSup.textContent = hintsLeft;
      if (hintsLeft <= 0) {
        hintBtn.disabled = true;
        hintBtn.style.opacity = '0.5';
      } else {
        // Блокируем кнопку на 1.5 сек
        hintBtn.disabled = true;
        hintBtn.style.opacity = '0.5';
        setTimeout(() => { hintBtn.disabled = false; hintBtn.style.opacity = '1'; }, 1500);
      }
    };
  }
}

function renderNumpad() {
  numpadDiv.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    // Считаем количество уже расставленных n на поле
    let count = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board[r][c] === n) count++;
    if (count >= 9) {
      const btn = document.createElement('button');
      btn.textContent = '';
      btn.disabled = true;
      btn.style.width = '38px';
      btn.style.height = '38px';
      btn.style.background = '#e0f7fa';
      btn.style.border = '2px solid #00bcd4';
      btn.style.borderRadius = '8px';
      btn.style.cursor = 'default';
      btn.style.opacity = '0.5';
      numpadDiv.appendChild(btn);
      continue;
    }
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.style.width = '38px';
    btn.style.height = '38px';
    btn.style.fontSize = '1.2em';
    btn.style.background = '#e0f7fa';
    btn.style.color = '#0097a7';
    btn.style.border = '2px solid #00bcd4';
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';
    btn.onmousedown = btn.ontouchstart = (e) => {
      e.preventDefault();
      if (selectedCell && !selectedCell.disabled) {
        handleCellInput(selectedCell, n);
      }
      highlightSameNumbers(n);
    };
    numpadDiv.appendChild(btn);
  }
}

function highlightSameNumbers(num, bold = false) {
  const cells = boardDiv.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.classList.remove('highlight-num', 'highlight-bold');
    if (num && cell.value == num) {
      if (bold) cell.classList.add('highlight-bold');
      else cell.classList.add('highlight-num');
    }
  });
}

function handleCellInput(input, value) {
  const r = +input.dataset.r, c = +input.dataset.c;
  const correct = solution[r][c] === value;
  const winOverlay = document.getElementById('win-overlay');
  if (correct) {
    input.value = value;
    board[r][c] = value;
    input.classList.remove('error');
    input.classList.add('filled');
    input.classList.remove('selected');
    input.blur();
    selectedCell = null;
    renderNumpad(); // обновить numpad
    // Проверка на победу
    if (board.flat().every((v, i) => v === solution[Math.floor(i/9)][i%9] || prefilled[Math.floor(i/9)][i%9])) {
      if (winOverlay) winOverlay.style.display = 'flex';
      errors = 0;
      updateErrors();
      setTimeout(()=>{
        if (winOverlay) winOverlay.style.display = 'none';
        initBoard();
      }, 2000);
    }
  } else {
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 1000);
    errors++;
    updateErrors();
    // Не показывать сообщение об ошибке, если уже WIN! или Game Over
    if (winOverlay && winOverlay.style.display === 'flex') return;
    if (message.textContent && message.textContent.startsWith('Game Over')) return;
    if (errors >= maxErrors) {
      message.textContent = 'Game Over! Too many mistakes. New game...';
      message.style.color = '#d32f2f';
      message.style.fontWeight = 'bold';
      message.style.fontSize = '1.3em';
      message.style.fontFamily = 'inherit';
      message.style.textAlign = 'center';
      setTimeout(()=>{
        errors = 0;
        updateErrors();
        if (winOverlay) winOverlay.style.display = 'none';
        message.textContent = '';
        initBoard();
      }, 2000);
    } else {
      message.textContent = 'Mistake!';
      message.style.color = '#d32f2f';
      message.style.fontWeight = 'bold';
      message.style.fontSize = '1.3em';
      message.style.fontFamily = 'inherit';
      message.style.textAlign = 'center';
      setTimeout(()=>{ message.textContent = ''; }, 1200);
    }
  }
}

function selectCell(e) {
  if (selectedCell) selectedCell.classList.remove('selected');
  const input = e.target;
  // Всегда выделяем строку, столбец и блок
  highlightRowCol(+input.dataset.r, +input.dataset.c);
  highlightBlock(+input.dataset.r, +input.dataset.c);
  // Если prefilled — только выделяем такие же цифры жирным, не выделяем саму клетку
  if (input.classList.contains('prefilled') && input.value) {
    highlightSameNumbers(+input.value, true);
    selectedCell = null;
  } else if (input.classList.contains('filled')) {
    // Если пользователь уже заполнил клетку, не выделяем её
    highlightSameNumbers(+input.value, true);
    selectedCell = null;
  } else {
    selectedCell = input;
    if (!input.classList.contains('filled') && !input.classList.contains('prefilled')) {
      input.classList.add('selected');
    }
    highlightSameNumbers(null, false);
  }
}

function highlightRowCol(row, col) {
  const cells = boardDiv.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.classList.remove('highlight-row','highlight-col');
    if (row >= 0 && +cell.dataset.r === row) cell.classList.add('highlight-row');
    if (col >= 0 && +cell.dataset.c === col) cell.classList.add('highlight-col');
  });
}

function highlightBlock(row, col) {
  const cells = boardDiv.querySelectorAll('.cell');
  let blockRow = Math.floor(row/3)*3;
  let blockCol = Math.floor(col/3)*3;
  cells.forEach(cell => {
    cell.classList.remove('highlight-block');
    const r = +cell.dataset.r, c = +cell.dataset.c;
    if (row >= 0 && col >= 0 && r >= blockRow && r < blockRow+3 && c >= blockCol && c < blockCol+3) {
      cell.classList.add('highlight-block');
    }
  });
}

function updateErrors() {
    errorSpan.textContent = `Mistakes: ${errors}/${maxErrors}`;
}

newBtn.onclick = initBoard;

initBoard();

if (difficultySelect) {
  difficultySelect.onchange = () => {
    initBoard();
  };
}

// Добавляю стиль для .hinted
const style = document.createElement('style');
style.textContent = `.hinted { background: #fffde7 !important; border: 2px solid #ffb300 !important; transition: background 0.3s, border 0.3s; }`;
document.head.appendChild(style); 