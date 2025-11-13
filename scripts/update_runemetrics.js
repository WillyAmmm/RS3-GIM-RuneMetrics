// scripts/update_runemetrics.js

const fs = require("fs");
const path = require("path");

// ---- CONFIG ----

// Characters to track
const CHARACTERS = [
  { name: "Willy Tired" },
  { name: "Jklkh" }
];

const RUNEMETRICS_BASE = "https://apps.runescape.com/runemetrics";

// Skill ID → name mapping (including Necromancy)
const SKILL_NAMES = [
  "Attack",        // 0
  "Defence",       // 1
  "Strength",      // 2
  "Constitution",  // 3
  "Ranged",        // 4
  "Prayer",        // 5
  "Magic",         // 6
  "Cooking",       // 7
  "Woodcutting",   // 8
  "Fletching",     // 9
  "Fishing",       // 10
  "Firemaking",    // 11
  "Crafting",      // 12
  "Smithing",      // 13
  "Mining",        // 14
  "Herblore",      // 15
  "Agility",       // 16
  "Thieving",      // 17
  "Slayer",        // 18
  "Farming",       // 19
  "Runecrafting",  // 20
  "Hunter",        // 21
  "Construction",  // 22
  "Summoning",     // 23
  "Dungeoneering", // 24
  "Divination",    // 25
  "Invention",     // 26
  "Archaeology",   // 27
  "Necromancy"     // 28
];

// ---- HTTP HELPERS ----

