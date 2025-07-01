const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = 800, HEIGHT = 600, TILE_SIZE = 30;
const ROWS = Math.floor(HEIGHT / TILE_SIZE), COLS = Math.floor(WIDTH / TILE_SIZE);

const COLORS = {
    bg: "#1e1e1e",
    wall: "#888",
    player: "#0f0",
    enemy: "#f00",
    bullet: "#fff",
    boss: "#ff0",
    bonus_life: "#0cf",
    bonus_shield: "#ff0",
    bonus_speed: "#f80"
};

// Центрирование карты
const offsetX = Math.floor((canvas.width - COLS * TILE_SIZE) / 2);
const offsetY = Math.floor((canvas.height - ROWS * TILE_SIZE) / 2);

// Добавить глобальную переменную скорости пуль
const BULLET_SPEED = 0.08;

// --- Генерация лабиринта ---
function generateMaze() {
    const cellSize = 2;
    const mazeRows = Math.floor((ROWS - 1) / (cellSize + 1));
    const mazeCols = Math.floor((COLS - 1) / (cellSize + 1));
    let maze = Array.from({length: ROWS}, () => Array(COLS).fill(1));
    let visited = Array.from({length: mazeRows}, () => Array(mazeCols).fill(false));
    let stack = [];
    let startR = Math.floor(mazeRows / 2), startC = Math.floor(mazeCols / 2);
    stack.push([startR, startC]);
    visited[startR][startC] = true;
    // Открываем стартовую клетку
    for (let dr = 0; dr < cellSize; dr++) {
        for (let dc = 0; dc < cellSize; dc++) {
            maze[startR * (cellSize + 1) + 1 + dr][startC * (cellSize + 1) + 1 + dc] = 0;
        }
    }
    // DFS генерация
    while (stack.length > 0) {
        let [r, c] = stack[stack.length - 1];
        let neighbors = [];
        for (let [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            let nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < mazeRows && nc >= 0 && nc < mazeCols && !visited[nr][nc]) {
                neighbors.push([nr, nc, dr, dc]);
            }
        }
        if (neighbors.length > 0) {
            let [nr, nc, dr, dc] = neighbors[Math.floor(Math.random() * neighbors.length)];
            // Пробиваем проход шириной 2
            for (let i = 0; i < cellSize + 1; i++) {
                if (dr === 0) {
                    maze[r * (cellSize + 1) + 1 + i][Math.min(c, nc) * (cellSize + 1) + cellSize + 1] = 0;
                } else {
                    maze[Math.min(r, nr) * (cellSize + 1) + cellSize + 1][c * (cellSize + 1) + 1 + i] = 0;
                }
            }
            // Открываем новую клетку
            for (let dr2 = 0; dr2 < cellSize; dr2++) {
                for (let dc2 = 0; dc2 < cellSize; dc2++) {
                    maze[nr * (cellSize + 1) + 1 + dr2][nc * (cellSize + 1) + 1 + dc2] = 0;
                }
            }
            visited[nr][nc] = true;
            stack.push([nr, nc]);
        } else {
            stack.pop();
        }
    }
    // Стены по периметру
    for (let i = 0; i < COLS; i++) { maze[0][i] = 1; maze[ROWS-1][i] = 1; }
    for (let i = 0; i < ROWS; i++) { maze[i][0] = 1; maze[i][COLS-1] = 1; }
    // Центр для игрока — свободное пространство 3x3 клетки
    let cx = Math.floor(COLS/2), cy = Math.floor(ROWS/2);
    for (let y = cy-1; y <= cy+1; y++) {
        for (let x = cx-1; x <= cx+1; x++) {
            maze[y][x] = 0;
        }
    }
    return maze;
}

// --- Генерация пустой карты для босса ---
function generateBossMap() {
    let maze = Array.from({length: ROWS}, () => Array(COLS).fill(0));
    for (let i = 0; i < COLS; i++) { maze[0][i] = 1; maze[ROWS-1][i] = 1; }
    for (let i = 0; i < ROWS; i++) { maze[i][0] = 1; maze[i][COLS-1] = 1; }
    return maze;
}

let maze = generateMaze();

// --- Игрок ---
let player = {
    x: Math.floor(COLS/2),
    y: Math.floor(ROWS/2),
    dir: "up",
    speed: 1,
    lives: 10,
    shield: 0,
    speedBonus: 0,
    canShoot: true,
    shootCooldown: 0,
    moveCooldown: 0,
    animX: Math.floor(COLS/2),
    animY: Math.floor(COLS/2),
    targetX: Math.floor(COLS/2),
    targetY: Math.floor(COLS/2),
    isMoving: false
};

