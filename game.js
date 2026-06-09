/**
 * Space Rider - Endless Space Runner Game Logic
 * Inspired by retro-futuristic arcade games and "Crazy Taxi" in space.
 */

// --- Canvas & Rendering Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const LOGICAL_WIDTH = 450;
const LOGICAL_HEIGHT = 800;

// --- Game Constants & Configuration ---
const LANE_WIDTH = LOGICAL_WIDTH / 3;
const LANES = [
  LANE_WIDTH / 2,                  // Lane 0 (Left): 75
  LANE_WIDTH + LANE_WIDTH / 2,     // Lane 1 (Center): 225
  LANE_WIDTH * 2 + LANE_WIDTH / 2  // Lane 2 (Right): 375
];

const OBSTACLE_TYPES = {
  ASTEROID: 'asteroid', // Standard, jumpable
  CRUISER: 'cruiser'    // Tall, non-jumpable alien cruiser
};

// --- Game State Variables ---
const STATES = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover'
};

let currentState = STATES.MENU;
let score = 0;
let distance = 0;
let baseSpeed = 350; // Initial scroll speed (px/sec)
let currentSpeed = baseSpeed;
let speedIncrement = 4.0; // How fast the game speeds up over time (px/sec^2)
let lives = 3;
let maxLives = 3;

// --- Spaceship & Shop Configurations ---
const SHIP_CONFIGS = {
  base: {
    name: 'Base Ship',
    speedMultiplier: 1.0,
    shieldHardening: 0.0,
    colorTheme: { glow: '#06b6d4', body: '#0f172a', trim: '#a855f7', cockpit: '#00ffcc' },
    laserCooldown: 0,
    extraLives: 0
  },
  fast: {
    name: 'Fast Ship',
    speedMultiplier: 1.25,
    shieldHardening: 0.10,
    colorTheme: { glow: '#10b981', body: '#064e3b', trim: '#fbbf24', cockpit: '#34d399' },
    laserCooldown: 0,
    extraLives: 0
  },
  magnet: {
    name: 'Magnet Ship',
    speedMultiplier: 1.0,
    shieldHardening: 0.20,
    colorTheme: { glow: '#8b5cf6', body: '#2e1065', trim: '#3b82f6', cockpit: '#a78bfa' },
    laserCooldown: 0,
    extraLives: 0
  },
  laser: {
    name: 'Laser Striker',
    speedMultiplier: 1.1,
    shieldHardening: 0.15,
    colorTheme: { glow: '#f43f5e', body: '#4c0519', trim: '#f97316', cockpit: '#fda4af' },
    laserCooldown: 8.0, // seconds
    extraLives: 0
  },
  aegis: {
    name: 'Aegis Dreadnought',
    speedMultiplier: 0.85,
    shieldHardening: 0.50,
    colorTheme: { glow: '#fbbf24', body: '#1e293b', trim: '#f8fafc', cockpit: '#fef08a' },
    laserCooldown: 0,
    extraLives: 1
  }
};

// --- Coin & Shop State Variables ---
const LOCAL_STORAGE_COINS_KEY = 'space_rider_coins';
const LOCAL_STORAGE_SHIPS_KEY = 'space_rider_owned_ships';
const LOCAL_STORAGE_EQUIPPED_KEY = 'space_rider_equipped_ship';
const LOCAL_STORAGE_UPGRADES_KEY = 'space_rider_ship_upgrades';

let lifetimeCoins = parseInt(localStorage.getItem(LOCAL_STORAGE_COINS_KEY)) || 0;
let ownedShips = [];
try {
  ownedShips = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHIPS_KEY));
  if (!Array.isArray(ownedShips)) ownedShips = ['base'];
} catch (e) {
  ownedShips = ['base'];
}
let equippedShip = localStorage.getItem(LOCAL_STORAGE_EQUIPPED_KEY) || 'base';

// Ship tuning persistent upgrades
let shipUpgrades = {};
try {
  shipUpgrades = JSON.parse(localStorage.getItem(LOCAL_STORAGE_UPGRADES_KEY)) || {};
} catch (e) {
  shipUpgrades = {};
}
// Ensure defaults exist for all ship configs
const defaultUpgrades = { engine: 1, shield: 1 };
Object.keys(SHIP_CONFIGS).forEach(shipId => {
  if (!shipUpgrades[shipId] || typeof shipUpgrades[shipId] !== 'object') {
    shipUpgrades[shipId] = { ...defaultUpgrades };
  } else {
    if (typeof shipUpgrades[shipId].engine !== 'number') shipUpgrades[shipId].engine = 1;
    if (typeof shipUpgrades[shipId].shield !== 'number') shipUpgrades[shipId].shield = 1;
  }
});

let sessionCoins = 0;
let coins = [];
let coinSpawnTimer = 0;
const COIN_SPAWN_INTERVAL = 1.0;

// Laser variables
let laserCooldownTimer = 0;
let activeLaserDrawTimer = 0;
let laserBeamX = 0;
let laserBeamY = 0;

// Aegis variable
let aegisAbsorbTimer = 0;

// Shop Navigation Context & Animations
let shopOriginSource = 'menu';
let currentShopShipIndex = 0;
const SHOP_SHIP_IDS = Object.keys(SHIP_CONFIGS);

let shopAnimationId = null;
let lastShopTime = 0;
let shopAnimState = 'idle'; // 'idle', 'flyOut', 'flyIn'
let shopAnimProgress = 0;
let shopTargetIndex = 0;
let shopFlyDirection = 1;
let previewParticles = [];

// Collision & Invulnerability
let invulnerableTimer = 0;
const INVULNERABILITY_DURATION = 1.5; // seconds
let isInvulnerable = false;

// Screen Shake Effect
let shakeTimer = 0;
const SHAKE_DURATION = 0.3; // seconds
const SHAKE_INTENSITY = 10; // offset in pixels

// Spawning Variables
let spawnTimer = 0;
let baseSpawnInterval = 1.8; // seconds
let currentSpawnInterval = baseSpawnInterval;

// Arrays for game objects
let obstacles = [];
let particles = [];
let stars = [];

// --- Player Configuration ---
const player = {
  targetLane: 1, // Start in Center lane
  x: LANES[1],
  y: LOGICAL_HEIGHT - 120, // Draw near bottom
  width: 44,
  height: 54,
  lerpSpeed: 16, // Lane switching slide speed
  tilt: 0,
  
  // Jump Mechanics
  isJumping: false,
  jumpTimer: 0,
  jumpDuration: 0.7, // seconds
  maxJumpHeight: 80, // pixels
  jumpHeight: 0
};

// --- Starfield Initialization ---
function initStarfield() {
  stars = [];
  const starCount = 100;
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * LOGICAL_WIDTH,
      y: Math.random() * LOGICAL_HEIGHT,
      size: Math.random() * 2 + 0.5,
      speedMultiplier: Math.random() * 0.7 + 0.3,
      color: `rgba(${Math.floor(Math.random() * 50 + 205)}, ${Math.floor(Math.random() * 50 + 205)}, 255, ${Math.random() * 0.6 + 0.4})`
    });
  }
}

// --- Window Resize & DPI Scaler Handler ---
function handleResize() {
  const dpr = window.devicePixelRatio || 1;
  const container = document.getElementById('game-container');
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  // Calculate fitting width and height preserving aspect ratio
  let w = containerWidth;
  let h = containerHeight;
  const targetRatio = LOGICAL_WIDTH / LOGICAL_HEIGHT;
  const currentRatio = w / h;

  if (currentRatio > targetRatio) {
    w = h * targetRatio;
  } else {
    h = w / targetRatio;
  }

  // Set style dimensions in CSS pixels
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  // Set actual drawing buffer size scaled by DPR
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  // Reset transforms and apply scaling
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr * (w / LOGICAL_WIDTH), dpr * (h / LOGICAL_HEIGHT));
}

window.addEventListener('resize', handleResize);
// Initialize dimensions immediately
handleResize();

// --- Input Event Listeners ---
let keyState = {};

window.addEventListener('keydown', (e) => {
  keyState[e.code] = true;
  
  if (currentState === STATES.PLAYING) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      player.targetLane = Math.max(0, player.targetLane - 1);
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      player.targetLane = Math.min(2, player.targetLane + 1);
    }
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      triggerJump();
    }
    if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      triggerLaser();
    }
    if (e.code === 'Escape') {
      togglePause();
    }
  } else if (currentState === STATES.MENU) {
    if (e.code === 'Space' || e.code === 'Enter') {
      startGame();
    }
  } else if (currentState === STATES.PAUSED) {
    if (e.code === 'Escape') {
      togglePause();
    }
  }
});

window.addEventListener('keyup', (e) => {
  keyState[e.code] = false;
});

