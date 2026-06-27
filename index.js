require('dotenv').config();

const admin = require('firebase-admin');

let firestore = null;

if (process.env.USE_FIREBASE_PROFILES === 'true') {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  firestore = admin.firestore();
  console.log('[firebase] Firestore initialized');
}

function useFirebaseProfiles() {
  return !!firestore;
}

function profileCollection(guildId) {
  return firestore.collection('guilds').doc(guildId).collection('buyer_profiles');
}

function linkCollection(guildId) {
  return firestore.collection('guilds').doc(guildId).collection('buyer_profile_links');
}

function eventCollection(guildId) {
  return firestore.collection('guilds').doc(guildId).collection('buyer_point_events');
}

function awardedRoundCollection(guildId) {
  return firestore.collection('guilds').doc(guildId).collection('buyer_awarded_rounds');
}

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const Database = require('better-sqlite3');
const { VALID_POKEMON } = require('./validPokemon');
const { CHOICE_GROUPS } = require('./choiceGroups');
const { RARE_POKEMON } = require('./rarepokemon');
const { getStealPriceInfo, formatStealPrice } = require('./stealPrices');
const { POKEMON_ALIAS_GROUPS } = require('./pokemonAliases');
const {
  RARE_POKEMON: STEAL_RARE_POKEMON,
  REGIONAL_POKEMON: STEAL_REGIONAL_POKEMON,
  GMAX_POKEMON: STEAL_GMAX_POKEMON,
} = require('./stealPrices');
const MONITORED_CHANNELS = [
  '1359714826125054054',
  '1360355438385955046',
  '1351455244579766313',
  '1299233648490450964',
  '1327527123245600860',
  '1335152895120638032',
  '1353952163000221707',
  '1353952203253092382',
  '1328147163074789376',
  '1350349284440281189',
  '1330664983419162709',
  '1335091028692308040',
  '1335091270380556370',
  '1335091392820543571',
  '1335093055858016329',
  '1335094460165652501',
  '1490111593260908626',
  '1482440965670047917',
  '1479555134827790426',
  '1467291429520019617',
  '1490111547647856640',
  '1482842372684513441',
  '1330346795510927421',
  '1369038240002084876',
  '1411457812135149649',
  '1408998216355287050',
  '1352028129270567013',
  '1352027790891024515',
  '1352910706017570907',
  '1328151841611190392',
  '1404169965535363303',
  '1360700714510192710',
  '1329956204079874119',
  '1348284474982666240',
  '1357371915664359824',
  '1374420301257117776',
  '1374420357770907729',
  '1299472736971657226',
  '1401158854837927946',
  '1351797543994003557',
  '1352030093756858458',
  '1344467595713056768',
  '1370401661192900688',
  '1343484220504539156',
  '1387646555875708949',

];

const EPHEMERAL = 64;

const EVENT_QUEUE_ENABLED = false;

const EVENT_SLOT_CONFIG = [
  {
    key: 'event1',
    label: 'Pokopia Ditto',
    fixedPokemon: 'pokopia ditto',
    buyerRoleEnv: 'EVENT1_BUYER_ROLE_ID',
    maxPokemon: 2,
  },
  // add event3 / event4 later if needed
];

const BASE_SLOT_DEFS = [
  { key: 'rare', label: 'Rare', maxPokemon: 1, type: 'normal' },
  { key: 'regional', label: 'Regionals', maxPokemon: 1, type: 'normal' },
  { key: 'gmax', label: 'Gmax', maxPokemon: 1, type: 'normal' },
  { key: 'eevos', label: 'Eevees', maxPokemon: 1, type: 'normal' },
  { key: 'choice1', label: 'Choice1', maxPokemon: 0, type: 'choice' },
  { key: 'choice2', label: 'Choice2', maxPokemon: 0, type: 'choice' },
  { key: 'res1', label: '1Res A', maxPokemon: 1, type: 'normal' },
  { key: 'res2', label: '1Res B', maxPokemon: 1, type: 'normal' },
  { key: 'res3', label: '1Res C', maxPokemon: 1, type: 'normal' },
  { key: 'res4', label: '1Res D', maxPokemon: 1, type: 'normal' },
  { key: 'res5', label: '1Res E', maxPokemon: 1, type: 'normal' },
  { key: 'res6', label: '1Res F', maxPokemon: 1, type: 'normal' },
  { key: 'res7', label: '2Res GH', maxPokemon: 2, type: 'normal' },
  { key: 'res8', label: '2Res IJ', maxPokemon: 2, type: 'normal' },
  { key: 'booster1', label: 'Booster1', maxPokemon: 1, type: 'normal' },
  { key: 'booster2', label: 'Booster2', maxPokemon: 1, type: 'normal' },
  { key: 'donor', label: 'Donor', maxPokemon: 1, type: 'normal' },
  { key: 'org', label: 'Org', maxPokemon: 1, type: 'normal' },
  { key: 'reserver', label: 'Reserver', maxPokemon: 1, type: 'normal' },
];

function buildEventSlotDefs() {
  if (!EVENT_QUEUE_ENABLED) return [];

  return EVENT_SLOT_CONFIG.map((slot) => ({
    key: slot.key,
    label: slot.label,
    maxPokemon: Number(slot.maxPokemon ?? 1),
    type: 'normal',
  }));
}

const SLOT_DEFS = [...BASE_SLOT_DEFS, ...buildEventSlotDefs()];

const SLOT_KEYS = new Set(SLOT_DEFS.map((slot) => slot.key));
const BOOSTER_SLOT_KEYS = new Set(['booster1', 'booster2', 'donor']);
const MAJOR_SLOT_KEYS = new Set([
  'rare',
  'regional',
  'gmax',
  'eevos',
  'choice1',
  'choice2',
  ...(EVENT_QUEUE_ENABLED ? EVENT_SLOT_CONFIG.map((slot) => slot.key) : []),
]);
const CHOOSE_RARE_SLOT_KEYS = new Set(['gmax', 'choice1', 'choice2']);
const CHOICE_SLOT_KEYS = new Set(['choice1', 'choice2']);
const SLOT_COUNT = SLOT_DEFS.length;
const MAIN_SLOT_COUNT = SLOT_DEFS.filter((slot) => !BOOSTER_SLOT_KEYS.has(slot.key)).length;
const BANNED_POKEMON = new Set(['eevee', 'jolteon', 'flareon', 'vaporeon', 'sylveon', 'glaceon', 'espeon', 'umbreon', 'leafeon', 'alcremie',
  'appletun',
  'blastoise',
  'butterfree',
  'centiskorch',
  'charizard',
  'cinderace',
  'coalossal',
  'copperajah',
  'corviknight',
  'drednaw',
  'duraludon',
  'flapple',
  'hatterene',
  'inteleon',
  'kingler',
  'garbodor',
  'gengar',
  'grimmsnarl',
  'lapras',
  'machamp',
  'meowth',
  'orbeetle',
  'rillaboom',
  'sandaconda',
  'snorlax',
  'toxtricity',
  'venusaur',
  'pikachu']);
const CHOICE_GROUP_NAMES = Object.keys(CHOICE_GROUPS || {});
const MAX_SLASH_CHOICES = 25;
const MISSINGNO_NAME = 'missingno';
const RES_SLOT_REGEX = /^res[1-8]$/;
const SINGLE_RES_SLOT_KEYS = ['res1', 'res2', 'res3', 'res4', 'res5', 'res6'];
const DOUBLE_RES_SLOT_KEYS = ['res7', 'res8'];
const overpauseTimers = new Map(); // key = guildId:channelId -> timeout
const MAX_NOTES_PER_SLOT = 3;
const MAX_NOTE_LENGTH = 70;
const FIXED_REMOVE_TAIL = [
  'All Eevee',
  'Vaporeon',
  'Jolteon',
  'Flareon',
  'Espeon',
  'Umbreon',
  'Leafeon',
  'Glaceon',
  'Sylveon',
  'All Pikachu',
  'Missingno',
  'Rare',
  'Regional',
  'Gmax',
  'Paradox',
];

const ALL_FORM_POKEMON = new Set([
  'basculin',
  'cramorant',
  'cyclizar',
  'furfrou',
  'lycanroc',
  'oricorio',
  'tatsugiri',
  'squawkabilly',
  'unown',
  'burmy',
  'castform',
  'cherrim',
  'darmanitan',
  'flabebe',
  'floette',
  'florges',
  'rotom',
  'vivillon',
  'wormadam',
  'deerling',
  'pichu',
  'sawsbuck',
  'morpeko',
  'ursaluna',
  'maushold',
  'dudunsparce',
  'palafin',
  'gimmighoul',
  'eiscue',
  'arceus',
  'silvally',
  'zarude',
  'terapagos',
  'urshifu',
  'deoxys',
  'meloetta',
  'zygarde',
  'xerneas',
  'wishiwashi',
  'ogerpon',
  'genesect',
  'koraidon',
  'miraidon',
  'marshadow',
  'smeargle',
  'greedent',
  'tangrowth',
]);

const REGIONAL_FORM_BASE_POKEMON = new Set([
  'ninetales',
  'vulpix',
  'geodude',
  'graveler',
  'raticate',
  'rattata',
  'persian',
  'meowth',
  'exeggutor',
  'dugtrio',
  'diglett',
  'grimer',
  'golem',
  'sandshrew',
  'sandslash',
  'marowak',
  'raichu',
  'muk',
  'linoone',
  'yamask',
  'slowpoke',
  'slowbro',
  'slowking',
  'farfetch\'d',
  'rapidash',
  'ponyta',
  'mr. mime',
  'weezing',
  'zigzagoon',
  'corsola',
  'darumaka',
  'stunfisk',
  'darmanitan',
  'growlithe',
  'arcanine',
  'electrode',
  'voltorb',
  'typhlosion',
  'lilligant',
  'samurott',
  'sneasel',
  'decidueye',
  'qwilfish',
  'braviary',
  'avalugg',
  'zoroark',
  'zorua',
  'sliggoo',
  'goodra',
  'basculin',
  'wooper',
  'tauros',
  'snorlax',
])

const dbPath = process.env.DB_PATH || 'queue.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS queue_state (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'staff',
  booster_locked INTEGER NOT NULL DEFAULT 1,
  round_number INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sponsor_config (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  sponsor_user_id TEXT
);

CREATE TABLE IF NOT EXISTS temporary_pokemon_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, pokemon_name)
);

CREATE TABLE IF NOT EXISTS incense_channels (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  is_bought INTEGER NOT NULL DEFAULT 0,
  is_paused INTEGER NOT NULL DEFAULT 0,
  bought_at TEXT,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS slots (
  guild_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  slot_label TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  max_pokemon INTEGER NOT NULL DEFAULT 1,
  user_id TEXT,
  pokemon_names TEXT,
  claimed_at TEXT,
  choice_group_name TEXT,
  chosen_rare TEXT,
  ffa_pokemon TEXT,
  PRIMARY KEY (guild_id, slot_key)
);

CREATE TABLE IF NOT EXISTS slot_notes (
  guild_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  note_index INTEGER NOT NULL,
  note_text TEXT NOT NULL,
  PRIMARY KEY (guild_id, slot_key, note_index)
);

CREATE TABLE IF NOT EXISTS user_claim_history (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, slot_key)
);

CREATE TABLE IF NOT EXISTS previous_round_claim_history (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, slot_key)
);

CREATE TABLE IF NOT EXISTS finished_history (
  guild_id TEXT PRIMARY KEY,
  finished_at TEXT NOT NULL,
  summary_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buyer_profiles (
  guild_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  display_user_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  total_buys INTEGER NOT NULL DEFAULT 0,
  rare_buys INTEGER NOT NULL DEFAULT 0,
  regional_buys INTEGER NOT NULL DEFAULT 0,
  gmax_buys INTEGER NOT NULL DEFAULT 0,
  eevos_buys INTEGER NOT NULL DEFAULT 0,
  choice_res_points INTEGER NOT NULL DEFAULT 0,
  choice_buys INTEGER NOT NULL DEFAULT 0,
  single_res_buys INTEGER NOT NULL DEFAULT 0,
  double_res_buys INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, profile_id)
);

CREATE TABLE IF NOT EXISTS buyer_awarded_rounds (
  guild_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, round_number)
);

CREATE TABLE IF NOT EXISTS buyer_profile_links (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS buyer_point_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  slot_key TEXT,
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS readiness (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_ready INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS watch_config (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  channel_id TEXT,
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  last_triggered_at TEXT
);

CREATE TABLE IF NOT EXISTS log_config (
  guild_id TEXT PRIMARY KEY,
  action_log_channel_id TEXT,
  finished_queue_channel_id TEXT
);

CREATE TABLE IF NOT EXISTS event_claim_history (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, round_number)
);
`);

try {
  db.prepare(`
    ALTER TABLE queue_state
    ADD COLUMN round_number INTEGER NOT NULL DEFAULT 1
  `).run();
} catch (error) {
  if (!String(error.message).includes('duplicate column name')) {
    throw error;
  }
}

db.prepare(`
CREATE TABLE IF NOT EXISTS org_timers (
  guild_id TEXT PRIMARY KEY,
  last_org_at TEXT NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS buy_channels (
  guild_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, slot_key)
)
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS announcement_config (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    template_number INTEGER NOT NULL DEFAULT 1,
    top_text TEXT DEFAULT '',
    bottom_text TEXT DEFAULT '',
    access_ping TEXT DEFAULT '',
    item_emojis TEXT DEFAULT '',
    group_emojis TEXT DEFAULT '',
    PRIMARY KEY (guild_id, user_id, template_number)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS announcement_active_template (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    active_template_number INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS timed_buyer_roles (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, role_id)
)
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS raffles (
    id TEXT PRIMARY KEY,
    entries_json TEXT NOT NULL,
    num_winners INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  )
`).run();

async function giveTimedRole(guild, userId, roleId) {
  if (!roleId) return;

  const mainId = await getProfileIdForUser(guild.id, userId);

  const member = await guild.members.fetch(mainId).catch(() => null);
  if (!member) return;

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId).catch(console.error);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO timed_buyer_roles (guild_id, user_id, role_id, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, role_id)
    DO UPDATE SET expires_at = excluded.expires_at
  `).run(guild.id, mainId, roleId, expiresAt);
}

async function checkExpiredBuyerRoles(client) {
  const rows = db.prepare(`
    SELECT * FROM timed_buyer_roles
    WHERE expires_at <= ?
  `).all(new Date().toISOString());

  for (const row of rows) {
    const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
    const member = guild
      ? await guild.members.fetch(row.user_id).catch(() => null)
      : null;

    if (member?.roles.cache.has(row.role_id)) {
      await member.roles.remove(row.role_id).catch(console.error);
    }

    db.prepare(`
      DELETE FROM timed_buyer_roles
      WHERE guild_id = ? AND user_id = ? AND role_id = ?
    `).run(row.guild_id, row.user_id, row.role_id);
  }
}

function clampAnnouncementTemplateNumber(number) {
  const value = Number(number);
  if (!Number.isInteger(value)) return 1;
  if (value < 1) return 1;
  if (value > 20) return 20;
  return value;
}

function getSponsorConfig(guildId) {
  return db.prepare(`
    SELECT *
    FROM sponsor_config
    WHERE guild_id = ?
  `).get(guildId);
}

function buildBuyChannelPingLines(guildId) {
  const slots = getSlots(guildId);

  const rows = db.prepare(`
    SELECT slot_key, channel_id
    FROM buy_channels
    WHERE guild_id = ?
  `).all(guildId);

  const channelBySlot = new Map(
    rows.map((row) => [row.slot_key, row.channel_id])
  );

  const lines = [];

  for (const slot of slots) {
    if (!slot.user_id) continue;

    const channelId = channelBySlot.get(slot.slot_key);
    if (!channelId) continue;

    lines.push(
      `<@${slot.user_id}> ${prettySlotLabel(slot.slot_key)} buy in <#${channelId}>`
    );
  }

  return lines;
}

async function safeInteractionReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(payload).catch(() => null);
    }

    return await interaction.reply(payload).catch(() => null);
  } catch {
    return null;
  }
}

async function forceLinkAlt(guildId, altUserId, mainUserId, staffUserId) {
  const now = new Date().toISOString();
  const profileId = await ensureBuyerProfile(guildId, mainUserId);

  if (!useFirebaseProfiles()) {
    db.prepare(`
      INSERT INTO buyer_profile_links
      (guild_id, user_id, profile_id, status, created_at, approved_by, approved_at)
      VALUES (?, ?, ?, 'approved', ?, ?, ?)
      ON CONFLICT(guild_id, user_id)
      DO UPDATE SET
        profile_id = excluded.profile_id,
        status = 'approved',
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at
    `).run(guildId, altUserId, profileId, now, staffUserId, now);

    return profileId;
  }

  await linkCollection(guildId).doc(altUserId).set({
    user_id: altUserId,
    profile_id: profileId,
    status: 'approved',
    created_at: now,
    approved_by: staffUserId,
    approved_at: now,
  }, { merge: true });

  return profileId;
}

async function createPendingAltLink(guildId, altUserId, mainUserId) {
  const now = new Date().toISOString();
  const profileId = await ensureBuyerProfile(guildId, mainUserId);

  if (!useFirebaseProfiles()) {
    db.prepare(`
      INSERT INTO buyer_profile_links
      (guild_id, user_id, profile_id, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(guild_id, user_id)
      DO UPDATE SET
        profile_id = excluded.profile_id,
        status = 'pending',
        created_at = excluded.created_at,
        approved_by = NULL,
        approved_at = NULL
    `).run(guildId, altUserId, profileId, now);

    return profileId;
  }

  await linkCollection(guildId).doc(altUserId).set({
    user_id: altUserId,
    profile_id: profileId,
    status: 'pending',
    created_at: now,
    approved_by: null,
    approved_at: null,
  }, { merge: true });

  return profileId;
}

function clearCooldownsForGuild(guildId) {
  db.prepare(`DELETE FROM user_claim_history WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM previous_round_claim_history WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM event_claim_history WHERE guild_id = ?`).run(guildId);
  db.prepare(`DELETE FROM temporary_pokemon_cooldowns WHERE guild_id = ?`).run(guildId);
}

async function checkAutoClearCd() {
  const rows = db.prepare(`SELECT guild_id, last_org_at FROM org_timers`).all();
  const now = Date.now();

  for (const row of rows) {
    const last = new Date(row.last_org_at).getTime();
    if (now - last >= 6 * 60 * 60 * 1000) {
      clearCooldownsForGuild(row.guild_id);
      db.prepare(`DELETE FROM org_timers WHERE guild_id = ?`).run(row.guild_id);
      console.log(`[auto-clearcd] Cleared cooldowns for ${row.guild_id}`);
    }
  }
}

async function approveAltLink(guildId, altUserId, staffUserId) {
  const now = new Date().toISOString();

  if (!useFirebaseProfiles()) {
    const row = db.prepare(`
      SELECT *
      FROM buyer_profile_links
      WHERE guild_id = ?
        AND user_id = ?
        AND status = 'pending'
    `).get(guildId, altUserId);

    if (!row) return null;

    db.prepare(`
      UPDATE buyer_profile_links
      SET status = 'approved',
          approved_by = ?,
          approved_at = ?
      WHERE guild_id = ?
        AND user_id = ?
    `).run(staffUserId, now, guildId, altUserId);

    return row;
  }

  const ref = linkCollection(guildId).doc(altUserId);
  const snap = await ref.get();

  if (!snap.exists) return null;

  const data = snap.data();
  if (data.status !== 'pending') return null;

  await ref.update({
    status: 'approved',
    approved_by: staffUserId,
    approved_at: now,
  });

  return data;
}

async function unlinkAlt(guildId, userId) {
  if (!useFirebaseProfiles()) {
    const result = db.prepare(`
      DELETE FROM buyer_profile_links
      WHERE guild_id = ?
        AND user_id = ?
    `).run(guildId, userId);

    return result.changes > 0;
  }

  const ref = linkCollection(guildId).doc(userId);
  const snap = await ref.get();

  if (!snap.exists) return false;

  await ref.delete();
  return true;
}

async function resetBuyerProfile(guildId, userId) {
  const profileId = await getProfileIdForUser(guildId, userId);

  if (!useFirebaseProfiles()) {
    db.prepare(`
      DELETE FROM buyer_profiles
      WHERE guild_id = ?
        AND profile_id = ?
    `).run(guildId, profileId);

    db.prepare(`
      DELETE FROM buyer_point_events
      WHERE guild_id = ?
        AND profile_id = ?
    `).run(guildId, profileId);

    db.prepare(`
      DELETE FROM buyer_profile_links
      WHERE guild_id = ?
        AND profile_id = ?
    `).run(guildId, profileId);

    db.prepare(`
      DELETE FROM buyer_profile_links
      WHERE guild_id = ?
        AND user_id = ?
    `).run(guildId, userId);

    return;
  }

  await profileCollection(guildId).doc(profileId).delete();

  const events = await eventCollection(guildId)
    .where('profile_id', '==', profileId)
    .get();

  for (const doc of events.docs) {
    await doc.ref.delete();
  }

  const linksByProfile = await linkCollection(guildId)
    .where('profile_id', '==', profileId)
    .get();

  for (const doc of linksByProfile.docs) {
    await doc.ref.delete();
  }

  await linkCollection(guildId).doc(userId).delete();
}

async function adjustBuyerPoints(guildId, userId, amount, reason, staffUserId) {
  const profileId = await ensureBuyerProfile(guildId, userId);
  const now = new Date().toISOString();

  if (!useFirebaseProfiles()) {
    db.prepare(`
      UPDATE buyer_profiles
      SET points = MAX(points + ?, 0),
          choice_res_points = MAX(choice_res_points + ?, 0),
          updated_at = ?
      WHERE guild_id = ?
        AND profile_id = ?
    `).run(amount, amount, now, guildId, profileId);

    db.prepare(`
      INSERT INTO buyer_point_events
      (guild_id, profile_id, user_id, slot_key, points_delta, reason, created_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `).run(
      guildId,
      profileId,
      userId,
      amount,
      `manual:${staffUserId}:${reason || 'No reason provided'}`,
      now
    );

    return;
  }

  const ref = profileCollection(guildId).doc(profileId);

  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};

    tx.set(ref, {
      points: Math.max((data.points || 0) + amount, 0),
      choice_res_points: Math.max((data.choice_res_points || 0) + amount, 0),
      updated_at: now,
    }, { merge: true });
  });

  await eventCollection(guildId).add({
    profile_id: profileId,
    user_id: userId,
    slot_key: null,
    points_delta: amount,
    reason: `manual:${staffUserId}:${reason || 'No reason provided'}`,
    created_at: now,
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

async function buildProfilesCsv(guildId) {
  let rows;

  if (!useFirebaseProfiles()) {
    rows = db.prepare(`
      SELECT *
      FROM buyer_profiles
      WHERE guild_id = ?
      ORDER BY points DESC
    `).all(guildId);
  } else {
    const snapshot = await profileCollection(guildId).get();

    rows = snapshot.docs.map((doc) => ({
      profile_id: doc.id,
      ...doc.data(),
    }));
  }

  const header = [
    'profile_id',
    'points',
    'choice_res_points',
    'total_buys',
    'rare_buys',
    'regional_buys',
    'gmax_buys',
    'eevos_buys'
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      row.profile_id,
      row.points || 0,
      row.choice_res_points || 0,
      row.total_buys || 0,
      row.rare_buys || 0,
      row.regional_buys || 0,
      row.gmax_buys || 0,
      row.eevos_buys || 0
    ].join(','));
  }

  return lines.join('\n');
}

async function getLeaderboard(guildId, type = 'points', limit = 10) {
  const safeLimit = Number.isInteger(Number(limit)) ? Number(limit) : 10;

  let column;

  switch (type) {
    case 'points':
      column = 'points';
      break;
    case 'rare':
      column = 'rare_buys';
      break;
    case 'regional':
      column = 'regional_buys';
      break;
    case 'gmax':
      column = 'gmax_buys';
      break;
    case 'eevee':
      column = 'eevos_buys';
      break;
    default:
      column = 'points';
  }

  if (!useFirebaseProfiles()) {
    return db.prepare(`
      SELECT profile_id, ${column} as value
      FROM buyer_profiles
      WHERE guild_id = ?
      ORDER BY ${column} DESC
      LIMIT ?
    `).all(guildId, safeLimit);
  }

  const snapshot = await profileCollection(guildId)
    .orderBy(column, 'desc')
    .limit(safeLimit)
    .get();

  return snapshot.docs.map((doc) => ({
    profile_id: doc.id,
    value: doc.data()[column] || 0,
    ...doc.data(),
  }));
}

async function getProfileIdForUser(guildId, userId) {
  if (!useFirebaseProfiles()) {
    const link = db.prepare(`
      SELECT profile_id
      FROM buyer_profile_links
      WHERE guild_id = ?
        AND user_id = ?
        AND status = 'approved'
    `).get(guildId, userId);

    return link?.profile_id || userId;
  }

  const doc = await linkCollection(guildId)
    .doc(userId)
    .get();

  if (!doc.exists) {
    return userId;
  }

  const data = doc.data();

  return data?.status === 'approved'
    ? data.profile_id
    : userId;
}

async function ensureBuyerProfile(guildId, userId) {
  const profileId = await getProfileIdForUser(
    guildId,
    userId
  );

  const now = new Date().toISOString();

  if (!useFirebaseProfiles()) {
    db.prepare(`
      INSERT OR IGNORE INTO buyer_profiles
      (guild_id, profile_id, display_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      guildId,
      profileId,
      profileId,
      now,
      now
    );

    return profileId;
  }

  const ref = profileCollection(guildId).doc(profileId);

  const snapshot = await ref.get();

  if (!snapshot.exists) {
    await ref.set({
      profile_id: profileId,
      display_user_id: profileId,
      points: 0,
      total_buys: 0,
      rare_buys: 0,
      regional_buys: 0,
      gmax_buys: 0,
      eevos_buys: 0,
      choice_res_points: 0,
      choice_buys: 0,
      single_res_buys: 0,
      double_res_buys: 0,
      created_at: now,
      updated_at: now,
    });
  }

  return profileId;
}

function getProfilePointsForSlot(slotKey) {
  if (slotKey === 'rare') return 1;
  if (slotKey === 'regional') return 2;
  if (slotKey === 'gmax') return 1;
  if (slotKey === 'eevos') return 1;
  if (SINGLE_RES_SLOT_KEYS.includes(slotKey)) return 1;
  if (DOUBLE_RES_SLOT_KEYS.includes(slotKey)) return 2;
  if (isChoiceSlot(slotKey)) return 3;
  return 0;
}

function isCountableBuySlot(slotKey) {
  return (
    slotKey === 'rare' ||
    slotKey === 'regional' ||
    slotKey === 'gmax' ||
    slotKey === 'eevos' ||
    isChoiceSlot(slotKey) ||
    isResSlot(slotKey)
  );
}

async function awardBuyerProfileForSlot(guildId, userId, slotKey) {
  const profileId = await ensureBuyerProfile(guildId, userId);
  const points = getProfilePointsForSlot(slotKey);
  const now = new Date().toISOString();

  const shouldCountBuy = isCountableBuySlot(slotKey) ? 1 : 0;
  const rare = slotKey === 'rare' ? 1 : 0;
  const regional = slotKey === 'regional' ? 1 : 0;
  const gmax = slotKey === 'gmax' ? 1 : 0;
  const eevos = slotKey === 'eevos' ? 1 : 0;
  const choiceBuys = isChoiceSlot(slotKey) ? 1 : 0;
  const singleResBuys = SINGLE_RES_SLOT_KEYS.includes(slotKey) ? 1 : 0;
  const doubleResBuys = DOUBLE_RES_SLOT_KEYS.includes(slotKey) ? 1 : 0;

  if (!useFirebaseProfiles()) {
    db.prepare(`
      UPDATE buyer_profiles
      SET
        points = points + ?,
        choice_res_points = choice_res_points + ?,
        total_buys = total_buys + ?,
        rare_buys = rare_buys + ?,
        regional_buys = regional_buys + ?,
        gmax_buys = gmax_buys + ?,
        eevos_buys = eevos_buys + ?,
        choice_buys = choice_buys + ?,
        single_res_buys = single_res_buys + ?,
        double_res_buys = double_res_buys + ?,
        updated_at = ?
      WHERE guild_id = ?
        AND profile_id = ?
    `).run(
      points,
      points,
      shouldCountBuy,
      rare,
      regional,
      gmax,
      eevos,
      choiceBuys,
      singleResBuys,
      doubleResBuys,
      now,
      guildId,
      profileId
    );

    db.prepare(`
      INSERT INTO buyer_point_events
      (guild_id, profile_id, user_id, slot_key, points_delta, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      profileId,
      userId,
      slotKey,
      points,
      `finish_award:${slotKey}`,
      now
    );

    return;
  }

  const ref = profileCollection(guildId).doc(profileId);

  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};

    tx.set(ref, {
      points: (data.points || 0) + points,
      choice_res_points: (data.choice_res_points || 0) + points,
      total_buys: (data.total_buys || 0) + shouldCountBuy,
      rare_buys: (data.rare_buys || 0) + rare,
      regional_buys: (data.regional_buys || 0) + regional,
      gmax_buys: (data.gmax_buys || 0) + gmax,
      eevos_buys: (data.eevos_buys || 0) + eevos,
      choice_buys: (data.choice_buys || 0) + choiceBuys,
      single_res_buys: (data.single_res_buys || 0) + singleResBuys,
      double_res_buys: (data.double_res_buys || 0) + doubleResBuys,
      updated_at: now,
    }, { merge: true });
  });

  await eventCollection(guildId).add({
    profile_id: profileId,
    user_id: userId,
    slot_key: slotKey,
    points_delta: points,
    reason: `finish_award:${slotKey}`,
    created_at: now,
  });
}


async function hasProfileAwardsForRound(guildId, roundNumber) {
  if (!useFirebaseProfiles()) {
    const row = db.prepare(`
      SELECT 1
      FROM buyer_awarded_rounds
      WHERE guild_id = ?
        AND round_number = ?
    `).get(guildId, roundNumber);

    return !!row;
  }

  const doc = await awardedRoundCollection(guildId)
    .doc(String(roundNumber))
    .get();

  return doc.exists;
}