// --- Враги ---
function spawnEnemies(count, speed, shootFreq, smart) {
    let enemies = [];
    let attempts = 0;
    while (enemies.length < count && attempts < 1000) {
        let x = Math.floor(Math.random() * (COLS-2)) + 1;
        let y = Math.floor(Math.random() * (ROWS-2)) + 1;
        if (maze[y][x] !== 0) { attempts++; continue; }
        if (x === player.x && y === player.y) { attempts++; continue; }
        if (enemies.some(e => e.x === x && e.y === y)) { attempts++; continue; }
        enemies.push({
            x, y,
            dir: ["up","down","left","right"][Math.floor(Math.random()*4)],
            speed: speed,
            shootTimer: Math.floor(Math.random() * (shootFreq[1] - shootFreq[0])) + shootFreq[0],
            canShoot: true,
            moveCooldown: 0,
            smart: smart || 0
        });
    }
    return enemies;
}

// --- Бонусы ---
const BONUS_TYPES = ["life", "shield", "speed"];
function spawnBonus() {
    while (true) {
        let x = Math.floor(Math.random() * (COLS-2)) + 1;
        let y = Math.floor(Math.random() * (ROWS-2)) + 1;
        if (maze[y][x] === 0 && !(x === player.x && y === player.y)) {
            return {
                x, y,
                type: BONUS_TYPES[Math.floor(Math.random()*BONUS_TYPES.length)],
                timer: Date.now(),
                createdAt: Date.now()
            };
        }
    }
}

// --- Пули ---
function createBullet(x, y, dir, owner) {
    return { x, y, dir, owner, alive: true };
}

function moveBullet(bullet) {
    let dx = 0, dy = 0;
    if (bullet.dir === "up") dy = -BULLET_SPEED;
    if (bullet.dir === "down") dy = BULLET_SPEED;
    if (bullet.dir === "left") dx = -BULLET_SPEED;
    if (bullet.dir === "right") dx = BULLET_SPEED;
    if (bullet.dir === "upleft") { dx = -BULLET_SPEED; dy = -BULLET_SPEED; }
    if (bullet.dir === "upright") { dx = BULLET_SPEED; dy = -BULLET_SPEED; }
    if (bullet.dir === "downleft") { dx = -BULLET_SPEED; dy = BULLET_SPEED; }
    if (bullet.dir === "downright") { dx = BULLET_SPEED; dy = BULLET_SPEED; }
    bullet.x += dx;
    bullet.y += dy;
    // Столкновение со стеной
    if (
        bullet.x < 0 || bullet.x >= COLS ||
        bullet.y < 0 || bullet.y >= ROWS ||
        maze[Math.floor(bullet.y)] && maze[Math.floor(bullet.y)][Math.floor(bullet.x)] === 1
    ) {
        bullet.alive = false;
    }
}

// --- Баланс уровней ---
const LEVELS = [
    { enemyCount: 3, enemySpeed: 1, shootFreq: [60, 180], smart: 0.1 }, // 1 лвл
    { enemyCount: 3, enemySpeed: 1.05, shootFreq: [54, 162], smart: 0.2 }, // 2 лвл
    { enemyCount: 3, enemySpeed: 1.1, shootFreq: [49, 146], smart: 0.3 }, // 3 лвл
    { enemyCount: 4, enemySpeed: 1.15, shootFreq: [44, 131], smart: 0.4 }, // 4 лвл
    { enemyCount: 5, enemySpeed: 1.2, shootFreq: [40, 118], smart: 0.5 }, // 5 лвл
    { boss: true, bossLives: 100, bossSpeed: 1, shootFreq: [30, 80] } // 6 лвл
];
let currentLevel = 0;

// --- Состояния ---
let enemies = [];
let bullets = [];
let enemyBullets = [];
let bonuses = [];
let boss = null;
let bossLives = 0;
let bossShootTimer = 0;
let bonusTimer = Date.now();
let bonusInterval = 10000;
let bonusDuration = 6000;
let gameState = "play"; // play, win, lose, pause, nextlevel

// Таймеры бонусов
let shieldTimer = 0;
let speedTimer = 0;

// Для плавного движения
let MOVE_FRAMES = 30; // в 2 раза медленнее
let moveFrame = 0;

// Базовые параметры врагов
const BASE_ENEMY_MOVE_COOLDOWN = 60;
const BASE_ENEMY_SMART_CHANCE = 0;
const BASE_ENEMY_COUNT = 3;
const BASE_ENEMY_SHOOT_INTERVAL = 100;

// --- Цвета фаз босса ---
const BOSS_PHASE_COLORS = ["#ff0", "#f00", "#800000"];
let bossPhase = 1;
let bossMinions = [];
let bossInvulnerable = false;
let bossSuperAttackCounter = 0;

function isSafeSpawn(x, y, enemies) {
    for (let enemy of enemies) {
        if (Math.abs(enemy.x - x) <= 2 && Math.abs(enemy.y - y) <= 2) {
            return false;
        }
    }
    return true;
}