// --- Mobile Touch Swiping / Tapping Logic ---
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchHasSwiped = false;
const swipeThreshold = 40; // minimum movement in pixels to count as swipe

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 0) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
  touchHasSwiped = false;
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 0 || currentState !== STATES.PLAYING) return;
  
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - touchStartX;
  const diffY = currentY - touchStartY;
  
  // If user swiped significantly horizontally before any trigger
  if (!touchHasSwiped && Math.abs(diffX) > swipeThreshold) {
    if (diffX > 0) {
      player.targetLane = Math.min(2, player.targetLane + 1);
    } else {
      player.targetLane = Math.max(0, player.targetLane - 1);
    }
    touchHasSwiped = true;
    // Update start coordinate to avoid double swipes on a single draw
    touchStartX = currentX;
  }
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  if (currentState !== STATES.PLAYING) {
    // In menu or game over screens, standard buttons are handled by HTML click listeners
    return;
  }
  
  const touchEndTime = Date.now();
  const duration = touchEndTime - touchStartTime;
  
  // Differentiate swipe vs tap: If no swipe occurred and the tap was quick and stable
  if (!touchHasSwiped && duration < 300) {
    triggerJump();
  }
}, { passive: true });

function triggerJump() {
  if (!player.isJumping) {
    player.isJumping = true;
    player.jumpTimer = 0;
  }
}

// --- High Score Leaderboard System ---
const LOCAL_STORAGE_KEY = 'space_rider_leaderboard_records';

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to load leaderboard from localStorage", e);
  }
  
  // Initialize and return an empty array
  const defaultBoard = [];
  saveLeaderboard(defaultBoard);
  return defaultBoard;
}

function saveLeaderboard(board) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(board));
  } catch (e) {
    console.error("Failed to save leaderboard to localStorage", e);
  }
}

