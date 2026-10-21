export const GAME_CONFIG = {
  ROOMS: { TOTAL: 3, WAVES_PER_ROOM: 3 },
  WAVES: {
    1: { count: 1, pattern: 'chase', spawnType: 'progressive', batchSize: 2, intervalMs: 1200 },
    2: { count: 1, pattern: 'linear', spawnType: 'batch', batchSize: 5, intervalMs: 2000 },
    3: { count: 1, pattern: 'random', spawnType: 'batch', batchSize: 8, intervalMs: 2500 },
  },
  SCALING: {
    ROOM_SPEED_MULTIPLIERS: [1, 1.25, 1.5],
    WAVE_SPEED_MULTIPLIERS: [1, 1.15, 1.3],
    ROOM_DAMAGE: [0.5, 0.5, 1],
    BASE_ENEMY_SPEED: 40,
  },
  SPAWN_SAFE_RADIUS: 180,
};

export const MUSIC_CONFIG = {
  MAIN: { name: 'BugBlitz', src: '/audios/BugBlitz.mp3', bpm: 130, volume: 0.15 },
  BOSS_1: { name: "Spider Queen's Arcade", src: "/audios/MANTIS OVERDRIVE.mp3", bpm: 110, volume: 0.15 },
  BOSS_2: { name: 'ArmorBugApocalipse', src: '/audios/ArmorBugApocalipse.mp3', bpm: 200, volume: 0.2 },
  BOSS_3: { name: 'MANTIS OVERDRIVE', src: "/audios/Spider Queen's Arcade.mp3", bpm: 180, volume: 0.2 },
};