function startLevel() {
    if (LEVELS[currentLevel].boss) {
        maze = generateBossMap();
        boss = {
            x: 2, y: 2,
            dir: "down",
            moveCooldown: 0,
            shootCooldown: 0,
            lives: 100
        };
        bossLives = 100;
        bossShootTimer = 0;
        enemies = [];
    } else {
        maze = generateMaze();
        let lvl = LEVELS[currentLevel];
        enemies = spawnEnemies(lvl.enemyCount, lvl.enemySpeed, lvl.shootFreq, lvl.smart);
    }
    // Найти безопасное место для игрока
    let safeX = Math.floor(COLS/2), safeY = Math.floor(ROWS/2);
    let found = false;
    for (let attempt = 0; attempt < 1000; attempt++) {
        let x = Math.floor(Math.random() * (COLS-4)) + 2;
        let y = Math.floor(Math.random() * (ROWS-4)) + 2;
        if (maze[y][x] === 0 && isSafeSpawn(x, y, enemies)) {
            safeX = x; safeY = y; found = true; break;
        }
    }
    player.x = safeX;
    player.y = safeY;
    player.animX = player.x;
    player.animY = player.y;
    player.targetX = player.x;
    player.targetY = player.y;
    player.dir = "up";
    player.shield = 0;
    player.speedBonus = 0;
    player.isMoving = false;
    player.canShoot = true;
    player.shootCooldown = 0;
    moveFrame = 0;
    bullets = [];
    enemyBullets = [];
    bonuses = [];
}

startLevel();

// --- Управление (плавное) ---
let keys = {left: false, right: false, up: false, down: false};
window.addEventListener('keydown', e => {
    if (gameState !== "play") return;
    if (e.key === "ArrowLeft") keys.left = true;
    if (e.key === "ArrowRight") keys.right = true;
    if (e.key === "ArrowUp") keys.up = true;
    if (e.key === "ArrowDown") keys.down = true;
    if (e.key === " ") {
        if (player.canShoot) {
            bullets.push(createBullet(player.x, player.y, player.dir, "player"));
            player.canShoot = false;
            player.shootCooldown = 10 - (player.speedBonus ? 5 : 0);
        }
    }
});
window.addEventListener('keyup', e => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
    if (e.key === "ArrowUp") keys.up = false;
    if (e.key === "ArrowDown") keys.down = false;
});

function canMoveTo(x, y, fromX = player.x, fromY = player.y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (maze[y][x] === 1) return false;
    if (Array.isArray(enemies) && enemies.some(e => (e.x === x && e.y === y) || (e.targetX === x && e.targetY === y))) return false;
    if (boss && boss.x !== undefined && x >= boss.x && x < boss.x+3 && y >= boss.y && y < boss.y+3) return false;
    if (bossMinions && bossMinions.some(m => m.x === x && m.y === y)) return false;
    if (Math.abs(x - fromX) === 1 && Math.abs(y - fromY) === 1) {
        if (maze[fromY][x] === 1 || maze[y][fromX] === 1) return false;
        if (Array.isArray(enemies) && enemies.some(e => (e.x === x && e.y === fromY) || (e.x === fromX && e.y === y))) return false;
        if ((player.x === x && player.y === fromY) || (player.x === fromX && player.y === y)) return false;
        if (boss && boss.x !== undefined && ((x >= boss.x && x < boss.x+3 && fromY >= boss.y && fromY < boss.y+3) || (fromX >= boss.x && fromX < boss.x+3 && y >= boss.y && y < boss.y+3))) return false;
    }
    if (typeof fromX !== 'undefined' && typeof fromY !== 'undefined' && (x !== player.x || y !== player.y)) {
        if (player.x === x && player.y === y) return false;
    }
    return true;
}

function updatePlayerMove() {
    let moveFrames = player.speedBonus ? 15 : 30;
    if (player.isMoving) {
        moveFrame++;
        player.animX += (player.targetX - player.animX) / (moveFrames - moveFrame + 1);
        player.animY += (player.targetY - player.animY) / (moveFrames - moveFrame + 1);
        if (moveFrame >= moveFrames) {
            player.animX = player.targetX;
            player.animY = player.targetY;
            player.x = player.targetX;
            player.y = player.targetY;
            player.isMoving = false;
            moveFrame = 0;
        }
        return;
    }
    let nx = player.x, ny = player.y, ndir = player.dir;
    let moved = false;
    if (keys.up) { ny = player.y-1; ndir = "up"; moved = true; }
    if (keys.down) { ny = player.y+1; ndir = "down"; moved = true; }
    if (keys.left) { nx = player.x-1; ndir = "left"; moved = true; }
    if (keys.right) { nx = player.x+1; ndir = "right"; moved = true; }
    if ((nx !== player.x || ny !== player.y) && canMoveTo(nx, ny, player.x, player.y)) {
        player.targetX = nx; player.targetY = ny; player.dir = ndir;
        player.isMoving = true;
        moveFrame = 0;
    } else if (moved) {
        player.dir = ndir;
    }
}