function updateLeaderboardUI() {
  const board = loadLeaderboard();
  const container = document.getElementById('leaderboard-container');
  container.innerHTML = '';
  
  if (board.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-500 py-2 italic">No logs on board</div>';
    return;
  }
  
  board.forEach((entry, idx) => {
    const isTop = idx === 0;
    const item = document.createElement('div');
    item.className = `flex justify-between items-center py-1 border-b border-white/5 last:border-b-0 ${isTop ? 'text-cyan-400 font-bold' : 'text-gray-300'}`;
    
    // Rank & Name left, Score right
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-purple-500 w-4">${idx + 1}.</span>
        <span>${escapeHTML(entry.name)}</span>
      </div>
      <span class="font-mono">${entry.score.toLocaleString()}</span>
    `;
    container.appendChild(item);
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function checkAndProcessHighScore(finalScore) {
  const board = loadLeaderboard();
  
  // Show input if there are less than 10 scores, or finalScore beats the lowest score
  const isEligible = board.length < 10 || finalScore > board[board.length - 1].score;
  const submitSection = document.getElementById('highscore-submit-section');
  
  if (isEligible && finalScore > 0) {
    submitSection.classList.remove('hidden');
    document.getElementById('pilot-name-input').focus();
  } else {
    submitSection.classList.add('hidden');
  }
}

// Submit High Score Handler
document.getElementById('btn-submit-score').addEventListener('click', () => {
  const nameInput = document.getElementById('pilot-name-input');
  let name = nameInput.value.trim().toUpperCase();
  
  if (!name) {
    name = 'PILOT';
  }
  
  let board = loadLeaderboard();
  board.push({ name: name, score: Math.floor(score) });
  
  // Sort descending and keep top 10
  board.sort((a, b) => b.score - a.score);
  board = board.slice(0, 10);
  
  saveLeaderboard(board);
  updateLeaderboardUI();
  
  // Hide submit panel
  document.getElementById('highscore-submit-section').classList.add('hidden');
});

// --- Obstacle Class and Factory ---
class Obstacle {
  constructor(laneIdx, type) {
    this.lane = laneIdx;
    this.x = LANES[laneIdx];
    this.y = -100; // start off-screen at top
    this.type = type;
    
    // Rotation & Shape attributes
    this.angle = 0;
    this.spinSpeed = (Math.random() - 0.5) * 2.5; // rads per sec
    
    // Physics properties
    if (this.type === OBSTACLE_TYPES.ASTEROID) {
      this.radius = Math.random() * 8 + 22; // collision radius (22 - 30)
      this.width = this.radius * 2;
      this.height = this.radius * 2;
      // Generate irregular jagged outline
      this.vertices = [];
      const vertexCount = Math.floor(Math.random() * 4) + 8; // 8 to 11 corners
      for (let i = 0; i < vertexCount; i++) {
        const theta = (i / vertexCount) * Math.PI * 2;
        const offset = (Math.random() - 0.5) * (this.radius * 0.4);
        this.vertices.push({
          x: Math.cos(theta) * (this.radius + offset),
          y: Math.sin(theta) * (this.radius + offset)
        });
      }
    } else {
      // Tall alien cruiser properties (Cruiser)
      this.width = 56;
      this.height = 96;
      this.colorHue = Math.floor(Math.random() * 40) + 320; // 320 to 360 (purple/pink)
    }
  }

  update(dt, speed) {
    this.y += speed * dt;
    this.angle += this.spinSpeed * dt;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.type === OBSTACLE_TYPES.ASTEROID) {
      ctx.rotate(this.angle);
      
      // Draw outer asteroid neon glow
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
      
      // Path drawing
      ctx.beginPath();
      ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
      for (let i = 1; i < this.vertices.length; i++) {
        ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
      }
      ctx.closePath();
      
      // Fill rock texture gradient
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius);
      grad.addColorStop(0, '#1a2b36');
      grad.addColorStop(1, '#0c151c');
      ctx.fillStyle = grad;
      ctx.fill();
      
      // Draw border
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inside rock detail lines (craters)
      ctx.shadowBlur = 0; // disable glow for crater lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-this.radius*0.3, -this.radius*0.2, this.radius*0.25, 0, Math.PI*2);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(this.radius*0.4, this.radius*0.3, this.radius*0.18, 0, Math.PI*2);
      ctx.stroke();

    } else {
      // Draw Alien Cruiser (Tall obstacle)
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsl(${this.colorHue}, 90%, 50%)`;

      // Back Engine Flames (Rose/Orange glow)
      const pulse = Math.sin(Date.now() / 50) * 8;
      ctx.fillStyle = '#ff3366';
      ctx.beginPath();
      ctx.moveTo(-16, -this.height/2);
      ctx.lineTo(-4, -this.height/2 - 12 - pulse);
      ctx.lineTo(4, -this.height/2 - 12 - pulse);
      ctx.lineTo(16, -this.height/2);
      ctx.closePath();
      ctx.fill();

      // Main metallic ship body
      ctx.fillStyle = '#1e102b';
      ctx.strokeStyle = `hsl(${this.colorHue}, 90%, 50%)`;
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.moveTo(0, this.height/2); // nose cone pointing down
      ctx.lineTo(this.width/2, this.height/4); // right wing tip
      ctx.lineTo(this.width/3, -this.height/3); // right flank
      ctx.lineTo(this.width/4, -this.height/2); // right engine pod
      ctx.lineTo(-this.width/4, -this.height/2); // left engine pod
      ctx.lineTo(-this.width/3, -this.height/3); // left flank
      ctx.lineTo(-this.width/2, this.height/4); // left wing tip
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cabin Shield Glow (glowing core)
      ctx.shadowBlur = 8;
      ctx.fillStyle = `hsl(${this.colorHue}, 95%, 70%)`;
      ctx.beginPath();
      ctx.ellipse(0, 10, 10, 18, 0, 0, Math.PI*2);
      ctx.fill();

      // Futuristic wing accents
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-this.width/3, this.height/15);
      ctx.lineTo(-this.width/2.2, this.height/4);
      ctx.moveTo(this.width/3, this.height/15);
      ctx.lineTo(this.width/2.2, this.height/4);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// --- Particles Engine ---
class Particle {
  constructor(x, y, vx, vy, color, size, life, text = null) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life; // initial life in seconds
    this.maxLife = life;
    this.text = text;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    
    if (this.text) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      ctx.font = 'bold 12px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.text, this.x, this.y);
    } else {
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}

function spawnExplosion(x, y, color = '#f43f5e') {
  const pCount = 35;
  for (let i = 0; i < pCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 260 + 80;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const size = Math.random() * 4 + 2;
    const life = Math.random() * 0.4 + 0.3;
    particles.push(new Particle(x, y, vx, vy, color, size, life));
  }
}

function spawnEngineExhaust(x, y) {
  // Glow particles floating backwards from the engine nozzle
  const vx = (Math.random() - 0.5) * 40;
  const vy = currentSpeed + Math.random() * 60; // shoot particles backwards
  const theme = SHIP_CONFIGS[equippedShip]?.colorTheme || SHIP_CONFIGS.base.colorTheme;
  const color = player.isJumping ? theme.glow : theme.trim;
  const size = Math.random() * 2.5 + 1.5;
  const life = Math.random() * 0.2 + 0.15;
  particles.push(new Particle(x, y + 25, vx, vy, color, size, life));
}

// --- Spaceship Render & Animation ---
function drawSpacecraft(dt) {
  // invulnerability blink state: check timer
  if (isInvulnerable) {
    const blinkInterval = 100; // millisecond blink interval
    if (Math.floor(Date.now() / blinkInterval) % 2 === 0) {
      return; // Skip rendering on alternating intervals
    }
  }

  ctx.save();
  
  // Draw Jump Shadow beneath the player first (stays on grid level)
  if (player.isJumping) {
    const shadowScale = 1 - (player.jumpHeight / player.maxJumpHeight) * 0.4;
    const shadowAlpha = 0.45 * (1 - player.jumpHeight / player.maxJumpHeight);
    
    ctx.save();
    ctx.translate(player.x, player.y + 15);
    ctx.scale(shadowScale, shadowScale * 0.5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.arc(0, 0, player.width * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Position ship accounting for physical height from jump
  ctx.translate(player.x, player.y - player.jumpHeight);
  
  // Calculate roll tilt based on velocity delta during lane switches
  ctx.rotate(player.tilt * 0.08);

  // Apply visual stretch/scale for jump height effect
  if (player.isJumping) {
    const scaleFactor = 1 + (player.jumpHeight / player.maxJumpHeight) * 0.25;
    ctx.scale(scaleFactor, scaleFactor);
  }

  // Get active ship configuration colors
  const config = SHIP_CONFIGS[equippedShip] || SHIP_CONFIGS.base;
  const theme = config.colorTheme;

  // Draw Aegis Shield bubble if active
  if (aegisAbsorbTimer > 0) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#60a5fa';
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.7)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, player.width * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw Spacecraft Graphics
  // Engine glow (pulses)
  const enginePulse = Math.sin(Date.now() / 40) * 4;
  ctx.shadowBlur = 10 + enginePulse;
  ctx.shadowColor = theme.glow;
  ctx.fillStyle = theme.trim;
  ctx.beginPath();
  ctx.moveTo(-6, 25);
  ctx.lineTo(0, 32 + enginePulse);
  ctx.lineTo(6, 25);
  ctx.closePath();
  ctx.fill();

  // Ship Outer Glow Border
  ctx.shadowBlur = 12;
  ctx.shadowColor = theme.glow;
  
  // Main chassis path
  const w = player.width;
  const h = player.height;
  
  ctx.fillStyle = theme.body;
  ctx.strokeStyle = theme.glow;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(0, -h/2); // nose cone
  ctx.lineTo(w/2, h/4); // right wing tip
  ctx.lineTo(w/3, h/2); // right rear corner
  ctx.lineTo(w/6, h/3); // thruster recess right
  ctx.lineTo(-w/6, h/3); // thruster recess left
  ctx.lineTo(-w/3, h/2); // left rear corner
  ctx.lineTo(-w/2, h/4); // left wing tip
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit glass
  ctx.shadowBlur = 6;
  ctx.fillStyle = theme.cockpit;
  ctx.beginPath();
  ctx.moveTo(0, -h/3);
  ctx.lineTo(w/5, -h/15);
  ctx.lineTo(w/8, h/8);
  ctx.lineTo(-w/8, h/8);
  ctx.lineTo(-w/5, -h/15);
  ctx.closePath();
  ctx.fill();

  // Wing Decals
  ctx.strokeStyle = theme.trim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w/3.5, h/8);
  ctx.lineTo(-w/2.5, h/5.5);
  ctx.moveTo(w/3.5, h/8);
  ctx.lineTo(w/2.5, h/5.5);
  ctx.stroke();

  ctx.restore();
}

// --- Scrolling Visual Grid (Perspective Lanes) ---
let laneDashOffset = 0;

function drawEnvironment(dt) {
  // Update star positions relative to speed
  stars.forEach(star => {
    star.y += currentSpeed * star.speedMultiplier * dt;
    if (star.y > LOGICAL_HEIGHT) {
      star.y = 0;
      star.x = Math.random() * LOGICAL_WIDTH;
    }
    
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });

  // Calculate grid lines layout
  laneDashOffset = (laneDashOffset + currentSpeed * dt) % 80;

  // Draw Vertical Lane Boundaries
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)'; // neon purple
  ctx.lineWidth = 3;
  ctx.setLineDash([40, 40]);
  ctx.lineDashOffset = -laneDashOffset;

  // Line 1: Left-Center boundary (x = 150)
  ctx.beginPath();
  ctx.moveTo(LANE_WIDTH, 0);
  ctx.lineTo(LANE_WIDTH, LOGICAL_HEIGHT);
  ctx.stroke();

  // Line 2: Center-Right boundary (x = 300)
  ctx.beginPath();
  ctx.moveTo(LANE_WIDTH * 2, 0);
  ctx.lineTo(LANE_WIDTH * 2, LOGICAL_HEIGHT);
  ctx.stroke();

  ctx.setLineDash([]); // Reset dash array
}

// --- Spawner Logic & Validation ---
function spawnObstacles(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    // Determine spawn layout based on probabilities
    const rand = Math.random();
    let spawnPattern = 'single';
    if (rand > 0.85) {
      spawnPattern = 'triple';
    } else if (rand > 0.50) {
      spawnPattern = 'double';
    }

    if (spawnPattern === 'single') {
      const lane = Math.floor(Math.random() * 3);
      const type = Math.random() > 0.45 ? OBSTACLE_TYPES.ASTEROID : OBSTACLE_TYPES.CRUISER;
      obstacles.push(new Obstacle(lane, type));
    } 
    else if (spawnPattern === 'double') {
      // Pick 2 distinct random lanes
      const availableLanes = [0, 1, 2];
      const lane1Idx = Math.floor(Math.random() * availableLanes.length);
      const lane1 = availableLanes.splice(lane1Idx, 1)[0];
      const lane2 = availableLanes[Math.floor(Math.random() * availableLanes.length)];

      const type1 = Math.random() > 0.5 ? OBSTACLE_TYPES.ASTEROID : OBSTACLE_TYPES.CRUISER;
      const type2 = Math.random() > 0.5 ? OBSTACLE_TYPES.ASTEROID : OBSTACLE_TYPES.CRUISER;

      obstacles.push(new Obstacle(lane1, type1));
      obstacles.push(new Obstacle(lane2, type2));
    } 
    else if (spawnPattern === 'triple') {
      // Must occupy all 3 lanes
      // Spec: If a Triple spawn occurs, at least one obstacle MUST be jumpable (Asteroid) to avoid soft-locking.
      let types = [
        Math.random() > 0.5 ? OBSTACLE_TYPES.ASTEROID : OBSTACLE_TYPES.CRUISER,
        Math.random() > 0.5 ? OBSTACLE_TYPES.ASTEROID : OBSTACLE_TYPES.CRUISER,
        Math.random() > 0.5 ? OBSTACLE_TYPES.ASTEROID : OBSTACLE_TYPES.CRUISER
      ];

      // Check if all three are Cruisers
      const allCruisers = types.every(t => t === OBSTACLE_TYPES.CRUISER);
      if (allCruisers) {
        // Force at least one random lane to contain an Asteroid
        const overrideLane = Math.floor(Math.random() * 3);
        types[overrideLane] = OBSTACLE_TYPES.ASTEROID;
      }

      // Push all three
      for (let i = 0; i < 3; i++) {
        obstacles.push(new Obstacle(i, types[i]));
      }
    }

    // Reset spawn timer with scaling interval
    spawnTimer = currentSpawnInterval;
  }
}

// --- Collision Manager ---
function checkCollisions() {
  if (isInvulnerable) return;

  const playerLeft = player.x - player.width * 0.45;
  const playerRight = player.x + player.width * 0.45;
  const playerTop = player.y - player.height * 0.45;
  const playerBottom = player.y + player.height * 0.45;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    
    // Skip collision if player jumped over a jumpable obstacle (Asteroid)
    if (player.isJumping && obs.type === OBSTACLE_TYPES.ASTEROID) {
      continue;
    }

    // AABB or Circle intersection bounding calculation
    let isColliding = false;

    if (obs.type === OBSTACLE_TYPES.ASTEROID) {
      // Circle-to-AABB collision check (simplified logic)
      const closestX = Math.max(playerLeft, Math.min(obs.x, playerRight));
      const closestY = Math.max(playerTop, Math.min(obs.y, playerBottom));
      
      const dx = obs.x - closestX;
      const dy = obs.y - closestY;
      const distSq = dx * dx + dy * dy;
      
      isColliding = distSq < (obs.radius * obs.radius);
    } else {
      // Tall Cruiser rectangle intersection checks
      const obsLeft = obs.x - obs.width / 2;
      const obsRight = obs.x + obs.width / 2;
      const obsTop = obs.y - obs.height / 2;
      const obsBottom = obs.y + obs.height / 2;

      isColliding = (
        playerLeft < obsRight &&
        playerRight > obsLeft &&
        playerTop < obsBottom &&
        playerBottom > obsTop
      );
    }

    if (isColliding) {
      triggerCollision(obs);
      break; // trigger one hit max per frame
    }
  }
}