async function markProfileAwardsForRound(guildId, roundNumber) {
  const now = new Date().toISOString();

  if (!useFirebaseProfiles()) {
    db.prepare(`
      INSERT OR IGNORE INTO buyer_awarded_rounds
      (guild_id, round_number, awarded_at)
      VALUES (?, ?, ?)
    `).run(guildId, roundNumber, now);

    return;
  }

  await awardedRoundCollection(guildId)
    .doc(String(roundNumber))
    .set({
      round_number: roundNumber,
      awarded_at: now,
    });
}

async function awardBuyerProfilesForFinishedRound(guildId) {
  const state = getQueueState(guildId);
  if (!state) return { awarded: false, reason: 'no_state' };

  const roundNumber = Number(state.round_number ?? 1);

  if (await hasProfileAwardsForRound(guildId, roundNumber)) {
    return { awarded: false, reason: 'already_awarded' };
  }

  const slots = getSlots(guildId);

  for (const slot of slots) {
    if (!slot.user_id) continue;
    await awardBuyerProfileForSlot(guildId, slot.user_id, slot.slot_key);
  }

  await markProfileAwardsForRound(guildId, roundNumber);

  return { awarded: true, reason: 'ok' };
}

async function getBuyerProfile(guildId, userId) {
  const profileId = await getProfileIdForUser(
    guildId,
    userId
  );

  if (!useFirebaseProfiles()) {
    return db.prepare(`
      SELECT *
      FROM buyer_profiles
      WHERE guild_id = ?
        AND profile_id = ?
    `).get(guildId, profileId);
  }

  const doc = await profileCollection(guildId)
    .doc(profileId)
    .get();

  return doc.exists
    ? doc.data()
    : null;
}

async function getLinkedAlts(guildId, profileId) {
  if (!useFirebaseProfiles()) {
    return db.prepare(`
      SELECT user_id
      FROM buyer_profile_links
      WHERE guild_id = ?
        AND profile_id = ?
        AND status = 'approved'
      ORDER BY created_at ASC
    `).all(guildId, profileId);
  }

  const snapshot = await linkCollection(guildId)
    .where('profile_id', '==', profileId)
    .where('status', '==', 'approved')
    .get();

  return snapshot.docs.map((doc) => ({
    user_id: doc.data().user_id,
  }));
}

function getHighestProfileTitle(profile) {
  if (!profile) return 'New Buyer';

  if (profile.rare_buys >= 100) return 'Rare Monarch';
  if (profile.regional_buys >= 100) return 'Regional Monarch';
  if (profile.gmax_buys >= 100) return 'Gmax Monarch';
  if (profile.eevos_buys >= 100) return 'Eevee Monarch';
  if (profile.choice_res_points >= 300) return 'Ditto Monarch';

  if (profile.total_buys >= 200) return 'Ditto Royalty';

  if (profile.rare_buys >= 50) return 'Rare Legend';
  if (profile.regional_buys >= 50) return 'Regional Legend';
  if (profile.gmax_buys >= 50) return 'Gmax Legend';
  if (profile.eevos_buys >= 50) return 'Eevee Legend';
  if (profile.choice_res_points >= 150) return 'Choice/Res Legend';

  if (profile.rare_buys >= 20) return 'Rare Specialist';
  if (profile.regional_buys >= 20) return 'Regional Specialist';
  if (profile.gmax_buys >= 20) return 'Gmax Specialist';
  if (profile.eevos_buys >= 20) return 'Eevee Specialist';
  if (profile.choice_res_points >= 50) return 'Choice/Res Veteran';

  if (profile.total_buys >= 50) return 'VIP Buyer';
  if (profile.total_buys >= 25) return 'Loyal Buyer';
  if (profile.total_buys >= 10) return 'Regular Buyer';

  return 'New Buyer';
}

function setSponsorConfig(guildId, enabled, sponsorUserId = null) {
  db.prepare(`
    INSERT INTO sponsor_config (guild_id, enabled, sponsor_user_id)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET
      enabled = excluded.enabled,
      sponsor_user_id = excluded.sponsor_user_id
  `).run(guildId, enabled ? 1 : 0, sponsorUserId);
}

function getClaimedSlot(guildId, slotKey) {
  const slot = getSlot(guildId, slotKey);
  return slot?.user_id ? slot : null;
}

function getNextOpenSlotFromKeys(guildId, slotKeys) {
  const slots = getSlots(guildId);

  return slotKeys
    .map((key) => slots.find((slot) => slot.slot_key === key))
    .find((slot) => slot && !slot.user_id) || null;
}

function areAllSlotsFilled(guildId, slotKeys) {
  return !getNextOpenSlotFromKeys(guildId, slotKeys);
}

function getClaimedChoiceByGroup(guildId, groupName) {
  return getSlots(guildId).find((slot) =>
    isChoiceSlot(slot.slot_key) &&
    slot.user_id &&
    normalizePokemonName(slot.choice_group_name || '') === normalizePokemonName(groupName)
  ) || null;
}

function findPokemonOwnerFromCurrentQueue(guildId, pokemonName) {
  const sponsor = getSponsorConfig(guildId);

  if (sponsor?.enabled && sponsor.sponsor_user_id) {
    return {
      user_id: sponsor.sponsor_user_id,
      slot_label: 'Sponsor',
      slot_key: 'sponsor',
    };
  }

  const normalized = normalizePokemonName(pokemonName);
  const baseNormalized = normalizePokemonBaseName(pokemonName);
  const slots = getSlots(guildId);

  const makeOwner = (slot) => {
    if (!slot?.user_id) return null;
    return {
      user_id: slot.user_id,
      slot_label: slot.slot_label || prettySlotLabel(slot.slot_key),
      slot_key: slot.slot_key,
    };
  };

  for (const slot of slots) {
    if (!slot.user_id) continue;

    if (
      slot.chosen_rare &&
      (
        normalizePokemonName(slot.chosen_rare) === normalized ||
        normalizePokemonName(slot.chosen_rare) === baseNormalized
      )
    ) {
      return makeOwner(slot);
    }

    if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
      const ffaPokemon = getSlotFfaPokemon(slot).map(normalizePokemonName);
      const groupPokemon = getChoiceGroupByName(slot.choice_group_name);

      if (
        (groupPokemon.includes(normalized) || groupPokemon.includes(baseNormalized)) &&
        !ffaPokemon.includes(normalized) &&
        !ffaPokemon.includes(baseNormalized)
      ) {
        return makeOwner(slot);
      }

      continue;
    }

    const pokemonList = parsePokemonList(slot.pokemon_names).map(normalizePokemonName);

    if (pokemonList.includes(normalized) || pokemonList.includes(baseNormalized)) {
      return makeOwner(slot);
    }
  }

  return null;
}

function findPokemonOwnerFromFinishedHistory(guildId, pokemonName) {
  const sponsor = getSponsorConfig(guildId);

  if (sponsor?.enabled && sponsor.sponsor_user_id) {
    return {
      user_id: sponsor.sponsor_user_id,
      slot_label: 'Sponsor',
      slot_key: 'sponsor',
    };
  }
  const summary = getFinishedHistory(guildId);
  if (!summary?.slotSnapshot) return null;

  const normalized = normalizePokemonName(pokemonName);
  const baseNormalized = normalizePokemonBaseName(pokemonName);
  const slots = summary.slotSnapshot;

  const makeOwner = (slot) => {
    if (!slot?.user_id) return null;

    return {
      user_id: slot.user_id,
      slot_label: slot.slot_label || prettySlotLabel(slot.slot_key),
      slot_key: slot.slot_key,
    };
  };

  const getFinishedSlot = (slotKey) => {
    const slot = slots.find((s) => s.slot_key === slotKey && s.user_id);
    return makeOwner(slot);
  };

  const getFinishedChoiceByGroup = (groupName) => {
    const normalizedGroup = normalizePokemonName(groupName);

    const slot = slots.find((s) =>
      isChoiceSlot(s.slot_key) &&
      s.user_id &&
      normalizePokemonName(s.choice_group_name || '') === normalizedGroup
    );

    return makeOwner(slot);
  };

  // 1) Exact ownership from finished snapshot
  for (const slot of slots) {
    if (!slot.user_id) continue;

    if (
      slot.chosen_rare &&
      (
        normalizePokemonName(slot.chosen_rare) === normalized ||
        normalizePokemonName(slot.chosen_rare) === baseNormalized
      )
    ) {
      return makeOwner(slot);
    }

    if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
      const ffaPokemon = Array.isArray(slot.ffa_pokemon)
        ? slot.ffa_pokemon.map(normalizePokemonName)
        : [];

      const groupPokemon = getChoiceGroupByName(slot.choice_group_name);

      if (
        (groupPokemon.includes(normalized) || groupPokemon.includes(baseNormalized)) &&
        !ffaPokemon.includes(normalized) &&
        !ffaPokemon.includes(baseNormalized)
      ) {
        return makeOwner(slot);
      }

      continue;
    }

    const pokemonList = Array.isArray(slot.pokemon_names)
      ? slot.pokemon_names.map(normalizePokemonName)
      : [];

    if (pokemonList.includes(normalized) || pokemonList.includes(baseNormalized)) {
      return makeOwner(slot);
    }
  }

  // 2) Special routing fallback from finished snapshot
  const choiceParadox = getFinishedChoiceByGroup('paradox');
  const choicePikas = getFinishedChoiceByGroup('pikas');

  const eeveeFamily = new Set([
    'eevee',
    'vaporeon',
    'jolteon',
    'flareon',
    'espeon',
    'umbreon',
    'leafeon',
    'glaceon',
    'sylveon',
  ]);

  const PARADOX_POKEMON = new Set([
    'great-tusk',
    'scream-tail',
    'brute-bonnet',
    'flutter-mane',
    'slither-wing',
    'sandy-shocks',
    'roaring-moon',
    'walking-wake',
    'gouging-fire',
    'raging-bolt',

    'iron-treads',
    'iron-bundle',
    'iron-hands',
    'iron-jugulis',
    'iron-moth',
    'iron-thorns',
    'iron-valiant',
    'iron-leaves',
    'iron-boulder',
    'iron-crown',
  ]);

  if (normalized.includes('paradox') || PARADOX_POKEMON.has(normalized)) {
    return choiceParadox || getFinishedSlot('rare');
  }

  if (normalized === 'partner-pikachu') {
    return choicePikas || getFinishedSlot('regional');
  }

  if (normalized === 'partner-eevee') {
    return getFinishedSlot('eevos');
  }

  if (normalized === 'pikachu') {
    return choicePikas || getFinishedSlot('gmax');
  }

  if (eeveeFamily.has(normalized)) {
    return getFinishedSlot('eevos');
  }

  // 3) Steal price category fallback
  if (STEAL_RARE_POKEMON.has(normalized)) {
    return getFinishedSlot('rare');
  }

  if (STEAL_REGIONAL_POKEMON.has(normalized)) {
    return getFinishedSlot('regional');
  }

  if (STEAL_GMAX_POKEMON.has(normalized)) {
    return getFinishedSlot('gmax');
  }

  return null;
}

function addPokemonCooldown(guildId, userId, pokemonName) {
  db.prepare(`
    INSERT OR IGNORE INTO temporary_pokemon_cooldowns
    (guild_id, user_id, pokemon_name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    guildId,
    userId,
    normalizePokemonName(pokemonName),
    new Date().toISOString()
  );
}

function addFinishedPokemonCooldowns(guildId) {
  db.prepare(`
    DELETE FROM temporary_pokemon_cooldowns
    WHERE guild_id = ?
  `).run(guildId);

  const slots = getSlots(guildId);

  for (const slot of slots) {
    if (!slot.user_id) continue;

    if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
      const ffaPokemon = getSlotFfaPokemon(slot);

      const groupPokemon = getChoiceGroupByName(slot.choice_group_name)
        .filter((name) => !ffaPokemon.includes(name))
        .filter((name) => name !== MISSINGNO_NAME);

      for (const pokemonName of groupPokemon) {
        addPokemonCooldown(guildId, slot.user_id, pokemonName);
      }

      continue;
    }

    const pokemonList = parsePokemonList(slot.pokemon_names)
      .filter((name) => name !== MISSINGNO_NAME);

    for (const pokemonName of pokemonList) {
      addPokemonCooldown(guildId, slot.user_id, pokemonName);
    }
  }
}

function removePokemonCooldown(guildId, userId, pokemonName) {
  db.prepare(`
    DELETE FROM temporary_pokemon_cooldowns
    WHERE guild_id = ?
      AND user_id = ?
      AND pokemon_name = ?
  `).run(guildId, userId, normalizePokemonName(pokemonName));
}

function clearAllCooldownsForGuild(guildId) {
  db.prepare(`
    DELETE FROM user_claim_history
    WHERE guild_id = ?
  `).run(guildId);

  db.prepare(`
    DELETE FROM previous_round_claim_history
    WHERE guild_id = ?
  `).run(guildId);

  db.prepare(`
    DELETE FROM event_claim_history
    WHERE guild_id = ?
  `).run(guildId);

  db.prepare(`
    DELETE FROM temporary_pokemon_cooldowns
    WHERE guild_id = ?
  `).run(guildId);
}

function getActiveAnnouncementTemplate(guildId, userId) {
  let row = db.prepare(`
    SELECT active_template_number
    FROM announcement_active_template
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  if (!row) {
    db.prepare(`
      INSERT INTO announcement_active_template
      (guild_id, user_id, active_template_number)
      VALUES (?, ?, 1)
    `).run(guildId, userId);

    return 1;
  }

  return clampAnnouncementTemplateNumber(row.active_template_number);
}

function buildAnnouncementFromSlot(guild, userId, templateNumber, includePing) {
  const config = getAnnouncementConfig(guild.id, userId, templateNumber);

  const parts = [];

  if (config.top_text?.trim()) {
    parts.push(expandEmojiAliasesAcrossBot(config.top_text.trim(), client));
  }

  if (includePing && config.access_ping?.trim()) {
    parts.push(config.access_ping.trim());
  }

  parts.push(buildAnnouncementMiddleFromSlot(guild.id, userId, templateNumber));

  if (config.bottom_text?.trim()) {
    parts.push(expandEmojiAliasesAcrossBot(config.bottom_text.trim(), client));
  }

  return parts.join('\n\n');
}

function buildAnnouncementMiddleFromSlot(guildId, userId, templateNumber) {
  const config = getAnnouncementConfig(guildId, userId, templateNumber);

  const itemEmojis = splitEmojiList(config.item_emojis);
  const groupEmojis = splitEmojiList(config.group_emojis);

  let slots = [];

  try {
    slots = getSlots(guildId);
  } catch (err) {
    console.error('[Announcement] Could not read slots:', err);
    return 'No queue data found.';
  }

  const lines = [];
  let itemIndex = 0;
  let groupIndex = 0;

  const choiceLines = [];
  const reservePokemon = [];

  for (const slot of slots) {
    if (!slot.user_id) continue;
    if (isChoiceSlot(slot.slot_key)) continue;

    const pokemonList = parsePokemonList(slot.pokemon_names);

    for (const pokemon of pokemonList) {
      reservePokemon.push(
        prettyPokemonName(formatReserveOutputName(pokemon))
      );
    }
  }

  for (const slot of slots) {
    if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
      const ffaPokemon = getSlotFfaPokemon(slot);

      const groupPokemon = getChoiceGroupByName(slot.choice_group_name)
        .filter((name) => !ffaPokemon.includes(name))
        .filter((name) => name !== MISSINGNO_NAME)
        .map((name) => prettyPokemonName(formatReserveOutputName(name)))
        .sort((a, b) => a.localeCompare(b));

      choiceLines.push(
        `**${prettyGroupName(slot.choice_group_name)}:** ${groupPokemon.join(', ') || 'None'}`
      );

      if (ffaPokemon.length) {
        const formattedFfa = ffaPokemon
          .map((name) => prettyPokemonName(formatReserveOutputName(name)))
          .sort((a, b) => a.localeCompare(b));

        choiceLines.push(
          `**ffa ${prettyGroupName(slot.choice_group_name)}:** ${formattedFfa.join(', ')}`
        );
      }
    }
  }

  choiceLines.push(...formatMajorFfaLines(slots));

  if (choiceLines.length) {
    const groupEmoji = pickCycle(groupEmojis, groupIndex++);
    lines.push(formatListLine(groupEmoji, '**Reserved Choices**'));

    for (let i = 0; i < choiceLines.length; i++) {
      lines.push(choiceLines[i]);

      // ➖ add separator between groups (not after last)
      if (i < choiceLines.length - 1) {
        lines.push(''); // blank line = clean spacing
      }
    }

    lines.push('');
  }

  const sortedReservePokemon = [...new Set(reservePokemon)]
    .sort((a, b) => a.localeCompare(b));

  if (sortedReservePokemon.length) {
    const groupEmoji = pickCycle(groupEmojis, groupIndex++);
    lines.push(formatListLine(groupEmoji, '**Reserve List**'));

    for (const pokemon of sortedReservePokemon) {
      const emoji = pickCycle(itemEmojis, itemIndex++);
      lines.push(formatListLine(emoji, prettyPokemonName(pokemon)));
    }

    lines.push('');
  }

  const output = lines.join('\n').trim();
  return output || 'No Pokémon selected yet.';
}

function setActiveAnnouncementTemplate(guildId, userId, templateNumber) {
  const safeNumber = clampAnnouncementTemplateNumber(templateNumber);

  db.prepare(`
    INSERT INTO announcement_active_template
    (guild_id, user_id, active_template_number)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET active_template_number = excluded.active_template_number
  `).run(guildId, userId, safeNumber);

  getAnnouncementConfig(guildId, userId, safeNumber);

  return safeNumber;
}

function getAnnouncementConfig(guildId, userId, templateNumber = null) {
  const safeTemplateNumber = clampAnnouncementTemplateNumber(
    templateNumber ?? getActiveAnnouncementTemplate(guildId, userId)
  );

  let row = db.prepare(`
    SELECT *
    FROM announcement_config
    WHERE guild_id = ?
      AND user_id = ?
      AND template_number = ?
  `).get(guildId, userId, safeTemplateNumber);

  if (!row) {
    db.prepare(`
      INSERT INTO announcement_config
      (guild_id, user_id, template_number, top_text, bottom_text, access_ping, item_emojis, group_emojis)
      VALUES (?, ?, ?, '', '', '', '', '')
    `).run(guildId, userId, safeTemplateNumber);

    row = db.prepare(`
      SELECT *
      FROM announcement_config
      WHERE guild_id = ?
        AND user_id = ?
        AND template_number = ?
    `).get(guildId, userId, safeTemplateNumber);
  }

  return row;
}

function wasRecentlyPausedOrBought(row, minutes = 5) {
  if (!row?.bought_at) return false;

  const lastTime = new Date(row.bought_at).getTime();
  if (Number.isNaN(lastTime)) return false;

  return Date.now() - lastTime < minutes * 60 * 1000;
}

function setAnnouncementConfig(guildId, userId, field, value) {
  const allowedFields = new Set([
    'top_text',
    'bottom_text',
    'access_ping',
    'item_emojis',
    'group_emojis',
  ]);

  if (!allowedFields.has(field)) {
    throw new Error(`Invalid announcement config field: ${field}`);
  }

  const templateNumber = getActiveAnnouncementTemplate(guildId, userId);
  getAnnouncementConfig(guildId, userId, templateNumber);

  db.prepare(`
    UPDATE announcement_config
    SET ${field} = ?
    WHERE guild_id = ?
      AND user_id = ?
      AND template_number = ?
  `).run(value || '', guildId, userId, templateNumber);
}

function splitDiscordMessage(text, maxLength = 1900) {
  const chunks = [];
  let current = '';

  const lines = String(text || '').split('\n');

  for (let line of lines) {
    // 🔥 Handle very long single lines (split by commas)
    if (line.length > maxLength) {
      const parts = line.split(', ');

      let temp = '';
      for (const part of parts) {
        const next = temp ? `${temp}, ${part}` : part;

        if (next.length > maxLength) {
          if (temp) chunks.push(temp);
          temp = part;
        } else {
          temp = next;
        }
      }

      if (temp) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        chunks.push(temp);
      }

      continue;
    }

    const next = current ? `${current}\n${line}` : line;

    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

function findEmojiByNameAcrossBot(client, emojiName) {
  const target = String(emojiName || '').toLowerCase();

  for (const guild of client.guilds.cache.values()) {
    const emoji = guild.emojis.cache.find(
      (e) => e.name.toLowerCase() === target
    );

    if (emoji && emoji.available) return emoji;
  }

  return null;
}

function expandEmojiAliasesAcrossBot(text, client) {
  return String(text || '').replace(/:([a-zA-Z0-9_]+):/g, (match, emojiName) => {
    const emoji = findEmojiByNameAcrossBot(client, emojiName);

    if (!emoji) return match;

    return emoji.animated
      ? `<a:${emoji.name}:${emoji.id}>`
      : `<:${emoji.name}:${emoji.id}>`;
  });
}

function expandEmojiAliases(text, guild) {
  return String(text || '').replace(/:([a-zA-Z0-9_]+):/g, (match, emojiName) => {
    const emoji = guild.emojis.cache.find((e) => e.name === emojiName);

    if (!emoji) return match;

    return emoji.animated
      ? `<a:${emoji.name}:${emoji.id}>`
      : `<:${emoji.name}:${emoji.id}>`;
  });
}


function splitEmojiList(input) {
  return String(input || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function getPokemonListForSlot(slot) {
  return parsePokemonList(slot?.pokemon_names);
}

function buildAnnouncementMiddle(guildId, userId) {
  const config = getAnnouncementConfig(guildId, userId);

  const itemEmojis = splitEmojiList(config.item_emojis);
  const groupEmojis = splitEmojiList(config.group_emojis);

  let slots = [];

  try {
    slots = getSlots(guildId);
  } catch (err) {
    console.error('[Announcement] Could not read slots:', err);
    return 'No queue data found.';
  }

  const lines = [];
  let itemIndex = 0;
  let groupIndex = 0;

  const choiceLines = [];

  const reservePokemon = [];

  for (const slot of slots) {
    if (!slot.user_id) continue;
    if (isChoiceSlot(slot.slot_key)) continue;

    const pokemonList = parsePokemonList(slot.pokemon_names);

    for (const pokemon of pokemonList) {
      reservePokemon.push(
        prettyPokemonName(formatReserveOutputName(pokemon))
      );
    }
  }

  for (const slot of slots) {
    if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
      const ffaPokemon = getSlotFfaPokemon(slot);

      const groupPokemon = getChoiceGroupByName(slot.choice_group_name)
        .filter((name) => !ffaPokemon.includes(name))
        .filter((name) => name !== MISSINGNO_NAME)
        .map((name) => prettyPokemonName(formatReserveOutputName(name)))
        .sort((a, b) => a.localeCompare(b));

      choiceLines.push(
        `**!${prettyGroupName(slot.choice_group_name)}:** ${groupPokemon.join(', ') || 'None'}`
      );

      if (ffaPokemon.length) {
        const formattedFfa = ffaPokemon
          .map((name) => prettyPokemonName(formatReserveOutputName(name)))
          .sort((a, b) => a.localeCompare(b));

        choiceLines.push(
          `-# *FFAHP:* ${formattedFfa.join(', ')}`
        );
      }
    }
  }

  choiceLines.push(...formatMajorFfaLines(slots));

  if (choiceLines.length) {
    const groupEmoji = pickCycle(groupEmojis, groupIndex++);
    lines.push(`## ${formatListLine(groupEmoji, '**Reserved Choices**')}`);

    for (let i = 0; i < choiceLines.length; i++) {
      lines.push(choiceLines[i]);

    }

    lines.push('');
  }

  const sortedReservePokemon = [...new Set(reservePokemon)]
    .sort((a, b) => a.localeCompare(b));

  if (sortedReservePokemon.length) {
    const groupEmoji = pickCycle(groupEmojis, groupIndex++);
    lines.push(`## ${formatListLine(groupEmoji, '**Reserve List**')}`);

    for (const pokemon of sortedReservePokemon) {
      const emoji = pickCycle(itemEmojis, itemIndex++);
      lines.push(formatListLine(emoji, prettyPokemonName(pokemon)));
    }

    lines.push('');
  }

  const output = lines.join('\n').trim();
  return output || 'No Pokémon selected yet.';
}

function buildAnnouncement(guild, userId, includePing) {
  const config = getAnnouncementConfig(guild.id, userId);

  const parts = [];

  if (config.top_text?.trim()) {
    parts.push(expandEmojiAliasesAcrossBot(config.top_text.trim(), client));
  }

  if (includePing && config.access_ping?.trim()) {
    parts.push(config.access_ping.trim());
  }

  parts.push(buildAnnouncementMiddle(guild.id, userId));

  if (config.bottom_text?.trim()) {
    parts.push(expandEmojiAliasesAcrossBot(config.bottom_text.trim(), client));
  }

  return parts.join('\n\n');
}

function pickCycle(list, index) {
  if (!list.length) return '';
  return list[index % list.length];
}

function copyAnnouncementTemplate(guildId, fromUserId, fromSlot, toUserId, toSlot) {
  const safeFromSlot = clampAnnouncementTemplateNumber(fromSlot);
  const safeToSlot = clampAnnouncementTemplateNumber(toSlot);

  const source = getAnnouncementConfig(guildId, fromUserId, safeFromSlot);

  db.prepare(`
    INSERT INTO announcement_config
    (guild_id, user_id, template_number, top_text, bottom_text, access_ping, item_emojis, group_emojis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, template_number)
    DO UPDATE SET
      top_text = excluded.top_text,
      bottom_text = excluded.bottom_text,
      access_ping = excluded.access_ping,
      item_emojis = excluded.item_emojis,
      group_emojis = excluded.group_emojis
  `).run(
    guildId,
    toUserId,
    safeToSlot,
    source.top_text || '',
    source.bottom_text || '',
    source.access_ping || '',
    source.item_emojis || '',
    source.group_emojis || ''
  );

  return {
    fromSlot: safeFromSlot,
    toSlot: safeToSlot,
  };
}

function formatListLine(prefix, name) {
  return prefix ? `${prefix} ${name}` : `${name}`;
}

function normalizeDisplayName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ensureColumn(tableName, columnName, sqlTypeWithDefault) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((col) => col.name);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlTypeWithDefault}`);
  }
}

function tryClaimSlot(guildId, slotKey, userId) {
  const result = db.prepare(`
    UPDATE slots
    SET user_id = ?,
        pokemon_names = ?,
        claimed_at = ?,
        choice_group_name = NULL,
        chosen_rare = NULL,
        ffa_pokemon = NULL
    WHERE guild_id = ?
      AND slot_key = ?
      AND user_id IS NULL
  `).run(
    userId,
    serializePokemonList([]),
    new Date().toISOString(),
    guildId,
    slotKey
  );

  return result.changes === 1;
}

async function resumeIncenseInChannel(channel) {
  const overwriteTarget = getIncenseBotOverwriteTarget();
  if (!overwriteTarget) return;

  await channel.permissionOverwrites.delete(overwriteTarget).catch(() => null);

  db.prepare(`
    UPDATE incense_channels
    SET is_paused = 0,
        is_bought = 0,
        bought_at = NULL
    WHERE guild_id = ? AND channel_id = ?
  `).run(channel.guild.id, channel.id);
}

async function announceChooseTimePriority(interaction) {
  const slots = getSlots(interaction.guild.id);

  const eevee = slots.find(s => s.slot_key === 'eevos');
  const gmax = slots.find(s => s.slot_key === 'gmax');

  if (!eevee?.user_id && !gmax?.user_id) return;

  // determine who is first
  const candidates = [eevee, gmax]
    .filter(s => s && s.user_id && s.claimed_at);

  if (!candidates.length) return;

  candidates.sort((a, b) => new Date(a.claimed_at) - new Date(b.claimed_at));

  const first = candidates[0];

  // ONLY announce if the current claimer is the first one
  if (first.user_id !== interaction.user.id) return;

  // ❗ prevent double ping if same user owns both
  if (eevee?.user_id && gmax?.user_id && eevee.user_id === gmax.user_id) {
    return;
  }

  const slotLabel = first.slot_key === 'eevos' ? 'Eevees' : 'Gmax';

  await interaction.channel.send({
    content: `<@${first.user_id}> claimed **${slotLabel}** first. Please choose time. \n <a:espeon_popq:1498540985695600773><a:50:1498540987650150421><a:28:1496865325214470344>`,
  }).catch(() => null);
}

async function purgeRecentMessages(guild, offenderId) {
  const TEN_MIN_MS = 10 * 60 * 1000;
  const now = Date.now();
  let totalDeleted = 0;

  for (const channelId of MONITORED_CHANNELS) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) continue;

    const toDelete = messages.filter((msg) => {
      return (
        msg.author.id === offenderId &&
        now - msg.createdTimestamp <= TEN_MIN_MS
      );
    });

    if (!toDelete.size) continue;

    const bulkEligible = [...toDelete.values()].filter(
      (msg) => now - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (bulkEligible.length >= 2) {
      await channel.bulkDelete(bulkEligible, true).catch(() => null);
      totalDeleted += bulkEligible.length;
    } else {
      for (const msg of toDelete.values()) {
        await msg.delete().catch(() => null);
        totalDeleted += 1;
      }
    }
  }

  return totalDeleted;
}

function hasProtectedRole(member) {
  const protectedRoleIds = [
    process.env.STAFF_ROLE_ID?.trim(),
    process.env.ADMIN_ROLE_ID?.trim(),
  ].filter(Boolean);

  return member.roles.cache.some((role) => protectedRoleIds.includes(role.id));
}

function getExistingPokemonPicker(guildId, pokemonName, currentUserId = null) {
  const slots = getSlots(guildId);

  for (const slot of slots) {
    if (!slot.user_id) continue;
    if (currentUserId && slot.user_id === currentUserId) continue;

    const pickedPokemon = parsePokemonList(slot.pokemon_names);
    if (pickedPokemon.includes(pokemonName)) {
      return slot;
    }
  }

  return null;
}

function isIncensePausedMessage(message) {
  const incenseBotId = process.env.INCENSE_BOT_ID?.trim();
  if (!incenseBotId) return false;
  if (message.author.id !== incenseBotId) return false;

  const content = String(message.content ?? '').toLowerCase();
  return content.includes('incense has been paused');
}

function getOverpauseTimerKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function cancelOverpauseTimer(guildId, channelId) {
  const key = getOverpauseTimerKey(guildId, channelId);
  const timer = overpauseTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    overpauseTimers.delete(key);
  }
}

async function notifyOverpauseHelp(guild, pausedChannelId) {
  const config = getWatchConfig(guild.id);
  if (!config?.enabled) return;
  if (!config?.channel_id) return;

  const watchChannel = await guild.channels.fetch(config.channel_id).catch(() => null);
  if (!watchChannel || typeof watchChannel.send !== 'function') return;

  await watchChannel.send(
    `Help! Incense looks paused for over 4 minutes in <#${pausedChannelId}>. Please help to resume it. \n <a:0_:1496873992550879375><a:0_:1496873992550879375><a:0_:1496873992550879375><a:0_:1496873992550879375><a:0_:1496873992550879375><a:0_:1496873992550879375><a:0_:1496873992550879375><a:0_:1496873992550879375>`
  ).catch(() => null);
}