function canEnemyMoveTo(x, y, self) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (maze[y][x] === 1) return false;
    if (Array.isArray(enemies) && enemies.some(e => e !== self && e.x === x && e.y === y)) return false;
    if (player.x === x && player.y === y) return false;
    if (boss && boss.x !== undefined && x >= boss.x && x < boss.x+3 && y >= boss.y && y < boss.y+3) return false;
    if (Math.abs(x - self.x) === 1 && Math.abs(y - self.y) === 1) {
        if (maze[self.y][x] === 1 || maze[y][self.x] === 1) return false;
        if (Array.isArray(enemies) && enemies.some(e => e !== self && ((e.x === x && e.y === self.y) || (e.x === self.x && e.y === y)))) return false;
        if ((player.x === x && player.y === self.y) || (player.x === self.x && player.y === y)) return false;
        if (boss && boss.x !== undefined && ((x >= boss.x && x < boss.x+3 && self.y >= boss.y && self.y < boss.y+3) || (self.x >= boss.x && self.x < boss.x+3 && y >= boss.y && y < boss.y+3))) return false;
    }
    return true;
}

function smartEnemyDir(enemy, smartChance) {
    // 30% шанс стоять на месте
    if (Math.random() < 0.3) return null;
    // Вероятность идти к игроку зависит от уровня (макс 0.3)
    if (Math.random() < smartChance) {
        let dx = player.x - enemy.x;
        let dy = player.y - enemy.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? "right" : "left";
        } else if (dy !== 0) {
            return dy > 0 ? "down" : "up";
        }
    }
    return ["up","down","left","right"][Math.floor(Math.random()*4)];
}

