import pygame
import sys
import random
import time
import math
import numpy as np

pygame.init()
WIDTH, HEIGHT = 800, 600
TILE_SIZE = 30
ROWS = HEIGHT // TILE_SIZE
COLS = WIDTH // TILE_SIZE

win = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Танчики — Лабиринт")

clock = pygame.time.Clock()

WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
GRAY = (100, 100, 100)
BG_COLOR = (30, 30, 30)

# Лабиринт, как в оригинале — стены каждые 2 клетки + проходы и стены по периметру
def generate_tank_maze():
    # Размеры для крупного лабиринта
    cell_size = 2  # размер стены (2x2), проходы между ними >= 2
    maze_rows = (ROWS - 1) // (cell_size + 1)
    maze_cols = (COLS - 1) // (cell_size + 1)
    maze = np.ones((ROWS, COLS), dtype=int)

    # Сетка для DFS
    visited = np.zeros((maze_rows, maze_cols), dtype=bool)
    stack = []
    start_r, start_c = maze_rows // 2, maze_cols // 2
    stack.append((start_r, start_c))
    visited[start_r, start_c] = True

    # Открываем стартовую клетку
    for dr in range(cell_size):
        for dc in range(cell_size):
            maze[start_r * (cell_size + 1) + 1 + dr, start_c * (cell_size + 1) + 1 + dc] = 0

    # DFS генерация
    while stack:
        r, c = stack[-1]
        neighbors = []
        for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < maze_rows and 0 <= nc < maze_cols and not visited[nr, nc]:
                neighbors.append((nr, nc, dr, dc))
        if neighbors:
            nr, nc, dr, dc = random.choice(neighbors)
            # Пробиваем проход шириной 2
            for i in range(cell_size+1):
                if dr == 0:
                    # горизонтальный проход
                    maze[r * (cell_size + 1) + 1 + i, min(c, nc) * (cell_size + 1) + cell_size + 1] = 0
                else:
                    # вертикальный проход
                    maze[min(r, nr) * (cell_size + 1) + cell_size + 1, c * (cell_size + 1) + 1 + i] = 0
            # Открываем новую клетку
            for dr2 in range(cell_size):
                for dc2 in range(cell_size):
                    maze[nr * (cell_size + 1) + 1 + dr2, nc * (cell_size + 1) + 1 + dc2] = 0
            visited[nr, nc] = True
            stack.append((nr, nc))
        else:
            stack.pop()
    # Стены по периметру
    maze[0,:] = 1
    maze[-1,:] = 1
    maze[:,0] = 1
    maze[:,-1] = 1
    # Центр для игрока — свободное пространство 3x3 клетки
    cx, cy = COLS // 2, ROWS // 2
    for y in range(cy - 1, cy + 2):
        for x in range(cx - 1, cx + 2):
            maze[y][x] = 0
    return maze.tolist()

def generate_boss_map():
    # Пустая карта, только стены по периметру
    maze = []
    for y in range(ROWS):
        row = []
        for x in range(COLS):
            if x == 0 or y == 0 or x == COLS - 1 or y == ROWS - 1:
                row.append(1)
            else:
                row.append(0)
        maze.append(row)
    return maze

map_layout = generate_tank_maze()

walls = []
for y, row in enumerate(map_layout):
    for x, cell in enumerate(row):
        if cell == 1:
            walls.append(pygame.Rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE))