function startOverpauseTimer(guild, channelId) {
  const key = getOverpauseTimerKey(guild.id, channelId);

  // prevent duplicate timers
  cancelOverpauseTimer(guild.id, channelId);

  const timer = setTimeout(async () => {
    overpauseTimers.delete(key);
    await notifyOverpauseHelp(guild, channelId).catch((error) => {
      console.error('Overpause notify error:', error);
    });
  }, 4 * 60 * 1000);

  overpauseTimers.set(key, timer);
}

function isIncenseResumedMessage(message) {
  const incenseBotId = process.env.INCENSE_BOT_ID?.trim();
  if (!incenseBotId) return false;
  if (message.author.id !== incenseBotId) return false;

  const content = String(message.content ?? '').toLowerCase();

  return content.includes('incense has been resumed');
}

function isQuarantined(member) {
  const quarantineRoleId = process.env.QUARANTINE_ROLE_ID?.trim();
  if (!quarantineRoleId) return false;
  return member.roles.cache.has(quarantineRoleId);
}

async function fetchMessageFromLink(client, link) {
  const match = String(link).trim().match(
    /^https?:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/
  );

  if (!match) return null;

  const [, guildId, channelId, messageId] = match;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;

  return channel.messages.fetch(messageId).catch(() => null);
}

async function quarantineMember(member) {
  const quarantineRoleId = process.env.QUARANTINE_ROLE_ID?.trim();
  if (!quarantineRoleId) {
    throw new Error('QUARANTINE_ROLE_ID is not set');
  }

  const rolesToRemove = [
    process.env.QUARANTINE_BYPASS_ROLE_1_ID?.trim(),
    process.env.QUARANTINE_BYPASS_ROLE_2_ID?.trim(),
  ].filter(Boolean);

  const removableRoleIds = rolesToRemove.filter((roleId) =>
    member.roles.cache.has(roleId)
  );

  if (removableRoleIds.length) {
    await member.roles.remove(removableRoleIds).catch(() => null);
  }

  if (!member.roles.cache.has(quarantineRoleId)) {
    await member.roles.add(quarantineRoleId).catch(() => null);
  }
}

function formatChannelMentions(channelIds, limit = 10) {
  const shown = channelIds.slice(0, limit).map((id) => `<#${id}>`);
  const remaining = channelIds.length - shown.length;

  return shown.length
    ? `${shown.join('\n')}${remaining > 0 ? `\n+${remaining} more` : ''}`
    : 'None';
}
function canSlotTakeMissingno(slotKey) {
  return (
    isResSlot(slotKey) ||
    slotKey === 'org' ||
    slotKey === 'reserver' ||
    slotKey === 'booster1' ||
    slotKey === 'booster2' ||
    slotKey === 'donor'
  );
}

function canPokemonGoInSlot(slot, pokemonName) {
  if (!slot) return false;

  if (pokemonName === MISSINGNO_NAME) {
    return canSlotTakeMissingno(slot.slot_key);
  }

  return true;
}

function getNextOwnedCompatibleSlotWithSpace(guildId, userId, pokemonName) {
  const ownedSlots = getOwnedPickableSlots(guildId, userId);

  const partiallyFilled = ownedSlots.find((slot) => {
    const currentPokemon = parsePokemonList(slot.pokemon_names);
    const maxPokemon = Number(slot.max_pokemon ?? 1);
    return (
      currentPokemon.length > 0 &&
      currentPokemon.length < maxPokemon &&
      canPokemonGoInSlot(slot, pokemonName)
    );
  });

  if (partiallyFilled) return partiallyFilled;

  return ownedSlots.find((slot) => {
    const currentPokemon = parsePokemonList(slot.pokemon_names);
    const maxPokemon = Number(slot.max_pokemon ?? 1);
    return (
      currentPokemon.length < maxPokemon &&
      canPokemonGoInSlot(slot, pokemonName)
    );
  }) || null;
}

function removePokemonFromOwnedPickableSlots(guildId, userId, pokemonName) {
  const ownedSlots = getOwnedPickableSlots(guildId, userId);
  let removed = false;

  for (const slot of ownedSlots) {
    const currentPokemon = parsePokemonList(slot.pokemon_names);
    if (!currentPokemon.includes(pokemonName)) continue;

    const updatedPokemon = currentPokemon.filter((name) => name !== pokemonName);
    savePokemonList(guildId, slot.slot_key, updatedPokemon);
    removed = true;
  }

  return removed;
}

function getStealDisplayPrice(info) {
  if (!info) return 'Check Common sr';
  if (info.source === 'common-sr') return 'Check Common sr';
  return info.price != null ? formatStealPrice(info.price) : 'Check Common sr';
}

function stripTrailingCatchMeta(text) {
  let value = String(text ?? '').trim();

  // remove custom emojis
  value = value.replace(/(<:[^:]+:\d+>)+$/g, '').trim();

  // remove :male: etc
  value = value.replace(/(:[a-zA-Z_]+:)+$/g, '').trim();

  // remove unicode gender
  value = value.replace(/[♀♂?]+$/g, '').trim();

  return value;
}

function parseStealCatchMessage(message) {
  if (!message) return null;

  const content = String(message.content ?? '').trim();
  if (!content) return null;

  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return null;

  const match = firstLine.match(
    /^Congratulations\s+<@!?(\d+)>!\s+You caught a Level\s+\d+\s+(.+?)\s*\(\d+(\.\d+)?%\)/i
  );

  if (!match) return null;

  const stealerId = match[1];
  const rawPokemonPart = stripTrailingCatchMeta(match[2]);

  if (!stealerId || !rawPokemonPart) return null;

  return {
    stealerId,
    rawPokemonName: rawPokemonPart,
    pokemonName: normalizePokemonName(rawPokemonPart),
  };
}

function sanitizeThreadNamePart(text, maxLength = 40) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, maxLength) || 'steal-case';
}

async function addUsersToThread(thread, userIds) {
  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    await thread.members.add(userId).catch(() => null);
  }
}