function triggerCollision(obstacle) {
  const config = SHIP_CONFIGS[equippedShip] || SHIP_CONFIGS.base;
  
  // Roll for shield hardening deflection
  const upgrades = shipUpgrades[equippedShip] || { engine: 1, shield: 1 };
  const actualShieldHardening = config.shieldHardening + (upgrades.shield - 1) * 0.05;
  if (Math.random() < actualShieldHardening) {
    aegisAbsorbTimer = 0.5;
    
    // Spawn shield spark particles
    const pCount = 15;
    for (let i = 0; i < pCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 120 + 60;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      particles.push(new Particle(player.x, player.y - player.jumpHeight, vx, vy, '#60a5fa', Math.random() * 3 + 2, 0.4));
    }
    
    shakeTimer = SHAKE_DURATION * 0.5;
    obstacles = obstacles.filter(o => o !== obstacle);
    
    particles.push(new Particle(player.x, player.y - player.jumpHeight - 40, 0, -60, '#38bdf8', 0, 0.8, "SHIELD ABSORBED"));
    
    // Scrap Recycler Coin Conversion logic for Aegis ship
    if (equippedShip === 'aegis' && obstacle.type === OBSTACLE_TYPES.ASTEROID) {
      const aegisUpgrades = shipUpgrades.aegis || { engine: 1, shield: 1 };
      const coinChance = aegisUpgrades.engine * 0.10; // Level 1 = 10%, Level 5 = 50%
      if (Math.random() < coinChance) {
        // Spawn immediate floating gold coin at asteroid's position
        const c = new Coin(obstacle.lane);
        c.x = obstacle.x;
        c.y = obstacle.y;
        coins.push(c);
        
        // Spawn text particle
        particles.push(new Particle(obstacle.x, obstacle.y - 20, 0, -50, '#eab308', 0, 0.8, "RECYCLED COIN"));
      }
    }
    
    isInvulnerable = true;
    invulnerableTimer = 0.5;
    return;
  }

  lives--;
  updateLivesUI();

  // Screen shake & Explosion particle trigger
  shakeTimer = SHAKE_DURATION;
  spawnExplosion(player.x, player.y - player.jumpHeight, '#f43f5e');
  spawnExplosion(obstacle.x, obstacle.y, '#06b6d4');

  // Remove the hit obstacle to prevent multiple frames hitting
  obstacles = obstacles.filter(o => o !== obstacle);

  if (lives <= 0) {
    endGame();
  } else {
    // Grant invulnerability period
    isInvulnerable = true;
    const upgrades = shipUpgrades[equippedShip] || { engine: 1, shield: 1 };
    invulnerableTimer = INVULNERABILITY_DURATION + (upgrades.shield - 1) * 0.25;
  }
}

// --- HUD Lives UI Draw ---
function updateLivesUI() {
  const container = document.getElementById('lives-container');
  container.innerHTML = '';
  
  for (let i = 0; i < maxLives; i++) {
    const isLit = i < lives;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `w-6 h-6 transition-all duration-300 ${isLit ? 'text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.75)] scale-100' : 'text-gray-700 opacity-30 scale-90'}`);
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    
    // Custom futuristic ship vector layout
    svg.innerHTML = `<path d="M12 2L2 22h4l2-3h8l2 3h4L12 2zm0 4.5l5.5 11h-11L12 6.5z"/>`;
    container.appendChild(svg);
  }
}

// --- Main Engine Physics updates ---
function update(dt) {
  // 1. Timers
  if (invulnerableTimer > 0) {
    invulnerableTimer -= dt;
    if (invulnerableTimer <= 0) {
      isInvulnerable = false;
    }
  }

  if (shakeTimer > 0) {
    shakeTimer -= dt;
  }

  if (activeLaserDrawTimer > 0) {
    activeLaserDrawTimer -= dt;
  }

  if (laserCooldownTimer > 0) {
    laserCooldownTimer -= dt;
    if (laserCooldownTimer < 0) laserCooldownTimer = 0;
    updateLaserHUD();
  }

  if (aegisAbsorbTimer > 0) {
    aegisAbsorbTimer -= dt;
  }

  // 2. Linear Speed Escalation
  currentSpeed += speedIncrement * dt;
  // Scale spawn frequency down with speed (faster speed -> faster spawn)
  currentSpawnInterval = Math.max(0.65, baseSpawnInterval - (currentSpeed - baseSpeed) / 450);

  // 3. Score & continuous distance increments
  const upgrades = shipUpgrades[equippedShip] || { engine: 1, shield: 1 };
  distance += currentSpeed * (1 + (upgrades.engine - 1) * 0.08) * dt;
  score = Math.floor(distance / 10);
  document.getElementById('hud-score').innerText = score.toString().padStart(6, '0');

  // 4. Parabolic Jump Physics
  if (player.isJumping) {
    player.jumpTimer += dt;
    const progress = player.jumpTimer / player.jumpDuration;
    
    if (progress >= 1.0) {
      // Jump complete
      player.isJumping = false;
      player.jumpHeight = 0;
    } else {
      // Calculate parabolic curve height
      player.jumpHeight = Math.sin(progress * Math.PI) * player.maxJumpHeight;
    }
  }

  // 5. Smooth Lane switching Interpolation (lerp)
  const targetX = LANES[player.targetLane];
  const diffX = targetX - player.x;
  player.x += diffX * player.lerpSpeed * dt;
  
  // Calculate visual tilt angles based on lane switch velocity
  player.tilt = diffX;

  // 6. Spawn engine particle trail sparks
  if (Math.random() < 0.35) {
    spawnEngineExhaust(player.x, player.y - player.jumpHeight);
  }

  // 7. Update Obstacles position & cleanups
  obstacles.forEach(obs => obs.update(dt, currentSpeed));
  
  // Clean off-screen objects
  obstacles = obstacles.filter(obs => obs.y < LOGICAL_HEIGHT + 100);

  // 7b. Update Coins position, magnet attraction & cleanups
  coins.forEach(coin => {
    if (equippedShip === 'magnet') {
      const dx = player.x - coin.x;
      const dy = (player.y - player.jumpHeight) - coin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const upgrades = shipUpgrades.magnet || { engine: 1, shield: 1 };
      const magnetRadius = 150 + (upgrades.shield - 1) * 50;
      if (dist < magnetRadius) {
        const pullSpeed = 350 * dt;
        coin.x += (dx / dist) * pullSpeed;
        coin.y += (dy / dist) * pullSpeed;
      }
    }
    coin.update(dt, currentSpeed);
  });
  coins = coins.filter(coin => coin.y < LOGICAL_HEIGHT + 100);

  // 8. Spawner triggering
  spawnObstacles(dt);
  spawnCoins(dt);

  // 9. Particle movement ticks
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => p.life > 0);

  // 10. Process Collisions
  checkCollisions();
  checkCoinCollisions();
}