// --- Игровой цикл ---
function gameLoop() {
    console.log('gameState:', gameState);
    console.log('player:', player);
    console.log('boss:', boss);
    // Центрирование canvas (на случай ресайза)
    const mapWidth = COLS * TILE_SIZE;
    const mapHeight = ROWS * TILE_SIZE;
    const offsetX = Math.floor((canvas.width - mapWidth) / 2);
    const offsetY = Math.floor((canvas.height - mapHeight) / 2);
    // --- Логика ---
    if (gameState === "play") {
        updatePlayerMove();
        // Кулдаун стрельбы игрока
        if (!player.canShoot) {
            player.shootCooldown--;
            if (player.shootCooldown <= 0) player.canShoot = true;
        }
        // Упрощённая логика босса: просто ездит случайно и стреляет
        if (boss) {
            // Определяем фазу босса
            let phase = 1;
            if (boss.lives <= 70 && boss.lives > 30) phase = 2;
            if (boss.lives <= 30) phase = 3;
            bossPhase = phase;
            // Скорости по фазам
            let moveCooldowns = [90, 60, 35];
            let shootIntervals = [500, 300, 150];
            if (boss.moveDirTimer === undefined || boss.moveDirTimer <= 0) {
                boss.dir = ["up","down","left","right"][Math.floor(Math.random()*4)];
                boss.moveDirTimer = 60 + Math.floor(Math.random()*60); // 2-3 секунды
            }
            boss.moveDirTimer--;
            if (boss.moveCooldown === undefined) boss.moveCooldown = 0;
            boss.moveCooldown--;
            if (boss.moveCooldown <= 0) {
                let bx = boss.x, by = boss.y;
                let canMove = (dx, dy) => {
                    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                        let nx = bx + dx + j, ny = by + dy + i;
                        if (nx < 1 || nx > COLS-4 || ny < 1 || ny > ROWS-4 || maze[ny][nx] === 1) return false;
                    }
                    return true;
                };
                if (boss.dir === "up" && canMove(0,-1)) boss.y--;
                if (boss.dir === "down" && canMove(0,1)) boss.y++;
                if (boss.dir === "left" && canMove(-1,0)) boss.x--;
                if (boss.dir === "right" && canMove(1,0)) boss.x++;
                boss.moveCooldown = moveCooldowns[phase-1];
            }
            if (boss.shootCooldown === undefined) boss.shootCooldown = 0;
            boss.shootCooldown--;
            let bossShootInterval = shootIntervals[phase-1];
            if (boss.shootCooldown <= 0) {
                bossSuperAttackCounter = (bossSuperAttackCounter || 0) + 1;
                let doSuper = bossSuperAttackCounter % 3 === 0;
                let superType = Math.floor(Math.random()*2); // 0: пулемёт, 1: супер-пуля
                boss.lastSuperAttack = Date.now();
                if (doSuper) {
                    if (superType === 0) {
                        // Пулемёт: залп 8 пуль
                        let dirs = ["up","down","left","right","upleft","upright","downleft","downright"];
                        for (let d of dirs) {
                            let dx = 0, dy = 0;
                            if (d.includes("up")) dy = -1;
                            if (d.includes("down")) dy = 1;
                            if (d.includes("left")) dx = -1;
                            if (d.includes("right")) dx = 1;
                            enemyBullets.push({x: boss.x+1, y: boss.y+1, dir: d, dx, dy, owner: "boss", alive: true, color: "#0ff"});
                        }
                    } else if (superType === 1) {
                        // Супер-пуля
                        let dx = player.x - (boss.x+1);
                        let dy = player.y - (boss.y+1);
                        let len = Math.sqrt(dx*dx + dy*dy);
                        dx = dx/len; dy = dy/len;
                        enemyBullets.push({x: boss.x+1, y: boss.y+1, dx, dy, dir: "super", owner: "boss", alive: true, color: "#fff", big: true});
                    }
                } else {
                    // Обычный выстрел
                    enemyBullets.push({x: boss.x+1, y: boss.y+1, dir: boss.dir, owner: "boss", alive: true, color: "#00f"});
                }
                boss.shootCooldown = bossShootInterval;
            }
            // Если есть миньоны, обновляем их и проверяем живы ли
            if (bossMinions && bossMinions.length > 0) {
                updateMinions();
            } else {
                bossInvulnerable = false;
            }
        } else {
            for (let enemyIdx = 0; enemyIdx < enemies.length; enemyIdx++) {
                let enemy = enemies[enemyIdx];
                if (enemy.moveCooldown === undefined) enemy.moveCooldown = 0;
                enemy.moveCooldown--;
                if (enemy.shootCooldown === undefined) enemy.shootCooldown = 0;
                enemy.shootCooldown--;
                if (enemy.moveCooldown <= 0) {
                    // Для первых 3 врагов — базовые параметры
                    let enemyMoveCooldown = BASE_ENEMY_MOVE_COOLDOWN;
                    let enemySmartChance = BASE_ENEMY_SMART_CHANCE;
                    let enemyShootInterval = BASE_ENEMY_SHOOT_INTERVAL;
                    // Для остальных и на последующих уровнях — +10% к скорости, интеллекту и стрельбе за уровень
                    if (enemyIdx >= BASE_ENEMY_COUNT || currentLevel > 0) {
                        let levelFactor = 1 + 0.1 * currentLevel;
                        enemyMoveCooldown = Math.max(Math.round(BASE_ENEMY_MOVE_COOLDOWN / levelFactor), 10);
                        enemySmartChance = Math.min(BASE_ENEMY_SMART_CHANCE + 0.1 * currentLevel, 0.7);
                        enemyShootInterval = Math.max(Math.round(BASE_ENEMY_SHOOT_INTERVAL / levelFactor), 2);
                    }
                    let dir = smartEnemyDir(enemy, enemy.smart);
                    if (dir) {
                        enemy.dir = dir;
                        let ex = enemy.x, ey = enemy.y;
                        let nx = ex, ny = ey;
                        if (enemy.dir === "up") ny--;
                        if (enemy.dir === "down") ny++;
                        if (enemy.dir === "left") nx--;
                        if (enemy.dir === "right") nx++;
                        if (canEnemyMoveTo(nx, ny, enemy)) {
                            enemy.x = nx; enemy.y = ny;
                        }
                    }
                    enemy.moveCooldown = enemyMoveCooldown;
                    // Стрельба врага с ограничением по частоте
                    if (enemy.shootCooldown <= 0) {
                        enemyBullets.push({x: enemy.x, y: enemy.y, dir: enemy.dir, owner: "enemy", alive: true, color: "#f00"});
                        enemy.shootCooldown = enemyShootInterval;
                        enemy.flash = 5;
                    }
                }
                if (enemy.flash) enemy.flash--;
            }
        }
        // Движение пуль
        for (let bullet of bullets) moveBullet(bullet);
        for (let bullet of enemyBullets) {
            if (bullet.dx !== undefined && bullet.dy !== undefined) {
                bullet.x += (bullet.dx || 0) * BULLET_SPEED;
                bullet.y += (bullet.dy || 0) * BULLET_SPEED;
                if (
                    bullet.x < 0 || bullet.x >= COLS ||
                    bullet.y < 0 || bullet.y >= ROWS ||
                    maze[Math.floor(bullet.y)] && maze[Math.floor(bullet.y)][Math.floor(bullet.x)] === 1
                ) bullet.alive = false;
                if (isNaN(bullet.x) || isNaN(bullet.y)) bullet.alive = false;
            } else {
                moveBullet(bullet);
            }
        }
        bullets = bullets.filter(b => b.alive);
        enemyBullets = enemyBullets.filter(b => b.alive);
        // Проверка попаданий
        for (let bullet of bullets) {
            // Враги
            for (let enemy of enemies) {
                if (Math.floor(bullet.x) === enemy.x && Math.floor(bullet.y) === enemy.y) {
                    enemy.x = -100; enemy.y = -100; // Удаляем врага
                    bullet.alive = false;
                }
            }
            // Миньоны босса
            for (let minion of bossMinions) {
                if (Math.floor(bullet.x) === minion.x && Math.floor(bullet.y) === minion.y) {
                    minion.alive = false;
                    bullet.alive = false;
                }
            }
            // Босс
            if (boss && !bossInvulnerable && isBulletHitBoss({x: Math.floor(bullet.x), y: Math.floor(bullet.y)}, boss)) {
                boss.lives--;
                bullet.alive = false;
                if (boss.lives <= 0) { boss = null; gameState = "win"; }
            }
        }
        enemies = enemies.filter(e => e.x >= 0 && e.y >= 0);
        // Пули врагов по игроку
        for (let bullet of enemyBullets) {
            if (bullet.dir === "super" && bullet.big && bullet.alive) {
                let px = player.x * TILE_SIZE + TILE_SIZE / 2 + offsetX;
                let py = player.y * TILE_SIZE + TILE_SIZE / 2 + offsetY;
                let bx = bullet.x * TILE_SIZE + TILE_SIZE / 2 + offsetX;
                let by = bullet.y * TILE_SIZE + TILE_SIZE / 2 + offsetY;
                let dist = Math.sqrt((px - bx) * (px - bx) + (py - by) * (py - by));
                let playerRadius = TILE_SIZE / 2;
                let bulletRadius = TILE_SIZE * 1.5;
                if (dist < playerRadius + bulletRadius) {
                    if (player.shield > 0) {
                        bullet.alive = false;
                    } else {
                        player.lives -= 2;
                        bullet.alive = false;
                        if (player.lives <= 0) gameState = "lose";
                    }
                }
            } else if (Math.floor(bullet.x) === player.x && Math.floor(bullet.y) === player.y && bullet.alive) {
                if (player.shield > 0) {
                    bullet.alive = false;
                } else {
                    player.lives--;
                    bullet.alive = false;
                    if (player.lives <= 0) gameState = "lose";
                }
            }
        }
        // Проверка столкновения с врагами/боссом
        for (let enemy of enemies) {
            if (enemy.x === player.x && enemy.y === player.y) {
                // Теперь ничего не происходит, столкновения невозможны
            }
        }
        if (boss && isPlayerHitByBoss(player, boss)) {
            // Теперь ничего не происходит, столкновения невозможны
        }
        // Бонусы
        let bonusAppearInterval = bonusInterval;
        if (boss) bonusAppearInterval = bonusInterval / 2;
        if (Date.now() - bonusTimer > bonusAppearInterval) {
            bonuses.push(spawnBonus());
            bonusTimer = Date.now();
        }
        for (let bonus of bonuses) {
            if (bonus.x === player.x && bonus.y === player.y) {
                if (bonus.type === "life") player.lives++;
                if (bonus.type === "shield") { player.shield = 1; shieldTimer = 600; }
                if (bonus.type === "speed") { player.speedBonus = 1; speedTimer = 600; }
                bonus.timer = 0;
            }
        }
        bonuses = bonuses.filter(b => (Date.now() - b.createdAt) < 12000 && b.timer > 0);
        // Победа/переход на уровень
        if (!boss && enemies.length === 0 && currentLevel < LEVELS.length-1 && gameState === "play") {
            currentLevel++;
            startLevel();
        }
        // Проверка эффектов бонусов
        if (player.shield) {
            shieldTimer--;
            if (shieldTimer <= 0) player.shield = 0;
        }
        if (player.speedBonus) {
            speedTimer--;
            if (speedTimer <= 0) player.speedBonus = 0;
        }
    }
    // --- Отрисовка ---
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Лабиринт
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (maze[y][x] === 1) {
                ctx.fillStyle = COLORS.wall;
                ctx.fillRect(x * TILE_SIZE + offsetX, y * TILE_SIZE + offsetY, TILE_SIZE, TILE_SIZE);
            }
        }
    }
    // Бонусы
    for (let bonus of bonuses) {
        if (bonus.type === "life") {
            // Красное сердечко
            ctx.save();
            ctx.translate(bonus.x * TILE_SIZE + TILE_SIZE/2 + offsetX, bonus.y * TILE_SIZE + TILE_SIZE/2 + offsetY);
            ctx.scale(0.7, 0.7);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(0, -10, -15, -10, -15, 0);
            ctx.bezierCurveTo(-15, 10, 0, 15, 0, 25);
            ctx.bezierCurveTo(0, 15, 15, 10, 15, 0);
            ctx.bezierCurveTo(15, -10, 0, -10, 0, 0);
            ctx.fillStyle = "#f00";
            ctx.fill();
            ctx.restore();
        } else if (bonus.type === "shield") {
            // Синий щит
            ctx.save();
            ctx.translate(bonus.x * TILE_SIZE + TILE_SIZE/2 + offsetX, bonus.y * TILE_SIZE + TILE_SIZE/2 + offsetY);
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(10, 0);
            ctx.lineTo(0, 15);
            ctx.lineTo(-10, 0);
            ctx.closePath();
            ctx.fillStyle = "#09f";
            ctx.fill();
            ctx.restore();
        } else if (bonus.type === "speed") {
            // Яркая зигзагообразная молния
            ctx.save();
            ctx.translate(bonus.x * TILE_SIZE + TILE_SIZE/2 + offsetX, bonus.y * TILE_SIZE + TILE_SIZE/2 + offsetY);
            ctx.strokeStyle = "#fa0";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-7, -10);
            ctx.lineTo(0, -2);
            ctx.lineTo(-4, 2);
            ctx.lineTo(4, 8);
            ctx.lineTo(0, 2);
            ctx.lineTo7, 10;
            ctx.stroke();
            ctx.restore();
        }
    }
    // Игрок
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(player.animX * TILE_SIZE + offsetX, player.animY * TILE_SIZE + offsetY, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    let cx = player.animX * TILE_SIZE + TILE_SIZE/2 + offsetX;
    let cy = player.animY * TILE_SIZE + TILE_SIZE/2 + offsetY;
    ctx.moveTo(cx, cy);
    if (player.dir === "up") ctx.lineTo(cx, cy - TILE_SIZE/2);
    if (player.dir === "down") ctx.lineTo(cx, cy + TILE_SIZE/2);
    if (player.dir === "left") ctx.lineTo(cx - TILE_SIZE/2, cy);
    if (player.dir === "right") ctx.lineTo(cx + TILE_SIZE/2, cy);
    ctx.stroke();
    // Враги
    for (let enemy of enemies) {
        ctx.fillStyle = COLORS.enemy;
        ctx.fillRect(enemy.x * TILE_SIZE + offsetX, enemy.y * TILE_SIZE + offsetY, TILE_SIZE, TILE_SIZE);
        // Дуло врага
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        let cx = enemy.x * TILE_SIZE + TILE_SIZE/2 + offsetX;
        let cy = enemy.y * TILE_SIZE + TILE_SIZE/2 + offsetY;
        ctx.moveTo(cx, cy);
        if (enemy.dir === "up") ctx.lineTo(cx, cy - TILE_SIZE/2);
        if (enemy.dir === "down") ctx.lineTo(cx, cy + TILE_SIZE/2);
        if (enemy.dir === "left") ctx.lineTo(cx - TILE_SIZE/2, cy);
        if (enemy.dir === "right") ctx.lineTo(cx + TILE_SIZE/2, cy);
        ctx.stroke();
        // Вспышка выстрела
        if (enemy.flash) {
            ctx.fillStyle = "#ff0";
            ctx.beginPath();
            ctx.arc(enemy.x * TILE_SIZE + TILE_SIZE/2 + offsetX, enemy.y * TILE_SIZE + TILE_SIZE/2 + offsetY, TILE_SIZE/2, 0, 2*Math.PI);
            ctx.fill();
        }
    }
    // Босс
    if (boss) {
        ctx.fillStyle = BOSS_PHASE_COLORS[bossPhase-1];
        ctx.fillRect((boss.x)*TILE_SIZE + offsetX, (boss.y)*TILE_SIZE + offsetY, TILE_SIZE*3, TILE_SIZE*3);
        ctx.fillStyle = "#000";
        ctx.font = "bold 24px Arial";
        ctx.fillText(boss.lives, (boss.x+1)*TILE_SIZE + offsetX + 5, (boss.y)*TILE_SIZE + offsetY + 30);
        // Фаза босса
        ctx.fillStyle = "#fff";
        ctx.font = "22px Arial";
        ctx.fillText("Boss phase: " + bossPhase, 40, 70);
    }
    // Миньоны босса
    for (let minion of bossMinions) {
        if (minion.alive) {
            ctx.fillStyle = "#f00";
            ctx.fillRect(minion.x*TILE_SIZE + offsetX, minion.y*TILE_SIZE + offsetY, TILE_SIZE, TILE_SIZE);
            // Дуло
            ctx.save();
            ctx.translate(minion.x*TILE_SIZE + offsetX + TILE_SIZE/2, minion.y*TILE_SIZE + offsetY + TILE_SIZE/2);
            let angle = 0;
            if (minion.dir === "up") angle = -Math.PI/2;
            if (minion.dir === "down") angle = Math.PI/2;
            if (minion.dir === "left") angle = Math.PI;
            if (minion.dir === "right") angle = 0;
            ctx.rotate(angle);
            ctx.fillStyle = "#fff";
            ctx.fillRect(-4, -TILE_SIZE/2, 8, TILE_SIZE/2);
            ctx.restore();
        }
    }
    // Пули
    for (let bullet of bullets) {
        ctx.fillStyle = COLORS.bullet;
        ctx.fillRect(bullet.x * TILE_SIZE + offsetX + TILE_SIZE/4, bullet.y * TILE_SIZE + offsetY + TILE_SIZE/4, TILE_SIZE/2, TILE_SIZE/2);
    }
    for (let bullet of enemyBullets) {
        if (bullet.big) {
            ctx.fillStyle = bullet.color || "#fa0";
            ctx.beginPath();
            ctx.arc(bullet.x * TILE_SIZE + offsetX + TILE_SIZE/2, bullet.y * TILE_SIZE + offsetY + TILE_SIZE/2, TILE_SIZE*1.5, 0, 2*Math.PI);
            ctx.fill();
        } else if (bullet.color) {
            ctx.fillStyle = bullet.color;
            ctx.fillRect(bullet.x * TILE_SIZE + offsetX + TILE_SIZE/4, bullet.y * TILE_SIZE + offsetY + TILE_SIZE/4, TILE_SIZE/2, TILE_SIZE/2);
        }
    }
    // UI
    ctx.fillStyle = "#fff";
    ctx.font = "22px Arial";
    ctx.fillText("Lives: " + player.lives, 10 + offsetX, 40 + offsetY);
    ctx.fillText("Level: " + (currentLevel+1), 10 + offsetX, 70 + offsetY);
    if (player.shield) ctx.fillText("Shield!", 10 + offsetX, 60 + offsetY);
    if (player.speedBonus) ctx.fillText("Speed!", 10 + offsetX, 80 + offsetY);
    // --- Жизни в виде сердечек ---
    drawHearts(ctx, 10 + offsetX, 30 + offsetY, Math.max(0, player.lives));
    // Полоска здоровья босса
    if (boss) {
        let barWidth = 400;
        let barHeight = 24;
        let barX = WIDTH/2 - barWidth/2;
        let barY = offsetY - 40;
        ctx.save();
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#ff4d6d';
        let percent = boss.lives / 100;
        ctx.fillRect(barX, barY, barWidth * percent, barHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('Boss HP', barX + barWidth/2, barY + barHeight - 6);
        ctx.textAlign = 'left';
        ctx.restore();
    }
    if (gameState === "win") {
        ctx.fillStyle = "rgba(30,30,30,0.8)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 64px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Victory!", WIDTH/2, HEIGHT/2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }
    if (gameState === "lose") {
        ctx.fillStyle = "rgba(30,30,30,0.8)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 64px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Defeat!", WIDTH/2, HEIGHT/2-40);
        ctx.font = "32px Arial";
        ctx.fillText("Restart", WIDTH/2, HEIGHT/2+40);
        ctx.fillText("Exit", WIDTH/2, HEIGHT/2+100);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }
    // UI: фаза босса и неуязвимость
    if (bossInvulnerable) {
        ctx.fillStyle = "#ff0";
        ctx.font = "bold 22px Arial";
        ctx.fillText("Boss is invulnerable while minions are alive!", 40, 100);
    }
    requestAnimationFrame(gameLoop);
}