async function buildThreadTranscript(thread) {
  let allMessages = [];
  let lastId;

  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;

    const batchMessages = [...batch.values()];
    allMessages.push(...batchMessages);
    lastId = batchMessages[batchMessages.length - 1].id;

    if (batch.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = allMessages.map((msg) => {
    const time = new Date(msg.createdTimestamp).toISOString();
    const author = msg.author ? `${msg.author.username} (${msg.author.id})` : 'Unknown';
    const text = msg.content?.trim() || '(no text content)';
    const attachments = msg.attachments?.size
      ? ` [attachments: ${[...msg.attachments.values()].map((a) => a.url).join(', ')}]`
      : '';

    return `[${time}] ${author}: ${text}${attachments}`;
  });

  return lines.join('\n');
}

function getDefaultPokemonListForSlot(slotKey) {
  if (isEventSlot(slotKey)) {
    const fixedPokemon = getEventFixedPokemon(slotKey);
    return fixedPokemon ? [fixedPokemon] : [];
  }
  return [];
}

function buildIncBoughtEmbed(rows) {
  const boughtRows = rows.filter((row) => row.is_bought);
  const notBoughtRows = rows.filter((row) => !row.is_bought);

  return new EmbedBuilder()
    .setTitle('Incense Bought Tracker')
    .setDescription(
      `${boughtRows.length}/${rows.length} bought\n` +
      `${notBoughtRows.length} remaining`
    )
    .addFields({
      name: 'Not Bought',
      value: formatChannelMentions(
        notBoughtRows.map((row) => row.channel_id),
        10
      ),
      inline: false,
    })
    .setColor(0x5865F2)
    .setTimestamp();
}

function getIncenseChannels(guildId) {
  return db.prepare(`
    SELECT channel_id, is_bought, is_paused, bought_at
    FROM incense_channels
    WHERE guild_id = ?
    ORDER BY channel_id ASC
  `).all(guildId);
}

function removeAllIncenseChannels(guildId) {
  db.prepare(`
    DELETE FROM incense_channels
    WHERE guild_id = ?
  `).run(guildId);
}

function isTrackedIncenseChannel(guildId, channelId) {
  return !!db.prepare(`
    SELECT 1
    FROM incense_channels
    WHERE guild_id = ? AND channel_id = ?
    LIMIT 1
  `).get(guildId, channelId);
}

function addIncenseChannel(guildId, channelId) {
  db.prepare(`
    INSERT OR IGNORE INTO incense_channels (guild_id, channel_id, is_bought, is_paused)
    VALUES (?, ?, 0, 0)
  `).run(guildId, channelId);
}

function removeIncenseChannel(guildId, channelId) {
  db.prepare(`
    DELETE FROM incense_channels
    WHERE guild_id = ? AND channel_id = ?
  `).run(guildId, channelId);
}

function markIncenseBought(guildId, channelId) {
  db.prepare(`
    UPDATE incense_channels
    SET is_bought = 1,
        bought_at = ?
    WHERE guild_id = ? AND channel_id = ?
  `).run(new Date().toISOString(), guildId, channelId);
}

function setIncensePaused(guildId, channelId, paused) {
  db.prepare(`
    UPDATE incense_channels
    SET is_paused = ?
    WHERE guild_id = ? AND channel_id = ?
  `).run(paused ? 1 : 0, guildId, channelId);
}

function resetIncenseChannel(guildId, channelId) {
  db.prepare(`
    UPDATE incense_channels
    SET is_bought = 0,
        is_paused = 0,
        bought_at = NULL
    WHERE guild_id = ? AND channel_id = ?
  `).run(guildId, channelId);
}

function resetAllIncenseChannels(guildId) {
  db.prepare(`
    UPDATE incense_channels
    SET is_bought = 0,
        is_paused = 0,
        bought_at = NULL
    WHERE guild_id = ?
  `).run(guildId);
}

function getIncenseBotOverwriteTarget() {
  return process.env.INCENSE_BOT_ROLE_ID?.trim() || process.env.INCENSE_BOT_ID?.trim() || null;
}

async function pauseIncenseInChannel(channel) {
  const overwriteTarget = getIncenseBotOverwriteTarget();
  if (!overwriteTarget) return;

  await channel.permissionOverwrites.edit(overwriteTarget, {
    ViewChannel: false,
    SendMessages: false,
  });

  db.prepare(`
    UPDATE incense_channels
    SET is_paused = 1
    WHERE guild_id = ? AND channel_id = ?
  `).run(channel.guild.id, channel.id);
}

async function getTrackedIncenseChannels(guild) {
  const rows = db.prepare(`
    SELECT channel_id
    FROM incense_channels
    WHERE guild_id = ?
    ORDER BY channel_id ASC
  `).all(guild.id);

  const channels = [];
  for (const row of rows) {
    const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
    if (channel) channels.push(channel);
  }

  return channels;
}

function getIncenseChannelRow(guildId, channelId) {
  return db.prepare(`
    SELECT channel_id, is_bought, is_paused, bought_at
    FROM incense_channels
    WHERE guild_id = ? AND channel_id = ?
    LIMIT 1
  `).get(guildId, channelId);
}

async function resumeIncenseInChannel(channel) {
  const overwriteTarget = getIncenseBotOverwriteTarget();
  if (!overwriteTarget) return;

  await channel.permissionOverwrites.delete(overwriteTarget).catch(() => null);

  db.prepare(`
    UPDATE incense_channels
    SET is_paused = 0,
        is_bought = 0,
        bought_at = NULL
    WHERE guild_id = ? AND channel_id = ?
  `).run(channel.guild.id, channel.id);
}

function isIncenseBoughtMessage(message) {
  const incenseBotId = process.env.INCENSE_BOT_ID?.trim();
  if (!incenseBotId) return false;
  if (message.author.id !== incenseBotId) return false;

  const content = String(message.content ?? '').toLowerCase();
  return content.includes('you purchased an incense for 50 shards!');
}

function prettyUsername(guild, userId) {
  if (!userId) return 'Unknown';

  const member = guild.members.cache.get(userId);

  if (member) {
    return member.displayName; // nickname if exists
  }

  return `User ${userId}`; // fallback if not cached
}

function buildPastHistoryCopyText(summary) {
  if (!summary || !Array.isArray(summary.slotSnapshot)) {
    return 'No finished round history stored yet.';
  }

  const lines = [];

  const sortedSlots = [...summary.slotSnapshot].sort((a, b) => {
    return SLOT_DEFS.findIndex((slot) => slot.key === a.slot_key)
      - SLOT_DEFS.findIndex((slot) => slot.key === b.slot_key);
  });

  for (const slot of sortedSlots) {
    const label = slot.slot_label ?? prettySlotLabel(slot.slot_key);
    const buyer = slot.user_id ? `<@${slot.user_id}>` : 'Open';

    if (isChoiceSlot(slot.slot_key)) {
      const groupText = slot.choice_group_name
        ? prettyGroupName(slot.choice_group_name)
        : 'No group chosen';

      const rareText = slot.chosen_rare
        ? `, rare: ${slot.chosen_rare}`
        : '';

      lines.push(`${label} - ${buyer}, ${groupText}${rareText}`);
      continue;
    }

    const pokemonList = Array.isArray(slot.pokemon_names)
      ? slot.pokemon_names.map(prettyPokemonName)
      : [];

    const chosenPokemonText = pokemonList.length
      ? pokemonList.join(', ')
      : 'No Pokémon chosen';

    const extraRareText =
      slot.slot_key === 'gmax' && slot.chosen_rare
        ? `, rare: ${slot.chosen_rare}`
        : '';

    lines.push(`${label} - ${buyer}, ${chosenPokemonText}${extraRareText}`);
  }

  return lines.join('\n');
}

function formatReserveOutputName(pokemonName) {
  const normalized = normalizePokemonName(pokemonName);
  if (ALL_FORM_POKEMON.has(normalized)) {
    return `all ${normalized}`;
  }
  return normalized;
}

function isUserOnPokemonCooldown(guildId, userId, pokemonName) {
  const normalizedPokemon = normalizePokemonName(pokemonName);

  const row = db.prepare(`
    SELECT 1
    FROM temporary_pokemon_cooldowns
    WHERE guild_id = ?
      AND user_id = ?
      AND pokemon_name = ?
    LIMIT 1
  `).get(guildId, userId, normalizedPokemon);

  return !!row;
}

function ensureSchema() {
  ensureColumn('queue_state', 'booster_locked', `INTEGER NOT NULL DEFAULT 1`);
  ensureColumn('queue_state', 'cooldown_cleared', `INTEGER DEFAULT 0`);
  ensureColumn('slots', 'chosen_rare', `TEXT`);
  ensureColumn('slots', 'ffa_pokemon', `TEXT`);

  const userHistoryColumns = db.prepare(`PRAGMA table_info(user_claim_history)`).all().map((column) => column.name);
  if (userHistoryColumns.includes('last_slot_key') || userHistoryColumns.includes('last_slot_number')) {
    db.exec(`DROP TABLE IF EXISTS user_claim_history`);
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_claim_history (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          slot_key TEXT NOT NULL,
          PRIMARY KEY (guild_id, user_id, slot_key)
        );
      `);
  }

  const previousHistoryColumns = db.prepare(`PRAGMA table_info(previous_round_claim_history)`).all().map((column) => column.name);
  if (previousHistoryColumns.includes('last_slot_key') || previousHistoryColumns.includes('last_slot_number')) {
    db.exec(`DROP TABLE IF EXISTS previous_round_claim_history`);
    db.exec(`
        CREATE TABLE IF NOT EXISTS previous_round_claim_history (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          slot_key TEXT NOT NULL,
          PRIMARY KEY (guild_id, user_id, slot_key)
        );
      `);
  }
}

ensureSchema();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TRAP_CHANNEL_ID = process.env.TRAP_CHANNEL_ID?.trim();
const STAFF_LOG_CHANNEL_ID = process.env.STAFF_LOG_CHANNEL_ID?.trim();

function getMessagePreview(message) {
  if (message.content && message.content.trim().length > 0) {
    return message.content.trim();
  }

  if (message.attachments.size > 0) {
    const files = message.attachments.map(att => att.url);
    return `📎 Attachment(s):\n${files.join('\n')}`;
  }

  if (message.embeds.length > 0) {
    return '📦 Embed message (no visible text)';
  }

  return '(no visible content)';
}

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (!TRAP_CHANNEL_ID || message.channel.id !== TRAP_CHANNEL_ID) return;
    if (message.author.bot) return;
    if (message.channel.id === process.env.TRAP_CHANNEL_ID?.trim()) {
      const staffRoleId = process.env.STAFF_ROLE_ID?.trim();
      if (staffRoleId && message.member.roles.cache.has(staffRoleId)) return;

      const messageUrl = message.url;
      const rawContent = getMessagePreview(message);

      const quarantineRoleId = process.env.QUARANTINE_ROLE_ID?.trim();
      const bypassRoleIds = [
        process.env.QUARANTINE_BYPASS_ROLE_1_ID?.trim(),
        process.env.QUARANTINE_BYPASS_ROLE_2_ID?.trim(),
      ].filter(Boolean);

      if (quarantineRoleId && !message.member.roles.cache.has(quarantineRoleId)) {
        await message.member.roles.add(quarantineRoleId).catch(console.error);
      }

      for (const roleId of bypassRoleIds) {
        if (message.member.roles.cache.has(roleId)) {
          await message.member.roles.remove(roleId).catch(console.error);
        }
      }

      await message.delete().catch((err) => {
        console.error('[trap] Failed to delete trigger message:', err);
      });

      const deletedCount = await purgeRecentMessages(message.guild, message.author.id);

      const logChannel = STAFF_LOG_CHANNEL_ID
        ? await message.guild.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(() => null)
        : null;

      if (logChannel && typeof logChannel.send === 'function') {
        const embed = new EmbedBuilder()
          .setTitle('Quarantine Triggered')
          .setColor(0xED4245)
          .addFields(
            { name: 'User', value: `<@${message.author.id}> (${message.author.id})`, inline: false },
            { name: 'Trigger Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Deleted Recent Messages', value: String(deletedCount), inline: true },
            { name: 'Content', value: rawContent.slice(0, 1024), inline: false },
          )
          .setTimestamp();

        const modRoleId = process.env.MOD_ROLE_ID?.trim();

        await logChannel.send({
          content: modRoleId ? `<@&${modRoleId}>` : undefined,
          embeds: [embed],
        }).catch(console.error);
      }

      return;
    }

    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    if (hasProtectedRole(member)) return;
    if (isQuarantined(member)) return;

    const messageUrl = message.url;
    const rawContent = getMessagePreview(message);

    await message.delete().catch(() => null);
    await quarantineMember(member);

    const deletedCount = await purgeRecentMessages(message.guild, message.author.id);

    const logChannel = STAFF_LOG_CHANNEL_ID
      ? await message.guild.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(() => null)
      : null;

    if (logChannel && typeof logChannel.send === 'function') {
      const embed = new EmbedBuilder()
        .setTitle('Quarantine Triggered')
        .setColor(0xED4245)
        .addFields(
          { name: 'User', value: `<@${message.author.id}> (${message.author.id})`, inline: false },
          { name: 'Trigger Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Deleted Recent Messages', value: String(deletedCount), inline: true },
          { name: 'Trigger Message', value: `[Jump to message](${messageUrl})`, inline: false },
          { name: 'Content', value: rawContent.slice(0, 1024), inline: false },
        )
        .setTimestamp();

      const modRoleId = process.env.MOD_ROLE_ID?.trim();
      await logChannel.send({
        content: modRoleId ? `<@&${modRoleId}>` : undefined,
        embeds: [embed],
      }).catch(() => null);
    }
  } catch (error) {
    console.error('Trap channel quarantine error:', error);
  }
});

function buildCloseTicketConfirmButtons(threadId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`closeticketconfirm:${threadId}:yes`)
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`closeticketconfirm:${threadId}:no`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function normalizePokemonName(name) {
  const normalized = String(name || '')
    .normalize('NFD')                  // split accents
    .replace(/[\u0300-\u036f]/g, '')   // remove accents
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/\s+/g, '-')
    .trim();
  return POKEMON_ALIAS_LOOKUP.get(normalized) || normalized;
}

const POKEMON_ALIAS_LOOKUP = new Map();

function buildPokemonAliasLookup() {
  for (const [englishName, aliases] of Object.entries(POKEMON_ALIAS_GROUPS || {})) {
    const canonical = normalizePokemonName(englishName);

    POKEMON_ALIAS_LOOKUP.set(canonical, canonical);

    for (const alias of aliases || []) {
      POKEMON_ALIAS_LOOKUP.set(normalizePokemonName(alias), canonical);
    }
  }
}

function resolvePokemonAlias(name) {
  const normalized = normalizePokemonName(name);
  return POKEMON_ALIAS_LOOKUP.get(normalized) || normalized;
}

function prettyPokemonName(name) {
  if (!name) return '';

  return String(name)
    .replace(/-/g, ' ')              // convert hyphens → spaces
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function prettyGroupName(name) {
  return String(name)
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getSlotDef(slotKey) {
  return SLOT_DEFS.find((slot) => slot.key === slotKey) || null;
}

function prettySlotLabel(slotKey) {
  return getSlotDef(slotKey)?.label ?? slotKey ?? 'Unknown';
}

function isEventSlot(slotKey) {
  return EVENT_QUEUE_ENABLED && EVENT_SLOT_CONFIG.some((slot) => slot.key === slotKey);
}

function getEventSlotConfig(slotKey) {
  return EVENT_SLOT_CONFIG.find((slot) => slot.key === slotKey) || null;
}

function getEventFixedPokemon(slotKey) {
  const config = getEventSlotConfig(slotKey);
  return config ? normalizePokemonName(config.fixedPokemon) : null;
}

function getEventChosenPokemon(slot) {
  const currentPokemon = parsePokemonList(slot?.pokemon_names);
  const fixedPokemon = getEventFixedPokemon(slot?.slot_key);

  if (!fixedPokemon) return currentPokemon;

  return currentPokemon.filter((name) => normalizePokemonName(name) !== fixedPokemon);
}

function getFinishedEventChosenPokemon(slotSnapshot) {
  const currentPokemon = Array.isArray(slotSnapshot?.pokemon_names)
    ? slotSnapshot.pokemon_names.map(normalizePokemonName)
    : [];

  const fixedPokemon = getEventFixedPokemon(slotSnapshot?.slot_key);
  if (!fixedPokemon) return currentPokemon;

  return currentPokemon.filter((name) => normalizePokemonName(name) !== fixedPokemon);
}

function isChoiceSlot(slotKey) {
  return CHOICE_SLOT_KEYS.has(slotKey);
}

function isResSlot(slotKey) {
  return RES_SLOT_REGEX.test(slotKey);
}

function hasStaffRole(member) {
  const staffRoleId = process.env.STAFF_ROLE_ID?.trim();
  if (!staffRoleId) return false;
  return member?.roles?.cache?.has(staffRoleId) ?? false;
}

function getChoiceGroupByName(groupName) {
  return (CHOICE_GROUPS?.[groupName] || []).map(normalizePokemonName);
}

function parsePokemonList(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializePokemonList(list) {
  return JSON.stringify(list);
}

function getQueueState(guildId) {
  return db.prepare(`SELECT * FROM queue_state WHERE guild_id = ? AND is_active = 1`).get(guildId);
}

function getSlots(guildId) {
  return db
    .prepare(`SELECT * FROM slots WHERE guild_id = ?`)
    .all(guildId)
    .sort((a, b) => SLOT_DEFS.findIndex((slot) => slot.key === a.slot_key) - SLOT_DEFS.findIndex((slot) => slot.key === b.slot_key));
}

function getSlot(guildId, slotKey) {
  return db.prepare(`SELECT * FROM slots WHERE guild_id = ? AND slot_key = ?`).get(guildId, slotKey);
}

function getSlotNotes(guildId, slotKey) {
  return db
    .prepare(`
      SELECT note_index, note_text
      FROM slot_notes
      WHERE guild_id = ? AND slot_key = ?
      ORDER BY note_index ASC
    `)
    .all(guildId, slotKey);
}

function getWatchConfig(guildId) {
  return db.prepare(`
    SELECT *
    FROM watch_config
    WHERE guild_id = ?
  `).get(guildId);
}

function ensureWatchConfig(guildId) {
  db.prepare(`
    INSERT OR IGNORE INTO watch_config (guild_id, enabled, cooldown_minutes)
    VALUES (?, 0, 30)
  `).run(guildId);
}

function setWatchChannel(guildId, channelId) {
  ensureWatchConfig(guildId);
  db.prepare(`
    UPDATE watch_config
    SET channel_id = ?
    WHERE guild_id = ?
  `).run(channelId, guildId);
}

function setWatchEnabled(guildId, enabled) {
  ensureWatchConfig(guildId);
  db.prepare(`
    UPDATE watch_config
    SET enabled = ?
    WHERE guild_id = ?
  `).run(enabled ? 1 : 0, guildId);
}

function setWatchCooldown(guildId, minutes) {
  ensureWatchConfig(guildId);
  db.prepare(`
    UPDATE watch_config
    SET cooldown_minutes = ?
    WHERE guild_id = ?
  `).run(minutes, guildId);
}

function setWatchLastTriggered(guildId, isoTime) {
  ensureWatchConfig(guildId);
  db.prepare(`
    UPDATE watch_config
    SET last_triggered_at = ?
    WHERE guild_id = ?
  `).run(isoTime, guildId);
}

function addSlotNote(guildId, slotKey, noteText) {
  const trimmedNote = noteText.trim();

  if (!trimmedNote.length) {
    return { ok: false, reason: 'empty_note' };
  }

  if (trimmedNote.length > MAX_NOTE_LENGTH) {
    return { ok: false, reason: 'note_too_long' };
  }

  const existing = getSlotNotes(guildId, slotKey);
  if (existing.length >= MAX_NOTES_PER_SLOT) {
    return { ok: false, reason: 'max_notes' };
  }

  const nextIndex = existing.length + 1;

  db.prepare(`
    INSERT INTO slot_notes (guild_id, slot_key, note_index, note_text)
    VALUES (?, ?, ?, ?)
  `).run(guildId, slotKey, nextIndex, trimmedNote);

  return { ok: true, noteIndex: nextIndex };
}

function clearSlotNotes(guildId, slotKey) {
  db.prepare(`
    DELETE FROM slot_notes
    WHERE guild_id = ? AND slot_key = ?
  `).run(guildId, slotKey);
}

function clearAllSlotNotesForGuild(guildId) {
  db.prepare(`
    DELETE FROM slot_notes
    WHERE guild_id = ?
  `).run(guildId);
}

function getUserMajorClaimCount(guildId, userId) {
  const rows = db.prepare(`SELECT slot_key FROM slots WHERE guild_id = ? AND user_id = ?`).all(guildId, userId);
  return rows.filter((row) => MAJOR_SLOT_KEYS.has(row.slot_key)).length;
}

function hasClaimedSlotThisRound(guildId, userId, slotKey) {
  const row = db.prepare(`
    SELECT 1
    FROM user_claim_history
    WHERE guild_id = ? AND user_id = ? AND slot_key = ?
    LIMIT 1
  `).get(guildId, userId, slotKey);

  return !!row;
}

function hadSlotLastRound(guildId, userId, slotKey) {
  const row = db.prepare(`
    SELECT 1
    FROM previous_round_claim_history
    WHERE guild_id = ? AND user_id = ? AND slot_key = ?
    LIMIT 1
  `).get(guildId, userId, slotKey);

  return !!row;
}

function rolloverClaimHistoryToPreviousRound(guildId) {
  db.prepare(`DELETE FROM previous_round_claim_history WHERE guild_id = ?`).run(guildId);

  const rows = db.prepare(`
    SELECT guild_id, user_id, slot_key
    FROM user_claim_history
    WHERE guild_id = ?
  `).all(guildId);

  const insert = db.prepare(`
    INSERT INTO previous_round_claim_history (guild_id, user_id, slot_key)
    VALUES (?, ?, ?)
  `);

  for (const row of rows) {
    insert.run(row.guild_id, row.user_id, row.slot_key);
  }

  db.prepare(`DELETE FROM user_claim_history WHERE guild_id = ?`).run(guildId);
}

function getSlotFfaPokemon(slot) {
  return parsePokemonList(slot?.ffa_pokemon);
}

const MAJOR_FFA_SLOT_KEYS = new Set(['rare', 'regional', 'gmax', 'eevos']);

function isMajorFfaSlot(slotKey) {
  return MAJOR_FFA_SLOT_KEYS.has(slotKey);
}

function formatMajorFfaLines(slots) {
  const lines = [];

  for (const slot of slots) {
    if (!isMajorFfaSlot(slot.slot_key)) continue;

    const ffaPokemon = getSlotFfaPokemon(slot);
    if (!ffaPokemon.length) continue;

    const formattedFfa = ffaPokemon
      .map((name) => prettyPokemonName(formatReserveOutputName(name)))
      .sort((a, b) => a.localeCompare(b));

    lines.push(`**ffa ${slot.slot_label}:** ${formattedFfa.join(', ')}`);
  }

  return lines;
}

function saveSlotFfaPokemon(guildId, slotKey, pokemonList) {
  db.prepare(`
    UPDATE slots
    SET ffa_pokemon = ?
    WHERE guild_id = ? AND slot_key = ?
  `).run(serializePokemonList(pokemonList), guildId, slotKey);
}

function removeCurrentRoundEventClaim(guildId, userId) {
  const state = getQueueState(guildId);
  if (!state) return;

  db.prepare(`
    DELETE FROM event_claim_history
    WHERE guild_id = ? AND user_id = ? AND round_number = ?
  `).run(guildId, userId, state.round_number);
}

function truncateText(text, maxLength = 20) {
  const value = String(text ?? '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatCompactList(items, maxLength = 20) {
  const values = items.map((item) => String(item));
  const full = values.join(', ');
  if (full.length <= maxLength) return full;

  let result = '';
  let countUsed = 0;

  for (const item of values) {
    const next = result ? `${result}, ${item}` : item;
    if (next.length > maxLength - 10) break;
    result = next;
    countUsed += 1;
  }

  const remaining = values.length - countUsed;
  return remaining > 0 ? `${result} +${remaining} more` : result;
}

function addInlineSpacer(embed) {
  embed.addFields({
    name: '\u200B',
    value: '\u200B',
    inline: true,
  });
}

function setCurrentRoundEventClaim(guildId, userId) {
  const state = getQueueState(guildId);
  if (!state) return;

  db.prepare(`
    INSERT OR REPLACE INTO event_claim_history (guild_id, user_id, round_number)
    VALUES (?, ?, ?)
  `).run(guildId, userId, state.round_number);
}

function resetSlot(guildId, slotKey) {
  const slotDef = getSlotDef(slotKey);
  const defaultPokemon = isEventSlot(slotKey)
    ? (() => {
      const fixedPokemon = getEventFixedPokemon(slotKey);
      return fixedPokemon ? [fixedPokemon] : [];
    })()
    : [];

  db.prepare(`
    UPDATE slots
    SET user_id = NULL,
        pokemon_names = ?,
        claimed_at = NULL,
        choice_group_name = NULL,
        chosen_rare = NULL,
        ffa_pokemon = NULL,
        max_pokemon = ?
    WHERE guild_id = ? AND slot_key = ?
  `).run(
    serializePokemonList(defaultPokemon),
    slotDef?.maxPokemon ?? 1,
    guildId,
    slotKey
  );

  clearSlotNotes(guildId, slotKey);
}

function savePokemonList(guildId, slotKey, pokemonList) {
  db.prepare(`UPDATE slots SET pokemon_names = ? WHERE guild_id = ? AND slot_key = ?`)
    .run(serializePokemonList(pokemonList), guildId, slotKey);
}

function setChoiceGroupName(guildId, slotKey, groupName) {
  db.prepare(`UPDATE slots SET choice_group_name = ?, pokemon_names = ? WHERE guild_id = ? AND slot_key = ?`)
    .run(groupName, serializePokemonList([]), guildId, slotKey);
}

function setChosenRare(guildId, slotKey, rareText) {
  db.prepare(`UPDATE slots SET chosen_rare = ? WHERE guild_id = ? AND slot_key = ?`)
    .run(rareText.trim(), guildId, slotKey);
}

function setBoosterLocked(guildId, locked) {
  db.prepare(`UPDATE queue_state SET booster_locked = ? WHERE guild_id = ? AND is_active = 1`)
    .run(locked ? 1 : 0, guildId);
}

function setSlotMaxPokemon(guildId, slotKey, maxPokemon) {
  db.prepare(`
    UPDATE slots
    SET max_pokemon = ?
    WHERE guild_id = ? AND slot_key = ?
  `).run(maxPokemon, guildId, slotKey);
}

function getClaimedAtValue(slot) {
  if (!slot?.claimed_at) return Number.MAX_SAFE_INTEGER;
  const time = new Date(slot.claimed_at).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function getOwnedPickableSlots(guildId, userId) {
  return getSlots(guildId).filter(
    (slot) =>
      slot.user_id === userId &&
      !isChoiceSlot(slot.slot_key)
  );
}

function touchSlotClaimedAt(guildId, slotKey) {
  db.prepare(`
    UPDATE slots
    SET claimed_at = ?
    WHERE guild_id = ? AND slot_key = ?
  `).run(new Date().toISOString(), guildId, slotKey);
}

function getNextOwnedPickableSlotWithSpace(guildId, userId) {
  const ownedSlots = getOwnedPickableSlots(guildId, userId);

  const partiallyFilled = ownedSlots.find((slot) => {
    const currentPokemon = parsePokemonList(slot.pokemon_names);
    const maxPokemon = Number(slot.max_pokemon ?? 1);
    return currentPokemon.length > 0 && currentPokemon.length < maxPokemon;
  });

  if (partiallyFilled) return partiallyFilled;

  return ownedSlots.find((slot) => {
    const currentPokemon = parsePokemonList(slot.pokemon_names);
    const maxPokemon = Number(slot.max_pokemon ?? 1);
    return currentPokemon.length < maxPokemon;
  }) || null;
}

function getNextOwnedEmptyPickableSlot(guildId, userId) {
  const ownedSlots = getOwnedPickableSlots(guildId, userId);
  return ownedSlots.find((slot) => parsePokemonList(slot.pokemon_names).length === 0) || null;
}

function hasBoosterRole(member) {
  const boosterRoleId = process.env.BOOSTER_ROLE_ID?.trim();
  if (!boosterRoleId) return false;
  return member?.roles?.cache?.has(boosterRoleId) ?? false;
}

function hasDoubleBoosterRole(member) {
  const doubleBoosterRoleId = process.env.DOUBLE_BOOSTER_ROLE_ID?.trim();
  if (!doubleBoosterRoleId) return false;
  return member?.roles?.cache?.has(doubleBoosterRoleId) ?? false;
}

function hasDonorRole(member) {
  const donorRoleId = process.env.DONOR_ROLE_ID?.trim();
  if (!donorRoleId) return false;
  return member?.roles?.cache?.has(donorRoleId) ?? false;
}

function hasBoosterCooldown(member) {
  const boosterCdRoleId = process.env.BOOSTER_CD_ROLE_ID?.trim();
  if (!boosterCdRoleId) return false;
  return member?.roles?.cache?.has(boosterCdRoleId) ?? false;
}

function hasDonorCooldown(member) {
  const donorCdRoleId = process.env.DONOR_CD_ROLE_ID?.trim();
  if (!donorCdRoleId) return false;
  return member?.roles?.cache?.has(donorCdRoleId) ?? false;
}

function slotOwnsPokemon(slot, pokemonName) {
  if (!slot?.user_id) return false;

  const chosenPokemon = parsePokemonList(slot.pokemon_names);
  if (chosenPokemon.includes(pokemonName)) return true;

  if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
    const groupPokemon = getChoiceGroupByName(slot.choice_group_name);
    const ffaPokemon = getSlotFfaPokemon(slot);

    return groupPokemon.includes(pokemonName) && !ffaPokemon.includes(pokemonName);
  }

  return false;
}

function getConflictingOwner(guildId, pokemonName, currentSlotKey) {
  const currentSlot = getSlot(guildId, currentSlotKey);
  const currentClaimTime = getClaimedAtValue(currentSlot);

  const matchingSlots = getSlots(guildId)
    .filter((otherSlot) => otherSlot.slot_key !== currentSlotKey)
    .filter((otherSlot) => otherSlot.user_id)
    .filter((otherSlot) => slotOwnsPokemon(otherSlot, pokemonName))
    .sort((a, b) => getClaimedAtValue(a) - getClaimedAtValue(b));

  if (!matchingSlots.length) return null;

  const earliestOwner = matchingSlots[0];
  if (getClaimedAtValue(earliestOwner) <= currentClaimTime) {
    return earliestOwner;
  }

  return null;
}

function getChoiceGroupConflicts(guildId, slotKey, groupName) {
  const groupPokemon = getChoiceGroupByName(groupName);
  const conflicts = [];

  for (const pokemonName of groupPokemon) {
    const pickedSlot = getExistingPokemonPicker(guildId, pokemonName);

    if (pickedSlot && pickedSlot.slot_key !== slotKey) {
      conflicts.push({
        pokemonName,
        ownerSlot: pickedSlot,
      });
      continue;
    }

    const ownerSlot = getConflictingOwner(guildId, pokemonName, slotKey);
    if (ownerSlot) {
      conflicts.push({
        pokemonName,
        ownerSlot,
      });
    }
  }

  return conflicts;
}

function getAllOwnedPokemonForSlot(slot) {
  if (!slot?.user_id) return [];

  const owned = new Set();

  for (const pokemonName of parsePokemonList(slot.pokemon_names)) {
    owned.add(pokemonName);
  }

  if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
    const ffaPokemon = getSlotFfaPokemon(slot);

    for (const pokemonName of getChoiceGroupByName(slot.choice_group_name)) {
      if (!ffaPokemon.includes(pokemonName)) {
        owned.add(pokemonName);
      }
    }
  }

  return [...owned];
}

function getChoiceOwner(guildId, pokemonName, currentUserId = null) {
  const slots = getSlots(guildId);

  for (const slot of slots) {
    if (!slot.user_id) continue;
    if (currentUserId && slot.user_id === currentUserId) continue;
    if (!isChoiceSlot(slot.slot_key)) continue;
    if (!slot.choice_group_name) continue;

    const groupPokemon = getChoiceGroupByName(slot.choice_group_name);
    const ffaPokemon = getSlotFfaPokemon(slot);

    if (groupPokemon.includes(pokemonName) && !ffaPokemon.includes(pokemonName)) {
      return slot;
    }
  }

  return null;
}

function buildPokemonOwnershipMap(guildId) {
  const claimedSlots = getSlots(guildId)
    .filter((slot) => slot.user_id)
    .sort((a, b) => {
      const timeDiff = getClaimedAtValue(a) - getClaimedAtValue(b);
      if (timeDiff !== 0) return timeDiff;
      return a.slot_key.localeCompare(b.slot_key);
    });

  const firstOwnerByPokemon = new Map();

  for (const slot of claimedSlots) {
    for (const pokemonName of getAllOwnedPokemonForSlot(slot)) {
      if (!firstOwnerByPokemon.has(pokemonName)) {
        firstOwnerByPokemon.set(pokemonName, slot.slot_key);
      }
    }
  }

  return firstOwnerByPokemon;
}

function reconcilePokemonOwnership(guildId) {
  const firstOwnerByPokemon = buildPokemonOwnershipMap(guildId);
  const claimedSlots = getSlots(guildId).filter((slot) => slot.user_id);

  for (const slot of claimedSlots) {
    if (isChoiceSlot(slot.slot_key)) continue;

    const currentPokemon = parsePokemonList(slot.pokemon_names);
    const filteredPokemon = currentPokemon.filter(
      (pokemonName) => firstOwnerByPokemon.get(pokemonName) === slot.slot_key
    );

    if (filteredPokemon.length !== currentPokemon.length) {
      savePokemonList(guildId, slot.slot_key, filteredPokemon);
    }
  }
}

function mentionUser(userId) {
  return userId ? `<@${userId}>` : 'Nobody';
}

function getSlotOwnerId(guildId, slotKey) {
  const slot = getSlot(guildId, slotKey);
  return slot?.user_id ?? null;
}

function findChoiceBuyerByKeyword(guildId, keyword) {
  const slots = getSlots(guildId);
  const lowerKeyword = keyword.toLowerCase();

  const match = slots.find(
    (slot) =>
      isChoiceSlot(slot.slot_key) &&
      slot.user_id &&
      slot.choice_group_name &&
      slot.choice_group_name.toLowerCase().includes(lowerKeyword)
  );

  return match?.user_id ?? null;
}

function ensureLogConfig(guildId) {
  db.prepare(`
    INSERT OR IGNORE INTO log_config (guild_id)
    VALUES (?)
  `).run(guildId);
}

function setActionLogChannel(guildId, channelId) {
  ensureLogConfig(guildId);
  db.prepare(`
    UPDATE log_config
    SET action_log_channel_id = ?
    WHERE guild_id = ?
  `).run(channelId, guildId);
}

function setFinishedQueueChannel(guildId, channelId) {
  ensureLogConfig(guildId);
  db.prepare(`
    UPDATE log_config
    SET finished_queue_channel_id = ?
    WHERE guild_id = ?
  `).run(channelId, guildId);
}

function getLogConfig(guildId) {
  ensureLogConfig(guildId);
  return db.prepare(`
    SELECT *
    FROM log_config
    WHERE guild_id = ?
  `).get(guildId);
}

async function sendActionLog(guild, content, messageUrl = null, type = 'info') {
  try {
    const config = getLogConfig(guild.id);
    if (!config?.action_log_channel_id) return;

    const channel = await guild.channels.fetch(config.action_log_channel_id).catch(() => null);
    if (!isSendableChannel(channel)) return;

    const colors = {
      claim: 0x57F287,
      withdraw: 0xFEE75C,
      transfer: 0x5865F2,
      admin: 0xED4245,
      note: 0xEB459E,
      system: 0x2F3136,
      finish: 0x00B0F4,
      info: 0x5865F2,
    };

    const embed = new EmbedBuilder()
      .setDescription(content)
      .setColor(colors[type] || colors.info)
      .setTimestamp();

    if (messageUrl) {
      embed.addFields({
        name: 'Jump',
        value: `[Go to message](${messageUrl})`,
      });
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Action log error:', error);
  }
}

async function sendFinishedQueueArchive(guild, finishedBy, summary) {
  try {
    const config = getLogConfig(guild.id);
    if (!config?.finished_queue_channel_id) return;

    const channel = await guild.channels.fetch(config.finished_queue_channel_id).catch(() => null);
    if (!isSendableChannel(channel)) return;

    const queueEmbed = buildQueueEmbedFromSlots(summary.slotSnapshot, {
      title: 'Previous Round Queue',
      phaseText: 'Previous finished round',
      boosterLocked: false,
    });

    const infoEmbed = new EmbedBuilder()
      .setDescription(`Org completed by <@${finishedBy}>`)
      .setColor(0x00B0F4)
      .setTimestamp();

    await channel.send({
      embeds: [queueEmbed, infoEmbed],
    });
  } catch (error) {
    console.error('Finished queue archive error:', error);
  }
}

function buildFinishSummaryLines(guildId) {
  const slots = getSlots(guildId);

  const chosenRareSlots = slots.filter(
    (slot) => CHOOSE_RARE_SLOT_KEYS.has(slot.slot_key) && slot.chosen_rare
  );

  const chosenRareText = chosenRareSlots.length
    ? chosenRareSlots.map((slot) => slot.chosen_rare.trim()).join(', ')
    : 'None';

  const rareOwnerId = getSlotOwnerId(guildId, 'rare');
  const regionalOwnerId = getSlotOwnerId(guildId, 'regional');
  const gmaxOwnerId = getSlotOwnerId(guildId, 'gmax');

  const choiceParadoxBuyerId = findChoiceBuyerByKeyword(guildId, 'paradox');
  const choicePikasBuyerId =
    findChoiceBuyerByKeyword(guildId, 'pika') ||
    findChoiceBuyerByKeyword(guildId, 'pikas');

  const lines = [];

  lines.push(
    `<a:31:1496873982366842961><a:32:1496873984489164881><a:33:1496873986951352390><a:34:1496873994618671134><a:35:1496873996682006689><a:36:1496873998699593729><a:37:1496874000524251176>\n**Chosen rares/regs taken**, pls remove: **${chosenRareText}** (${mentionUser(rareOwnerId)} ${mentionUser(regionalOwnerId)})`
  );

  if (choiceParadoxBuyerId) {
    lines.push(
      `Choice **paradox taken** this round, please remove from list (${mentionUser(rareOwnerId)})`
    );
  } else {
    lines.push(
      `Choice **paradox not taken** this round, paradox given to (${mentionUser(rareOwnerId)})`
    );
  }

  if (choicePikasBuyerId) {
    lines.push(
      `Choice **pikas taken** this round please remove pikachu (${mentionUser(gmaxOwnerId)})`
    );
  } else {
    lines.push(
      `Choice **pikas not taken:** \n**Normal Pikachu** goes to ${mentionUser(gmaxOwnerId)} and **Partner Pikachu** goes to ${mentionUser(regionalOwnerId)}`
    );
  }

  lines.push(`<a:31:1496873982366842961><a:32:1496873984489164881><a:33:1496873986951352390><a:34:1496873994618671134><a:35:1496873996682006689><a:36:1496873998699593729><a:37:1496874000524251176>`);

  return lines;
}

function getCurrentHolderMentions(guildId) {
  return [...new Set(getSlots(guildId).filter((slot) => slot.user_id).map((slot) => `<@${slot.user_id}>`))].join(' ');
}

function buildSummaryFromCurrentSlots(guildId) {
  const slots = getSlots(guildId);
  const choiceLines = [];
  const reservePokemon = [];
  const removePokemon = [];
  const chosenRares = [];

  for (const slot of slots) {
    if (slot.chosen_rare && CHOOSE_RARE_SLOT_KEYS.has(slot.slot_key)) {
      chosenRares.push(slot.chosen_rare.trim());
    }

    if (isChoiceSlot(slot.slot_key) && slot.choice_group_name) {
      const ffaPokemon = getSlotFfaPokemon(slot);

      const groupPokemon = getChoiceGroupByName(slot.choice_group_name)
        .filter((name) => !ffaPokemon.includes(name))
        .filter((name) => name !== MISSINGNO_NAME)
        .map((name) => prettyPokemonName(formatReserveOutputName(name)))
        .sort((a, b) => a.localeCompare(b));

      choiceLines.push(`**${prettyGroupName(slot.choice_group_name)}:** ${groupPokemon.join(', ') || 'None'}`);
      if (ffaPokemon.length) {
        const formattedFfa = ffaPokemon
          .map((name) => prettyPokemonName(formatReserveOutputName(name)))
          .sort((a, b) => a.localeCompare(b));

        choiceLines.push(`**ffa ${prettyGroupName(slot.choice_group_name)}:** ${formattedFfa.join(', ')}`);
      }
      removePokemon.push(...groupPokemon);
      continue;
    }

    const slotPokemon = isEventSlot(slot.slot_key)
      ? getEventChosenPokemon(slot)
      : parsePokemonList(slot.pokemon_names);

    for (const pokemonName of slotPokemon) {
      if (pokemonName === MISSINGNO_NAME) continue;
      const formatted = formatReserveOutputName(pokemonName);
      reservePokemon.push(prettyPokemonName(formatted));
      removePokemon.push(prettyPokemonName(formatted));
    }
  }
  choiceLines.push(...formatMajorFfaLines(slots));

  reservePokemon.sort((a, b) => a.localeCompare(b));
  const uniqueRemovePokemon = [...new Set(removePokemon)].sort((a, b) => a.localeCompare(b));
  const uniqueChosenRares = [...new Set(chosenRares.filter(Boolean))];

  const choiceGroupNames = slots
    .filter((slot) => isChoiceSlot(slot.slot_key) && slot.choice_group_name)
    .map((slot) => slot.choice_group_name.toLowerCase());

  return {
    finishedAt: new Date().toISOString(),
    choiceList: choiceLines.length ? choiceLines.join('\n') : 'None',
    reservesList: reservePokemon.length ? reservePokemon.join('\n') : 'None',
    removeList: [...uniqueRemovePokemon, ...FIXED_REMOVE_TAIL].join(', '),
    chosenRares: uniqueChosenRares.length ? uniqueChosenRares.join(', ') : 'None',
    choicePikasTaken: choiceGroupNames.some((name) => name.includes('pika')),
    choiceParadoxTaken: choiceGroupNames.some((name) => name.includes('paradox')),
    holderIds: [...new Set(slots.filter((slot) => slot.user_id).map((slot) => slot.user_id))],
    slotSnapshot: slots.map((slot) => ({
      slot_key: slot.slot_key,
      slot_label: slot.slot_label,
      slot_type: slot.slot_type,
      user_id: slot.user_id,
      claimed_at: slot.claimed_at,
      pokemon_names: parsePokemonList(slot.pokemon_names),
      choice_group_name: slot.choice_group_name,
      chosen_rare: slot.chosen_rare,
      ffa_pokemon: getSlotFfaPokemon(slot),
      notes: getSlotNotes(guildId, slot.slot_key).map((n) => n.note_text),
    })),
  };
}

function saveFinishedHistory(guildId, summary) {
  db.prepare(`
    INSERT INTO finished_history (guild_id, finished_at, summary_json)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET finished_at = excluded.finished_at, summary_json = excluded.summary_json
  `).run(guildId, summary.finishedAt, JSON.stringify(summary));
}

function getFinishedHistory(guildId) {
  const row = db.prepare(`SELECT * FROM finished_history WHERE guild_id = ?`).get(guildId);
  if (!row) return null;
  try {
    return JSON.parse(row.summary_json);
  } catch {
    return null;
  }
}

function resetReadiness(guildId, userIds) {
  db.prepare(`DELETE FROM readiness WHERE guild_id = ?`).run(guildId);
  const insert = db.prepare(`
    INSERT INTO readiness (guild_id, user_id, is_ready)
    VALUES (?, ?, 0)
  `);
  for (const userId of userIds) insert.run(guildId, userId);
}

function getReadinessRows(guildId) {
  return db.prepare(`SELECT * FROM readiness WHERE guild_id = ? ORDER BY user_id`).all(guildId);
}

function setReadiness(guildId, userId, isReady) {
  db.prepare(`
    INSERT INTO readiness (guild_id, user_id, is_ready)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET is_ready = excluded.is_ready
  `).run(guildId, userId, isReady ? 1 : 0);
}

function isSendableChannel(channel) {
  return !!channel && typeof channel.send === 'function';
}

function buildReadinessEmbed(guildId) {
  const rows = getReadinessRows(guildId);
  const readyLines = rows.map((row) => `${row.is_ready ? '✅ Ready' : '❌ Not Ready'} - <@${row.user_id}>`);
  return new EmbedBuilder()
    .setTitle('Readiness Checker')
    .setDescription(readyLines.length ? readyLines.join('\n') : 'No buyers found.')
    .setColor(0xC89C74);
}

function getMainFilledCount(slots) {
  return slots.filter((slot) => !BOOSTER_SLOT_KEYS.has(slot.slot_key) && slot.user_id).length;
}

function getBoosterFilledCount(slots) {
  return slots.filter((slot) => BOOSTER_SLOT_KEYS.has(slot.slot_key) && slot.user_id).length;
}

function buildQueueEmbedFromSlots(slots, options = {}) {
  const boosterLocked = !!options.boosterLocked;
  const mainFilled = getMainFilledCount(slots);
  const boosterFilled = getBoosterFilledCount(slots);
  const chosenRareCount = slots.filter(
    (slot) => CHOOSE_RARE_SLOT_KEYS.has(slot.slot_key) && slot.chosen_rare
  ).length;

  const embed = new EmbedBuilder()
    .setTitle(options.title ?? 'Eevee Org Bot')
    .setDescription(
      `${mainFilled}/${MAIN_SLOT_COUNT} slots filled\n` +
      `${chosenRareCount}/3 rares chosen\n` +
      `Boosters + Donor ${boosterFilled}/3 filled\n` +
      `Booster status: **${boosterLocked ? 'Locked' : 'Unlocked'}**\n` +
      ` -------------------------------------------------------------------`
    )
    .setColor(0xFFB6C1);

  const normalSlots = [];
  const resSlots = [];
  const eventSlots = [];
  const bottomSlots = [];


  slots.forEach((slot) => {
    if (isResSlot(slot.slot_key)) {
      resSlots.push(slot);
    } else if (isEventSlot(slot.slot_key)) {
      eventSlots.push(slot);
    } else if (
      slot.slot_key === 'org' ||
      slot.slot_key === 'reserver' ||
      slot.slot_key === 'booster1' ||
      slot.slot_key === 'booster2' ||
      slot.slot_key === 'donor'
    ) {
      bottomSlots.push(slot);
    } else {
      normalSlots.push(slot);
    }
  });

  function buildSlotValue(slot) {
    const ownerText = slot.user_id ? `<@${slot.user_id}>` : 'Open';
    const chosenPokemon = Array.isArray(slot.pokemon_names)
      ? slot.pokemon_names
      : parsePokemonList(slot.pokemon_names);

    let value = `${ownerText}`;

    if (isChoiceSlot(slot.slot_key)) {
      value += `\n${slot.choice_group_name ? prettyGroupName(slot.choice_group_name) : 'Not selected'}`;

      const ffaPokemon = getSlotFfaPokemon(slot);
      if (ffaPokemon.length) {
        value += `\nFFA: ${formatCompactList(ffaPokemon.map(prettyPokemonName), 20)}`;
      }

      if (slot.chosen_rare) {
        value += `\nRare: ${prettyPokemonName(slot.chosen_rare)}`;
      }
    } else {
      value += `\n${chosenPokemon.length ? chosenPokemon.map(prettyPokemonName).join(', ') : 'Not set'}`;

      if (slot.slot_key === 'gmax' && slot.chosen_rare) {
        value += `\nRare: ${prettyPokemonName(slot.chosen_rare)}`;
      }
    }

    const notes = Array.isArray(slot.notes)
      ? slot.notes
      : getSlotNotes(options.guildIdForNotes ?? '', slot.slot_key).map((n) => n.note_text);

    notes.forEach((note, noteIndex) => {
      value += `\n${noteIndex === 0 ? 'Note' : `Note ${noteIndex + 1}`}: ${truncateText(note, 20)}`;
    });

    return value;
  }

  normalSlots.forEach((slot) => {
    embed.addFields({
      name: slot.slot_label,
      value: buildSlotValue(slot),
      inline: true,
    });
  });

  if (resSlots.length) {
    const entries = resSlots.map((slot) => {
      const owner = slot.user_id ? `<@${slot.user_id}>` : 'Open';

      const label = slot.slot_label
        .replace('1Res ', '')
        .replace('2Res ', '');

      const chosenPokemon = Array.isArray(slot.pokemon_names)
        ? slot.pokemon_names
        : parsePokemonList(slot.pokemon_names);

      const pokemonText = chosenPokemon.length
        ? chosenPokemon.map(prettyPokemonName).join(', ')
        : 'Not set';

      return `**${label} - ${owner}**\n${pokemonText}`;
    });

    const left = entries.filter((_, i) => i % 2 === 0);
    const right = entries.filter((_, i) => i % 2 === 1);

    embed.addFields(
      {
        name: 'Reserves',
        value: left.join('\n\n') || 'None',
        inline: true,
      },
      {
        name: '\u200B',
        value: right.join('\n\n') || '\u200B',
        inline: true,
      },
      {
        name: '\u200B',
        value: '\u200B',
        inline: true,
      }
    );
  }

  if (eventSlots.length) {
    eventSlots.forEach((slot) => {
      embed.addFields({
        name: slot.slot_label,
        value: buildSlotValue(slot),
        inline: true,
      });
    });
  }

  bottomSlots.forEach((slot) => {
    embed.addFields({
      name: slot.slot_label,
      value: buildSlotValue(slot),
      inline: true,
    });
  });

  return embed;
}

function normalizePokemonBaseName(name) {
  const normalized = normalizePokemonName(name);

  if (normalized.includes('unown')) {
    return 'unown';
  }

  const formParts = [
    'white-flower',
    'red-flower',
    'blue-flower',
    'yellow-flower',
    'orange-flower',

    'matron-trim',
    'heart-trim',
    'star-trim',
    'diamond-trim',
    'debutante-trim',
    'dandy-trim',
    'la-reine-trim',
    'kabuki-trim',
    'pharaoh-trim',

    'school',
    'noice-face',
    'three-segment',
    'family-of-three',
    'hero',
    'bloodmoon',
    'hangry',
    'winter',
    'autumn',
    'summer',
    'spiky-eared',
    'east-sea',
    'trash',
    'sandy',
    'icy-snow',
    'polar',
    'tundra',
    'continental',
    'garden',
    'elegant',
    'modern',
    'marine',
    'archipelago',
    'high-plain',
    'sandstorm',
    'river',
    'monsoon',
    'savanna',
    'sun',
    'ocean',
    'jungle',
    'fancy',
    'poke-ball',
    'heat',
    'wash',
    'frost',
    'fan',
    'mow',
    'phone',
    'drone',
    'pokedex',
    'zen',
    'sunshine',
    'rainy',
    'sunny',
    'snowy',
    'blue-plumage',
    'yellow-plumage',
    'white-plumage',
    'droopy',
    'stretchy',
    'dusk',
    'midnight',
    'pom-pom',
    'pau',
    'sensu',
    'ride',
    'battle',
    'gulping',
    'gorging',
    'blue-striped',
    'white-striped',
    'zenith',
    'sprinting-build',
    'gliding-build',
    'drive-mode',
    'glide-mode',
    'rapid-strike',
    'bug',
    'dark',
    'dragon',
    'electric',
    'fighting',
    'fire',
    'flying',
    'ghost',
    'grass',
    'ground',
    'ice',
    'poison',
    'psychic',
    'rock',
    'steel',
    'water',
    'fairy',
    'wellspring-mask',
    'hearthflame-mask',
    'cornerstone-mask',
    'attack',
    'defense',
    'speed',
    'high-speed-flight-configuration',
    'pirouette',
    'terastal',
    '10%',
    'core',
    'complete',
    'cell',
    'dada',
    'neutral',
  ];

  let base = normalized;

  for (const form of formParts) {
    if (base.startsWith(`${form}-`)) {
      base = base.slice(form.length + 1);
      break;
    }

    if (base.endsWith(`-${form}`)) {
      base = base.slice(0, -(form.length + 1));
      break;
    }
  }

  return base;
}

function buildQueueEmbed(guildId) {
  const state = getQueueState(guildId);
  const slots = getSlots(guildId);
  const phaseText = state?.phase === 'public' ? 'Public phase' : 'Staff phase';

  return buildQueueEmbedFromSlots(slots, {
    title: 'Eevee Org Bot',
    boosterLocked: !!state?.booster_locked,
    guildIdForNotes: guildId,
  });
}

function getOpenButtonStyle(slotKey, boosterLocked = true) {
  if (BOOSTER_SLOT_KEYS.has(slotKey)) {
    return boosterLocked ? ButtonStyle.Secondary : ButtonStyle.Success;
  }

  if (slotKey === 'org' || slotKey === 'reserver') {
    return ButtonStyle.Primary;
  }

  return ButtonStyle.Success;
}

function getFinishedSlotOwnedPokemon(slotSnapshot) {
  const names = [];

  if (isEventSlot(slotSnapshot.slot_key)) {
    const fixedPokemon = getEventFixedPokemon(slotSnapshot.slot_key);
    if (fixedPokemon && fixedPokemon !== MISSINGNO_NAME) {
      names.push(fixedPokemon);
    }

    for (const pokemonName of getFinishedEventChosenPokemon(slotSnapshot)) {
      const normalized = normalizePokemonName(pokemonName);
      if (normalized === MISSINGNO_NAME) continue;
      names.push(normalized);
    }
  } else if (Array.isArray(slotSnapshot.pokemon_names)) {
    for (const pokemonName of slotSnapshot.pokemon_names) {
      const normalized = normalizePokemonName(pokemonName);
      if (normalized === MISSINGNO_NAME) continue;
      names.push(normalized);
    }
  }

  if (isChoiceSlot(slotSnapshot.slot_key) && slotSnapshot.choice_group_name) {
    const ffaPokemon = Array.isArray(slotSnapshot.ffa_pokemon)
      ? slotSnapshot.ffa_pokemon.map(normalizePokemonName)
      : [];

    for (const pokemonName of getChoiceGroupByName(slotSnapshot.choice_group_name)) {
      const normalized = normalizePokemonName(pokemonName);
      if (normalized === MISSINGNO_NAME) continue;
      if (!ffaPokemon.includes(normalized)) {
        names.push(normalized);
      }
    }
  }

  if (slotSnapshot.chosen_rare) {
    const normalizedRare = normalizePokemonName(slotSnapshot.chosen_rare);
    if (normalizedRare !== MISSINGNO_NAME) {
      names.push(normalizedRare);
    }
  }

  return [...new Set(names)];
}

function buildReservePingsEmbed(summary) {
  const pokemonOwnerMap = new Map(); // pokemon -> userId
  const pokemonByUser = new Map();   // userId -> Set(pokemon)
  const notesByUser = new Map();     // userId -> Set(notes)

  const sortedSlots = [...(summary.slotSnapshot || [])].sort((a, b) => {
    const timeA = a?.claimed_at ? new Date(a.claimed_at).getTime() : Number.MAX_SAFE_INTEGER;
    const timeB = b?.claimed_at ? new Date(b.claimed_at).getTime() : Number.MAX_SAFE_INTEGER;

    if (timeA !== timeB) return timeA - timeB;
    return String(a.slot_key).localeCompare(String(b.slot_key));
  });

  for (const slot of sortedSlots) {
    if (!slot.user_id) continue;

    const ownedPokemon = getFinishedSlotOwnedPokemon(slot);

    for (const pokemonName of ownedPokemon) {
      if (pokemonOwnerMap.has(pokemonName)) continue;
      pokemonOwnerMap.set(pokemonName, slot.user_id);
    }

    if (!notesByUser.has(slot.user_id)) {
      notesByUser.set(slot.user_id, new Set());
    }

    for (const note of Array.isArray(slot.notes) ? slot.notes : []) {
      const trimmed = String(note).trim();
      if (trimmed) {
        notesByUser.get(slot.user_id).add(trimmed);
      }
    }
  }

  for (const [pokemonName, userId] of pokemonOwnerMap.entries()) {
    if (!pokemonByUser.has(userId)) {
      pokemonByUser.set(userId, new Set());
    }

    const reserveName = formatReserveOutputName(pokemonName);
    const displayName = REGIONAL_FORM_BASE_POKEMON.has(pokemonName)
      ? `normal ${pokemonName}`
      : reserveName;

    pokemonByUser
      .get(userId)
      .add(prettyPokemonName(displayName));
  }

  const allUserIds = new Set([
    ...pokemonByUser.keys(),
    ...notesByUser.keys(),
  ]);

  const lines = [...allUserIds].map((userId) => {
    const pokemonList = [...(pokemonByUser.get(userId) || new Set())].sort((a, b) => a.localeCompare(b));
    const noteList = [...(notesByUser.get(userId) || new Set())];

    let block = `<@${userId}> - \`${pokemonList.join(', ') || 'No Pokémon'}\``;

    if (noteList.length) {
      block += `\nNotes:\n${noteList.map((note) => `• ${note}`).join('\n')}`;
    }

    return block;
  });

  return new EmbedBuilder()
    .setTitle('Reserve Pings')
    .setDescription(lines.length ? lines.join('\n\n') : 'No stored Pokemon ownership found.')
    .setColor(0xFAD7A0);
}