// --- Main Render Canvas pipeline ---
function draw() {
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // Apply Shake Translate offset if active
  ctx.save();
  if (shakeTimer > 0) {
    const dx = (Math.random() - 0.5) * SHAKE_INTENSITY;
    const dy = (Math.random() - 0.5) * SHAKE_INTENSITY;
    ctx.translate(dx, dy);
  }

  // Draw scrolling backgrounds & visual lane borders
  drawEnvironment(1/60);

  // Draw active coins
  coins.forEach(c => c.draw());

  // Draw obstacles
  obstacles.forEach(obs => obs.draw());

  // Draw particles (exhaust + explosions)
  particles.forEach(p => p.draw());

  // Draw Spaceship Model
  drawSpacecraft(1/60);

  // Draw Laser Beam if active
  if (activeLaserDrawTimer > 0) {
    ctx.save();
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ef4444';
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(laserBeamX, player.y - player.jumpHeight);
    ctx.lineTo(laserBeamX, laserBeamY);
    ctx.stroke();

    // Inner beam core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore(); // restore shake translations
}

// --- Game Loop Thread ---
let lastTime = 0;
let animationFrameId = null;

function gameLoop(timestamp) {
  if (currentState !== STATES.PLAYING) return;

  let dt = (timestamp - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1; // cap frame step to avoid physics breaking
  lastTime = timestamp;

  update(dt);
  draw();

  animationFrameId = requestAnimationFrame(gameLoop);
}

// --- State Flow Operations ---
function startGame() {
  currentState = STATES.PLAYING;
  
  // Apply equipped ship stats
  const config = SHIP_CONFIGS[equippedShip] || SHIP_CONFIGS.base;
  baseSpeed = 350 * config.speedMultiplier;
  currentSpeed = baseSpeed;
  maxLives = 3 + (config.extraLives || 0);
  lives = maxLives;

  // Reset parameters
  score = 0;
  distance = 0;
  obstacles = [];
  coins = [];
  particles = [];
  sessionCoins = 0;
  document.getElementById('hud-coins').innerText = '0000';
  
  player.targetLane = 1;
  player.x = LANES[1];
  player.isJumping = false;
  player.jumpHeight = 0;
  isInvulnerable = false;
  invulnerableTimer = 0;
  laserCooldownTimer = 0;
  activeLaserDrawTimer = 0;
  aegisAbsorbTimer = 0;

  initStarfield();
  updateLivesUI();
  updateLaserHUD();

  // Handle Overlay UIs Visibility
  document.getElementById('menu-overlay').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('hud-overlay').classList.remove('hidden');

  // Trigger main animation thread
  lastTime = performance.now();
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(gameLoop);
}

function endGame() {
  currentState = STATES.GAMEOVER;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  // Show UI overlays
  document.getElementById('hud-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.remove('hidden');
  
  const finalScoreEl = document.getElementById('final-score');
  finalScoreEl.innerText = Math.floor(score).toString().padStart(6, '0');

  // Verify and process leaderboard checks
  checkAndProcessHighScore(Math.floor(score));
  updateLaserHUD();
  syncBalancesUI();
}

function togglePause() {
  if (currentState === STATES.PLAYING) {
    currentState = STATES.PAUSED;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    document.getElementById('pause-overlay').classList.remove('hidden');
  } else if (currentState === STATES.PAUSED) {
    currentState = STATES.PLAYING;
    lastTime = performance.now();
    document.getElementById('pause-overlay').classList.add('hidden');
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

// --- Menu UI Event Triggers ---
document.getElementById('btn-start-game').addEventListener('click', startGame);
document.getElementById('btn-pause-trigger').addEventListener('click', togglePause);
document.getElementById('btn-resume').addEventListener('click', togglePause);

document.getElementById('btn-restart').addEventListener('click', () => {
  togglePause();
  startGame();
});

document.getElementById('btn-quit').addEventListener('click', () => {
  currentState = STATES.MENU;
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('hud-overlay').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  updateLeaderboardUI();
  syncBalancesUI();
});

document.getElementById('btn-play-again').addEventListener('click', startGame);

document.getElementById('btn-return-menu').addEventListener('click', () => {
  currentState = STATES.MENU;
  document.getElementById('gameover-overlay').classList.add('hidden');
  // Ensure hangar tab is hidden and main menu tab is shown
  document.getElementById('view-hangar').classList.add('hidden');
  document.getElementById('view-main').classList.remove('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  updateLeaderboardUI();
  syncBalancesUI();
});

// --- Hangar & Shop Modal Functions ---
function syncBalancesUI() {
  const menuBalance = document.getElementById('menu-coin-balance');
  const modalBalance = document.getElementById('modal-coin-balance');
  if (menuBalance) menuBalance.innerText = lifetimeCoins;
  if (modalBalance) modalBalance.innerText = lifetimeCoins;
}

// --- Coin Class & Methods ---
class Coin {
  constructor(laneIdx) {
    this.lane = laneIdx;
    this.x = LANES[laneIdx];
    this.y = -50;
    this.radius = 12;
    this.width = this.radius * 2;
    this.height = this.radius * 2;
    this.angle = 0;
    this.pulse = Math.random() * Math.PI;
  }

  update(dt, speed) {
    this.y += speed * dt;
    this.angle += 3.5 * dt;
    this.pulse += 5 * dt;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    
    // Gold neon glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(234, 179, 8, 0.8)';
    
    // Coin shape
    ctx.fillStyle = '#eab308';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    const pulseRadius = this.radius + Math.sin(this.pulse) * 1.5;
    ctx.arc(0, 0, Math.max(4, pulseRadius), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Inner details
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ca8a04';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }
}

function spawnCoins(dt) {
  coinSpawnTimer -= dt;
  if (coinSpawnTimer <= 0) {
    const lane = Math.floor(Math.random() * 3);
    coins.push(new Coin(lane));
    coinSpawnTimer = COIN_SPAWN_INTERVAL + (Math.random() * 0.5);
  }
}

function checkCoinCollisions() {
  const playerLeft = player.x - player.width * 0.45;
  const playerRight = player.x + player.width * 0.45;
  const playerTop = player.y - player.height * 0.45 - player.jumpHeight;
  const playerBottom = player.y + player.height * 0.45 - player.jumpHeight;

  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    
    const closestX = Math.max(playerLeft, Math.min(coin.x, playerRight));
    const closestY = Math.max(playerTop, Math.min(coin.y, playerBottom));
    
    const dx = coin.x - closestX;
    const dy = coin.y - closestY;
    const distSq = dx * dx + dy * dy;
    
    if (distSq < (coin.radius * coin.radius)) {
      collectCoin(coin);
    }
  }
}

function collectCoin(coin) {
  sessionCoins++;
  lifetimeCoins++;
  localStorage.setItem(LOCAL_STORAGE_COINS_KEY, lifetimeCoins);
  
  document.getElementById('hud-coins').innerText = sessionCoins.toString().padStart(4, '0');

  // Sparkle particles
  const pCount = 8;
  for (let i = 0; i < pCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 100 + 40;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 50;
    particles.push(new Particle(coin.x, coin.y, vx, vy, '#fef08a', Math.random() * 2 + 1.5, Math.random() * 0.2 + 0.15));
  }

  coins = coins.filter(c => c !== coin);
}

function openShopModal(source) {
  shopOriginSource = source;
  syncBalancesUI();
  
  shopAnimState = 'idle';
  shopAnimProgress = 0;
  previewParticles = [];
  
  renderHangarShop();
  
  // Tab switching inside menu-overlay: hide main view, show hangar view
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-hangar').classList.remove('hidden');
  
  // Ensure menu-overlay is visible
  document.getElementById('menu-overlay').classList.remove('hidden');
  // Hide gameover-overlay in case we came from game over
  document.getElementById('gameover-overlay').classList.add('hidden');
  
  // Start shop loop
  lastShopTime = performance.now();
  if (shopAnimationId) cancelAnimationFrame(shopAnimationId);
  shopAnimationId = requestAnimationFrame(shopLoop);
}

// Semantic alias per spec
function openHangarShop(source) {
  openShopModal(source);
}

function closeHangarShop() {
  if (shopAnimationId) {
    cancelAnimationFrame(shopAnimationId);
    shopAnimationId = null;
  }
  
  if (shopOriginSource === 'gameover') {
    // Hide menu-overlay completely and reveal gameover-overlay
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('gameover-overlay').classList.remove('hidden');
  } else if (shopOriginSource === 'menu') {
    // Switch tabs back to main view inside menu-overlay
    document.getElementById('view-hangar').classList.add('hidden');
    document.getElementById('view-main').classList.remove('hidden');
    syncBalancesUI();
  }
}

function shopLoop(timestamp) {
  if (document.getElementById('view-hangar').classList.contains('hidden')) {
    shopAnimationId = null;
    return;
  }
  
  let dt = (timestamp - lastShopTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastShopTime = timestamp;
  
  updateShopPreview(dt);
  drawShopPreviewCanvas();
  
  shopAnimationId = requestAnimationFrame(shopLoop);
}

function updateShopPreview(dt) {
  previewParticles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  previewParticles = previewParticles.filter(p => p.life > 0);
  
  const shipId = SHOP_SHIP_IDS[currentShopShipIndex];
  const config = SHIP_CONFIGS[shipId] || SHIP_CONFIGS.base;
  const theme = config.colorTheme;
  
  if (shopAnimState === 'flyOut') {
    shopAnimProgress += dt * 4.5; // fly out fast
    
    // Engine sparks trail during flyOut
    if (Math.random() < 0.6) {
      const shipX = 60 + (shopAnimProgress * 150 * shopFlyDirection * -1);
      const shipY = 60 + Math.sin(Date.now() / 300) * 5;
      previewParticles.push({
        x: shipX + 18 * shopFlyDirection,
        y: shipY + (Math.random() - 0.5) * 8,
        vx: (120 + Math.random() * 60) * shopFlyDirection,
        vy: (Math.random() - 0.5) * 40,
        color: theme.trim,
        size: Math.random() * 2 + 1,
        life: Math.random() * 0.3 + 0.1,
        maxLife: 0.4
      });
    }

    if (shopAnimProgress >= 1) {
      currentShopShipIndex = shopTargetIndex;
      shopAnimState = 'flyIn';
      shopAnimProgress = 0;
      renderHangarShop(true); // skip canvas static draw
    }
  } else if (shopAnimState === 'flyIn') {
    shopAnimProgress += dt * 4.0; // glide in
    
    // Engine sparks trail during flyIn
    if (Math.random() < 0.6) {
      const shipX = (60 + (150 * shopFlyDirection)) - (shopAnimProgress * 150 * shopFlyDirection);
      const shipY = 60 + Math.sin(Date.now() / 300) * 5;
      previewParticles.push({
        x: shipX + 18 * shopFlyDirection,
        y: shipY + (Math.random() - 0.5) * 8,
        vx: (120 + Math.random() * 60) * shopFlyDirection,
        vy: (Math.random() - 0.5) * 40,
        color: theme.trim,
        size: Math.random() * 2 + 1,
        life: Math.random() * 0.3 + 0.1,
        maxLife: 0.4
      });
    }

    if (shopAnimProgress >= 1) {
      shopAnimState = 'idle';
      shopAnimProgress = 0;
    }
  } else {
    // idle state: gentle fire trail
    if (Math.random() < 0.3) {
      const shipX = 60;
      const shipY = 60 + Math.sin(Date.now() / 300) * 5;
      previewParticles.push({
        x: shipX - 18,
        y: shipY + (Math.random() - 0.5) * 6,
        vx: -80 - Math.random() * 40,
        vy: (Math.random() - 0.5) * 20,
        color: theme.trim,
        size: Math.random() * 1.5 + 0.8,
        life: Math.random() * 0.2 + 0.1,
        maxLife: 0.3
      });
    }
  }
}

function drawShopPreviewCanvas() {
  const previewCanvas = document.getElementById('shop-preview-canvas');
  if (!previewCanvas) return;
  const pCtx = previewCanvas.getContext('2d');
  if (!pCtx) return;
  
  pCtx.clearRect(0, 0, 120, 120);
  
  // Draw particles
  previewParticles.forEach(p => {
    pCtx.save();
    pCtx.globalAlpha = Math.max(0, p.life / p.maxLife);
    pCtx.shadowBlur = 6;
    pCtx.shadowColor = p.color;
    pCtx.fillStyle = p.color;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.restore();
  });
  
  const shipId = SHOP_SHIP_IDS[currentShopShipIndex];
  const config = SHIP_CONFIGS[shipId] || SHIP_CONFIGS.base;
  const theme = config.colorTheme;
  
  pCtx.save();
  
  let x = 60;
  let y = 60 + Math.sin(Date.now() / 300) * 5;
  let scale = 1.0;
  let rotation = -0.15;
  
  if (shopAnimState === 'flyOut') {
    x = 60 + (shopAnimProgress * 150 * shopFlyDirection * -1);
    scale = 1.0 - shopAnimProgress * 0.7;
    rotation = -0.15 + (shopAnimProgress * 0.3 * -shopFlyDirection);
  } else if (shopAnimState === 'flyIn') {
    x = (60 + (150 * shopFlyDirection)) - (shopAnimProgress * 150 * shopFlyDirection);
    scale = 0.3 + shopAnimProgress * 0.7;
    rotation = (-0.15 - 0.15 * shopFlyDirection) + (shopAnimProgress * 0.15 * shopFlyDirection);
  }
  
  pCtx.translate(x, y);
  pCtx.scale(scale, scale);
  pCtx.rotate(rotation);
  
  // Engine pulse glow
  const enginePulse = Math.sin(Date.now() / 50) * 2 + 2;
  pCtx.shadowBlur = 12;
  pCtx.shadowColor = theme.glow;
  pCtx.fillStyle = theme.trim;
  pCtx.beginPath();
  pCtx.moveTo(-6, 12);
  pCtx.lineTo(0, 20 + enginePulse);
  pCtx.lineTo(6, 12);
  pCtx.closePath();
  pCtx.fill();
  
  // Ship Chassis
  pCtx.shadowBlur = 10;
  pCtx.shadowColor = theme.glow;
  
  const w = 36;
  const h = 44;
  
  pCtx.fillStyle = theme.body;
  pCtx.strokeStyle = theme.glow;
  pCtx.lineWidth = 2.0;
  
  pCtx.beginPath();
  pCtx.moveTo(0, -h/2); // nose cone
  pCtx.lineTo(w/2, h/4); // right wing tip
  pCtx.lineTo(w/3, h/2); // right rear corner
  pCtx.lineTo(w/6, h/3); // thruster recess right
  pCtx.lineTo(-w/6, h/3); // thruster recess left
  pCtx.lineTo(-w/3, h/2); // left rear corner
  pCtx.lineTo(-w/2, h/4); // left wing tip
  pCtx.closePath();
  pCtx.fill();
  pCtx.stroke();
  
  // Cockpit glass
  pCtx.shadowBlur = 6;
  pCtx.fillStyle = theme.cockpit;
  pCtx.beginPath();
  pCtx.moveTo(0, -h/3);
  pCtx.lineTo(w/5, -h/15);
  pCtx.lineTo(w/8, h/8);
  pCtx.lineTo(-w/8, h/8);
  pCtx.lineTo(-w/5, -h/15);
  pCtx.closePath();
  pCtx.fill();
  
  // Wing Decals
  pCtx.strokeStyle = theme.trim;
  pCtx.lineWidth = 1.0;
  pCtx.beginPath();
  pCtx.moveTo(-w/3.5, h/8);
  pCtx.lineTo(-w/2.5, h/5.5);
  pCtx.moveTo(w/3.5, h/8);
  pCtx.lineTo(w/2.5, h/5.5);
  pCtx.stroke();
  
  pCtx.restore();
}

function slideShopShip(offset) {
  if (shopAnimState !== 'idle') return;
  
  shopFlyDirection = offset;
  
  let newIndex = currentShopShipIndex + offset;
  if (newIndex < 0) {
    newIndex = SHOP_SHIP_IDS.length - 1;
  } else if (newIndex >= SHOP_SHIP_IDS.length) {
    newIndex = 0;
  }
  
  shopTargetIndex = newIndex;
  shopAnimState = 'flyOut';
  shopAnimProgress = 0;
}

function renderShopDots() {
  const dotsContainer = document.getElementById('shop-carousel-dots');
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';
  
  SHOP_SHIP_IDS.forEach((shipId, index) => {
    const dot = document.createElement('div');
    dot.className = `w-2.5 h-2.5 rounded-full transition-all duration-200 cursor-pointer ${
      index === currentShopShipIndex 
        ? 'bg-cyan-400 shadow-[0_0_8px_#06b6d4] scale-110' 
        : 'bg-gray-600/50 hover:bg-gray-500/70'
    }`;
    dot.onclick = () => {
      if (shopAnimState !== 'idle') return;
      if (index === currentShopShipIndex) return;
      
      shopFlyDirection = index > currentShopShipIndex ? 1 : -1;
      shopTargetIndex = index;
      shopAnimState = 'flyOut';
      shopAnimProgress = 0;
      renderShopDots();
    };
    dotsContainer.appendChild(dot);
  });
}

function renderHangarShop(skipCanvasInit = false) {
  const listContainer = document.getElementById('hangar-shop-list');
  if (!listContainer) return;
  
  const shipId = SHOP_SHIP_IDS[currentShopShipIndex];
  const config = SHIP_CONFIGS[shipId];
  const isOwned = ownedShips.includes(shipId);
  const isActive = shipId === equippedShip;
  const price = getShipPrice(shipId);

  // Upgrades Levels
  const engineLevel = shipUpgrades[shipId]?.engine || 1;
  const shieldLevel = shipUpgrades[shipId]?.shield || 1;

  // 1. Calculate speed multiplier and bar percentage
  const speedBonus = (engineLevel - 1) * 0.08;
  const combinedSpeed = config.speedMultiplier + speedBonus;
  let speedPct = Math.min(100, combinedSpeed * 60);

  // 2. Calculate shield hardening and bar percentage
  const shieldBonus = (shieldLevel - 1) * 0.05;
  const combinedShield = config.shieldHardening + shieldBonus;
  let shieldPct = Math.min(100, combinedShield * 180);

  // 3. Calculate ability bar percentage and descriptions
  let abilityPct = 0;
  if (shipId === 'fast') abilityPct = 60;
  else if (shipId === 'magnet') abilityPct = Math.min(100, 75 + (shieldLevel - 1) * 5);
  else if (shipId === 'laser') abilityPct = Math.min(100, 50 + (shieldLevel - 1) * 12.5);
  else if (shipId === 'aegis') abilityPct = 100;
  
  let abilityName = 'Standard Thrusters';
  let abilityDesc = 'None';
  if (shipId === 'fast') { abilityName = 'Hyper Engine'; abilityDesc = 'Speed Boost'; }
  else if (shipId === 'magnet') { abilityName = 'Coin Magnet'; abilityDesc = '150px Pull'; }
  else if (shipId === 'laser') { abilityName = 'Laser Cannon'; abilityDesc = "Shoot obstacles ('F')"; }
  else if (shipId === 'aegis') { abilityName = 'Aegis Shield'; abilityDesc = '50% Absorb + Extra Life'; }

  // 4. Construct labels and MAX tags
  const speedLabel = `Speed: ${config.speedMultiplier}x ${
    engineLevel > 1 
      ? `<span class="text-cyan-400 font-bold ml-1">(+${speedBonus.toFixed(2)}x)</span>` 
      : ''
  }`;
  const speedMaxTag = engineLevel === 5 ? `<span class="text-yellow-400 font-bold ml-2">MAX</span>` : '';

  const shieldLabel = `Shield: ${(config.shieldHardening * 100)}% ${
    shieldLevel > 1 
      ? `<span class="text-cyan-400 font-bold ml-1">(+${(shieldBonus * 100).toFixed(0)}%)</span>` 
      : ''
  }`;
  const shieldMaxTag = shieldLevel === 5 ? `<span class="text-yellow-400 font-bold ml-2">MAX</span>` : '';

  let abilityLabel = `Ability: ${abilityName}`;
  let abilityMaxTag = '';

  if (shipId === 'laser') {
    const dynamicCooldown = Math.max(4.0, 8.0 - (shieldLevel - 1) * 1.0);
    abilityLabel = `Laser Cannon (CD: ${dynamicCooldown.toFixed(0)}s) ${
      shieldLevel > 1 
        ? `<span class="text-cyan-400 font-bold ml-1">(-${(shieldLevel - 1)}s)</span>` 
        : ''
    }`;
    abilityMaxTag = shieldLevel === 5 ? `<span class="text-yellow-400 font-bold ml-2">MAX</span>` : '';
  } else if (shipId === 'magnet') {
    const dynamicRadius = 150 + (shieldLevel - 1) * 50;
    abilityLabel = `Coin Magnet (Radius: ${dynamicRadius}px) ${
      shieldLevel > 1 
        ? `<span class="text-cyan-400 font-bold ml-1">(+${(shieldLevel - 1) * 50}px)</span>` 
        : ''
    }`;
    abilityMaxTag = shieldLevel === 5 ? `<span class="text-yellow-400 font-bold ml-2">MAX</span>` : '';
  } else if (shipId === 'aegis') {
    const dynamicRecycle = engineLevel * 10;
    abilityLabel = `Scrap Recycler (Recycle: ${dynamicRecycle}%) ${
      engineLevel > 1 
        ? `<span class="text-cyan-400 font-bold ml-1">(+${(engineLevel - 1) * 10}%)</span>` 
        : ''
    }`;
    abilityMaxTag = engineLevel === 5 ? `<span class="text-yellow-400 font-bold ml-2">MAX</span>` : '';
  }

  let desc = 'Standard issues fighter';
  if (shipId === 'fast') desc = 'Lightweight engine racer';
  else if (shipId === 'magnet') desc = 'Coin attracting field generator';
  else if (shipId === 'laser') desc = 'Heavy pulse combat ship';
  else if (shipId === 'aegis') desc = 'Fortress class survival cruiser';

  let actionButtonHTML = '';
  if (isActive) {
    actionButtonHTML = `
      <button class="w-24 h-8 flex items-center justify-center bg-cyan-500 text-black font-mono font-bold text-xs uppercase rounded-lg border border-cyan-400 cursor-default shadow-[0_0_12px_rgba(6,182,212,0.4)] truncate px-1" disabled>
        Active
      </button>
    `;
  } else if (isOwned) {
    actionButtonHTML = `
      <button onclick="equipShip('${shipId}')" class="w-24 h-8 flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs uppercase rounded-lg transition-all active:scale-95 shadow-[0_0_10px_rgba(168,85,247,0.3)] truncate px-1">
        Equip
      </button>
    `;
  } else {
    const canAfford = lifetimeCoins >= price;
    const btnClass = canAfford 
      ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-[0_0_10px_rgba(234,179,8,0.3)]' 
      : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700/30';
    const disabledAttr = canAfford ? '' : 'disabled';
    actionButtonHTML = `
      <button onclick="buyShip('${shipId}')" class="w-24 h-8 flex items-center justify-center font-mono font-bold text-xs uppercase rounded-lg transition-all active:scale-95 truncate px-1 ${btnClass}" ${disabledAttr}>
        Buy ${price}
      </button>
    `;
  }

  // Dynamic labels for ship-specific upgrades
  let engineTitle = 'Engine Tuning';
  let engineSub = '(Speed Booster)';
  let shieldTitle = 'Shield Matrix';
  let shieldSub = '(Shield Duration)';

  if (shipId === 'laser') {
    shieldTitle = 'Laser Capacitor';
    shieldSub = '(Cooldown)';
  } else if (shipId === 'magnet') {
    shieldTitle = 'Gravity Well';
    shieldSub = '(Magnet Radius)';
  } else if (shipId === 'aegis') {
    engineTitle = 'Scrap Recycler';
    engineSub = '(Coin Conversion)';
  }

  // Upgrades Tiers HTML
  const theme = config.colorTheme;
  let engineTiersHTML = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= engineLevel) {
      engineTiersHTML += `<div class="w-2.5 h-2 rounded-sm shadow-[0_0_6px_rgba(6,182,212,0.5)]" style="background-color: ${theme.glow}"></div>`;
    } else {
      engineTiersHTML += `<div class="w-2.5 h-2 rounded-sm border border-purple-500/30 bg-black/40"></div>`;
    }
  }

  let shieldTiersHTML = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= shieldLevel) {
      shieldTiersHTML += `<div class="w-2.5 h-2 rounded-sm shadow-[0_0_6px_rgba(244,63,94,0.5)]" style="background-color: ${theme.glow}"></div>`;
    } else {
      shieldTiersHTML += `<div class="w-2.5 h-2 rounded-sm border border-purple-500/30 bg-black/40"></div>`;
    }
  }

  const engineCost = engineLevel * 250;
  const shieldCost = shieldLevel * 250;
  
  let engineBtnHTML = '';
  if (!isOwned) {
    engineBtnHTML = `
      <button id="btn-upgrade-engine" class="w-full max-w-[140px] px-2 h-9 flex items-center justify-center text-gray-500 bg-gray-800/40 border border-gray-700/30 rounded-lg text-xs font-mono font-bold uppercase cursor-not-allowed truncate" disabled>
        Locked
      </button>
    `;
  } else if (engineLevel >= 5) {
    engineBtnHTML = `
      <button id="btn-upgrade-engine" class="w-full max-w-[140px] px-2 h-9 flex items-center justify-center text-cyan-400 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-xs font-mono font-bold uppercase cursor-default truncate" disabled>
        MAXED
      </button>
    `;
  } else {
    const canAfford = lifetimeCoins >= engineCost;
    const btnClass = canAfford 
      ? 'bg-purple-900/60 hover:bg-purple-800/70 text-cyan-300 border-purple-500/50 hover:border-cyan-400/80 shadow-[0_0_8px_rgba(168,85,247,0.2)]' 
      : 'text-gray-500 bg-gray-800/40 border border-gray-700/30 cursor-not-allowed';
    const disabledAttr = canAfford ? '' : 'disabled';
    engineBtnHTML = `
      <button id="btn-upgrade-engine" onclick="buyUpgrade('${shipId}', 'engine')" class="w-full max-w-[140px] px-2 h-9 flex items-center justify-center border rounded-lg text-xs font-mono font-bold uppercase transition-all active:scale-95 truncate ${btnClass}" ${disabledAttr}>
        Upgrade [${engineCost}]
      </button>
    `;
  }

  let shieldBtnHTML = '';
  if (!isOwned) {
    shieldBtnHTML = `
      <button id="btn-upgrade-shield" class="w-full max-w-[140px] px-2 h-9 flex items-center justify-center text-gray-500 bg-gray-800/40 border border-gray-700/30 rounded-lg text-xs font-mono font-bold uppercase cursor-not-allowed truncate" disabled>
        Locked
      </button>
    `;
  } else if (shieldLevel >= 5) {
    shieldBtnHTML = `
      <button id="btn-upgrade-shield" class="w-full max-w-[140px] px-2 h-9 flex items-center justify-center text-rose-400 bg-rose-950/20 border border-rose-500/30 rounded-lg text-xs font-mono font-bold uppercase cursor-default truncate" disabled>
        MAXED
      </button>
    `;
  } else {
    const canAfford = lifetimeCoins >= shieldCost;
    const btnClass = canAfford 
      ? 'bg-purple-900/60 hover:bg-purple-800/70 text-rose-300 border-purple-500/50 hover:border-rose-400/80 shadow-[0_0_8px_rgba(168,85,247,0.2)]' 
      : 'text-gray-500 bg-gray-800/40 border border-gray-700/30 cursor-not-allowed';
    const disabledAttr = canAfford ? '' : 'disabled';
    shieldBtnHTML = `
      <button id="btn-upgrade-shield" onclick="buyUpgrade('${shipId}', 'shield')" class="w-full max-w-[140px] px-2 h-9 flex items-center justify-center border rounded-lg text-xs font-mono font-bold uppercase transition-all active:scale-95 truncate ${btnClass}" ${disabledAttr}>
        Upgrade [${shieldCost}]
      </button>
    `;
  }

  const upgradesUIHTML = `
    <div class="mt-2 border-t border-purple-500/20 pt-2 flex flex-col gap-2">
      <h5 class="text-xs md:text-sm font-bold text-center tracking-wider text-purple-400 uppercase">Upgrades & Tuning</h5>
      
      <!-- Engine Tuning -->
      <div class="flex flex-wrap md:flex-nowrap items-center justify-between gap-1.5 py-1 w-full">
        <div class="flex-1 min-w-[100px] flex flex-col text-left">
          <span class="text-xs md:text-sm font-bold text-gray-200 truncate">${engineTitle}</span>
          <span class="text-[9px] md:text-[11px] text-gray-400 font-mono truncate">${engineSub}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap flex-1 justify-end">
          <div class="flex gap-1 flex-shrink-0">
            ${engineTiersHTML}
          </div>
          ${engineBtnHTML}
        </div>
      </div>

      <!-- Shield Matrix -->
      <div class="flex flex-wrap md:flex-nowrap items-center justify-between gap-1.5 py-1 w-full">
        <div class="flex-1 min-w-[100px] flex flex-col text-left">
          <span class="text-xs md:text-sm font-bold text-gray-200 truncate">${shieldTitle}</span>
          <span class="text-[9px] md:text-[11px] text-gray-400 font-mono truncate">${shieldSub}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap flex-1 justify-end">
          <div class="flex gap-1 flex-shrink-0">
            ${shieldTiersHTML}
          </div>
          ${shieldBtnHTML}
        </div>
      </div>
    </div>
  `;

  listContainer.innerHTML = `
    <div class="flex flex-col gap-3">
      <div class="flex justify-between items-start gap-2">
        <div class="flex-1 min-w-0">
          <h4 class="text-base md:text-lg font-black text-cyan-400 uppercase tracking-wide truncate">${config.name}</h4>
          <div class="h-10 md:h-12 overflow-y-auto mt-0.5 pr-1">
            <p class="text-xs md:text-sm font-mono text-gray-400 uppercase leading-tight">${desc}</p>
          </div>
        </div>
        <div class="flex-shrink-0">
          ${actionButtonHTML}
        </div>
      </div>

      <!-- Dedicated Preview Box -->
      <div id="shop-ship-preview-container" class="flex justify-center items-center h-28 bg-black/30 border border-purple-500/20 rounded-xl mb-1 relative overflow-hidden">
        <canvas id="shop-preview-canvas" width="120" height="120" class="block"></canvas>
      </div>
      
      <div class="space-y-1.5 font-mono text-xs md:text-sm text-gray-300">
        <div>
          <div class="flex justify-between mb-0.5 items-center">
            <span>${speedLabel}</span>
            ${speedMaxTag}
          </div>
          <div class="w-full bg-black/50 rounded-full h-2 border border-cyan-500/20 overflow-hidden">
            <div class="bg-cyan-500 h-full rounded-full" style="width: ${speedPct}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between mb-0.5 items-center">
            <span>${shieldLabel}</span>
            ${shieldMaxTag}
          </div>
          <div class="w-full bg-black/50 rounded-full h-2 border border-rose-500/20 overflow-hidden">
            <div class="bg-rose-500 h-full rounded-full" style="width: ${shieldPct}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between mb-0.5 items-center flex-wrap">
            <span>${abilityLabel}</span>
            ${abilityMaxTag}
          </div>
          <div class="w-full bg-black/50 rounded-full h-2 border border-yellow-500/20 overflow-hidden">
            <div class="bg-yellow-500 h-full rounded-full" style="width: ${abilityPct}%"></div>
          </div>
        </div>
      </div>

      ${upgradesUIHTML}
    </div>
  `;

  // Draw ship preview static frame if bypass flag is false
  if (!skipCanvasInit) {
    drawShopShipPreview(shipId);
  }

  // Render carousel dots
  renderShopDots();
}

function drawShopShipPreview(shipId) {
  drawShopPreviewCanvas();
}

window.buyUpgrade = function(shipId, upgradeType) {
  if (!ownedShips.includes(shipId)) return;
  
  const currentLvl = shipUpgrades[shipId]?.[upgradeType] || 1;
  if (currentLvl >= 5) return;
  
  const cost = currentLvl * 250;
  if (lifetimeCoins >= cost) {
    lifetimeCoins -= cost;
    localStorage.setItem(LOCAL_STORAGE_COINS_KEY, lifetimeCoins);
    
    if (!shipUpgrades[shipId]) {
      shipUpgrades[shipId] = { engine: 1, shield: 1 };
    }
    shipUpgrades[shipId][upgradeType]++;
    localStorage.setItem(LOCAL_STORAGE_UPGRADES_KEY, JSON.stringify(shipUpgrades));
    
    syncBalancesUI();
    renderHangarShop(true); // render without overwriting active loop animation
  }
}

function getShipPrice(shipId) {
  switch (shipId) {
    case 'fast': return 100;
    case 'magnet': return 250;
    case 'laser': return 450;
    case 'aegis': return 600;
    default: return 0;
  }
}

window.buyShip = function(shipId) {
  const price = getShipPrice(shipId);
  if (lifetimeCoins >= price) {
    lifetimeCoins -= price;
    localStorage.setItem(LOCAL_STORAGE_COINS_KEY, lifetimeCoins);
    
    ownedShips.push(shipId);
    localStorage.setItem(LOCAL_STORAGE_SHIPS_KEY, JSON.stringify(ownedShips));
    
    equippedShip = shipId;
    localStorage.setItem(LOCAL_STORAGE_EQUIPPED_KEY, equippedShip);
    
    syncBalancesUI();
    renderHangarShop();
  }
}

window.equipShip = function(shipId) {
  if (ownedShips.includes(shipId)) {
    equippedShip = shipId;
    localStorage.setItem(LOCAL_STORAGE_EQUIPPED_KEY, equippedShip);
    
    syncBalancesUI();
    renderHangarShop();
  }
}

// --- Ship Specific Abilities ---
function triggerLaser() {
  if (equippedShip !== 'laser') return;
  if (currentState !== STATES.PLAYING) return;
  if (laserCooldownTimer > 0) return;

  const laserLane = player.targetLane;
  
  let target = null;
  let minDistY = LOGICAL_HEIGHT;
  
  obstacles.forEach(obs => {
    if (obs.lane === laserLane && obs.y < player.y) {
      const distY = player.y - obs.y;
      if (distY < minDistY) {
        minDistY = distY;
        target = obs;
      }
    }
  });

  activeLaserDrawTimer = 0.18;
  laserBeamX = LANES[laserLane];

  if (target) {
    laserBeamY = target.y;
    spawnExplosion(target.x, target.y, '#ff0033');
    particles.push(new Particle(target.x, target.y - 15, 0, -40, '#f43f5e', 0, 0.6, "DESTROYED"));
    obstacles = obstacles.filter(o => o !== target);
  } else {
    laserBeamY = -100;
  }

  shakeTimer = 0.2;
  const upgrades = shipUpgrades.laser || { engine: 1, shield: 1 };
  const baseCooldown = SHIP_CONFIGS.laser.laserCooldown;
  const cooldownReduction = (upgrades.shield - 1) * 1.0;
  laserCooldownTimer = Math.max(1.0, baseCooldown - cooldownReduction);
  updateLaserHUD();
}

function updateLaserHUD() {
  const panel = document.getElementById('hud-laser-panel');
  const bar = document.getElementById('hud-laser-bar');
  const text = document.getElementById('hud-laser-text');
  const mobileContainer = document.getElementById('mobile-laser-container');

  if (equippedShip === 'laser') {
    panel.classList.remove('hidden');
    if (currentState === STATES.PLAYING) {
      mobileContainer.classList.remove('hidden');
      panel.style.bottom = '96px';
    } else {
      mobileContainer.classList.add('hidden');
      panel.style.bottom = '24px';
    }

    if (laserCooldownTimer > 0) {
      const upgrades = shipUpgrades.laser || { engine: 1, shield: 1 };
      const baseCooldown = SHIP_CONFIGS.laser.laserCooldown;
      const cooldownReduction = (upgrades.shield - 1) * 1.0;
      const maxCooldown = Math.max(1.0, baseCooldown - cooldownReduction);
      const pct = ((maxCooldown - laserCooldownTimer) / maxCooldown) * 100;
      bar.style.width = `${pct}%`;
      text.innerText = `${laserCooldownTimer.toFixed(1)}s`;
      text.className = 'text-[10px] text-rose-400 font-mono font-bold animate-pulse';
    } else {
      bar.style.width = '100%';
      text.innerText = 'READY';
      text.className = 'text-[10px] text-white font-mono font-bold';
    }
  } else {
    panel.classList.add('hidden');
    mobileContainer.classList.add('hidden');
  }
}

// --- Click & Touch Event Listeners ---
document.getElementById('btn-open-shop-menu').addEventListener('click', () => {
  openHangarShop('menu');
});

document.getElementById('btn-open-shop-gameover').addEventListener('click', () => {
  openShopModal('gameover');
});

document.getElementById('btn-close-shop').addEventListener('click', () => {
  closeHangarShop();
});

document.getElementById('btn-shop-prev').addEventListener('click', () => {
  slideShopShip(-1);
});

document.getElementById('btn-shop-next').addEventListener('click', () => {
  slideShopShip(1);
});

// --- Hangar Shop Touch Swipe Gestures ---
const shopSwipeContainer = document.getElementById('hangar-shop-swipe-container');
if (shopSwipeContainer) {
  let touchStartX = 0;
  let touchEndX = 0;

  shopSwipeContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  shopSwipeContainer.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diffX = touchStartX - touchEndX;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) {
        slideShopShip(1); // Swipe Left -> Next
      } else {
        slideShopShip(-1); // Swipe Right -> Prev
      }
    }
  }, { passive: true });
}

document.getElementById('btn-fire-laser-mobile').addEventListener('touchstart', (e) => {
  e.preventDefault();
  triggerLaser();
});

// --- Initialization Runs ---
initStarfield();
updateLeaderboardUI();
syncBalancesUI();
// Draw static menu background lines once at load
drawEnvironment(0.016);
draw();

// --- Auto-Shutdown Signal ---
window.addEventListener('beforeunload', () => {
  navigator.sendBeacon('http://localhost:3000/shutdown');
});
