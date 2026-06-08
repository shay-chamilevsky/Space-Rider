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
  constructor(x, y, vx, vy, color, size, life) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life; // initial life in seconds
    this.maxLife = life;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
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
  const color = player.isJumping ? '#06b6d4' : '#f43f5e';
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

  // Draw Spacecraft Graphics
  // Engine glow (pulses)
  const enginePulse = Math.sin(Date.now() / 40) * 4;
  ctx.shadowBlur = 10 + enginePulse;
  ctx.shadowColor = '#f43f5e';
  ctx.fillStyle = '#ff6688';
  ctx.beginPath();
  ctx.moveTo(-6, 25);
  ctx.lineTo(0, 32 + enginePulse);
  ctx.lineTo(6, 25);
  ctx.closePath();
  ctx.fill();

  // Ship Outer Glow Border
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#06b6d4';
  
  // Main chassis path
  const w = player.width;
  const h = player.height;
  
  ctx.fillStyle = '#0f172a'; // Deep metal gray
  ctx.strokeStyle = '#06b6d4'; // Cyan neon
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

  // Cockpit glass (neon green-blue)
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#00ffcc';
  ctx.beginPath();
  ctx.moveTo(0, -h/3);
  ctx.lineTo(w/5, -h/15);
  ctx.lineTo(w/8, h/8);
  ctx.lineTo(-w/8, h/8);
  ctx.lineTo(-w/5, -h/15);
  ctx.closePath();
  ctx.fill();

  // Wing Decals
  ctx.strokeStyle = '#a855f7';
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
    invulnerableTimer = INVULNERABILITY_DURATION;
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

  // 2. Linear Speed Escalation
  currentSpeed += speedIncrement * dt;
  // Scale spawn frequency down with speed (faster speed -> faster spawn)
  currentSpawnInterval = Math.max(0.65, baseSpawnInterval - (currentSpeed - baseSpeed) / 450);

  // 3. Score & continuous distance increments
  distance += currentSpeed * dt;
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

  // 8. Spawner triggering
  spawnObstacles(dt);

  // 9. Particle movement ticks
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => p.life > 0);

  // 10. Process Collisions
  checkCollisions();
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

  // Draw obstacles
  obstacles.forEach(obs => obs.draw());

  // Draw particles (exhaust + explosions)
  particles.forEach(p => p.draw());

  // Draw Spaceship Model
  drawSpacecraft(1/60);

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
  
  // Reset parameters
  score = 0;
  distance = 0;
  lives = maxLives;
  currentSpeed = baseSpeed;
  obstacles = [];
  particles = [];
  player.targetLane = 1;
  player.x = LANES[1];
  player.isJumping = false;
  player.jumpHeight = 0;
  isInvulnerable = false;
  invulnerableTimer = 0;

  initStarfield();
  updateLivesUI();

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
});

document.getElementById('btn-play-again').addEventListener('click', startGame);

document.getElementById('btn-return-menu').addEventListener('click', () => {
  currentState = STATES.MENU;
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  updateLeaderboardUI();
});

// --- Initialization Runs ---
initStarfield();
updateLeaderboardUI();
// Draw static menu background lines once at load
drawEnvironment(0.016);
draw();

// --- Auto-Shutdown Signal ---
window.addEventListener('beforeunload', () => {
  navigator.sendBeacon('http://localhost:3000/shutdown');
});