function mentionRole(roleId) {
  return roleId ? `<@&${roleId}>` : '';
}

function getOpenBuyerRoleIds(guildId) {
  const slots = getSlots(guildId);
  const roleIds = [];

  const rareOpen = slots.some((slot) => slot.slot_key === 'rare' && !slot.user_id);
  const regionalOpen = slots.some((slot) => slot.slot_key === 'regional' && !slot.user_id);
  const gmaxOpen = slots.some((slot) => slot.slot_key === 'gmax' && !slot.user_id);
  const eevosOpen = slots.some((slot) => slot.slot_key === 'eevos' && !slot.user_id);
  const choiceOpen = slots.some((slot) => (slot.slot_key === 'choice1' || slot.slot_key === 'choice2') && !slot.user_id);
  const reservesOpen = slots.some((slot) => RES_SLOT_REGEX.test(slot.slot_key) && !slot.user_id);

  if (rareOpen && process.env.RARE_BUYER_ROLE_ID?.trim()) {
    roleIds.push(process.env.RARE_BUYER_ROLE_ID.trim());
  }

  if (regionalOpen && process.env.REGIONAL_BUYER_ROLE_ID?.trim()) {
    roleIds.push(process.env.REGIONAL_BUYER_ROLE_ID.trim());
  }

  if (gmaxOpen && process.env.GMAX_BUYER_ROLE_ID?.trim()) {
    roleIds.push(process.env.GMAX_BUYER_ROLE_ID.trim());
  }

  if (eevosOpen && process.env.EEVOS_BUYER_ROLE_ID?.trim()) {
    roleIds.push(process.env.EEVOS_BUYER_ROLE_ID.trim());
  }

  if (choiceOpen && process.env.CHOICE_BUYER_ROLE_ID?.trim()) {
    roleIds.push(process.env.CHOICE_BUYER_ROLE_ID.trim());
  }

  if (reservesOpen && process.env.RESERVES_BUYER_ROLE_ID?.trim()) {
    roleIds.push(process.env.RESERVES_BUYER_ROLE_ID.trim());
  }

  if (EVENT_QUEUE_ENABLED) {
    for (const eventSlot of EVENT_SLOT_CONFIG) {
      const isOpen = slots.some((slot) => slot.slot_key === eventSlot.key && !slot.user_id);
      const roleId = process.env[eventSlot.buyerRoleEnv]?.trim();

      if (isOpen && roleId) {
        roleIds.push(roleId);
      }
    }
  }

  return [...new Set(roleIds)];
}

function buildButtons(guildId) {
  const state = getQueueState(guildId);
  const slots = getSlots(guildId);
  const rows = [];

  const mainOrder = [
    'rare',
    'regional',
    'gmax',
    'eevos',
    'choice1',
    'choice2',
    'booster1',
    'booster2',
    'donor',
  ];

  const mainSlots = mainOrder
    .map((key) => slots.find((slot) => slot.slot_key === key))
    .filter(Boolean);

  const eventSlots = slots.filter((slot) => isEventSlot(slot.slot_key));

  const orgSlot = slots.find((slot) => slot.slot_key === 'org');
  const reserverSlot = slots.find((slot) => slot.slot_key === 'reserver');

  function makeClaimButton(slot) {
    const isLockedBooster =
      BOOSTER_SLOT_KEYS.has(slot.slot_key) &&
      !!state?.booster_locked &&
      !slot.user_id;

    return new ButtonBuilder()
      .setCustomId(`claim:${guildId}:${slot.slot_key}`)
      .setLabel(slot.slot_label)
      .setStyle(
        slot.user_id
          ? ButtonStyle.Secondary
          : getOpenButtonStyle(slot.slot_key, !!state?.booster_locked)
      )
      .setDisabled(isLockedBooster || !!slot.user_id);
  }

  // Row 1-2: main slots only
  for (let i = 0; i < mainSlots.length; i += 5) {
    const row = new ActionRowBuilder();

    for (const slot of mainSlots.slice(i, i + 5)) {
      row.addComponents(makeClaimButton(slot));
    }

    rows.push(row);
  }

  // Row 3: reserves
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claimres:${guildId}:single`)
        .setLabel('Single Reserve')
        .setStyle(ButtonStyle.Success)
        .setDisabled(areAllSlotsFilled(guildId, SINGLE_RES_SLOT_KEYS)),

      new ButtonBuilder()
        .setCustomId(`claimres:${guildId}:double`)
        .setLabel('Double Reserve')
        .setStyle(ButtonStyle.Success)
        .setDisabled(areAllSlotsFilled(guildId, DOUBLE_RES_SLOT_KEYS))
    )
  );

  // Row 4: event slots only
  if (eventSlots.length) {
    const row = new ActionRowBuilder();

    for (const slot of eventSlots.slice(0, 5)) {
      row.addComponents(makeClaimButton(slot));
    }

    rows.push(row);
  }

  // Row 5: org / reserver / lock / unlock
  const bottomRow = new ActionRowBuilder();

  if (orgSlot) bottomRow.addComponents(makeClaimButton(orgSlot));
  if (reserverSlot) bottomRow.addComponents(makeClaimButton(reserverSlot));

  bottomRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`boosterlock:${guildId}:lock`)
      .setLabel('Lock Boosters')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`boosterlock:${guildId}:unlock`)
      .setLabel('Unlock Boosters')
      .setStyle(ButtonStyle.Success)
  );

  rows.push(bottomRow);

  return rows.slice(0, 5);
}

function getNextOpenSlotFromKeys(guildId, slotKeys) {
  const slots = getSlots(guildId);

  return slotKeys
    .map((key) => slots.find((slot) => slot.slot_key === key))
    .find((slot) => slot && !slot.user_id) || null;
}

function areAllSlotsFilled(guildId, slotKeys) {
  return !getNextOpenSlotFromKeys(guildId, slotKeys);
}


function buildWithdrawConfirmButtons(guildId, slotKey) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirmrelease:${guildId}:${slotKey}:yes`)
        .setLabel('Yes')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`confirmrelease:${guildId}:${slotKey}:no`)
        .setLabel('No')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function getFinishedMajorCooldownSlots() {
  return new Set(['rare', 'regional', 'gmax', 'eevos', 'choice1', 'choice2']);
}

function getFinishedEventCooldownSlotKeys() {
  return new Set(
    EVENT_QUEUE_ENABLED ? EVENT_SLOT_CONFIG.map((slot) => slot.key) : []
  );
}

