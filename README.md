# ✨ DittoEevee Bot

A custom Discord bot built for **Pokétwo org management**, automation, and moderation.

---

## 🚀 Features

### 🔥 Incense Management

* Automatically detects when incense is bought (via Pokétwo messages)
* Pauses channels after incense purchase
* Tracks incense usage across channels

#### Commands

* `/addinc` – add channel to tracking
* `/removeinc` – remove channel from tracking
* `/addallinc` – adds all chns in a category
* `/clearallinc` – removes all channels from tracking
* `/pause` / `/resume` – control single channel
* `/pauseall` / `/resumeall` – control all tracked channels
* `/incbought` – shows:

  * `x / total` channels bought
  * first X channels not bought

---

### 🎟️ Steal Report System (Ticketing)

* `/report` → create a steal ticket from a Pokétwo catch message
* Sends **public embed** in report channel
* Creates **private thread**:

  * only buyer + stealer + staff can view

#### Automatically

* Extracts Pokémon name
* Identifies stealer
* Calculates estimated steal value
* Logs report

#### Ticket Commands

* `/closeticket` – close ticket (with confirmation)
* `/addticket user:` – add user
* `/removeticket user:` – remove user

---

### 📄 Transcript System

On ticket close:

* Generates full transcript
* Uploads to transcript channel
* Deletes thread after logging

---

### 💰 Steal Price System

* Special categories (event, regional, paradox, etc.)
* Custom “odd steals”
* Spawn-rate-based pricing

**Fallback:**
Unknown Pokémon → `"check common sr"`

---

### 🧠 Catch Parsing (Robust)

Handles ALL Pokétwo formats:

#### Gender formats

* `♂ ♀`
* `:male:`
* `<:female:123>`
* `? (unknown)`

#### Other cases

* Multi-line messages (shiny chain)
* Pokédex / reward messages
* Coin rewards

#### Multi-word Pokémon

* `Star Trim Furfrou`
* `Paldean Tauros Blaze Breed`

---

### 🛡️ Anti-Scam / Safety System

* Watches channel for suspicious messages
* Auto quarantine:

  * assigns quarantine role
  * removes bypass roles
* Deletes recent messages (~10 min)
* Logs incident + pings moderators

---

### 🎲 Fun Watch Feature

* Randomly triggers messages
* Targets recent users
* Sends Eevee-themed phrases

---

## 🧩 Org System

### ⚙️ Core Features

* Full queue management system
* Supports:

  * choices
  * overlapping Pokémon consolidation
  * cooldown checks

#### Includes

* Event toggle
* Reserve ping assignment
* Reserve list + CL remove
* Choice FFA system
* Notes system (shown in embeds)
* Buyer role pings
* Readiness check system

---

### 🛠️ Staff Commands

* `/startqueue`
* `/openqueue`
* `/endqueue`
* `/finish`
* `/adminremove`
* `/readiness`
* `/clearnotes`
* `/clearcd`
* `/showcd`
* `/pauseall`
* `/resumeall`
* `/incbought`

---

### 👥 Public Commands

* Button claim
* `/choosegroup`
* `/chooserare`
* `/pick`
* `/withdraw`
* `/transfer`
* `/addnote`
* `/reservelist`
* `/pasthistory`
* `/clearres`
* `/clearallres`
* `/reservepings`
* `/setffa`
* `/choicelist`
* `/pause`
* `/resume`

---

## ⚠️ Permissions Required

Bot must have:

* Send Messages
* Manage Threads
* Create Private Threads
* Manage Messages
* Manage Roles
* Read Message History
* Add Reactions
* Embed Links

---

## ⚙️ Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env`:

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=""
STAFF_ROLE_ID=""
BOOSTER_ROLE_ID=""
DONOR_ROLE_ID=""
BOOSTER_CD_ROLE_ID=""
DONOR_CD_ROLE_ID=""
DOUBLE_BOOSTER_ROLE_ID=""
RARE_BUYER_ROLE_ID=""
REGIONAL_BUYER_ROLE_ID=""
GMAX_BUYER_ROLE_ID=""
EEVOS_BUYER_ROLE_ID=""
CHOICE_BUYER_ROLE_ID=""
RESERVES_BUYER_ROLE_ID=""
EVENT1_BUYER_ROLE_ID=""
EVENT2_BUYER_ROLE_ID=""
INCENSE_BOT_ID=""
INCENSE_BOUGHT_TEXT="You purchased an Incense for 50 shards!"
TRAP_CHANNEL_ID=""
STAFF_LOG_CHANNEL_ID=""
MOD_ROLE_ID=""
QUARANTINE_ROLE_ID=""
QUARANTINE_BYPASS_ROLE_1_ID=""
QUARANTINE_BYPASS_ROLE_2_ID=""
STEAL_REPORTS_CHANNEL_ID=""
STEAL_TRANSCRIPTS_CHANNEL_ID=""
DB_PATH="/data/queue.db"
```

### 3. Run bot

```bash
node index.js
```

---

## ❤️ Credits

Made by a FloofLover 