// Проверка, находится ли игрок в квадрате 3x3, занимаемом боссом
function isPlayerHitByBoss(player, boss) {
    return (
        player.x >= boss.x && player.x < boss.x + 3 &&
        player.y >= boss.y && player.y < boss.y + 3
    );
}

// Проверка, попала ли пуля в квадрат 3x3, занимаемый боссом
function isBulletHitBoss(bullet, boss) {
    return (
        bullet.x >= boss.x && bullet.x < boss.x + 3 &&
        bullet.y >= boss.y && bullet.y < boss.y + 3
    );
}

// Миньоны как обычные враги с дулом и 1 жизнью
function updateMinions() {
    for (let minion of bossMinions) {
        if (!minion.alive) continue;
        // Движение
        if (!minion.moveCooldown || minion.moveCooldown-- <= 0) {
            let dirs = ["up","down","left","right"];
            // Двигается к игроку с вероятностью 0.3, иначе случайно
            let d;
            if (Math.random() < 0.3) {
                let dx = player.x - minion.x;
                let dy = player.y - minion.y;
                if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? "right" : "left";
                else d = dy > 0 ? "down" : "up";
            } else {
                d = dirs[Math.floor(Math.random()*4)];
            }
            let nx = minion.x, ny = minion.y;
            if (d === "up") ny--;
            if (d === "down") ny++;
            if (d === "left") nx--;
            if (d === "right") nx++;
            if (canMoveTo(nx, ny, minion.x, minion.y)) {
                minion.x = nx; minion.y = ny; minion.dir = d;
            }
            minion.moveCooldown = 30;
        }
        // Стрельба
        if (!minion.shootCooldown || minion.shootCooldown-- <= 0) {
            enemyBullets.push({x: minion.x, y: minion.y, dir: minion.dir, owner: "minion", alive: true, color: "#f00"});
            minion.shootCooldown = 60;
        }
    }
    bossMinions = bossMinions.filter(m => m.alive);
    if (bossMinions.length === 0) bossInvulnerable = false;
}

// Бонус скорости +100%
if (player.speedBonus) {
    MOVE_FRAMES = 15; // В 2 раза быстрее (если обычное значение 30)
} else {
    MOVE_FRAMES = 30;
}

// --- Жизни в виде сердечек ---
function drawHearts(ctx, x, y, count) {
    for (let i = 0; i < count; i++) {
        ctx.save();
        ctx.translate(x + i*32, y);
        ctx.scale(1.2, 1.2);
        ctx.beginPath();
        ctx.moveTo(8, 15);
        ctx.bezierCurveTo(8, 12, 0, 8, 8, 4);
        ctx.bezierCurveTo(16, 8, 8, 12, 8, 15);
        ctx.closePath();
        ctx.fillStyle = '#ff4d6d';
        ctx.fill();
        ctx.restore();
    }
}

gameLoop(); 