function rebuildCooldownHistoryFromCurrentFinishedHolders(guildId) {
  const slots = getSlots(guildId);

  const majorCooldownSlotKeys = getFinishedMajorCooldownSlots();
  const eventCooldownSlotKeys = getFinishedEventCooldownSlotKeys();

  // major: keep only last round
  db.prepare(`DELETE FROM previous_round_claim_history WHERE guild_id = ?`).run(guildId);

  const insertMajor = db.prepare(`
    INSERT OR IGNORE INTO previous_round_claim_history (guild_id, user_id, slot_key)
    VALUES (?, ?, ?)
  `);

  for (const slot of slots) {
    if (!slot.user_id) continue;
    if (!majorCooldownSlotKeys.has(slot.slot_key)) continue;
    insertMajor.run(guildId, slot.user_id, slot.slot_key);
  }

  // event: store which round the user finished with an event slot
  const state = getQueueState(guildId);
  if (!state) return;

  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO event_claim_history (guild_id, user_id, round_number)
    VALUES (?, ?, ?)
  `);

  for (const slot of slots) {
    if (!slot.user_id) continue;
    if (!eventCooldownSlotKeys.has(slot.slot_key)) continue;
    insertEvent.run(guildId, slot.user_id, state.round_number);
  }

  // keep only last 2 rounds of event cooldown data
  db.prepare(`
    DELETE FROM event_claim_history
    WHERE guild_id = ?
      AND round_number < ?
  `).run(guildId, state.round_number - 1);
}

async function refreshQueueMessage(guild) {
  const state = getQueueState(guild.id);
  if (!state) return;

  const channel = await guild.channels.fetch(state.channel_id).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(state.message_id).catch(() => null);
  if (!message) return;

  await message.edit({
    embeds: [buildQueueEmbed(guild.id)],
    components: buildButtons(guild.id),
  });

}

function buildReserveListMessage(summary) {
  return (
    `**Choice list** \n${summary.choiceList}\n\n` +
    `**Reserves list** \n${summary.reservesList}\n\n` +
    `**N!cl remove list** \n${summary.removeList}`
  );
}

async function sendOrgLog(guild, userId, messageLink) {
  const threadId = process.env.ORG_LOG_THREAD_ID?.trim();
  if (!threadId) return;

  const thread = await guild.channels.fetch(threadId).catch(() => null);
  if (!thread || typeof thread.send !== 'function') return;

  await thread.send({
    content: `<@${userId}> completed an org → ${messageLink}`,
  });
}

async function sendReadinessPost(channel, guildId, holderIds, labelText) {
  resetReadiness(guildId, holderIds);

  const mentions = holderIds.map((id) => `<@${id}>`).join(' ');
  await channel.send({
    content: `${mentions}\n${labelText}`,
    embeds: [buildReadinessEmbed(guildId)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ready:${guildId}:yes`)
          .setLabel('Ready')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ready:${guildId}:no`)
          .setLabel('Not Ready')
          .setStyle(ButtonStyle.Danger)
      ),
    ],
  });
}

async function finishQueueAndAnnounce(guild, finishedBy) {
  const state = getQueueState(guild.id);
  if (!state) return null;

  const channel = await guild.channels.fetch(state.channel_id).catch(() => null);
  if (!channel) return null;

  const summary = buildSummaryFromCurrentSlots(guild.id);
  saveFinishedHistory(guild.id, summary);

  const mentions = summary.holderIds.map((id) => `<@${id}>`).join(' ');
  const finishLines = buildFinishSummaryLines(guild.id);
  const sentMessage = await channel.send({
    content:
      `Org finished by <@${finishedBy}>.\n${mentions}\n\n` +
      finishLines.join('\n'),
  });

  rebuildCooldownHistoryFromCurrentFinishedHolders(guild.id);

  db.prepare(`
    UPDATE queue_state
    SET is_active = 0, phase = 'finished'
    WHERE guild_id = ?
  `).run(guild.id);

  await sendActionLog(
    guild,
    `/finish ran by <@${finishedBy}>`,
    null,
    'finish'
  );

  await sendFinishedQueueArchive(guild, finishedBy, summary);

  return sentMessage;
}

async function sendBuyerNotifications(guildId, guild) {
  const slots = getSlots(guildId);

  const rows = db.prepare(`
    SELECT slot_key, channel_id
    FROM buy_channels
    WHERE guild_id = ?
  `).all(guildId);

  const channelMap = new Map(
    rows.map((r) => [r.slot_key, r.channel_id])
  );

  for (const slot of slots) {
    if (!slot.user_id) continue;

    const channelId = channelMap.get(slot.slot_key);
    if (!channelId) continue;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) continue;

    await channel.send({
      content: `<@${slot.user_id}> - **${prettySlotLabel(slot.slot_key)}** Start buying here <:9_:1496851117194219600>`
    }).catch(console.error);
  }
}

async function cancelQueueAndAnnounce(guild, cancelledBy) {
  const state = getQueueState(guild.id);
  if (!state) return false;

  const channel = await guild.channels.fetch(state.channel_id).catch(() => null);
  if (!channel) return false;

  const mentions = getCurrentHolderMentions(guild.id) || 'No slot holders';
  await channel.send({
    content: `${mentions}\nRound is cancelled by <@${cancelledBy}>. <:8_:1496851119450882110>`,
  });

  db.prepare(`UPDATE queue_state SET is_active = 0, phase = 'cancelled' WHERE guild_id = ?`).run(guild.id);
  db.prepare(`DELETE FROM readiness WHERE guild_id = ?`).run(guild.id);
  return true;
}

function addAllSlotChoices(option) {
  option.setRequired(true);
  for (const slot of SLOT_DEFS) {
    option.addChoices({ name: slot.label, value: slot.key });
  }
  return option;
}

function addChoiceSlotChoices(option) {
  option
    .setRequired(true)
    .addChoices(
      { name: 'Choice1', value: 'choice1' },
      { name: 'Choice2', value: 'choice2' }
    );
  return option;
}


function addChooseRareSlotChoices(option) {
  option
    .setRequired(true)
    .addChoices(
      { name: 'Gmax', value: 'gmax' },
      { name: 'Choice1', value: 'choice1' },
      { name: 'Choice2', value: 'choice2' }
    );
  return option;
}

function addChoiceGroupChoices(option) {
  return option
    .setRequired(true)
    .setAutocomplete(true);
}

const commands = [
  new SlashCommandBuilder()
    .setName('startqueue')
    .setDescription('Start a new staff queue in this channel'),

  new SlashCommandBuilder()
    .setName('copyannouncement')
    .setDescription('Copy another staff member announcement template into your own slot.')
    .addUserOption((option) =>
      option
        .setName('from')
        .setDescription('Staff member to copy from.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('slot')
        .setDescription('Their template slot to copy from.')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .addIntegerOption((option) =>
      option
        .setName('to_slot')
        .setDescription('Your template slot to copy into.')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  new SlashCommandBuilder()
    .setName('sponsortoggle')
    .setDescription('Route steal reports to a sponsor instead of Pokémon owner.')
    .addBooleanOption(option =>
      option
        .setName('enabled')
        .setDescription('Enable or disable sponsor routing.')
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName('sponsor')
        .setDescription('Sponsor user to route reports to.')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Find which groups a Pokémon belongs to.')
    .addStringOption(o =>
      o.setName('pokemon').setDescription('Pokemon name').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View buyer leaderboard.')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(true)
        .addChoices(
          { name: 'Points', value: 'points' },
          { name: 'Rare', value: 'rare' },
          { name: 'Regional', value: 'regional' },
          { name: 'Gmax', value: 'gmax' },
          { name: 'Eevee', value: 'eevee' }
        )
    ),

  new SlashCommandBuilder()
    .setName('forcelinkalt')
    .setDescription('Force link an alt to a main profile (staff only).')
    .addUserOption(o =>
      o.setName('alt').setDescription('Alt account').setRequired(true)
    )
    .addUserOption(o =>
      o.setName('main').setDescription('Main account').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('linkalt')
    .setDescription('Request to link your account to a main buyer profile.')
    .addUserOption(option =>
      option
        .setName('main')
        .setDescription('Main account to link this account under.')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setbuychn')
    .setDescription('Set this channel as the buy channel for a slot')
    .addStringOption((option) =>
      addAllSlotChoices(
        option
          .setName('slot')
          .setDescription('Slot to set buy channel for')
      )
    ),

  new SlashCommandBuilder()
    .setName('approvealt')
    .setDescription('Approve a pending alt link.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Alt user to approve.')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('unlinkalt')
    .setDescription('Remove an alt link.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to unlink.')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('resetprofile')
    .setDescription('Reset a buyer profile for one user.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User profile to reset.')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('addpoints')
    .setDescription('Add profile points to a user.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to add points to.')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount of points to add.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason.')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove profile points from a user.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to remove points from.')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount of points to remove.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason.')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('exportprofiles')
    .setDescription('Export all buyer profiles and alt links as CSV.'),

  new SlashCommandBuilder()
    .setName('addresult')
    .setDescription('Add Pokémon to a user after finish')
    .addUserOption(option =>
      option.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(option =>
      option.setName('pokemon').setDescription('Pokemon list (comma separated)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View buyer profile.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to view')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('removeresult')
    .setDescription('Remove Pokémon from a user after finish')
    .addUserOption(option =>
      option.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(option =>
      option.setName('pokemon').setDescription('Pokemon list (comma separated)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('forceupdate')
    .setDescription('Reconcile and force update the queue.'),

  new SlashCommandBuilder()
    .setName('reopenqueue')
    .setDescription('Repost the active queue in this channel.'),

  new SlashCommandBuilder()
    .setName('botstatus')
    .setDescription('Show bot and queue status.'),

  new SlashCommandBuilder()
    .setName('repingbuyers')
    .setDescription('Ping buyer roles for currently open queue slots'),

  new SlashCommandBuilder()
    .setName('clearallinc')
    .setDescription('Reset all tracked incense channels for this server'),

  new SlashCommandBuilder()
    .setName('viewannouncement')
    .setDescription('View a staff member announcement template slot.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Staff member whose template you want to view.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('slot')
        .setDescription('Template slot number.')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  new SlashCommandBuilder()
    .setName('setmajorffa')
    .setDescription('Set FFA Pokémon for Rare, Regional, Gmax, or Eevees.')
    .addStringOption((option) =>
      option
        .setName('slot')
        .setDescription('Major slot')
        .setRequired(true)
        .addChoices(
          { name: 'Rare', value: 'rare' },
          { name: 'Regional', value: 'regional' },
          { name: 'Gmax', value: 'gmax' },
          { name: 'Eevees', value: 'eevos' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('pokemon')
        .setDescription('Comma-separated FFA Pokémon')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('addallinc')
    .setDescription('Add all text channels under this category to incense tracking'),

  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a stolen catch using the catch message link')
    .addStringOption(option =>
      option
        .setName('message_link')
        .setDescription('Link to the caught Pokémon message')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setannouncetop')
    .setDescription('Open a popup to set the top announcement section.'),


  new SlashCommandBuilder()
    .setName('setannouncebottom')
    .setDescription('Open a popup to set the bottom announcement section.'),

  new SlashCommandBuilder()
    .setName('annoslot')
    .setDescription('Choose which announcement template slot to use.')
    .addIntegerOption((option) =>
      option
        .setName('number')
        .setDescription('Template slot number, 1 to 20.')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  new SlashCommandBuilder()
    .setName('setannounceping')
    .setDescription('Set the access ping for announcements.')

    .addStringOption((option) =>
      option
        .setName('ping')
        .setDescription('Example: <@&123456789>')
        .setRequired(true)
        .setMaxLength(200)
    ),

  new SlashCommandBuilder()
    .setName('setannounceemojis')
    .setDescription('Set emojis/symbols used in the generated announcement list.')

    .addStringOption((option) =>
      option
        .setName('item_emojis')
        .setDescription('Emojis before each Pokémon. Example: ✨ 🌸 ⭐')
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName('group_emojis')
        .setDescription('Emojis before group titles. Example: 🔥 💎')
        .setRequired(false)
        .setMaxLength(1000)
    ),

  new SlashCommandBuilder()
    .setName('sampleannounce')
    .setDescription('Preview the announcement without access ping.'),


  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send the announcement with access ping.'),


  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close this steal ticket thread'),

  new SlashCommandBuilder()
    .setName('addticket')
    .setDescription('Add a user to this ticket thread')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to add')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('removeticket')
    .setDescription('Remove a user from this ticket thread')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to remove')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('incbought')
    .setDescription('Show incense bought progress'),

  new SlashCommandBuilder()
    .setName('addinc')
    .setDescription('Add this channel to incense tracking'),

  new SlashCommandBuilder()
    .setName('removeinc')
    .setDescription('Remove this channel from incense tracking'),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause incense in this channel'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume incense in this channel'),

  new SlashCommandBuilder()
    .setName('pauseall')
    .setDescription('Staff pause incense in all tracked channels'),

  new SlashCommandBuilder()
    .setName('resumeall')
    .setDescription('Staff resume incense in all tracked channels'),

  new SlashCommandBuilder()
    .setName('directlogs')
    .setDescription('Set the action log channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel for action logs')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('directfinishedqueues')
    .setDescription('Set the finished queue archive channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel for finished queue embeds')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('choiceslist')
    .setDescription('Show all available choice groups'),

  new SlashCommandBuilder()
    .setName('openqueue')
    .setDescription('Post the current queue in this public channel'),

  new SlashCommandBuilder()
    .setName('endqueue')
    .setDescription('Cancel the current round and tag slot holders'),

  new SlashCommandBuilder()
    .setName('finish')
    .setDescription('Finish the current round and run readiness checker'),

  new SlashCommandBuilder()
    .setName('readiness')
    .setDescription('Repost readiness checker for the latest finished round'),

  new SlashCommandBuilder()
    .setName('reservelist')
    .setDescription('Show the latest stored reserve list'),

  new SlashCommandBuilder()
    .setName('pasthistory')
    .setDescription('Show the previous finished round queue UI'),

  new SlashCommandBuilder()
    .setName('choosegroup')
    .setDescription('Choose a group for a claimed choice slot')
    .addStringOption((option) => addChoiceSlotChoices(option.setName('slot').setDescription('Your claimed choice slot')))
    .addStringOption((option) => addChoiceGroupChoices(option.setName('group').setDescription('Choice group name'))),

  new SlashCommandBuilder()
    .setName('chooserare')
    .setDescription('Choose a rare for Gmax, Choice1 or Choice2')
    .addStringOption((option) => addChooseRareSlotChoices(option.setName('slot').setDescription('Your slot')))
    .addStringOption((option) => option.setName('rare').setDescription('Rare name').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setffa')
    .setDescription('Set FFA Pokemon for your claimed choice slot')
    .addStringOption((option) =>
      addChoiceSlotChoices(option.setName('slot').setDescription('Your claimed choice slot'))
    )
    .addStringOption((option) =>
      option.setName('pokemon')
        .setDescription('Comma-separated Pokemon names to make free')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pick')
    .setDescription('Assign a Pokemon to your next available owned normal slot')
    .addStringOption((option) =>
      option.setName('pokemon')
        .setDescription('Pokemon name')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('clearallres')
    .setDescription('Clear all your chosen reserve Pokémon'),

  new SlashCommandBuilder()
    .setName('clearres')
    .setDescription('Clear one chosen reserve Pokémon')
    .addStringOption(option =>
      option
        .setName('pokemon')
        .setDescription('Pokemon to clear')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Release one of your claimed slots')
    .addStringOption((option) => addAllSlotChoices(option.setName('slot').setDescription('Slot to release'))),

  new SlashCommandBuilder()
    .setName('reservepings')
    .setDescription('Show taken Pokemon and their owners from the latest finished round'),

  new SlashCommandBuilder()
    .setName('clearcd')
    .setDescription('Cleared all cd for the server'),

  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer one of your claimed slots to another user')
    .addStringOption((option) => addAllSlotChoices(option.setName('slot').setDescription('Your claimed slot')))
    .addUserOption((option) => option.setName('user').setDescription('New owner').setRequired(true)),

  new SlashCommandBuilder()
    .setName('addnote')
    .setDescription('Add a note to a slot. Max 3 per slot 70 characters each.')
    .addStringOption((option) => addAllSlotChoices(option.setName('slot').setDescription('Target slot')))
    .addStringOption((option) => option.setName('note').setDescription('Short note').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clearnotes')
    .setDescription('Removes all notes from a slot')
    .addStringOption((option) => addAllSlotChoices(option.setName('slot').setDescription('Target slot'))),

  new SlashCommandBuilder()
    .setName('showcd')
    .setDescription('View current major and event cooldowns'),

  new SlashCommandBuilder()
    .setName('setwatchchannel')
    .setDescription('Set the channel EeveeBot watches for random pings')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to watch')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('togglewatch')
    .setDescription('Enable or disable Eevee watch mode')
    .addBooleanOption(option =>
      option
        .setName('enabled')
        .setDescription('Turn watch mode on or off')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setwatchcooldown')
    .setDescription('Set Eevee watch cooldown in minutes')
    .addIntegerOption(option =>
      option
        .setName('minutes')
        .setDescription('Cooldown time in minutes')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('watchstatus')
    .setDescription('Show Eevee watch settings'),

  new SlashCommandBuilder()
    .setName('bonk')
    .setDescription('Bonk someone')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('Who to bonk')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('hug')
    .setDescription('Hug someone')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('Who to hug')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Battle another user')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('Who to battle')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('adminremove')
    .setDescription('Admin remove a player from a claimed slot')
    .addStringOption((option) => addAllSlotChoices(option.setName('slot').setDescription('Slot to clear'))),

  new SlashCommandBuilder()
    .setName('raffle')
    .setDescription('Pick raffle winners from a message')
    .addStringOption(option =>
      option.setName('message_link')
        .setDescription('Link to the message containing raffle entries')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners to pick (default 1)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),
].map((command) => command.toJSON());

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  setInterval(checkAutoClearCd, 5 * 60 * 1000);
  checkAutoClearCd();
  setInterval(() => checkExpiredBuyerRoles(client), 10 * 60 * 1000);
  checkExpiredBuyerRoles(client);
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on('shardDisconnect', (event, shardId) => {
  console.error(`[Discord] Shard ${shardId} disconnected`, event);
});

client.on('shardReconnecting', (shardId) => {
  console.warn(`[Discord] Shard ${shardId} reconnecting...`);
});

client.on('shardResume', (shardId, replayedEvents) => {
  console.log(`[Discord] Shard ${shardId} resumed. Replayed ${replayedEvents} events.`);
});

process.on('unhandledRejection', (error) => {
  console.error('[Unhandled Rejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
});

client.on('messageCreate', async (message) => {
  try {
    // 1. ignore DMs
    if (!message.guild) return;

    const guildId = message.guild.id;

    // =========================
    // INCENSE TRACKER
    // =========================

    if (isIncenseBoughtMessage(message)) {
      if (!isTrackedIncenseChannel(guildId, message.channel.id)) return;

      const row = getIncenseChannelRow(guildId, message.channel.id);

      if (!row) return;
      if (row.is_bought) return;
      if (row.is_paused) return;

      if (wasRecentlyPausedOrBought(row, 5)) {
        console.log(`[Safety] Skipping pause for ${message.channel.id}; recent buy detected.`);
        return;
      }

      markIncenseBought(guildId, message.channel.id);

      await pauseIncenseInChannel(message.channel);

      await message.channel.send('<:48:1496880432438972576> Incense bought! Channel paused.');

      return;
    }

    if (isIncensePausedMessage(message)) {
      if (!isTrackedIncenseChannel(guildId, message.channel.id)) return;

      startOverpauseTimer(message.guild, message.channel.id);
      return;
    }

    if (isIncenseResumedMessage(message)) {
      if (!isTrackedIncenseChannel(guildId, message.channel.id)) return;

      cancelOverpauseTimer(guildId, message.channel.id);
      return;
    }

    // after incense handling, ignore all other bot messages
    if (message.author.bot) return;

    const content = message.content.trim().toLowerCase();

    const channelId = message.channel?.id;

    if (!guildId || !channelId) return;

    // =========================
    // SHORTCUT COMMANDS (!p / !r)
    // =========================
    if (content === '!p') {
      if (!isTrackedIncenseChannel(guildId, channelId)) return;

      await pauseIncenseInChannel(message.channel);

      await message.reply('<:47:1496880430350336222> Channel paused.');

      return;
    }

    if (content === '!r') {
      if (!isTrackedIncenseChannel(guildId, channelId)) return;

      await resumeIncenseInChannel(message.channel);

      await message.reply('<:46:1496880428345458798> Channel resumed.');

      return;
    }

    // =========================
    // EXISTING WATCH FEATURE
    // =========================


    const config = getWatchConfig(guildId);

    if (!config) return;

    // enabled?
    if (!config.enabled) return;

    // correct watch channel?
    if (!config.channel_id || message.channel.id !== config.channel_id) return;

    // cooldown
    const now = Date.now();
    const last = config.last_triggered_at
      ? new Date(config.last_triggered_at).getTime()
      : 0;

    const cooldownMs = (config.cooldown_minutes ?? 30) * 60 * 1000;

    if (now - last < cooldownMs) return;

    // random chance
    if (Math.random() > 0.50) return;

    // recent chatter
    const recentMessages = await message.channel.messages.fetch({ limit: 3 });

    const recentUserIds = [
      ...new Set(
        recentMessages
          .filter((msg) => !msg.author.bot)
          .map((msg) => msg.author.id)
      ),
    ];

    if (!recentUserIds.length) return;

    const randomUserId =
      recentUserIds[Math.floor(Math.random() * recentUserIds.length)];

    if (!randomUserId) return;

    const phrases = [
      'eevee loves you! <a:11:1496852956103049386>',
      'eevee is watching you <a:3_:1496851131085754438>',
      '+67 aura ~',
      'eevee really likes u! <a:11:1496852956103049386>',
      'Blessing u with smol chain <a:2_:1496851133019328662>',
      'Eevee used wish! you have been blessed <a:2_:1496851133019328662>',

      '!barn',
      'go touch grass <a:3_:1496851131085754438>',
      'These colours don\'t seem unusual...✨',
      'eevee sees a 4k chain from you soon <:15:1496852948293128202>',
      'Eevee says you should lighten up <:15:1496852948293128202>',

      'eevee is hungry <a:14:1496852950570500116>',
      'go sleep <:10:1496852957927571526>',
      'eevee noms you!',
      'Whats sleep? <:10:1496852957927571526>',
      'Eevee used G-Max Cuddle!!',
      'Eevee used Tackle! You have been bonked',
      'Did you know I am fluffy? hug me!',
      'Eevee wants to battle! <a:14:1496852950570500116>',
      'You are a floofvee!! <:13:1496852952403677214>',
      'You need a hug <:13:1496852952403677214>',
      'Eevee misses you',
      'Eevee thinks you are cute, but Eevee is cuter',
      'Eeveeveeeeeeee',
      'Eevee used Charm! You must join the Eevee cult',
      'Eevee used Attract! You must love only Eevee now',
      'Eevee used Veevee Volley! Wheeeeeeeeeeee',
      'Eevee is bored <:13:1496852952403677214>',

      'org? when? never?',
      'my angel and devil died. it\'s only adhd posting now and she says go crazy',
      '<@716390085896962058> c pharamp',
      'rs weedle',
      'Banned dexdan92',
      '!licks !loj !locñ !locj !lock',
      'diagonals regnalsgio',
      'I\'m going back to sleep <:10:1496852957927571526>',
      'bots work but disco staff won\'t',
      '<:73223eevee:1496874075098972283><:38:1496874077174890510><:39:1496874079024709813><:40:1496874081927299243><:41:1496874084372316201><:42:1496874087077773374><:43:1496874089724248207><:44:1496874091498573985><:45:1496874092907729077>',
      '<a:ditto1:1496853870830157944><a:ditto1:1496853870830157944><a:ditto1:1496853870830157944><a:ditto1:1496853870830157944><a:ditto1:1496853870830157944><a:ditto1:1496853870830157944><a:ditto1:1496853870830157944>',
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    await message.channel.send(`<@${randomUserId}> ${phrase}`);
    setWatchLastTriggered(guildId, new Date().toISOString());
  } catch (error) {
    console.error('messageCreate error:', error);
  }
});

const buyerChannelId = process.env.BUYER_CHANNEL_ID.trim();

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // =========================
    // MODALS FIRST
    // =========================
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'announce_top_modal') {
        const text = interaction.fields.getTextInputValue('top_text');

        setAnnouncementConfig(
          interaction.guildId,
          interaction.user.id,
          'top_text',
          text
        );

        return interaction.reply({
          content: 'Top announcement section saved.',
          flags: EPHEMERAL,
        });
      }

      if (interaction.customId === 'announce_bottom_modal') {
        const text = interaction.fields.getTextInputValue('bottom_text');

        setAnnouncementConfig(
          interaction.guildId,
          interaction.user.id,
          'bottom_text',
          text
        );

        return interaction.reply({
          content: 'Bottom announcement section saved.',
          flags: EPHEMERAL,
        });
      }

      return;
    }


    // =========================
    // AUTOCOMPLETE
    // =========================
    if (interaction.isAutocomplete()) {
      try {
        if (interaction.commandName === 'choosegroup') {
          const focusedValue = interaction.options.getFocused().toLowerCase();

          const filtered = CHOICE_GROUP_NAMES
            .filter((groupName) => groupName.toLowerCase().includes(focusedValue))
            .slice(0, 25);

          return interaction.respond(
            filtered.map((groupName) => ({
              name: prettyGroupName(groupName),
              value: groupName,
            }))
          );
        }

        return interaction.respond([]);
      } catch (error) {
        console.error('Autocomplete error:', error);
        return;
      }
    }

    // =========================
    // SLASH COMMANDS
    // =========================

    if (interaction.isChatInputCommand()) {
      const { guild, user } = interaction;

      if (!guild) {
        return interaction.reply({
          content: 'Use this in a server.',
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'sponsortoggle') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const enabled = interaction.options.getBoolean('enabled', true);
        const sponsor = interaction.options.getUser('sponsor');

        if (enabled && !sponsor) {
          return interaction.reply({
            content: 'Please provide a sponsor user when enabling sponsor mode.',
            flags: EPHEMERAL,
          });
        }

        setSponsorConfig(
          guild.id,
          enabled,
          enabled ? sponsor.id : null
        );

        return interaction.reply({
          content: enabled
            ? `Sponsor routing enabled. Steal reports will route to <@${sponsor.id}>.`
            : 'Sponsor routing disabled. Steal reports will route to Pokémon owners.',

        });
      }

      if (interaction.commandName === 'addresult') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const input = interaction.options.getString('pokemon', true);

        const pokemonList = input.split(',').map(p => normalizePokemonName(p));

        const added = [];
        const failed = [];

        for (const pokemonName of pokemonList) {
          const slot = getNextOwnedCompatibleSlotWithSpace(guild.id, targetUser.id, pokemonName);

          if (!slot) {
            failed.push(pokemonName);
            continue;
          }

          const current = parsePokemonList(slot.pokemon_names);
          if (current.includes(pokemonName)) continue;

          current.push(pokemonName);
          savePokemonList(guild.id, slot.slot_key, current);

          addPokemonCooldown(guild.id, targetUser.id, pokemonName);

          added.push(pokemonName);
        }

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        return interaction.reply({
          content:
            `Added:\n${added.map(prettyPokemonName).join(', ') || 'None'}\n\n` +
            `Failed:\n${failed.map(prettyPokemonName).join(', ') || 'None'}`,

        });
      }

      if (interaction.commandName === 'setbuychn') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);

        db.prepare(`
          INSERT INTO buy_channels (guild_id, slot_key, channel_id)
          VALUES (?, ?, ?)
          ON CONFLICT(guild_id, slot_key)
          DO UPDATE SET channel_id = excluded.channel_id
        `).run(interaction.guild.id, slotKey, interaction.channel.id);

        return interaction.reply({
          content: `Buy channel for **${prettySlotLabel(slotKey)}** set to <#${interaction.channel.id}>.`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'forcelinkalt') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({ content: 'Staff only.', flags: EPHEMERAL });
        }

        const alt = interaction.options.getUser('alt', true);
        const main = interaction.options.getUser('main', true);

        await forceLinkAlt(guild.id, alt.id, main.id, interaction.user.id);

        return interaction.reply({
          content: `Linked <@${alt.id}> → <@${main.id}>`,

        });
      }

      if (interaction.commandName === 'lookup') {
        const raw = interaction.options.getString('pokemon', true);
        const normalized = normalizePokemonBaseName(raw);

        const matches = [];

        for (const [groupName, list] of Object.entries(CHOICE_GROUPS)) {
          const normalizedList = list.map(normalizePokemonName);

          if (normalizedList.includes(normalized)) {
            matches.push(prettyGroupName(groupName));
          }
        }

        if (!matches.length) {
          return interaction.reply({
            content: `${prettyPokemonName(raw)} is not in any choice group.`,

          });
        }

        return interaction.reply({
          content:
            `**${prettyPokemonName(raw)}** belongs to:\n` +
            matches.map(g => `• ${g}`).join('\n'),
        });
      }

      if (interaction.commandName === 'removeresult') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const input = interaction.options.getString('pokemon', true);

        const pokemonList = input.split(',').map(p => normalizePokemonName(p));

        const removed = [];

        for (const pokemonName of pokemonList) {
          const didRemove = removePokemonFromOwnedPickableSlots(
            guild.id,
            targetUser.id,
            pokemonName
          );

          if (didRemove) {
            removePokemonCooldown(guild.id, targetUser.id, pokemonName);
            removed.push(pokemonName);
          }
        }

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        return interaction.reply({
          content:
            `Removed:\n${removed.map(prettyPokemonName).join(', ') || 'None'}`,

        });
      }

      if (interaction.commandName === 'profile') {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;

        const profileId = await getProfileIdForUser(guild.id, targetUser.id);
        const mainText = `<@${profileId}>`;
        const profile = await getBuyerProfile(guild.id, targetUser.id);

        if (!profile) {
          return interaction.editReply({
            content: `<@${targetUser.id}> does not have a buyer profile yet.`,

          });
        }

        const linkedAlts = (await getLinkedAlts(guild.id, profileId))
          .map((row) => `<@${row.user_id}>`)
          .join(', ') || 'None';

        const embed = new EmbedBuilder()
          .setTitle(`${targetUser.username}'s Buyer Profile`)
          .setColor(0xFFB6C1)
          .addFields(
            { name: 'Title', value: getHighestProfileTitle(profile), inline: false },

            { name: 'Total Buys', value: String(profile.total_buys), inline: true },
            { name: 'Buyer Points', value: String(profile.choice_res_points), inline: true },
            { name: 'Rare Buys', value: String(profile.rare_buys), inline: true },
            { name: 'Regional Buys', value: String(profile.regional_buys), inline: true },
            { name: 'Gmax Buys', value: String(profile.gmax_buys), inline: true },
            { name: 'Eevee Buys', value: String(profile.eevos_buys), inline: true },
            { name: 'Choice Buys', value: String(profile.choice_buys), inline: true },
            { name: 'Single Res', value: String(profile.single_res_buys), inline: true },
            { name: 'Double Res', value: String(profile.double_res_buys), inline: true },
            { name: 'Main Profile', value: mainText, inline: false },
            { name: 'Linked Alts', value: linkedAlts, inline: false }
          )
          .setTimestamp();

        return interaction.editReply({
          embeds: [embed],
        });
      }

      if (interaction.commandName === 'linkalt') {
        const mainUser = interaction.options.getUser('main', true);

        if (mainUser.id === interaction.user.id) {
          return interaction.reply({
            content: 'You cannot link yourself as your own alt.',
            flags: EPHEMERAL,
          });
        }

        await createPendingAltLink(guild.id, interaction.user.id, mainUser.id);

        return interaction.reply({
          content:
            `Alt link requested.\n` +
            `This account <@${interaction.user.id}> will link under main profile <@${mainUser.id}> after staff approval.`,

        });
      }

      if (interaction.commandName === 'approvealt') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can approve alt links.',
            flags: EPHEMERAL,
          });
        }

        const altUser = interaction.options.getUser('user', true);
        const result = await approveAltLink(guild.id, altUser.id, interaction.user.id);

        if (!result) {
          return interaction.reply({
            content: `<@${altUser.id}> has no pending alt link.`,

          });
        }

        return interaction.reply({
          content: `Approved alt link: <@${altUser.id}> → <@${result.profile_id}>.`,

        });
      }

      if (interaction.commandName === 'unlinkalt') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can unlink alts.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const removed = await unlinkAlt(guild.id, targetUser.id);

        return interaction.reply({
          content: removed
            ? `<@${targetUser.id}> has been unlinked.`
            : `<@${targetUser.id}> had no alt link.`,

        });
      }

      if (interaction.commandName === 'resetprofile') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can reset profiles.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);

        await resetBuyerProfile(guild.id, targetUser.id);

        return interaction.reply({
          content: `Buyer profile reset for <@${targetUser.id}>.`,

        });
      }

      if (interaction.commandName === 'addpoints') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can add points.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        const reason = interaction.options.getString('reason') || 'Manual add';

        if (amount <= 0) {
          return interaction.reply({
            content: 'Amount must be positive.',
            flags: EPHEMERAL,
          });
        }

        await adjustBuyerPoints(guild.id, targetUser.id, amount, reason, interaction.user.id);

        return interaction.reply({
          content: `Added ${amount} points to <@${targetUser.id}>.`,

        });
      }

      if (interaction.commandName === 'removepoints') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can remove points.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        const reason = interaction.options.getString('reason') || 'Manual remove';

        if (amount <= 0) {
          return interaction.reply({
            content: 'Amount must be positive.',
            flags: EPHEMERAL,
          });
        }

        await adjustBuyerPoints(guild.id, targetUser.id, -amount, reason, interaction.user.id);

        return interaction.reply({
          content: `Removed ${amount} points from <@${targetUser.id}>.`,

        });
      }

      if (interaction.commandName === 'exportprofiles') {
        await interaction.deferReply({ flags: EPHEMERAL });
        if (!hasStaffRole(interaction.member)) {
          return interaction.editReply({
            content: 'Only staff can export profiles.',
            flags: EPHEMERAL,
          });
        }

        const csv = await buildProfilesCsv(guild.id);
        const buffer = Buffer.from(csv, 'utf8');

        const file = new AttachmentBuilder(buffer, {
          name: `buyer-profiles-${guild.id}.csv`,
        });

        return interaction.editReply({
          content: 'Buyer profile export:',
          files: [file],

        });
      }

      if (interaction.commandName === 'leaderboard') {
        await interaction.deferReply();
        const type = interaction.options.getString('type', true);

        const rows = await getLeaderboard(guild.id, type);

        if (!rows.length) {
          return interaction.editReply({
            content: 'No data yet.',
            flags: EPHEMERAL,
          });
        }

        const titleMap = {
          points: 'Points Leaderboard',
          rare: 'Rare Buyers',
          regional: 'Regional Buyers',
          gmax: 'Gmax Buyers',
          eevee: 'Eevee Buyers',
        };

        const description = rows
          .map((row, index) => {
            return `**${index + 1}.** <@${row.profile_id}> — ${row.value}`;
          })
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${titleMap[type]}`)
          .setColor(0xFFD700)
          .setDescription(description)
          .setTimestamp();

        return interaction.editReply({
          embeds: [embed],
        });
      }

      if (interaction.commandName === 'forceupdate') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        return interaction.reply({
          content: 'Queue reconciled and force updated.',

        });
      }

      if (interaction.commandName === 'reopenqueue') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        const oldChannel = await guild.channels.fetch(state.channel_id).catch(() => null);
        if (oldChannel) {
          const oldMessage = await oldChannel.messages.fetch(state.message_id).catch(() => null);
          if (oldMessage) {
            await oldMessage.edit({
              embeds: [buildQueueEmbed(guild.id)],
              components: [],
            }).catch(() => null);
          }
        }

        const queueMessage = await interaction.channel.send({
          embeds: [buildQueueEmbed(guild.id)],
          components: buildButtons(guild.id),
        });

        db.prepare(`
          UPDATE queue_state
          SET channel_id = ?, message_id = ?, phase = 'public'
          WHERE guild_id = ? AND is_active = 1
        `).run(interaction.channel.id, queueMessage.id, guild.id);

        return interaction.reply({
          content: 'Queue reposted in this channel. Old queue disabled.',

        });
      }

      if (interaction.commandName === 'botstatus') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(guild.id);
        const watch = getWatchConfig(guild.id);
        const incenseRows = getIncenseChannels(guild.id);

        const uptimeSeconds = Math.floor(process.uptime());
        const uptimeText =
          `${Math.floor(uptimeSeconds / 3600)}h ` +
          `${Math.floor((uptimeSeconds % 3600) / 60)}m ` +
          `${uptimeSeconds % 60}s`;

        return interaction.reply({
          content:
            `**EeveeBot Status**\n` +
            `Online: Yes\n` +
            `Ping: ${Math.round(client.ws.ping)}ms\n` +
            `Uptime: ${uptimeText}\n\n` +
            `**Queue**\n` +
            `Active: ${state ? 'Yes' : 'No'}\n` +
            `Phase: ${state?.phase ?? 'None'}\n` +
            `Channel: ${state?.channel_id ? `<#${state.channel_id}>` : 'None'}\n\n` +
            `**Watch**\n` +
            `Enabled: ${watch?.enabled ? 'Yes' : 'No'}\n` +
            `Channel: ${watch?.channel_id ? `<#${watch.channel_id}>` : 'None'}\n` +
            `Cooldown: ${watch?.cooldown_minutes ?? 'None'} min\n\n` +
            `**Incense Tracking**\n` +
            `Tracked channels: ${incenseRows.length}`,
        });
      }

      if (interaction.commandName === 'incbought') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const rows = [];

        for (const row of getIncenseChannels(guild.id)) {
          const exists = guild.channels.cache.has(row.channel_id);

          if (!exists) {
            // auto remove from DB
            removeIncenseChannel(guild.id, row.channel_id);
            continue;
          }

          rows.push(row);
        }

        return interaction.reply({
          embeds: [buildIncBoughtEmbed(rows)],

        });
      }

      if (interaction.commandName === 'viewannouncement') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        const slot = interaction.options.getInteger('slot', true);

        const config = getAnnouncementConfig(
          interaction.guildId,
          targetUser.id,
          slot
        );

        const message = buildAnnouncementFromSlot(
          interaction.guild,
          targetUser.id,
          slot,
          false
        );

        const chunks = splitDiscordMessage(
          `Viewing <@${targetUser.id}>'s announcement slot **${slot}**:\n\n${message}`
        );

        await interaction.reply({
          content: chunks[0],
          flags: EPHEMERAL,
        });

        for (const chunk of chunks.slice(1)) {
          await interaction.followUp({
            content: chunk,
            flags: EPHEMERAL,
          });
        }

        return;
      }

      if (interaction.commandName === 'copyannouncement') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }

        const fromUser = interaction.options.getUser('from', true);
        const fromSlot = interaction.options.getInteger('slot', true);
        const toSlot = interaction.options.getInteger('to_slot', true);

        if (fromUser.bot) {
          return interaction.reply({
            content: 'You cannot copy announcement templates from a bot.',
            flags: EPHEMERAL,
          });
        }

        const result = copyAnnouncementTemplate(
          interaction.guildId,
          fromUser.id,
          fromSlot,
          interaction.user.id,
          toSlot
        );

        return interaction.reply({
          content: `Copied <@${fromUser.id}>'s announcement slot **${result.fromSlot}** into your slot **${result.toSlot}**.`,

        });
      }

      if (interaction.commandName === 'repingbuyers') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        clearAllCooldownsForGuild(guild.id);

        db.prepare(`
          UPDATE queue_state
          SET cooldown_cleared = 1
          WHERE guild_id = ? AND is_active = 1
        `).run(guild.id);

        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        const roleIds = getOpenBuyerRoleIds(guild.id);

        if (!roleIds.length) {
          return interaction.reply({
            content: 'No open buyer roles to ping.',
            flags: EPHEMERAL,
          });
        }

        await interaction.reply({
          content: 'Repinging buyers and clearing cooldowns for this queue.',
          flags: EPHEMERAL,
        });

        return interaction.channel.send({
          content: `Eevee needs buyers! Cooldown over:\n${roleIds.map((id) => `<@&${id}>`).join(' ')}\n <a:24:1496863780532125806><a:23:1496863777973604532><a:22:1496863775867801650><a:21:1496863774211051580><a:20:1496863771900116994><a:19:1496863760579563681><a:18:1496863758826475590><a:16:1496863754342891662><a:2_:1496851133019328662>`,
          allowedMentions: {
            roles: roleIds,
          },
        });
      }

      if (interaction.commandName === 'annoslot') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }

        const number = interaction.options.getInteger('number', true);
        const activeNumber = setActiveAnnouncementTemplate(
          interaction.guildId,
          interaction.user.id,
          number
        );

        return interaction.reply({
          content: `Announcement template slot set to **${activeNumber}**.`,

        });
      }

      if (interaction.commandName === 'clearallinc') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command. <:8_:1496851119450882110>',
            flags: EPHEMERAL,
          });
        }

        removeAllIncenseChannels(guild.id);

        return interaction.reply({
          content: 'All tracked incense channels have been reset. <:9_:1496851117194219600>',

        });
      }

      if (interaction.commandName === 'setannouncetop') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }
        const config = getAnnouncementConfig(interaction.guildId, interaction.user.id);

        const modal = new ModalBuilder()
          .setCustomId('announce_top_modal')
          .setTitle('Set Announcement Top');

        const topInput = new TextInputBuilder()
          .setCustomId('top_text')
          .setLabel('Top section')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000);

        if (config.top_text?.trim()) {
          topInput.setValue(config.top_text);
        }

        modal.addComponents(
          new ActionRowBuilder().addComponents(topInput)
        );

        return interaction.showModal(modal);
      }

      if (interaction.commandName === 'setannouncebottom') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }
        const config = getAnnouncementConfig(interaction.guildId, interaction.user.id);

        const modal = new ModalBuilder()
          .setCustomId('announce_bottom_modal')
          .setTitle('Set Announcement Bottom');

        const bottomInput = new TextInputBuilder()
          .setCustomId('bottom_text')
          .setLabel('Bottom section')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000);

        if (config.bottom_text?.trim()) {
          bottomInput.setValue(config.bottom_text);
        }

        modal.addComponents(
          new ActionRowBuilder().addComponents(bottomInput)
        );

        return interaction.showModal(modal);
      }


      if (interaction.commandName === 'setannounceping') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }
        const ping = interaction.options.getString('ping', true);

        setAnnouncementConfig(interaction.guildId, interaction.user.id, 'access_ping', ping);

        return interaction.reply({
          content: `Access ping saved as: ${ping}`,

        });
      }

      if (interaction.commandName === 'setannounceemojis') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }
        const itemEmojis = interaction.options.getString('item_emojis') || '';
        const groupEmojis = interaction.options.getString('group_emojis') || '';

        if (itemEmojis) {
          setAnnouncementConfig(interaction.guildId, interaction.user.id, 'item_emojis', itemEmojis);
        }

        if (groupEmojis) {
          setAnnouncementConfig(interaction.guildId, interaction.user.id, 'group_emojis', groupEmojis);
        }

        return interaction.reply({
          content: 'Announcement emojis saved.',

        });
      }

      if (interaction.commandName === 'sampleannounce') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }
        const message = buildAnnouncement(interaction.guild, interaction.user.id, false);
        const chunks = splitDiscordMessage(message);

        // optional visible confirmation (not silent)
        await interaction.reply({
          content: 'Sample announcement sent.',
          flags: EPHEMERAL,
        });

        // send all parts normally (no ping at all)
        for (const chunk of chunks) {
          await interaction.channel.send({
            content: chunk,
            allowedMentions: {
              parse: [], // no ping
            },
          });
        }

        return;
      }

      if (interaction.commandName === 'announce') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Staff only command.',
            flags: EPHEMERAL,
          });
        }
        const message = buildAnnouncement(interaction.guild, interaction.user.id, true);
        const chunks = splitDiscordMessage(message);

        await interaction.reply({
          content: 'Announcement sent.',
          flags: EPHEMERAL,
        });

        for (let i = 0; i < chunks.length; i++) {
          await interaction.channel.send({
            content: chunks[i],
            allowedMentions: {
              parse: i === 0 ? ['roles'] : [],
            },
          });
        }

        return;
      }

      if (interaction.commandName === 'addallinc') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const parentId = interaction.channel.parentId;
        if (!parentId) {
          return interaction.reply({
            content: 'This channel is not inside a category.',
            flags: EPHEMERAL,
          });
        }

        const channels = interaction.guild.channels.cache.filter(
          (ch) =>
            ch.parentId === parentId &&
            ch.isTextBased() &&
            ch.type === ChannelType.GuildText
        );

        let added = 0;

        for (const channel of channels.values()) {
          if (!isTrackedIncenseChannel(guild.id, channel.id)) {
            addIncenseChannel(guild.id, channel.id);
            added += 1;
          }
        }

        return interaction.reply({
          content: `Added ${added} channel(s) from this category to incense tracking. <:9_:1496851117194219600>`,

        });
      }

      if (interaction.commandName === 'report') {
        const stealReportsChannelId = process.env.STEAL_REPORTS_CHANNEL_ID?.trim();

        if (!stealReportsChannelId) {
          return interaction.reply({
            content: 'STEAL_REPORTS_CHANNEL_ID is not configured.',
            flags: EPHEMERAL,
          });
        }

        await interaction.reply({
          content: 'Processing steal report...',
          flags: EPHEMERAL,
        });

        try {
          const messageLink = interaction.options.getString('message_link', true);
          const targetMessage = await fetchMessageFromLink(client, messageLink);

          if (!targetMessage) {
            return interaction.followUp({
              content: 'That message link is invalid or I cannot access that message.',
              flags: EPHEMERAL,
            });
          }

          const parsed = parseStealCatchMessage(targetMessage);

          if (!parsed) {
            return interaction.followUp({
              content: 'That message is not a valid caught Pokémon message. <:8_:1496851119450882110>',
              flags: EPHEMERAL,
            });
          }

          const reportsChannel = await guild.channels.fetch(stealReportsChannelId).catch(() => null);

          if (!reportsChannel || typeof reportsChannel.send !== 'function') {
            return interaction.followUp({
              content: 'Steal reports channel is missing or not sendable.',
              flags: EPHEMERAL,
            });
          }

          const stealerId = parsed.stealerId;

          // display name stays pretty/raw if available
          const pokemonName = parsed.rawPokemonName || parsed.pokemonName;

          // find buyer from finished round first, then current queue
          let ownerSlot = findPokemonOwnerFromFinishedHistory(guild.id, pokemonName);

          if (!ownerSlot) {
            ownerSlot = findPokemonOwnerFromCurrentQueue(guild.id, pokemonName);
          }

          let buyerId;
          let ownerLabel;

          if (!ownerSlot) {
            buyerId = interaction.user.id;
            ownerLabel = 'Reporter fallback';
          } else {
            buyerId = ownerSlot.user_id;
            ownerLabel = ownerSlot.slot_label || 'Unknown';
          }

          const stealInfo = getStealPriceInfo(pokemonName);
          const priceText = getStealDisplayPrice(stealInfo);

          const embed = new EmbedBuilder()
            .setTitle('Steal Report')
            .setColor(0xED4245)
            .addFields(
              { name: 'Pokemon', value: pokemonName, inline: true },
              { name: 'Estimated Value', value: priceText, inline: true },
              { name: 'Owner Slot', value: ownerLabel, inline: true },
              { name: 'Buyer', value: `<@${buyerId}> (${buyerId})`, inline: false },
              { name: 'Stealer', value: `<@${stealerId}> (${stealerId})`, inline: false },
              { name: 'Catch Message', value: `[Jump to message](${targetMessage.url})`, inline: false }
            )
            .setTimestamp();

          await reportsChannel.send({ embeds: [embed] });

          const threadName =
            `steal-${sanitizeThreadNamePart(pokemonName)}-${sanitizeThreadNamePart(interaction.user.username, 20)}`;

          const thread = await reportsChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 1440,
            type: ChannelType.PrivateThread,
            invitable: false,
          });

          await addUsersToThread(thread, [buyerId, stealerId]);

          await thread.send({ embeds: [embed] });

          await thread.send({
            content:
              `<:8_:1496851119450882110> So sorry a pokemon was stolen! ${process.env.STAFF_ROLE_ID?.trim()
                ? `<@&${process.env.STAFF_ROLE_ID.trim()}>`
                : '@staff'
              } will help to resolve this:\n` +
              `<@${stealerId}> had stolen a **${pokemonName}** from <@${buyerId}>.\n\n` +
              `Estimated steal value: ${priceText}`,
          });

          const threadLink = `https://discord.com/channels/${guild.id}/${reportsChannel.id}/${thread.id}`;

          return interaction.followUp({
            content: `Ticket created <:9_:1496851117194219600>\n${threadLink}`,
            flags: EPHEMERAL,
          });
        } catch (error) {
          console.error('report command error:', error);

          return interaction.followUp({
            content: 'Something went wrong while handling the report.',
            flags: EPHEMERAL,
          });
        }
      }

      if (interaction.commandName === 'closeticket') {
        if (!interaction.channel?.isThread()) {
          return interaction.reply({
            content: 'This command can only be used inside a ticket thread.',
            flags: EPHEMERAL,
          });
        }

        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        return interaction.reply({
          content: 'Are you sure you want to close this ticket? <:9_:1496851117194219600>',
          components: buildCloseTicketConfirmButtons(interaction.channel.id),

        });
      }

      if (interaction.commandName === 'addticket') {
        if (!interaction.channel?.isThread()) {
          return interaction.reply({
            content: 'This command can only be used inside a ticket thread.',
            flags: EPHEMERAL,
          });
        }

        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        await interaction.channel.members.add(targetUser.id).catch(() => null);

        return interaction.reply({
          content: `Added <@${targetUser.id}> to this ticket. <:9_:1496851117194219600>`,

        });
      }

      if (interaction.commandName === 'removeticket') {
        if (!interaction.channel?.isThread()) {
          return interaction.reply({
            content: 'This command can only be used inside a ticket thread.',
            flags: EPHEMERAL,
          });
        }

        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const targetUser = interaction.options.getUser('user', true);
        await interaction.channel.members.remove(targetUser.id).catch(() => null);

        return interaction.reply({
          content: `Removed <@${targetUser.id}> from this ticket. <:9_:1496851117194219600>`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'pause') {
        const row = getIncenseChannelRow(guild.id, interaction.channel.id);

        if (!row) {
          return interaction.reply({
            content: 'This channel is not tracked for incense.',
            flags: EPHEMERAL,
          });
        }

        await pauseIncenseInChannel(interaction.channel);

        await sendActionLog(
          guild,
          `/pause ran by <@${interaction.user.id}> in <#${interaction.channel.id}>`,
          null,
          'system'
        );

        return interaction.reply({
          content: 'Incense paused in this channel. <a:12:1496852954328858624>',

        });
      }

      if (interaction.commandName === 'resume') {
        const row = getIncenseChannelRow(guild.id, interaction.channel.id);

        if (!row) {
          return interaction.reply({
            content: 'This channel is not tracked for incense.',
            flags: EPHEMERAL,
          });
        }

        await resumeIncenseInChannel(interaction.channel);

        await sendActionLog(
          guild,
          `/resume ran by <@${interaction.user.id}> in <#${interaction.channel.id}>`,
          null,
          'system'
        );

        return interaction.reply({
          content: 'Incense resumed in this channel. <a:12:1496852954328858624>',

        });
      }

      if (interaction.commandName === 'pauseall') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        await interaction.reply({
          content: 'Pausing all incense channels <:9_:1496851117194219600>',

        });

        const channels = await getTrackedIncenseChannels(guild);

        for (const channel of channels) {
          pauseIncenseInChannel(channel).catch(() => null);
        }

        return;
      }

      if (interaction.commandName === 'resumeall') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        // ✅ reply instantly
        await interaction.reply({
          content: 'Resuming all incense channels <:9_:1496851117194219600>',

        });

        // ✅ do work AFTER reply (no timeout issues)
        const channels = await getTrackedIncenseChannels(guild);

        for (const channel of channels) {
          resumeIncenseInChannel(channel).catch(() => null);
        }
      }

      if (interaction.commandName === 'addinc') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const channelId = interaction.channel.id;

        const existing = getIncenseChannelRow(guild.id, channelId);

        if (existing) {
          return interaction.reply({
            content: 'This channel is already tracked for incense.',

          });
        }

        addIncenseChannel(guild.id, channelId);

        await sendActionLog(
          guild,
          `/addinc ran by <@${interaction.user.id}> in <#${channelId}>`,
          null,
          'admin'
        );

        return interaction.reply({
          content: 'Channel added to incense tracking. <a:12:1496852954328858624>',

        });
      }

      if (interaction.commandName === 'removeinc') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const channel = interaction.channel;
        const channelId = channel.id;

        const existing = getIncenseChannelRow(guild.id, channelId);

        if (!existing) {
          return interaction.reply({
            content: 'This channel is not tracked for incense.',

          });
        }

        // clean up overwrite (important)
        const overwriteTarget = getIncenseBotOverwriteTarget();
        if (overwriteTarget) {
          await channel.permissionOverwrites.delete(overwriteTarget).catch(() => null);
        }

        removeIncenseChannel(guild.id, channelId);

        await sendActionLog(
          guild,
          `/removeinc ran by <@${interaction.user.id}> in <#${channelId}>`,
          null,
          'admin'
        );

        return interaction.reply({
          content: 'Channel removed from incense tracking. <a:12:1496852954328858624>',

        });
      }

      if (interaction.commandName === 'directlogs') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const channel = interaction.options.getChannel('channel', true);
        setActionLogChannel(guild.id, channel.id);

        await interaction.reply({
          content: `Action logs will now go to <#${channel.id}>.`,
          flags: EPHEMERAL,
        });

        await sendActionLog(
          guild,
          `<@${interaction.user.id}> set the action log channel to <#${channel.id}>.`,
          null,
          'admin'
        );

        return;
      }

      if (interaction.commandName === 'directfinishedqueues') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const channel = interaction.options.getChannel('channel', true);
        setFinishedQueueChannel(guild.id, channel.id);

        await interaction.reply({
          content: `Finished queue archives will now go to <#${channel.id}>.`,
          flags: EPHEMERAL,
        });

        await sendActionLog(
          guild,
          `<@${interaction.user.id}> set the finished queue archive channel to <#${channel.id}>.`,
          null,
          'admin'
        );

        return;
      }

      if (interaction.commandName === 'choiceslist') {
        const choiceNames = Object.keys(CHOICE_GROUPS || {});

        if (!choiceNames.length) {
          return interaction.reply({
            content: 'No choice groups found.',
            flags: EPHEMERAL,
          });
        }

        // pretty names
        const formatted = choiceNames.map((name) => `• ${prettyGroupName(name)}`);

        // number of columns (change to 2 or 3)
        const columns = 3;

        // split into chunks
        const perColumn = Math.ceil(formatted.length / columns);
        const chunks = [];

        for (let i = 0; i < columns; i++) {
          chunks.push(
            formatted.slice(i * perColumn, (i + 1) * perColumn)
          );
        }

        const embed = new EmbedBuilder()
          .setTitle('Choice Groups')
          .setColor(0xC89C74);

        // add each column as a field
        chunks.forEach((chunk) => {
          embed.addFields({
            name: '\u200B', // invisible title
            value: chunk.join('\n'),
            inline: true,
          });
        });

        return interaction.reply({
          embeds: [embed],
        });
      }

      if (interaction.commandName === 'bonk') {
        const target = interaction.options.getUser('target', true);

        // self bonk 
        if (target.id === interaction.user.id) {
          return interaction.reply({
            content: '<:15:1496852948293128202> why are you bonking yourself...',
          });
        }

        // eevee special
        if (target.id === client.user.id) {
          return interaction.reply({
            content: '<:4_:1496851129168822393> Why bonk Eevee',
          });
        }

        // bots
        if (target.bot) {
          return interaction.reply({
            content: 'You cannot bonk a bot <:15:1496852948293128202>',
          });
        }

        const messages = [
          `🔨 <@${interaction.user.id}> bonked <@${target.id}>`,
          `💥 <@${target.id}> got bonked by <@${interaction.user.id}>`,
          `🚨 Bonk! <@${target.id}> go to queue jail`,
          `😡 <@${interaction.user.id}> bonked <@${target.id}> for sniping`,
          `💥 <@${target.id}> dodged the bonk by <@${interaction.user.id}>`,
          `🔨 Bonk! <@${target.id}> you have been barned!`,
          `<:6_:1496851124425330790> Eevee bonks <@${target.id}>!!`,
        ];

        const msg = messages[Math.floor(Math.random() * messages.length)];

        return interaction.reply({ content: msg });
      }

      if (interaction.commandName === 'hug') {
        const target = interaction.options.getUser('target', true);

        // self hug
        if (target.id === interaction.user.id) {
          return interaction.reply({
            content: '<a:11:1496852956103049386> self-love is important',
          });
        }

        // eevee special
        if (target.id === client.user.id) {
          return interaction.reply({
            content: '<a:11:1496852956103049386> Eevee happily accepts the hug',
          });
        }

        // bots
        if (target.bot) {
          return interaction.reply({
            content: 'Bots do not need hugs... or do they <a:11:1496852956103049386>',
          });
        }

        const messages = [
          `<:30:1496865330092441641> <@${interaction.user.id}> hugged <@${target.id}>`,
          `<a:28:1496865325214470344> <@${target.id}> received a hug from <@${interaction.user.id}>`,
          `<a:29:1496865327508754704> <@${interaction.user.id}> gives <@${target.id}> a warm hug`,
          `<a:26:1496865320877428918> <@${target.id}> is now blessed with a hug from <@${interaction.user.id}>`,
          `<:27:1496865322894888981> <@${target.id}> dodged the hug from <@${interaction.user.id}>`,
          `<a:17:1496863756741902417> <@${interaction.user.id}> gives a cute cuddle to <@${target.id}>`,
          `<a:25:1496865318130417704> <@${interaction.user.id}> gives a hug to <@${target.id}> and didnt wanna let go`,
          `<:ditto2:1496853867575509143> <@${interaction.user.id}> gives a ditto hug to <@${target.id}>`,
        ];

        const msg = messages[Math.floor(Math.random() * messages.length)];

        return interaction.reply({ content: msg });
      }

      if (interaction.commandName === 'battle') {
        const target = interaction.options.getUser('target', true);

        // eeveebot special
        if (target.id === client.user.id) {
          return interaction.reply({
            content: 'You challenged Eevee... it used **Quick Attack** and won instantly <:7_:1496851121342513344>',
          });
        }

        // cannot battle bots
        if (target.bot) {
          return interaction.reply({
            content: 'You cannot battle a bot <:15:1496852948293128202>',
          });
        }

        // self battle
        if (target.id === interaction.user.id) {
          return interaction.reply({
            content: 'You fought yourself... and lost <:15:1496852948293128202>',
          });
        }

        // pick winner randomly
        const winner =
          Math.random() < 0.5 ? interaction.user : target;
        const loser =
          winner.id === interaction.user.id ? target : interaction.user;

        // random battle messages
        const battleScenes = [
          `${winner} used **Quick Attack** ⚡ — ${loser} couldn’t react!`,
          `${winner} landed a **critical hit** 💥 — ${loser} fainted!`,
          `${loser} tripped and ${winner} took the win`,
          `${winner} summoned shine luck 🍀 — ${loser} stood no chance`,
          `${winner} outplayed ${loser} like a true rare hoarder`,
          `${loser} got distracted by reserves — ${winner} wins`,
          `${loser} used **explosion** 💥 !! and both fainted 💀`,
          `${winner} pressed random buttons and still won against ${loser}`,
          `${loser} forgot what they were doing`,
          `${winner} sent out pikachu and used **Thunderbolt** ⚡ — ${loser} fainted`,
          `${winner} used **Hyper Beam** 💥 — it’s over for ${loser}`,
          `${loser} was confused! You hurt itself in your **confusion** and lost`,
          `${loser} lagged out 💀`,
          `${winner} used **Domain Expansion** — ${loser} had no escape`,
          `${loser} forgot to equip brain.exe`,
          `${winner} unlocked their hidden power and ${loser} stood no chance`,
          `${winner} shouted and powered up for no reason while ${loser} stared`,
          `${winner} used Ka-me-ha-meee-haaaaaa!! 🌊 — ${loser} got obliterated`,
          `${winner} used Hinokami Kagura 🔥 — ${loser} was burnt to a crisp`,
          `${winner} said “Nah, I’d win” and actually did against ${loser}`,
          `${winner} had the power of friendship 💖 while ${loser} did not`,
          `${loser} used **splash** but it had no effect`,
          `${loser} flinched 67 times`,
          `${loser} sent out snorlax, but snorlax decided to take a nap`,
          `${winner} sent out eevee and used **charm**, ${loser} forfeited`,
          `${loser} hesitated — ${winner} secured the win`,
          `${loser} got paralyzed and couldn't move`,
          `${loser} has no PP left and struggled`,
          `${winner} used Protect perfectly and countered ${loser}`,
          `${loser} tried to run… but couldn't escape`,
          `${loser} kept spamming the same move and lost`,
          `${loser} got outplayed in a dramatic fashion`,
          `${loser} forgot ${winner} is the main character`,

        ];

        const scene =
          battleScenes[Math.floor(Math.random() * battleScenes.length)];

        return interaction.reply({
          content: `<a:14:1496852950570500116> **Battle Start!**\n\n${scene}\n\n<:7_:1496851121342513344> Winner: ${winner}`,
        });
      }

      if (interaction.commandName === 'setwatchchannel') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const channel = interaction.options.getChannel('channel', true);

        setWatchChannel(guild.id, channel.id);

        return interaction.reply({
          content: `Eevee watch channel set to <#${channel.id}>.`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'togglewatch') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const enabled = interaction.options.getBoolean('enabled', true);

        setWatchEnabled(guild.id, enabled);

        return interaction.reply({
          content: `Eevee watch is now **${enabled ? 'enabled' : 'disabled'}**.`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'setwatchcooldown') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const minutes = interaction.options.getInteger('minutes', true);

        if (minutes < 1) {
          return interaction.reply({
            content: 'Cooldown must be at least 1 minute.',
            flags: EPHEMERAL,
          });
        }

        setWatchCooldown(guild.id, minutes);

        return interaction.reply({
          content: `Eevee watch cooldown set to **${minutes} minute(s)**.`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'watchstatus') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        ensureWatchConfig(guild.id);
        const config = getWatchConfig(guild.id);

        return interaction.reply({
          content:
            `**Eevee Watch Status**\n` +
            `Enabled: **${config.enabled ? 'Yes' : 'No'}**\n` +
            `Channel: ${config.channel_id ? `<#${config.channel_id}>` : 'Not set'}\n` +
            `Cooldown: **${config.cooldown_minutes} minute(s)**\n` +
            `Last Triggered: ${config.last_triggered_at ?? 'Never'}`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'clearcd') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        db.prepare(`
          DELETE FROM user_claim_history
          WHERE guild_id = ?
        `).run(guild.id);

        db.prepare(`
          DELETE FROM previous_round_claim_history
          WHERE guild_id = ?
        `).run(guild.id);

        db.prepare(`
          DELETE FROM event_claim_history
          WHERE guild_id = ?
        `).run(guild.id);

        db.prepare(`
		  DELETE FROM temporary_pokemon_cooldowns
		  WHERE guild_id = ?
		`).run(guild.id);

        await sendActionLog(
          guild,
          `/clearcd ran by <@${interaction.user.id}>`,
          null,
          'admin'
        );

        return interaction.reply({
          content: 'All cooldown history cleared for this server. <:9_:1496851117194219600>',

        });
      }

      if (interaction.commandName === 'showcd') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const state = db.prepare(`
          SELECT round_number
          FROM queue_state
          WHERE guild_id = ?
        `).get(guild.id);

        const currentRound = state?.round_number ?? 1;

        const previousRoundMajorRows = db.prepare(`
          SELECT user_id, slot_key
          FROM previous_round_claim_history
          WHERE guild_id = ?
          ORDER BY user_id ASC, slot_key ASC
        `).all(guild.id);

        const majorLines = previousRoundMajorRows.length
          ? previousRoundMajorRows.map((row) =>
            `• ${prettyUsername(guild, row.user_id)} → last round: ${prettySlotLabel(row.slot_key)}`
          )
          : ['• None'];

        const eventRows = db.prepare(`
          SELECT user_id, round_number
          FROM event_claim_history
          WHERE guild_id = ?
          ORDER BY round_number DESC, user_id ASC
        `).all(guild.id);

        const eventLines = eventRows.length
          ? eventRows.map((row) => {
            const roundsAgo = Math.max(1, currentRound - row.round_number + 1);

            const ageText =
              roundsAgo === 1 ? 'last round'
                : roundsAgo === 2 ? 'last 2 rounds ago'
                  : `${roundsAgo} rounds ago`;

            return `• ${prettyUsername(guild, row.user_id)} → ${ageText}`;
          })
          : ['• None'];

        return interaction.reply({
          content:
            `**Major Cooldowns**\n${majorLines.join('\n')}\n\n` +
            `**Event Cooldowns**\n${eventLines.join('\n')}`,

        });

      }

      if (interaction.commandName === 'startqueue') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const previousState = db.prepare(`
          SELECT round_number
          FROM queue_state
          WHERE guild_id = ?
        `).get(guild.id);

        const nextRoundNumber = (previousState?.round_number ?? 0) + 1;

        const tx = db.transaction(() => {

          db.prepare(`
            DELETE FROM event_claim_history
            WHERE guild_id = ?
              AND round_number < ?
          `).run(guild.id, nextRoundNumber - 2);

          db.prepare(`DELETE FROM slots WHERE guild_id = ?`).run(guild.id);
          db.prepare(`DELETE FROM queue_state WHERE guild_id = ?`).run(guild.id);
          db.prepare(`DELETE FROM readiness WHERE guild_id = ?`).run(guild.id);
          db.prepare(`DELETE FROM finished_history WHERE guild_id = ?`).run(guild.id);
          clearAllSlotNotesForGuild(guild.id);

          for (const slot of SLOT_DEFS) {
            db.prepare(`
              INSERT INTO slots (
                guild_id, slot_key, slot_label, slot_type, max_pokemon,
                user_id, pokemon_names, claimed_at, choice_group_name, chosen_rare
              ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL)
            `).run(
              guild.id,
              slot.key,
              slot.label,
              slot.type,
              slot.maxPokemon,
              serializePokemonList([])
            );
          }
        });

        tx();

        const queueMessage = await interaction.channel.send({
          embeds: [buildQueueEmbed(guild.id)],
          components: buildButtons(guild.id),
        });

        db.prepare(`
          INSERT INTO queue_state (
            guild_id, channel_id, message_id, is_active, created_by, created_at, phase, booster_locked, round_number, cooldown_cleared
          )
          VALUES (?, ?, ?, 1, ?, ?, 'staff', 1, ?, 0)
        `).run(
          guild.id,
          interaction.channel.id,
          queueMessage.id,
          user.id,
          new Date().toISOString(),
          nextRoundNumber
        );

        await refreshQueueMessage(guild);

        await sendActionLog(
          guild,
          `/startqueue ran by <@${interaction.user.id}>`,
          null,
          'system'
        );

        return interaction.reply({
          content: 'Staff queue started in this channel. Run /openqueue in the public channel when ready.',
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'openqueue') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue.',
            flags: EPHEMERAL,
          });
        }

        const oldChannel = await guild.channels.fetch(state.channel_id).catch(() => null);
        if (oldChannel) {
          const oldMessage = await oldChannel.messages.fetch(state.message_id).catch(() => null);
          if (oldMessage) {
            await oldMessage.edit({
              embeds: [buildQueueEmbed(guild.id)],
              components: [],
            }).catch(() => null);
          }
        }

        const queueMessage = await interaction.channel.send({
          embeds: [buildQueueEmbed(guild.id)],
          components: buildButtons(guild.id),
        });

        const openBuyerRoleIds = getOpenBuyerRoleIds(guild.id);

        if (openBuyerRoleIds.length) {
          await interaction.channel.send({
            content:
              `${openBuyerRoleIds.map((roleId) => mentionRole(roleId)).join(' ')} Eevee org time <3 <:7_:1496851121342513344>\n\n` +
              `**Commands:**\n` +
              `- <a:19:1496863760579563681> Use **/pick** for reserves.\n` +
              `- <a:16:1496863754342891662> Use **/choosegroup** for choice slots.\n` +
              `- <a:18:1496863758826475590> Use **/chooserare** for Choice and Gmax rare.\n` +
              `- <a:21:1496863774211051580> Use **/clearres** to remove one chosen reserve.\n` +
              `- <a:20:1496863771900116994> Use **/clearallres** to remove all reserves chosen so far.\n` +
              `- <a:22:1496863775867801650> Use **/setffa** for Choice ffa.\n` +
              `- <a:23:1496863777973604532> Use **/withdraw** to release your slot.\n` +
              `- <a:24:1496863780532125806> Use **/transfer** to give your claimed group to someone else.\n` +
              `- <a:2_:1496851133019328662> Use **/addnote** to add a note to your slot.\n` +
              `Eevee loves everyone so head to <#${buyerChannelId}> to run commands <a:5_:1496851126996307999> ~ ~`,
            allowedMentions: {
              roles: openBuyerRoleIds,
            },
          });
        }

        db.prepare(`
          UPDATE queue_state
          SET channel_id = ?, message_id = ?, phase = 'public'
          WHERE guild_id = ? AND is_active = 1
        `).run(interaction.channel.id, queueMessage.id, guild.id);

        return interaction.reply({
          content: 'Queue opened to public in this channel.',
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'endqueue') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can end the queue.',
            flags: EPHEMERAL,
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`endqueue_confirm:${guild.id}`)
            .setLabel('Confirm End Queue')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`endqueue_cancel:${guild.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: 'Are you sure you want to end the queue?',
          components: [row],
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'finish') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.editReply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        if (!getQueueState(guild.id)) {
          return interaction.editReply({
            content: 'No active queue.',
            flags: EPHEMERAL,
          });
        }

        await interaction.deferReply();

        rolloverClaimHistoryToPreviousRound(guild.id);

        const profileAwardResult = await awardBuyerProfilesForFinishedRound(guild.id);
        const currentSlots = getSlots(guild.id);

        for (const slot of currentSlots) {
          if (!slot.user_id) continue;

          await giveTimedRole(guild, slot.user_id, process.env.EEVEE_BUYERS_ROLE_ID?.trim());

          if (slot.slot_key === 'choice1' || slot.slot_key === 'choice2') {
            await giveTimedRole(guild, slot.user_id, process.env.EEVEE_CHOICE_LOVER_ROLE_ID?.trim());
          }
        }

        if (profileAwardResult.reason === 'already_awarded') {
          console.log('[profile] Awards already given for this round.');
        }

        const queueMessage = await finishQueueAndAnnounce(guild, user.id);

        await sendOrgLog(
          guild,
          user.id,
          queueMessage?.url || null
        );

        addFinishedPokemonCooldowns(guild.id);
        db.prepare(`
          INSERT INTO org_timers (guild_id, last_org_at)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET last_org_at = excluded.last_org_at
        `).run(guild.id, new Date().toISOString());

        return interaction.editReply({
          content: 'Round finished and readiness checker posted.',
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'readiness') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const summary = getFinishedHistory(guild.id);
        if (!summary || !Array.isArray(summary.holderIds) || !summary.holderIds.length) {
          return interaction.reply({
            content: 'No finished round buyers found.',
            flags: EPHEMERAL,
          });
        }

        await sendReadinessPost(
          interaction.channel,
          guild.id,
          summary.holderIds,
          '**React when ready to start.** <a:1_:1496851134944510102> \n'
        );

        await sendActionLog(
          guild,
          `/readiness ran by <@${interaction.user.id}>`,
          null,
          'system'
        );

        return interaction.reply({
          content: 'Readiness checker reposted.',
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'reservelist') {
        const summary = getFinishedHistory(guild.id);
        if (!summary) {
          return interaction.reply({
            content: 'No finished reserve list stored yet.',
            flags: EPHEMERAL,
          });
        }

        return interaction.reply({
          content: buildReserveListMessage(summary),
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`copylist:${guild.id}:choice`)
                .setLabel('Choice list')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`copylist:${guild.id}:reserves`)
                .setLabel('Reserves list')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`copylist:${guild.id}:remove`)
                .setLabel('N!cl remove list')
                .setStyle(ButtonStyle.Secondary)
            ),
          ],
        });
      }

      if (interaction.commandName === 'pasthistory') {
        const summary = getFinishedHistory(guild.id);
        if (!summary || !summary.slotSnapshot) {
          return interaction.reply({
            content: 'No finished round history stored yet.',
            flags: EPHEMERAL,
          });
        }

        const embed = buildQueueEmbedFromSlots(summary.slotSnapshot, {
          title: 'Previous Round Queue',
          phaseText: 'Previous finished round',
          boosterLocked: false,
        });

        return interaction.reply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`copylist:${guild.id}:history`)
                .setLabel('Copy history list')
                .setStyle(ButtonStyle.Primary)
            ),
          ],
        });
      }

      if (interaction.commandName === 'reservepings') {
        const summary = getFinishedHistory(guild.id);

        if (!summary || !Array.isArray(summary.slotSnapshot)) {
          return interaction.reply({
            content: 'No finished round data stored yet.',
            flags: EPHEMERAL,
          });
        }

        return interaction.reply({
          embeds: [buildReservePingsEmbed(summary)],
        });
      }

      if (interaction.commandName === 'setmajorffa') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const rawList = interaction.options.getString('pokemon', true);
        const slot = getSlot(guild.id, slotKey);

        if (!isMajorFfaSlot(slotKey)) {
          return interaction.reply({
            content: 'Major FFA can only be set for Rare, Regional, Gmax, or Eevees.',
            flags: EPHEMERAL,
          });
        }

        if (!slot || slot.user_id !== user.id) {
          return interaction.reply({
            content: 'You can only set FFA for your own claimed major slot.',
            flags: EPHEMERAL,
          });
        }

        const requestedPokemon = rawList
          .split(',')
          .map((name) =>
            normalizePokemonName(name)
              .replace(/^-+|-+$/g, '')
          )
          .filter(Boolean);

        const uniquePokemon = [...new Set(requestedPokemon)];

        saveSlotFfaPokemon(guild.id, slotKey, uniquePokemon);

        await refreshQueueMessage(guild);

        return interaction.reply({
          content: `FFA set for **${slot.slot_label}**: ${uniquePokemon.map(prettyPokemonName).join(', ') || 'None'}`,
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'setffa') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const rawList = interaction.options.getString('pokemon', true);
        const slot = getSlot(guild.id, slotKey);

        if (!isChoiceSlot(slotKey)) {
          return interaction.reply({
            content: 'FFA can only be set on choice slots.',
            flags: EPHEMERAL,
          });
        }

        if (!slot || slot.user_id !== user.id) {
          return interaction.reply({
            content: 'You can only set FFA for your own claimed choice slot.',
            flags: EPHEMERAL,
          });
        }

        if (!slot.choice_group_name) {
          return interaction.reply({
            content: 'Choose a group first with /choosegroup.',
            flags: EPHEMERAL,
          });
        }

        const groupPokemon = getChoiceGroupByName(slot.choice_group_name);
        const requestedPokemon = rawList
          .split(',')
          .map((name) =>
            normalizePokemonName(name)
              .replace(/^-+|-+$/g, '') // 🔥 strip leading/trailing hyphens ONLY here
          )
          .filter(Boolean);
        const groupPokemonSet = new Set(groupPokemon);
        const groupBaseSet = new Set(groupPokemon.map(normalizePokemonBaseName));

        const invalidPokemon = requestedPokemon.filter((name) => {
          const baseName = normalizePokemonBaseName(name);

          return !groupPokemonSet.has(name) && !groupBaseSet.has(baseName);
        });

        if (invalidPokemon.length) {
          return interaction.reply({
            content: `These Pokemon are not in ${prettyGroupName(slot.choice_group_name)}: ${invalidPokemon.map(prettyPokemonName).join(', ')}`,

          });
        }

        const uniquePokemon = [...new Set(
          requestedPokemon.map((name) => {
            const baseName = normalizePokemonBaseName(name);

            if (groupPokemonSet.has(name)) return name;
            if (groupBaseSet.has(baseName)) return baseName;

            return name;
          })
        )];
        saveSlotFfaPokemon(guild.id, slotKey, uniquePokemon);

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        return interaction.reply({
          content: `${getSlotDef(slotKey).label} FFA set to: ${uniquePokemon.map(prettyPokemonName).join(', ') || 'None'}`,
        });
      }

      if (interaction.commandName === 'choosegroup') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const groupName = interaction.options.getString('group', true).trim().toLowerCase();
        const slot = getSlot(guild.id, slotKey);
        const slotDef = getSlotDef(slotKey);

        if (!slotDef || !slot || slot.user_id !== user.id) {
          return interaction.reply({
            content: 'You can only choose a group for your own claimed choice slot.',
            flags: EPHEMERAL,
          });
        }

        if (!isChoiceSlot(slotKey)) {
          return interaction.reply({
            content: 'That slot is not a choice slot.',
            flags: EPHEMERAL,
          });
        }

        if (!CHOICE_GROUP_NAMES.includes(groupName)) {
          return interaction.reply({
            content: 'That choice group does not exist.',

          });
        }
        const groupPokemon = getChoiceGroupByName(groupName);

        const cooldownPokemon = groupPokemon.filter((pokemonName) =>
          isUserOnPokemonCooldown(guild.id, user.id, pokemonName)
        );

        if (cooldownPokemon.length) {
          return interaction.reply({
            content:
              `You cannot choose **${prettyGroupName(groupName)}** because you are on cooldown for:\n` +
              cooldownPokemon.map((name) => `**${prettyPokemonName(name)}**`).join(', ') +
              `\nCooldown clears after buyers reping. <:8_:1496851119450882110>`,

          });
        }

        setChoiceGroupName(guild.id, slotKey, groupName);
        touchSlotClaimedAt(guild.id, slotKey);

        const conflicts = getChoiceGroupConflicts(guild.id, slotKey, groupName);

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        if (conflicts.length) {
          const conflictText = conflicts
            .map(({ pokemonName, ownerSlot }) =>
              `**${prettyPokemonName(pokemonName)}** already belongs to ${ownerSlot.slot_label} <:8_:1496851119450882110>`
            )
            .join('\n');

          return interaction.reply({
            content:
              `${slotDef.label} group set to **${prettyGroupName(groupName)}**. <:9_:1496851117194219600>\n` +
              `Some Pokémon in this group are already taken by earlier claims: <:8_:1496851119450882110>\n${conflictText}`,
          });
        }

        return interaction.reply({
          content: `${slotDef.label} chose **${prettyGroupName(groupName)}**. <:9_:1496851117194219600>`,
        });
      }

      if (interaction.commandName === 'pick') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const rawInput = interaction.options.getString('pokemon', true);

        const requestedRawPokemon = rawInput
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean);

        if (!requestedRawPokemon.length) {
          return interaction.reply({
            content: 'Enter at least one Pokemon name.',

          });
        }

        const ownedSlots = getOwnedPickableSlots(guild.id, user.id);

        if (!ownedSlots.length) {
          return interaction.reply({
            content: 'You do not own any pickable normal slots right now.',

          });
        }

        const resolvedPokemon = [];
        const invalidPokemon = [];

        for (const rawName of requestedRawPokemon) {
          const resolved =
            typeof resolvePokemonCanonical === 'function'
              ? resolvePokemonCanonical(rawName)
              : normalizePokemonName(rawName);

          if (!resolved || !VALID_POKEMON.has(resolved)) {
            invalidPokemon.push(rawName);
          } else {
            resolvedPokemon.push(resolved);
          }
        }

        if (invalidPokemon.length) {
          return interaction.reply({
            content: `These Pokemon are invalid: <:8_:1496851119450882110> ${invalidPokemon.join(', ')}`,

          });
        }

        const uniquePokemon = [...new Set(resolvedPokemon)];

        const usedCountBefore = ownedSlots.reduce((sum, slot) => {
          return sum + parsePokemonList(slot.pokemon_names).length;
        }, 0);

        const totalCapacity = ownedSlots.reduce((sum, slot) => {
          return sum + Number(slot.max_pokemon ?? 1);
        }, 0);

        if (usedCountBefore + uniquePokemon.length > totalCapacity) {
          return interaction.reply({
            content: `You are trying to pick ${uniquePokemon.length} Pokemon but only have ${totalCapacity - usedCountBefore} space left.<:8_:1496851119450882110>  Use **/clearres** or **/clearallres** if you want to repick.`,

          });
        }

        const addedResults = [];
        const failedResults = [];
        let changed = false;

        for (const pokemonName of uniquePokemon) {
          if (isUserOnPokemonCooldown(guild.id, user.id, pokemonName)) {
            failedResults.push(
              `**${prettyPokemonName(pokemonName)}** → on cooldown (until buyers reping) <:8_:1496851119450882110>`
            );
            continue;
          }

          if (BANNED_POKEMON.has(pokemonName)) {
            failedResults.push(`**${prettyPokemonName(pokemonName)}** → not allowed <:8_:1496851119450882110>`);
            continue;
          }

          const nextSlot = getNextOwnedCompatibleSlotWithSpace(guild.id, user.id, pokemonName);

          if (!nextSlot) {
            failedResults.push(
              pokemonName === MISSINGNO_NAME
                ? `**${prettyPokemonName(pokemonName)}** → no valid Res slot with space <:8_:1496851119450882110>`
                : `**${prettyPokemonName(pokemonName)}** → no valid slot with space <:8_:1496851119450882110>`
            );
            continue;
          }

          const currentPokemon = parsePokemonList(nextSlot.pokemon_names);

          if (currentPokemon.includes(pokemonName)) {
            failedResults.push(`**${prettyPokemonName(pokemonName)}** → already in **${nextSlot.slot_label}** `);
            continue;
          }

          const existingPicker = getExistingPokemonPicker(guild.id, pokemonName, user.id);
          if (existingPicker) {
            failedResults.push(
              `**${prettyPokemonName(pokemonName)}** → already picked by **${existingPicker.slot_label}** <:8_:1496851119450882110>`
            );
            continue;
          }

          const choiceOwner = getChoiceOwner(guild.id, pokemonName, user.id);

          if (choiceOwner) {
            failedResults.push(
              `**${prettyPokemonName(pokemonName)}** → belongs to choice slot **${choiceOwner.slot_label}** <:8_:1496851119450882110>`
            );
            continue;
          }

          const updatedPokemon = [...currentPokemon, pokemonName];
          savePokemonList(guild.id, nextSlot.slot_key, updatedPokemon);

          addedResults.push(`**${prettyPokemonName(pokemonName)}** → **${nextSlot.slot_label}** <:9_:1496851117194219600>`);
          changed = true;
        }

        if (changed) {
          reconcilePokemonOwnership(guild.id);
          await refreshQueueMessage(guild);
        }

        const updatedOwnedSlots = getOwnedPickableSlots(guild.id, user.id);

        const chosenCount = updatedOwnedSlots.reduce((sum, slot) => {
          return sum + parsePokemonList(slot.pokemon_names).length;
        }, 0);

        const totalCapacityAfter = updatedOwnedSlots.reduce((sum, slot) => {
          return sum + Number(slot.max_pokemon ?? 1);
        }, 0);

        let content = '';

        if (addedResults.length) {
          content += `<@${user.id}> has reserved:\n${addedResults.join('\n')}\n`;
        }

        if (failedResults.length) {
          if (content) content += `\n`;
          content += `Could not reserve:\n${failedResults.join('\n')}\n`;
        }

        if (!content) {
          content = 'No Pokémon were added.\n';
        }

        content += `\n${chosenCount}/${totalCapacityAfter} Pokémon chosen.`;

        return interaction.reply({ content });
      }

      if (interaction.commandName === 'clearres') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const ownedSlots = getOwnedPickableSlots(guild.id, user.id);

        if (!ownedSlots.length) {
          return interaction.reply({
            content: 'You do not own any pickable normal slots right now.',

          });
        }

        const rawPokemon = interaction.options.getString('pokemon', true);
        const pokemonName = typeof resolvePokemonCanonical === 'function'
          ? resolvePokemonCanonical(rawPokemon)
          : normalizePokemonName(rawPokemon);

        if (!pokemonName || !VALID_POKEMON.has(pokemonName)) {
          return interaction.reply({
            content: `**${rawPokemon}** is not a valid Pokemon name. <:8_:1496851119450882110>`,

          });
        }

        const removed = removePokemonFromOwnedPickableSlots(guild.id, user.id, pokemonName);

        if (!removed) {
          return interaction.reply({
            content: `**${prettyPokemonName(pokemonName)}** is not currently owned by you. <:8_:1496851119450882110>`,

          });
        }

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        return interaction.reply({
          content: `Removed **${prettyPokemonName(pokemonName)}** from your chosen Pokémon. <:9_:1496851117194219600>`,

        });
      }

      if (interaction.commandName === 'clearallres') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const ownedSlots = getOwnedPickableSlots(guild.id, user.id);

        if (!ownedSlots.length) {
          return interaction.reply({
            content: 'You do not own any pickable normal slots right now. <:8_:1496851119450882110>',

          });
        }

        for (const slot of ownedSlots) {
          savePokemonList(guild.id, slot.slot_key, getDefaultPokemonListForSlot(slot.slot_key));
        }

        reconcilePokemonOwnership(guild.id);
        await refreshQueueMessage(guild);

        return interaction.reply({
          content: 'All your chosen Pokémon were cleared. You can repick now. <:9_:1496851117194219600>',

        });
      }

      if (interaction.commandName === 'chooserare') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const rareRaw = interaction.options.getString('rare', true).trim();
        const rareText = normalizePokemonName(rareRaw);
        const slot = getSlot(guild.id, slotKey);

        if (!CHOOSE_RARE_SLOT_KEYS.has(slotKey)) {
          return interaction.reply({
            content: 'That slot cannot choose a rare.',
            flags: EPHEMERAL,
          });
        }

        if (!slot || slot.user_id !== user.id) {
          return interaction.reply({
            content: 'You can only choose a rare for your own slot.',
            flags: EPHEMERAL,
          });
        }

        if (!RARE_POKEMON.has(rareText)) {
          return interaction.reply({
            content: `**${prettyPokemonName(rareText)}** is not a valid rare Pokemon name. <:8_:1496851119450882110>`,

          });
        }

        setChosenRare(guild.id, slotKey, prettyPokemonName(rareText));
        await refreshQueueMessage(guild);

        return interaction.reply({
          content: `${getSlotDef(slotKey).label} rare set to **${prettyPokemonName(rareText)}**. <:9_:1496851117194219600>`,
        });
      }

      if (interaction.commandName === 'withdraw') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const slot = getSlot(guild.id, slotKey);
        const slotDef = getSlotDef(slotKey);

        if (!slotDef || !slot || slot.user_id !== user.id) {
          return interaction.reply({
            content: 'You can only release your own claimed slot.',
            flags: EPHEMERAL,
          });
        }

        return interaction.reply({
          content: `Release **${slotDef.label}**?`,
          components: buildWithdrawConfirmButtons(guild.id, slotKey),
          flags: EPHEMERAL,
        });
      }

      if (interaction.commandName === 'transfer') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const targetUser = interaction.options.getUser('user', true);
        const slot = getSlot(guild.id, slotKey);
        const slotDef = getSlotDef(slotKey);

        if (!slotDef || !slot || slot.user_id !== user.id) {
          return interaction.reply({
            content: 'You can only transfer your own claimed slot.',

          });
        }

        if (MAJOR_SLOT_KEYS.has(slotKey) && getUserMajorClaimCount(guild.id, targetUser.id) >= 2) {
          return interaction.reply({ content: 'That user already holds 2 major groups.', flags: EPHEMERAL });
        }

        if (targetUser.bot) {
          return interaction.reply({
            content: 'You cannot transfer a slot to a bot.',
            flags: EPHEMERAL,
          });
        }

        db.prepare(`
        UPDATE slots
        SET user_id = ?
        WHERE guild_id = ? AND slot_key = ?
      `).run(targetUser.id, guild.id, slotKey);



        if (isEventSlot(slotKey)) {
          removeCurrentRoundEventClaim(guild.id, user.id);
          setCurrentRoundEventClaim(guild.id, targetUser.id);
        }

        await refreshQueueMessage(guild);

        await sendActionLog(
          guild,
          `<@${interaction.user.id}> transferred \`${slotDef.label}\` to <@${targetUser.id}>`,
          null,
          'transfer'
        );

        return interaction.reply({
          content: `Transferred **${slotDef.label}** to <@${targetUser.id}>. <:9_:1496851117194219600>`,
        });
      }

      if (interaction.commandName === 'addnote') {
        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        // ensure this only works in funky-buyers, unless staff
        if (
          interaction.channel.id !== buyerChannelId &&
          !hasStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content: `You may only run this command in <#${buyerChannelId}>.`,
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const note = interaction.options.getString('note', true);
        const slot = getSlot(guild.id, slotKey);
        const slotDef = getSlotDef(slotKey);

        if (!slotDef || !slot) {
          return interaction.reply({
            content: 'Invalid slot.',
            flags: EPHEMERAL,
          });
        }

        const canEdit =
          hasStaffRole(interaction.member) || slot.user_id === user.id;

        if (!canEdit) {
          return interaction.reply({
            content: 'You can only add notes to your own slot.',
            flags: EPHEMERAL,
          });
        }

        const result = addSlotNote(guild.id, slotKey, note);

        if (!result.ok) {
          if (result.reason === 'empty_note') {
            return interaction.reply({
              content: 'Note cannot be empty.',
              flags: EPHEMERAL,
            });
          }

          if (result.reason === 'note_too_long') {
            return interaction.reply({
              content: `Note is too long. Maximum length is ${MAX_NOTE_LENGTH} characters.`,
              flags: EPHEMERAL,
            });
          }

          if (result.reason === 'max_notes') {
            return interaction.reply({
              content: `That slot already has the maximum of ${MAX_NOTES_PER_SLOT} notes.`,
              flags: EPHEMERAL,
            });
          }
        }

        await refreshQueueMessage(guild);

        await sendActionLog(
          guild,
          `<@${interaction.user.id}> added note:\n> ${note}\nto \`${prettySlotLabel(slotKey)}\``,
          null,
          'note'
        );

        return interaction.reply({
          content: `Added note to **${slotDef.label}**. <:9_:1496851117194219600>`,

        });
      }

      if (interaction.commandName === 'clearnotes') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const slotDef = getSlotDef(slotKey);

        if (!slotDef) {
          return interaction.reply({
            content: 'Invalid slot.',
            flags: EPHEMERAL,
          });
        }

        clearSlotNotes(guild.id, slotKey);
        await refreshQueueMessage(guild);

        await sendActionLog(
          guild,
          `/clearnotes by <@${interaction.user.id}> on \`${slotDef.label}\``,
          null,
          'note'
        );

        return interaction.reply({
          content: `Removed all notes from **${slotDef.label}**. <:9_:1496851117194219600>`,

        });
      }

      if (interaction.commandName === 'adminremove') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(guild.id);
        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        const slotKey = interaction.options.getString('slot', true);
        const slot = getSlot(guild.id, slotKey);
        const slotDef = getSlotDef(slotKey);

        if (!slotDef || !slot || !slot.user_id) {
          return interaction.reply({
            content: 'That slot is not currently claimed.',
            flags: EPHEMERAL,
          });
        }

        const removedUserId = slot.user_id;

        resetSlot(guild.id, slotKey);

        if (isEventSlot(slotKey)) {
          removeCurrentRoundEventClaim(guild.id, removedUserId);
        }

        await refreshQueueMessage(guild);

        await sendActionLog(
          guild,
          `/adminremove by <@${interaction.user.id}> removed <@${removedUserId}> from \`${slotDef.label}\``,
          null,
          'admin'
        );

        return interaction.reply({
          content: `Removed <@${removedUserId}> from **${slotDef.label}**. <:8_:1496851119450882110>`,

        });
      }

      // raffles, like for redeem events
      if (interaction.commandName === 'raffle') {
        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this command.',
            flags: EPHEMERAL,
          });
        }

        await interaction.deferReply();

        // parse inputs
        const messageLink = interaction.options.getString('message_link', true);
        const numWinners = interaction.options.getInteger('winners') ?? 1;

        // grab message
        const resp = await fetchMessageFromLink(client, messageLink);
        if (!resp) {
          return interaction.editReply({
            content: 'That message link is invalid or I cannot access that message.'
          })
        }
        const raffleMsg = resp.content;

        // compute raffle entries
        const raffleEntries = new Map();
        let totalEntries = 0;

        for (let entry of raffleMsg.split('\n')) {
          let match = entry.match(/^(?<user>.*?)\s+(?:-\s+)?(?<entries>\d+)$/);
          if (match) {
            const user = match.groups.user;
            const entries = Number(match.groups.entries);
            if (entries === 0) continue;
            raffleEntries.set(
              user,
              (raffleEntries.get(user) ?? 0) + entries,
            )
            totalEntries += entries;
          }
        }
        if (!raffleEntries.size) {
          return interaction.editReply({
            content: `
            No valid entries found from the following message: ${messageLink}
            Expected format:
            [participant1] - [entries]
            [participant2] - [entries]
            where entries is a whole number and participant1 is any valid character (eg. 'Ditto Eevee')
            `
          })
        }

        const entryLines = [...raffleEntries.entries()]
          .map(([user, count]) => `${user} — ${count} entries`)
          .join('\n');

        const confirmEmbed = new EmbedBuilder()
          .setTitle('🎟️ Raffle Confirmation')
          .setColor(0x5865F2)
          .addFields(
            { name: 'Participants', value: entryLines.slice(0, 1024), inline: false },
            { name: 'Total Entries', value: String(totalEntries), inline: true },
            { name: 'Winners to Pick', value: String(numWinners), inline: true },
          )
          .setFooter({ text: 'Confirm to run the raffle' })
          .setTimestamp();

        // replace the encoded/button section at the bottom of the raffle command
        const raffleId = Date.now().toString(36) + Math.floor(Math.pow(10, 12) + Math.random() * 9 * Math.pow(10, 12)).toString(36);

        db.prepare(`
          INSERT INTO raffles (id, entries_json, num_winners, created_at, created_by)
          VALUES (?, ?, ?, ?, ?)
          `
        ).run(
          raffleId,
          JSON.stringify(Object.fromEntries(raffleEntries)),
          numWinners,
          new Date().toISOString(),
          interaction.user.id
        );

        return interaction.editReply({
          embeds: [confirmEmbed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`raffle_confirm:${raffleId}`)
                .setLabel('Run Raffle')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`raffle_cancel:${raffleId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
            ),
          ],
        });

      }

      return safeInteractionReply(interaction, {
        content: 'Unknown command.',
        flags: EPHEMERAL,
      });
    }

    // =========================
    // BUTTONS
    // =========================
    if (interaction.isButton()) {

      const parts = interaction.customId.split(':');
      const action = parts[0];

      if (!interaction.guild) {
        return interaction.reply({
          content: 'Use this in a server.',
          flags: EPHEMERAL,
        });
      }

      if (action === 'endqueue_confirm') {
        const guildId = parts[1];

        if (!interaction.guild || interaction.guild.id !== guildId) {
          return interaction.reply({
            content: 'This button is for a different server.',
            flags: EPHEMERAL,
          });
        }

        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can end the queue.',
            flags: EPHEMERAL,
          });
        }

        if (!getQueueState(interaction.guild.id)) {
          return interaction.update({
            content: 'No active queue.',
            components: [],
          });
        }

        await cancelQueueAndAnnounce(interaction.guild, interaction.user.id);
        const guild = interaction.guild;

        await sendActionLog(
          interaction.guild,
          `/endqueue ran by <@${interaction.user.id}>`,
          null,
          'system'
        );

        return interaction.update({
          content: 'Current round cancelled.',
          components: [],
        });
      }


      if (action === 'closeticketconfirm') {
        const threadId = parts[1];
        const confirmAction = parts[2];

        if (confirmAction === 'no') {
          return interaction.update({
            content: 'Ticket close cancelled.',
            components: [],
          });
        }

        const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
        if (!thread || !thread.isThread()) {
          return interaction.update({
            content: 'Thread not found.',
            components: [],
          });
        }

        const transcriptText = await buildThreadTranscript(thread);
        const transcriptBuffer = Buffer.from(transcriptText, 'utf8');
        const transcriptName = `${thread.name}-transcript.txt`;

        const transcriptLogChannelId = process.env.STEAL_TRANSCRIPTS_CHANNEL_ID?.trim();
        const transcriptLogChannel = transcriptLogChannelId
          ? await interaction.guild.channels.fetch(transcriptLogChannelId).catch(() => null)
          : null;

        if (transcriptLogChannel && typeof transcriptLogChannel.send === 'function') {
          const closeEmbed = new EmbedBuilder()
            .setTitle('Steal Ticket Closed')
            .setColor(0x57F287)
            .addFields(
              { name: 'Thread', value: thread.name, inline: false },
              { name: 'Closed By', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false }
            )
            .setTimestamp();

          await transcriptLogChannel.send({
            embeds: [closeEmbed],
            files: [{ attachment: transcriptBuffer, name: transcriptName }],
          }).catch(() => null);
        }

        await interaction.update({
          content: 'Ticket closed. Transcript saved.',
          components: [],
        });

        await thread.delete().catch(() => null);
        return;
      }

      if (action === 'endqueue_cancel') {
        return interaction.update({
          content: 'Queue end cancelled.',
          components: [],
        });
      }

      if (action === 'claimres') {
        const guildId = parts[1];
        const type = parts[2];

        if (!interaction.guild || interaction.guild.id !== guildId) {
          return interaction.reply({
            content: 'This button is for a different server.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(interaction.guild.id);

        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        await interaction.deferReply({ flags: EPHEMERAL });

        const slotKeys =
          type === 'single'
            ? SINGLE_RES_SLOT_KEYS
            : DOUBLE_RES_SLOT_KEYS;

        const nextSlot = getNextOpenSlotFromKeys(interaction.guild.id, slotKeys);

        if (!nextSlot) {
          return interaction.editReply({
            content:
              type === 'single'
                ? 'All Single Res slots are already claimed.'
                : 'All Double Res slots are already claimed.',
          });
        }

        const userId = interaction.user.id;

        const claimed = tryClaimSlot(
          interaction.guild.id,
          nextSlot.slot_key,
          userId
        );

        if (!claimed) {
          return interaction.editReply({
            content: 'That slot was just taken. Try again.',
          });
        }

        // 🔥 SAME tracking as normal claim
        db.prepare(`
          INSERT OR IGNORE INTO user_claim_history (guild_id, user_id, slot_key)
          VALUES (?, ?, ?)
        `).run(interaction.guild.id, userId, nextSlot.slot_key);

        clearSlotNotes(interaction.guild.id, nextSlot.slot_key);

        await refreshQueueMessage(interaction.guild);

        await sendActionLog(
          interaction.guild,
          `<@${userId}> claimed \`${nextSlot.slot_label}\``,
          interaction.message?.url ?? null,
          'claim'
        );

        return interaction.editReply({
          content: `You claimed **${nextSlot.slot_label}**. Now use **/pick** to choose your Pokémon.`,
        });
      }

      if (action === 'claim') {
        const guildId = parts[1];
        const slotKey = parts[2];
        const slot = getSlot(interaction.guild.id, slotKey);
        const slotDef = getSlotDef(slotKey);
        const state = getQueueState(interaction.guild.id);
        const userId = interaction.user.id;

        if (!state) {
          return interaction.reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        await interaction.deferReply({ flags: EPHEMERAL });

        if (!slotDef || !slot) {
          return interaction.editReply({
            content: 'That slot does not exist.',
            flags: EPHEMERAL,
          });
        }


        if (state.phase !== 'public' && !hasStaffRole(interaction.member)) {
          return interaction.editReply({
            content: 'Only staff can claim during staff phase.',
            flags: EPHEMERAL,
          });
        }

        if (BOOSTER_SLOT_KEYS.has(slotKey) && !!state.booster_locked) {
          return interaction.editReply({
            content: 'Boosters and Donor are currently locked.',
            flags: EPHEMERAL,
          });
        }

        if (slotKey === 'booster1' || slotKey === 'booster2') {
          if (!hasBoosterRole(interaction.member)) {
            return interaction.editReply({
              content: 'You need the Booster role to claim a booster slot.',
              flags: EPHEMERAL,
            });
          }

          if (hasBoosterCooldown(interaction.member)) {
            return interaction.editReply({
              content: 'You are currently on Booster cooldown.',
              flags: EPHEMERAL,
            });
          }
        }

        if (slotKey === 'donor') {
          if (!hasDonorRole(interaction.member)) {
            return interaction.editReply({
              content: 'You need the Donor role to claim the donor slot.',
              flags: EPHEMERAL,
            });
          }

          if (hasDonorCooldown(interaction.member)) {
            return interaction.editReply({
              content: 'You are currently on Donor cooldown.',
              flags: EPHEMERAL,
            });
          }
        }

        if (isEventSlot(slotKey)) {
          const currentState = getQueueState(interaction.guild.id);
          const blockedRounds = [
            currentState.round_number - 1,
            currentState.round_number - 2,
          ];

          console.log('EVENT CD CHECK', {
            guildId: interaction.guild.id,
            userId,
            currentRound: currentState.round_number,
            blockedRounds,
            slotKey,
          });

          const recentEventClaim = db.prepare(`
              SELECT *
              FROM event_claim_history
              WHERE guild_id = ?
                AND user_id = ?
                AND round_number IN (?, ?)
              LIMIT 1
            `).get(
            interaction.guild.id,
            userId,
            blockedRounds[0],
            blockedRounds[1]
          );

          console.log('EVENT CD RESULT', recentEventClaim);

          if (recentEventClaim) {
            return interaction.editReply({
              content: 'You cannot claim an event slot for 2 rounds after taking one.',
            });
          }
        }


        if (MAJOR_SLOT_KEYS.has(slotKey)) {
          const guild = interaction.guild;
          const state = getQueueState(guild.id);

          if (
            MAJOR_SLOT_KEYS.has(slotKey) &&
            getUserMajorClaimCount(interaction.guild.id, interaction.user.id) >= 2 &&
            !state?.cooldown_cleared
          ) {
            return interaction.editReply({
              content: 'You can only claim 2 major slots until buyers are repinged.',
            });
          }

          if (hadSlotLastRound(interaction.guild.id, userId, slotKey)) {
            return interaction.editReply({
              content: `You cannot claim ${slotDef.label} because you had it last round.`,
            });
          }
        }

        const claimed = tryClaimSlot(interaction.guild.id, slotKey, userId);

        if (!claimed) {
          return interaction.editReply({
            content: `${slotDef.label} was just claimed by someone else.`,
            flags: EPHEMERAL,
          });
        }



        if (isEventSlot(slotKey)) {
          const fixedPokemon = getEventFixedPokemon(slotKey);
          if (fixedPokemon) {
            savePokemonList(interaction.guild.id, slotKey, [fixedPokemon]);
          }
        }

        if (slotKey === 'booster1' || slotKey === 'booster2') {
          const maxPokemon = hasDoubleBoosterRole(interaction.member) ? 2 : 1;
          setSlotMaxPokemon(interaction.guild.id, slotKey, maxPokemon);
        } else {
          const slotDefault = getSlotDef(slotKey);
          setSlotMaxPokemon(interaction.guild.id, slotKey, slotDefault?.maxPokemon ?? 1);
        }

        clearSlotNotes(interaction.guild.id, slotKey);

        await refreshQueueMessage(interaction.guild);

        if (slotKey === 'eevos' || slotKey === 'gmax') {
          await announceChooseTimePriority(interaction);
        }

        await sendActionLog(
          interaction.guild,
          `<@${interaction.user.id}> claimed \`${slotDef.label}\``,
          interaction.message?.url ?? null,
          'claim'
        );


        if (slotDef.type === 'choice') {
          return interaction.editReply({
            content: `You claimed ${slotDef.label}. Next use **/choosegroup** to select a group, **/chooserare** to choose your rare/reg and **/setffa** to set FFA if needed in format (eevee, jolteon, flareon, vaporeon).`,
          });
        }

        return interaction.editReply({
          content: `You claimed ${slotDef.label}. Now use **/pick** to choose your Pokémon.`,
        });
      }


      if (action === 'confirmrelease') {
        const slotKey = parts[2];
        const answer = parts[3];
        const slotDef = getSlotDef(slotKey);

        if (answer === 'no') {
          return interaction.update({
            content: `Cancelled release for **${slotDef?.label ?? slotKey}**.`,
            components: [],
          });
        }

        // Read slot BEFORE resetting
        const slot = getSlot(interaction.guild.id, slotKey);

        if (!slotDef || !slot || !slot.user_id) {
          return interaction.update({
            content: 'That slot is already released.',
            components: [],
          });
        }

        if (slot.user_id !== interaction.user.id) {
          return interaction.update({
            content: 'You can only release your own slot.',
            components: [],
          });
        }

        // build a string stating what Pokemon are released
        let toBeFfaStr = `<@${interaction.user.id}> released **${slotDef.label}**.\n\n**Pokémon that were in this slot**: `

        toBeFfaStr += getAllOwnedPokemonForSlot(slot)
          .map(prettyPokemonName)
          .join(', ') || 'N/A';

        if (slot.chosen_rare) {
          toBeFfaStr += `\n\n**Goes back to original buyer**: ${prettyPokemonName(slot.chosen_rare)}`
        }

        resetSlot(interaction.guild.id, slotKey);
        await refreshQueueMessage(interaction.guild);

        await sendActionLog(
          interaction.guild,
          `<@${interaction.user.id}> withdrew \`${slotDef.label}\``,
          interaction.message?.url ?? null,
          'withdraw'
        );

        await interaction.update({ content: `Released.`, components: [] });

        return interaction.channel.send({
          content: `${toBeFfaStr}`,
        });
      }

      if (action === 'boosterlock') {
        const mode = parts[2];

        if (!hasStaffRole(interaction.member)) {
          return interaction.reply({
            content: 'Only staff can use this button.',
            flags: EPHEMERAL,
          });
        }

        const state = getQueueState(interaction.guild.id);
        if (!state) {
          return interaction.Reply({
            content: 'No active queue right now.',
            flags: EPHEMERAL,
          });
        }

        setBoosterLocked(interaction.guild.id, mode === 'lock');
        await refreshQueueMessage(interaction.guild);

        if (mode === 'unlock') {
          await sendBuyerNotifications(interaction.guild.id, interaction.guild);
          const boosterRoleId = process.env.BOOSTER_ROLE_ID?.trim();
          const donorRoleId = process.env.DONOR_ROLE_ID?.trim();

          const roleIds = [boosterRoleId, donorRoleId].filter(Boolean);

          if (roleIds.length) {
            await interaction.channel.send({
              content: `${roleIds.map((roleId) => mentionRole(roleId)).join(' ')} boosters and donor are now unlocked`,
              allowedMentions: {
                roles: roleIds,
              },
            });
          }
        }

        return interaction.reply({
          content: mode === 'lock'
            ? 'Boosters and Donor locked.'
            : 'Boosters and Donor unlocked.',

        });
      }

      if (action === 'ready') {
        const mode = parts[2];
        const rows = getReadinessRows(interaction.guild.id);

        if (!rows.some((row) => row.user_id === interaction.user.id)) {
          return interaction.reply({
            content: 'You are not part of the current readiness check.',
            flags: EPHEMERAL,
          });
        }

        setReadiness(interaction.guild.id, interaction.user.id, mode === 'yes');

        await interaction.update({
          embeds: [buildReadinessEmbed(interaction.guild.id)],
          components: interaction.message.components,
        });

        return;
      }

      if (action === 'copylist') {
        const listType = parts[2];
        const summary = getFinishedHistory(interaction.guild.id);

        if (!summary) {
          return interaction.reply({
            content: 'No finished reserve list stored yet.',
            flags: EPHEMERAL,
          });
        }

        let content = '';
        if (listType === 'choice') content = summary.choiceList;
        else if (listType === 'reserves') content = summary.reservesList;
        else if (listType === 'remove') content = summary.removeList;
        else if (listType === 'history') content = buildPastHistoryCopyText(summary);
        else content = 'Unknown list type.';

        return interaction.reply({
          content,
        });
      }

      if (action === 'raffle_cancel') {
        const raffleId = parts[1];
        const row = db.prepare(`SELECT * FROM raffles WHERE id = ?`).get(raffleId);

        if (!row) {
          return interaction.update({ content: 'Raffle data not found.', embeds: [], components: [] });
        }

        if (row.created_by && row.created_by !== interaction.user.id) {
          return interaction.reply({ content: 'Only the person who started this raffle can cancel it.', flags: EPHEMERAL });
        }

        db.prepare(`DELETE FROM raffles WHERE id = ?`).run(raffleId);
        return interaction.update({ content: 'Raffle cancelled.', embeds: [], components: [] });
      }

      if (action === 'raffle_confirm') {
        const raffleId = parts[1];
        const row = db.prepare(`SELECT * FROM raffles WHERE id = ?`).get(raffleId);

        if (!row) {
          return interaction.update({ content: 'Raffle data not found.', embeds: [], components: [] });
        }

        if (row.created_by && row.created_by !== interaction.user.id) {
          return interaction.reply({ content: 'Only the person who started this raffle can confirm it.', flags: EPHEMERAL });
        }

        db.prepare(`DELETE FROM raffles WHERE id = ?`).run(raffleId);

        const raffleEntries = new Map(Object.entries(JSON.parse(row.entries_json)));
        const numWinners = row.num_winners;

        let remainingTotal = [...raffleEntries.values()].reduce((sum, n) => sum + n, 0);
        let totalParticipants = raffleEntries.size;
        const remainingEntries = new Map(raffleEntries);
        const winners = [];

        for (let i = 0; i < Math.min(numWinners, totalParticipants); i++) {
          const roll = Math.random() * remainingTotal;
          let current = 0;

          for (const [user, entries] of remainingEntries) {
            current += entries;
            if (current > roll) {
              winners.push(user);
              remainingTotal -= entries;
              remainingEntries.delete(user);
              break;
            }
          }
        }

        const resultsEmbed = new EmbedBuilder()
          .setTitle('🎉 Raffle Results')
          .setColor(0x57F287)
          .addFields({
            name: `Winner${winners.length > 1 ? 's' : ''}`,
            value: winners.map((w, i) => `**${i + 1}.** ${w}`).join('\n'),
          })
          .setTimestamp();

        return interaction.update({ components: [] }).then(() =>
          interaction.followUp({ embeds: [resultsEmbed] })
        );
      }

      return interaction.reply({
        content: 'Unknown button action.',
        flags: EPHEMERAL,
      });
    }

  } catch (error) {
    console.error(error);

    if (interaction.replied || interaction.deferred) {
      return;
    }

    const payload = {
      content: 'Something went wrong while handling that interaction.',
      flags: EPHEMERAL,
    };

    if (interaction.isAutocomplete()) {
      try {
        await interaction.respond([]);
      } catch { }
      return;
    }


    try {
      await interaction.reply(payload);
    } catch { }
  }
});


process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
}

(async () => {
  try {
    await registerCommands();
    console.log('Slash commands registered.');
    buildPokemonAliasLookup();
    await client.login(process.env.DISCORD_TOKEN);
    console.log('Login call completed.');
  } catch (error) {
    console.error('Startup failed:', error);
  }
})();