# Игрок
player = pygame.Rect(WIDTH // 2, HEIGHT // 2, TILE_SIZE, TILE_SIZE)
player_speed = 3  # скорость игрока
direction = "up"

# Пули
bullet_speed = 10
bullets = []  # пули игрока

# === УРОВНИ ===
levels = [
    {"enemy_count": 3, "enemy_speed": 2, "shoot_freq": (60, 180)},
    {"enemy_count": 5, "enemy_speed": 3, "shoot_freq": (50, 150)},
    {"enemy_count": 6, "enemy_speed": 4, "shoot_freq": (40, 120)},
    {"enemy_count": 7, "enemy_speed": 4, "shoot_freq": (40, 120)},
    {"enemy_count": 8, "enemy_speed": 5, "shoot_freq": (30, 100)},
    {"boss": True, "boss_lives": 100, "boss_speed": 3, "shoot_freq": (30, 80)},
]
current_level = 0

# --- Бонусы ---
BONUS_TYPES = ["life", "shield", "speed"]
bonus_images = {}
for b in BONUS_TYPES:
    surf = pygame.Surface((TILE_SIZE, TILE_SIZE))
    if b == "life":
        surf.fill((0, 200, 255))
    elif b == "shield":
        surf.fill((255, 255, 0))
    elif b == "speed":
        surf.fill((255, 128, 0))
    bonus_images[b] = surf

def spawn_bonus():
    # Находит свободную клетку и спавнит бонус
    while True:
        x = random.randint(1, COLS - 2)
        y = random.randint(1, ROWS - 2)
        if map_layout[y][x] == 0:
            rect = pygame.Rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            if not player.colliderect(rect):
                return {"rect": rect, "type": random.choice(BONUS_TYPES), "timer": time.time()}

BONUS_SPAWN_INTERVAL = 10  # секунд
BONUS_DURATION = 6  # секунд для щита и ускорения

def spawn_enemies(enemy_count, speed=None, shoot_freq=None):
    enemy_list = []
    attempts = 0
    while len(enemy_list) < enemy_count and attempts < 1000:
        x = random.randint(1, COLS - 2)
        y = random.randint(1, ROWS - 2)
        if map_layout[y][x] != 0:
            attempts += 1
            continue
        enemy_rect = pygame.Rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        if enemy_rect.colliderect(player):
            attempts += 1
            continue
        if any(enemy_rect.colliderect(e["rect"]) for e in enemy_list):
            attempts += 1
            continue
        enemy = {
            "rect": enemy_rect,
            "direction": random.choice(["up", "down", "left", "right"]),
            "shoot_timer": random.randint(30, 120),
        }
        if speed is not None:
            enemy["speed"] = speed
        if shoot_freq is not None:
            enemy["shoot_freq"] = shoot_freq
        enemy_list.append(enemy)
    return enemy_list

def move_enemy(enemy, enemy_speed, enemies):
    speed = enemy_speed
    old_pos = enemy["rect"].copy()
    if enemy["direction"] == "left":
        enemy["rect"].x -= speed
    elif enemy["direction"] == "right":
        enemy["rect"].x += speed
    elif enemy["direction"] == "up":
        enemy["rect"].y -= speed
    elif enemy["direction"] == "down":
        enemy["rect"].y += speed
    # Для босса: меняем направление случайно каждые 40 кадров
    if enemy.get("is_boss"):
        if not hasattr(enemy, "move_timer"):
            enemy["move_timer"] = 0
        enemy["move_timer"] += 1
        if enemy["move_timer"] > 10:
            enemy["direction"] = random.choice([
                "up", "down", "left", "right",
                "upleft", "upright", "downleft", "downright"
            ])
            enemy["move_timer"] = 0
        # Диагональное движение
        if enemy["direction"] == "upleft":
            enemy["rect"].x -= speed
            enemy["rect"].y -= speed
        elif enemy["direction"] == "upright":
            enemy["rect"].x += speed
            enemy["rect"].y -= speed
        elif enemy["direction"] == "downleft":
            enemy["rect"].x -= speed
            enemy["rect"].y += speed
        elif enemy["direction"] == "downright":
            enemy["rect"].x += speed
            enemy["rect"].y += speed
        # Жестко ограничиваем перемещение босса границами поля
        if enemy["rect"].left < TILE_SIZE:
            enemy["rect"].left = TILE_SIZE
            enemy["direction"] = random.choice(["right", "down", "up", "upright", "downright"])
        if enemy["rect"].right > WIDTH - TILE_SIZE:
            enemy["rect"].right = WIDTH - TILE_SIZE
            enemy["direction"] = random.choice(["left", "down", "up", "upleft", "downleft"])
        if enemy["rect"].top < TILE_SIZE:
            enemy["rect"].top = TILE_SIZE
            enemy["direction"] = random.choice(["down", "left", "right", "downleft", "downright"])
        if enemy["rect"].bottom > HEIGHT - TILE_SIZE:
            enemy["rect"].bottom = HEIGHT - TILE_SIZE
            enemy["direction"] = random.choice(["up", "left", "right", "upleft", "upright"])
    else:
        if any(enemy["rect"].colliderect(w) for w in walls):
            enemy["rect"] = old_pos
            enemy["direction"] = random.choice(["up", "down", "left", "right"])
    # Запрет на столкновения с другими врагами и игроком
    for other in enemies:
        if other is enemy:
            continue
        if enemy["rect"].colliderect(other["rect"]):
            enemy["rect"] = old_pos
            enemy["direction"] = random.choice(["up", "down", "left", "right"])
            break
    if enemy["rect"].colliderect(player):
        enemy["rect"] = old_pos
        enemy["direction"] = random.choice(["up", "down", "left", "right"])

# Функции пуль
def create_bullet(rect, direction):
    bx, by = rect.center
    if direction == "up":
        rect_bullet = pygame.Rect(bx - 5, rect.top - 10, 10, 10)
        dx, dy = 0, -bullet_speed
    elif direction == "down":
        rect_bullet = pygame.Rect(bx - 5, rect.bottom + 10, 10, 10)
        dx, dy = 0, bullet_speed
    elif direction == "left":
        rect_bullet = pygame.Rect(rect.left - 10, by - 5, 10, 10)
        dx, dy = -bullet_speed, 0
    else:  # right
        rect_bullet = pygame.Rect(rect.right + 10, by - 5, 10, 10)
        dx, dy = bullet_speed, 0
    return {"rect": rect_bullet, "dx": dx, "dy": dy, "owner": "enemy" if rect != player else "player"}

def move_bullet(bullet):
    bullet["rect"].x += bullet["dx"]
    bullet["rect"].y += bullet["dy"]

def draw_player(win, player, direction):
    pygame.draw.rect(win, GREEN, player)
    center = player.center
    if direction == "up":
        pygame.draw.line(win, WHITE, center, (center[0], player.top - 10), 4)
    elif direction == "down":
        pygame.draw.line(win, WHITE, center, (center[0], player.bottom + 10), 4)
    elif direction == "left":
        pygame.draw.line(win, WHITE, center, (player.left - 10, center[1]), 4)
    elif direction == "right":
        pygame.draw.line(win, WHITE, center, (player.right + 10, center[1]), 4)

def draw_enemy(win, enemy):
    pygame.draw.rect(win, RED, enemy["rect"])
    center = enemy["rect"].center
    direction = enemy["direction"]
    if direction == "up":
        pygame.draw.line(win, WHITE, center, (center[0], enemy["rect"].top - 10), 4)
    elif direction == "down":
        pygame.draw.line(win, WHITE, center, (center[0], enemy["rect"].bottom + 10), 4)
    elif direction == "left":
        pygame.draw.line(win, WHITE, center, (enemy["rect"].left - 10, center[1]), 4)
    elif direction == "right":
        pygame.draw.line(win, WHITE, center, (enemy["rect"].right + 10, center[1]), 4)

def draw_bonus(win, bonus):
    rect = bonus["rect"]
    cx, cy = rect.center
    if bonus["type"] == "life":
        # Красное сердечко
        r = rect.width // 4
        pygame.draw.circle(win, (255, 0, 64), (cx - r, cy - r//2), r)
        pygame.draw.circle(win, (255, 0, 64), (cx + r, cy - r//2), r)
        points = [
            (cx - r*2, cy - r//2),
            (cx + r*2, cy - r//2),
            (cx, cy + r*2)
        ]
        pygame.draw.polygon(win, (255, 0, 64), points)
    elif bonus["type"] == "shield":
        # Синий щит
        r = rect.width // 2 - 2
        pygame.draw.circle(win, (0, 128, 255), (cx, cy - r//2), r)
        points = [
            (cx - r, cy),
            (cx + r, cy),
            (cx, cy + r)
        ]
        pygame.draw.polygon(win, (0, 128, 255), points)
        pygame.draw.arc(win, (255,255,255), (cx-r, cy-r, 2*r, 2*r), math.pi, 2*math.pi, 2)
    elif bonus["type"] == "speed":
        # Большая заметная желтая молния
        scale = 1.7
        points = [
            (cx - int(8*scale), cy - int(12*scale)),
            (cx + int(3*scale), cy - int(3*scale)),
            (cx - int(2*scale), cy + int(2*scale)),
            (cx + int(10*scale), cy + int(14*scale)),
            (cx, cy + int(3*scale)),
            (cx + int(6*scale), cy + int(2*scale))
        ]
        # Обводка
        pygame.draw.polygon(win, (255, 220, 0), points, width=0)
        pygame.draw.polygon(win, (255, 255, 100), points, width=3)

def main():
    global direction, current_level, map_layout, walls, player
    score = 0
    lives = 50
    run = True
    player_speed_base = 3
    player_speed = player_speed_base
    shield = False
    shield_end_time = 0
    speed_end_time = 0
    last_bonus_spawn = time.time()
    bonuses = []
    boss_mg_last_time = 0
    boss_super_last_time = 0
    while current_level < len(levels):
        params = levels[current_level]
        is_boss = params.get("boss", False)
        enemy_count = params.get("enemy_count", 0)
        enemy_speed = params.get("enemy_speed", 2)
        shoot_freq = params["shoot_freq"]
        boss_lives = params.get("boss_lives", 0)
        boss_speed = params.get("boss_speed", 2)
        if is_boss:
            map_layout = generate_boss_map()
        else:
            map_layout = generate_tank_maze()
        walls = []
        for y, row in enumerate(map_layout):
            for x, cell in enumerate(row):
                if cell == 1:
                    walls.append(pygame.Rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE))
        player.x, player.y = WIDTH // 2, HEIGHT // 2
        direction = "up"
        bullets.clear()
        enemy_bullets = []
        bonuses.clear()
        player_speed = player_speed_base
        shield = False
        shield_end_time = 0
        speed_end_time = 0
        last_bonus_spawn = time.time()
        boss_super_attack_timer = time.time()
        boss_super_attack_cooldown = 5
        boss_super_attack = None
        boss_super_attack_time = 0
        boss_invulnerable = False
        if is_boss:
            boss = {"rect": pygame.Rect(TILE_SIZE, TILE_SIZE, TILE_SIZE*2, TILE_SIZE*2), "lives": boss_lives, "direction": random.choice(["up", "down", "left", "right"]), "shoot_timer": random.randint(*shoot_freq), "is_boss": True}
            enemies = []
            boss["has_spawned_enemies"] = False
            boss["invulnerable_until_enemies"] = []
        else:
            enemies = spawn_enemies(enemy_count, speed=enemy_speed, shoot_freq=shoot_freq)
            for enemy in enemies:
                enemy["shoot_timer"] = random.randint(*shoot_freq)
        level_win = False
        while run:
            clock.tick(60)
            win.fill(BG_COLOR)
            now = time.time()
            # --- бонусы ---
            if now - last_bonus_spawn > BONUS_SPAWN_INTERVAL and len(bonuses) < 2 and not is_boss:
                bonuses.append(spawn_bonus())
                last_bonus_spawn = now
            for b in bonuses[:]:
                if now - b["timer"] > 12:
                    bonuses.remove(b)
            if shield and now > shield_end_time:
                shield = False
            if player_speed > player_speed_base and now > speed_end_time:
                player_speed = player_speed_base
            keys = pygame.key.get_pressed()
            old_pos = player.copy()
            if keys[pygame.K_LEFT]:
                player.x -= player_speed
                direction = "left"
            if keys[pygame.K_RIGHT]:
                player.x += player_speed
                direction = "right"
            if keys[pygame.K_UP]:
                player.y -= player_speed
                direction = "up"
            if keys[pygame.K_DOWN]:
                player.y += player_speed
                direction = "down"
            blocked = False
            if any(player.colliderect(w) for w in walls):
                blocked = True
            if any(player.colliderect(enemy["rect"]) for enemy in enemies):
                blocked = True
            if is_boss and player.colliderect(boss["rect"]):
                blocked = True
            if blocked:
                player.x, player.y = old_pos.x, old_pos.y
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    run = False
                if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                    bullets.append(create_bullet(player, direction))
            for bullet in bullets[:]:
                move_bullet(bullet)
                if (bullet["rect"].bottom < 0 or bullet["rect"].top > HEIGHT or
                    bullet["rect"].right < 0 or bullet["rect"].left > WIDTH or
                    any(bullet["rect"].colliderect(w) for w in walls)):
                    bullets.remove(bullet)
                    continue
                if is_boss and 'boss' in locals() and "invulnerable_until_enemies" in boss:
                    if bullet["rect"].colliderect(boss["rect"]):
                        # Босс неуязвим, если есть живые призванные враги
                        invuln = False
                        if "invulnerable_until_enemies" in boss and boss["invulnerable_until_enemies"]:
                            invuln = True
                        if not invuln:
                            boss["lives"] -= 1
                            if bullet in bullets:
                                bullets.remove(bullet)
                            score += 1
                        continue
                for enemy in enemies[:]:
                    if bullet["rect"].colliderect(enemy["rect"]):
                        enemies.remove(enemy)
                        if bullet in bullets:
                            bullets.remove(bullet)
                        score += 1
                        if is_boss and 'boss' in locals() and "invulnerable_until_enemies" in boss:
                            if enemy in boss["invulnerable_until_enemies"]:
                                boss["invulnerable_until_enemies"].remove(enemy)
                            if not boss["invulnerable_until_enemies"]:
                                boss["invulnerable_until_enemies"] = []
                        break
            if is_boss:
                # --- БОСС ДВИЖЕНИЕ ---
                boss_hp = boss["lives"] / boss_lives if boss_lives else 1
                boss_level = 1 if boss_hp > 0.7 else (2 if boss_hp > 0.3 else 3)
                boss_phase_speed = boss_speed
                if boss_level == 2:
                    boss_phase_speed += 1
                elif boss_level == 3:
                    boss_phase_speed += 2
                move_enemy(boss, boss_phase_speed, enemies)
                boss["shoot_timer"] -= 1
                # --- БОСС СУПЕР-АТАКИ ---
                # На 1 и 2 фазе супер-атака каждые 3 секунды, на 3 фазе пулемет каждую секунду и супер-атака каждые 3 секунды
                if boss_level < 3:
                    boss_super_attack_cooldown = 3
                    if boss_super_attack is None and now - boss_super_attack_timer > boss_super_attack_cooldown:
                        can_spawn = not hasattr(boss, "summoned_enemies") or not any(e in enemies for e in getattr(boss, "summoned_enemies", []))
                        boss_super_attack = random.choices(
                            ["spawn_enemies", "big_bullet", "machine_gun"],
                            weights=[2, 2, 6], k=1
                        )[0]
                        boss_super_attack_time = now
                        boss_super_attack_timer = now
                else:
                    # 3 фаза: пулемет каждую 1 сек, супер-атака каждые 3 сек
                    if now - boss_mg_last_time > 1:
                        bx, by = boss["rect"].center
                        for angle in range(0, 360, 30):
                            rad = math.radians(angle)
                            dx = int(bullet_speed * math.cos(rad))
                            dy = int(bullet_speed * math.sin(rad))
                            rect_bullet = pygame.Rect(bx - 5, by - 5, 10, 10)
                            enemy_bullets.append({"rect": rect_bullet, "dx": dx, "dy": dy, "owner": "boss_mg"})
                        boss_mg_last_time = now
                    if boss_super_attack is None and now - boss_super_last_time > 3:
                        can_spawn = not hasattr(boss, "summoned_enemies") or not any(e in enemies for e in getattr(boss, "summoned_enemies", []))
                        boss_super_attack = random.choices(
                            ["spawn_enemies", "big_bullet"],
                            weights=[1, 1], k=1
                        )[0]
                        boss_super_attack_time = now
                        boss_super_last_time = now
                if boss_super_attack:
                    if boss_super_attack == "spawn_enemies":
                        if not boss.get("has_spawned_enemies", False):
                            to_spawn = 3 - len(enemies)
                            if to_spawn > 0:
                                new_enemies = spawn_enemies(to_spawn, speed=enemy_speed, shoot_freq=shoot_freq)
                                for e in new_enemies:
                                    e["shoot_timer"] = random.randint(*shoot_freq)
                                    enemies.append(e)
                                boss["invulnerable_until_enemies"] = list(new_enemies)
                            boss["has_spawned_enemies"] = True
                        boss_super_attack = None
                    elif boss_super_attack == "big_bullet":
                        if now - boss_super_attack_time < 1:
                            # Супер большая пуля летит в сторону игрока
                            bx, by = boss["rect"].center
                            px, py = player.center
                            dx = px - bx
                            dy = py - by
                            length = max(1, (dx ** 2 + dy ** 2) ** 0.5)
                            dx = int(bullet_speed * dx / length)
                            dy = int(bullet_speed * dy / length)
                            rect_bullet = pygame.Rect(bx - 15, by - 15, 30, 30)
                            enemy_bullets.append({"rect": rect_bullet, "dx": dx, "dy": dy, "owner": "boss_big", "damage": 2})
                        boss_super_attack = None
                        boss_invulnerable = False
                    elif boss_super_attack == "machine_gun":
                        # На 3 фазе пулемет стреляет отдельно, здесь только для 1-2 фазы
                        if boss_level < 3:
                            bx, by = boss["rect"].center
                            for angle in range(0, 360, 30):
                                rad = math.radians(angle)
                                dx = int(bullet_speed * math.cos(rad))
                                dy = int(bullet_speed * math.sin(rad))
                                rect_bullet = pygame.Rect(bx - 5, by - 5, 10, 10)
                                enemy_bullets.append({"rect": rect_bullet, "dx": dx, "dy": dy, "owner": "boss_mg"})
                        boss_super_attack = None
            # --- ДВИЖЕНИЕ И СТРЕЛЬБА ВСЕХ ВРАГОВ (на любом уровне) ---
            for enemy in enemies:
                espeed = enemy.get("speed", enemy_speed)
                efreq = enemy.get("shoot_freq", shoot_freq)
                move_enemy(enemy, espeed, enemies)
                if "shoot_timer" not in enemy:
                    enemy["shoot_timer"] = random.randint(*efreq)
                enemy["shoot_timer"] -= 1
                if enemy["shoot_timer"] <= 0:
                    enemy_bullets.append(create_bullet(enemy["rect"], enemy["direction"]))
                    enemy["shoot_timer"] = random.randint(*efreq)
            for bullet in enemy_bullets[:]:
                move_bullet(bullet)
                if (bullet["rect"].bottom < 0 or bullet["rect"].top > HEIGHT or
                    bullet["rect"].right < 0 or bullet["rect"].left > WIDTH or
                    any(bullet["rect"].colliderect(w) for w in walls)):
                    enemy_bullets.remove(bullet)
                    continue
                if bullet["rect"].colliderect(player):
                    if shield:
                        enemy_bullets.remove(bullet)
                    else:
                        dmg = bullet.get("damage", 1)
                        lives -= dmg
                        enemy_bullets.remove(bullet)
                        if lives <= 0:
                            run = False
            for b in bonuses[:]:
                if player.colliderect(b["rect"]):
                    if b["type"] == "life":
                        lives += 1
                    elif b["type"] == "shield":
                        shield = True
                        shield_end_time = now + BONUS_DURATION
                    elif b["type"] == "speed":
                        player_speed = player_speed_base + 3
                        speed_end_time = now + BONUS_DURATION
                    bonuses.remove(b)
            for wall in walls:
                pygame.draw.rect(win, GRAY, wall)
            draw_player(win, player, direction)
            if is_boss:
                pygame.draw.rect(win, (200, 0, 200), boss["rect"])
                font = pygame.font.SysFont("Arial", 24)
                boss_text = font.render(f"Босс: {boss['lives']}", True, (255,255,255))
                win.blit(boss_text, (WIDTH//2-60, 10))
                # Показываем уровень босса и неуязвимость
                boss_lvl_text = font.render(f"Фаза босса: {boss_level}", True, (255,255,0))
                win.blit(boss_lvl_text, (WIDTH//2-60, 40))
                if is_boss and 'boss' in locals() and "invulnerable_until_enemies" in boss and boss["invulnerable_until_enemies"]:
                    invuln_text = font.render("Босс неуязвим!", True, (255,0,0))
                    win.blit(invuln_text, (WIDTH//2-60, 70))
            for enemy in enemies:
                draw_enemy(win, enemy)
            for bullet in bullets:
                pygame.draw.rect(win, WHITE, bullet["rect"])
            for bullet in enemy_bullets:
                if bullet.get("owner") == "boss_big":
                    pygame.draw.rect(win, (255, 128, 0), bullet["rect"])
                elif bullet.get("owner") == "boss_mg":
                    pygame.draw.rect(win, (0, 255, 255), bullet["rect"])
                else:
                    pygame.draw.rect(win, RED, bullet["rect"])
            for b in bonuses:
                draw_bonus(win, b)
            font = pygame.font.SysFont("Arial", 24)
            score_text = font.render(f"Счет: {score}", True, WHITE)
            lives_text = font.render(f"Жизни: {lives}", True, WHITE)
            level_text = font.render(f"Уровень: {current_level+1}", True, WHITE)
            if shield:
                shield_text = font.render("Щит!", True, (255,255,0))
                win.blit(shield_text, (10, 100))
            if player_speed > player_speed_base:
                speed_text = font.render("Скорость!", True, (255,128,0))
                win.blit(speed_text, (10, 130))
            win.blit(score_text, (10, 10))
            win.blit(lives_text, (10, 40))
            win.blit(level_text, (10, 70))
            if is_boss and boss["lives"] <= 0:
                win.fill(BG_COLOR)
                win.blit(font.render("Победа! Босс повержен!", True, WHITE), (WIDTH // 4, HEIGHT // 2))
                pygame.display.update()
                pygame.time.wait(3000)
                current_level += 1
                level_win = True
                break
            if not is_boss and len(enemies) == 0:
                win.fill(BG_COLOR)
                win.blit(font.render("Победа! Переход на следующий уровень...", True, WHITE), (WIDTH // 4, HEIGHT // 2))
                pygame.display.update()
                pygame.time.wait(2000)
                current_level += 1
                level_win = True
                break
            pygame.display.update()
        if not run or not level_win:
            break
    win.fill(BG_COLOR)
    font = pygame.font.SysFont("Arial", 36)
    if lives <= 0:
        win.blit(font.render("Игра окончена!", True, RED), (WIDTH // 3, HEIGHT // 2))
    else:
        win.blit(font.render("Вы прошли все уровни!", True, GREEN), (WIDTH // 4, HEIGHT // 2))
    pygame.display.update()
    pygame.time.wait(4000)
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