// Node 20 in GitHub Actions has global fetch
async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "GitHubActions-RunemetricsBot/1.0"
    }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${label}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON for ${label}: ${e.message}`);
  }
}

async function fetchProfile(name) {
  const url = `${RUNEMETRICS_BASE}/profile/profile?user=${encodeURIComponent(
    name
  )}&activities=20`;
  const data = await fetchJson(url, `profile for ${name}`);

  if (data.error) {
    throw new Error(
      `RuneMetrics error for ${name}: ${data.error} (${data.reason || "no reason"})`
    );
  }

  return data;
}

async function fetchQuests(name) {
  const url = `${RUNEMETRICS_BASE}/quests?user=${encodeURIComponent(name)}`;
  const data = await fetchJson(url, `quests for ${name}`);

  if (data.error) {
    throw new Error(
      `Quests error for ${name}: ${data.error} (${data.reason || "no reason"})`
    );
  }

  // Can be { quests: [...] } or just [...]
  if (Array.isArray(data.quests)) return data.quests;
  if (Array.isArray(data)) return data;
  return [];
}

// ---- CSV HELPERS ----

function toCsv(rows, headers) {
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

// ---- MARKDOWN HELPERS ----

function mdEscape(val) {
  if (val === null || val === undefined) return "";
  return String(val).replace(/\r?\n/g, "<br>");
}

function makeMarkdownTable(headers, rows) {
  if (!rows || rows.length === 0) {
    return "_No data._\n";
  }

  const headerRow = `| ${headers.join(" | ")} |`;
  const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) =>
    `| ${headers.map((h) => mdEscape(row[h])).join(" | ")} |`
  );

  return [headerRow, sepRow, ...dataRows].join("\n") + "\n";
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---- MAIN ----

async function main() {
  const timestamp = new Date().toISOString();
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  for (const char of CHARACTERS) {
    const name = char.name;
    const slug = slugify(name);

    console.log(`Fetching data for ${name}...`);

    const profile = await fetchProfile(name);
    const quests = await fetchQuests(name);

    const totalskill = profile.totalskill ?? "";
    const totalxp = profile.totalxp ?? "";
    const combatlevel = profile.combatlevel ?? "";

    // ---------- CSV (skills + quests) FOR THIS CHARACTER ----------

    const csvRows = [];

    // Skill rows
    if (Array.isArray(profile.skillvalues)) {
      for (const sv of profile.skillvalues) {
        const id = sv.id;
        const level = sv.level;
        const xp = sv.xp;
        const rank = sv.rank;
        const skillName = SKILL_NAMES[id] || `Skill_${id}`;

        csvRows.push({
          character: name,
          row_type: "skill",
          skill_id: id,
          skill_name: skillName,
          level,
          experience: xp,
          rank,
          quest_title: "",
          quest_status: "",
          quest_difficulty: "",
          quest_members: "",
          quest_points: "",
          quest_userEligible: "",
          totalskill,
          totalxp,
          combatlevel,
          timestamp
        });
      }
    }

    // Quest rows
    if (Array.isArray(quests) && quests.length > 0) {
      for (const q of quests) {
        csvRows.push({
          character: name,
          row_type: "quest",
          skill_id: "",
          skill_name: "",
          level: "",
          experience: "",
          rank: "",
          quest_title: q.title || "",
          quest_status: q.status || "",
          quest_difficulty:
            q.difficulty !== undefined ? q.difficulty : "",
          quest_members:
            q.members !== undefined ? q.members : "",
          quest_points:
            q.questPoints !== undefined ? q.questPoints : "",
          quest_userEligible:
            q.userEligible !== undefined ? q.userEligible : "",
          totalskill,
          totalxp,
          combatlevel,
          timestamp
        });
      }
    }

    const csvHeaders = [
      "character",
      "row_type",
      "skill_id",
      "skill_name",
      "level",
      "experience",
      "rank",
      "quest_title",
      "quest_status",
      "quest_difficulty",
      "quest_members",
      "quest_points",
      "quest_userEligible",
      "totalskill",
      "totalxp",
      "combatlevel",
      "timestamp"
    ];

    const csv = toCsv(csvRows, csvHeaders);
    const csvPath = path.join(dataDir, `${slug}_stats.csv`);
    fs.writeFileSync(csvPath, csv, "utf8");
    console.log(`Wrote ${csvRows.length} rows to ${csvPath}`);

    // ---------- MARKDOWN FOR THIS CHARACTER ----------

    const mdParts = [];

    mdParts.push(`# ${name}`);
    mdParts.push("");
    mdParts.push(`_Last updated: ${timestamp}_`);
    mdParts.push("");

    // Profile summary
    mdParts.push("## Profile");
    mdParts.push("");

    const summaryFields = [
      "name",
      "rank",
      "totalskill",
      "totalxp",
      "combatlevel",
      "magic",
      "melee",
      "ranged",
      "questsstarted",
      "questscomplete",
      "questsnotstarted",
      "loggedIn"
    ];

    const profileRows = summaryFields
      .filter((field) => profile[field] !== undefined)
      .map((field) => ({ Field: field, Value: profile[field] }));

    if (profileRows.length > 0) {
      mdParts.push(makeMarkdownTable(["Field", "Value"], profileRows));
    } else {
      mdParts.push("_No profile summary data._");
      mdParts.push("");
    }

    // Activities
    mdParts.push("## Activities");
    mdParts.push("");

    const activities = Array.isArray(profile.activities)
      ? profile.activities
      : [];

    if (activities.length > 0) {
      const headers = Object.keys(activities[0]);
      const actRows = activities.map((a) => {
        const row = {};
        headers.forEach((h) => (row[h] = a[h]));
        return row;
      });

      mdParts.push(makeMarkdownTable(headers, actRows));
    } else {
      mdParts.push("_No activities data returned._");
      mdParts.push("");
    }

    // Skills
    mdParts.push("## Skills");
    mdParts.push("");

    if (Array.isArray(profile.skillvalues) && profile.skillvalues.length > 0) {
      const skillRows = profile.skillvalues.map((sv) => ({
        Skill: SKILL_NAMES[sv.id] || `Skill ${sv.id}`,
        Level: sv.level,
        XP: sv.xp
      }));

      mdParts.push(makeMarkdownTable(["Skill", "Level", "XP"], skillRows));
    } else {
      mdParts.push("_No skillvalues data returned._");
      mdParts.push("");
    }

    // Quests
    mdParts.push("## Quests");
    mdParts.push("");

    if (quests.length > 0) {
      const questRows = quests.map((q) => ({
        title: q.title || "",
        status: q.status || "",
        difficulty:
          q.difficulty !== undefined ? q.difficulty : "",
        members: q.members !== undefined ? q.members : "",
        questPoints:
          q.questPoints !== undefined ? q.questPoints : "",
        userEligible:
          q.userEligible !== undefined ? q.userEligible : ""
      }));

      mdParts.push(
        makeMarkdownTable(
          [
            "title",
            "status",
            "difficulty",
            "members",
            "questPoints",
            "userEligible"
          ],
          questRows
        )
      );
    } else {
      mdParts.push("_No quest data returned._");
      mdParts.push("");
    }

    const mdPath = path.join(dataDir, `${slug}.md`);
    fs.writeFileSync(mdPath, mdParts.join("\n"), "utf8");
    console.log(`Wrote Markdown to ${mdPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
