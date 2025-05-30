import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import GSON from 'gson';
import fs from 'fs';
import {
    readDailyBattleJson,
    insertDailyBattleJson,
    readLast14DailyBattleJson,
    insertComprehensiveReport,
    readComprehensiveReport,
    deleteBattle, readDailyBattleJsonApi
} from "./queries.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

const FILE_PATH1 = './battles.json';
const FILE_PATH2 = './battaglie.json';

export function generaReportGilde(battaglie) {
    const gildaCount = {};

    battaglie.forEach((battaglia) => {

        battaglia.gilde.forEach(gilda => {
            if(!gildaCount[gilda.nome]){
                gildaCount[gilda.nome] = {numero_battaglie: 0, vittorie: 0};
            }
            gildaCount[gilda.nome].numero_battaglie++;
            if(battaglia.vincitore === gilda.nome) gildaCount[gilda.nome].vittorie++;
        })
    });

    return gildaCount;
}

function mergeAllies(significantGuilds) {
    const allyMap = {};

    for (const [name, data] of significantGuilds) {
        const hasAlly = data.alliance && data.alliance !== 'NoAlliance';
        const key = hasAlly ? data.alliance : Symbol(name);
        const readableAlly = hasAlly ? data.alliance : 'NoAlliance';

        if (!allyMap[key]) allyMap[key] = { guilds: [], alliance: readableAlly };
        allyMap[key].guilds.push([name, data]);
    }

    const mergedGuilds = [];

    for (const { guilds, alliance } of Object.values(allyMap)) {
        if (guilds.length === 1) {
            mergedGuilds.push(guilds[0]);
        } else {
            const mergedName = guilds.map(([name]) => name).sort().join('+');
            const mergedData = guilds.reduce(
                (acc, [_, data]) => {
                    acc.kills += data.kills;
                    acc.deaths += data.deaths;
                    acc.count += data.count;
                    return acc;
                },
                {
                    kills: 0,
                    deaths: 0,
                    count: 0,
                    alliance: alliance
                }
            );
            mergedGuilds.push([mergedName, mergedData]);
        }
    }

    return mergedGuilds;
}


async function fetchBattles() {
    console.log("Fetching battles...");
    let collected = [];
    let offset = 0;
    const limit = 51;
    let stop = false;
    //deleteBattle(); //PER CANCELLARE modificare id

    while (offset < 3000) {
        const url = `https://gameinfo-ams.albiononline.com/api/gameinfo/battles?limit=${limit}&offset=${offset}&sort=recent`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Fetch failed at offset ${offset} (status: ${res.status})`);
                offset += limit;
                continue;
            }

            const data = await res.json();
            let matched = 0;

            const now = new Date();

            const yesterdayUTC = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - 1
            ));

            const startWindow = new Date(Date.UTC(
                yesterdayUTC.getUTCFullYear(),
                yesterdayUTC.getUTCMonth(),
                yesterdayUTC.getUTCDate(),
                19, 0, 0, 0
            ));

            const endWindow = new Date(Date.UTC(
                yesterdayUTC.getUTCFullYear(),
                yesterdayUTC.getUTCMonth(),
                yesterdayUTC.getUTCDate(),
                21, 59, 59, 999
            ));

            for (const battle of data) {
                const battleDate = new Date(battle.startTime);
                const totalPlayers = Object.keys(battle.players || {}).length;

                if (
                    battleDate >= startWindow &&
                    battleDate <= endWindow &&
                    totalPlayers >= 25 &&
                    totalPlayers <= 60
                ) {
                    collected.push(battle);
                    matched++;
                }
            }

            console.log(`Offset ${offset}: ${data.length} battles fetched, ${matched} matched.`);

        } catch (err) {
            console.error(`Error at offset ${offset}:`, err.message);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
        offset += limit;
    }


    if(collected.length > 0) {
        const battaglie = collected
            .map(battle => {
                const guildMap = {};

                Object.values(battle.players).forEach(player => {
                    const guild = player.guildName || 'NoGuild';
                    const kills = player.kills || 0;
                    const deaths = player.deaths || 0;
                    const alliance = player.allianceName || 'NoAlliance';

                    if (!guildMap[guild]) {
                        guildMap[guild] = {count: 0, alliance, kills: 0, deaths: 0};
                    }
                    guildMap[guild].kills += kills;
                    guildMap[guild].deaths += deaths;
                    guildMap[guild].count++;
                });


                const significantGuilds = Object.entries(guildMap)
                    .filter(([_, data]) => data.count >= 11);

                if (significantGuilds.length < 2) return null;

                const significantAlliances = new Set(
                    significantGuilds
                        .map(([_, data]) => data.alliance)
                        .filter(ally => ally && ally !== 'NoAlliance')
                );

                const secondaryGuildsMatched = Object.entries(guildMap)
                    .filter(([_, data]) => data.count <= 10 && significantAlliances.has(data.alliance))
                    .map(([name, data]) => ({
                        nome: name,
                        players: data.count,
                        ally: data.alliance,
                        kills: data.kills,
                        deaths: data.deaths
                    }));

                const mergedGuilds = mergeAllies(significantGuilds);

                if (mergedGuilds.length < 2) return null;

                const allianceCounts = {};

                mergedGuilds.forEach(([_, data]) => {
                    const alliance = data.alliance || 'NoAlliance';
                    allianceCounts[alliance] = (allianceCounts[alliance] || 0) + data.count;
                });

                secondaryGuildsMatched.forEach(g => {
                    const alliance = g.ally || 'NoAlliance';
                    allianceCounts[alliance] = (allianceCounts[alliance] || 0) + g.players;
                });

                const dominantAlly = Object.values(allianceCounts).some(count => count >= 25);
                if (dominantAlly) return null;

                const matchedNames = new Set(secondaryGuildsMatched.map(g => g.nome));

                let participantsCount = 0;
                Object.entries(guildMap)
                    .filter(([name, data]) => data.count <= 10 && !matchedNames.has(name))
                    .forEach(([_, data]) => {
                        participantsCount += data.count;
                    });

                let winner = null;
                let maxKills = -1;
                for (const [name, data] of mergedGuilds) {
                    if (data.kills > maxKills) {
                        maxKills = data.kills;
                        winner = name;
                    }
                }

                return {
                    id: battle.id,
                    data: battle.endTime,
                    gilde: mergedGuilds.map(([name, data]) => ({
                        nome: name,
                        players: data.count,
                        ally: data.alliance,
                        kills: data.kills,
                        deaths: data.deaths
                    })),
                    vincitore: winner,
                    secondary: secondaryGuildsMatched,
                    ratti: participantsCount,
                };
            })
            .filter(b => b && Array.isArray(b.gilde) && b.gilde.length > 0 && b.vincitore);

        try {
            const current_battles = JSON.stringify(battaglie);
            const last_battles_raw = await readDailyBattleJson();
            if(last_battles_raw !== null) {
                const last_battles = JSON.stringify(last_battles_raw);
                if (last_battles === current_battles) {
                    console.log("Duplicate report, no further action taken")
                    return -1;
                }else{
                    await insertDailyBattleJson(current_battles);
                }
            }else{
                await insertDailyBattleJson(current_battles);
            }
            console.log("Inserimento completato con successo!");
        } catch (err) {
            console.error("Errore durante l'inserimento nel DB:", err);
        }

        try {
            const rawBattaglie = await readLast14DailyBattleJson();
            const battaglie = rawBattaglie.flat();
            const report = generaReportGilde(battaglie);
            await insertComprehensiveReport(JSON.stringify(report));
            console.log("creport success");

        } catch (err) {
            console.error("Errore weekly report:", err);
        }

        fs.writeFileSync(FILE_PATH1, JSON.stringify(collected, null, 2));
        fs.writeFileSync(FILE_PATH2, JSON.stringify(battaglie, null, 2));


        console.log(`Salvate ${collected.length} battaglie`);
    } else {
        console.log("nessuna battaglia considerata")
    }
}


setInterval(fetchBattles, 3000000); //50 min
//fetchBattles();


app.get('/api/battles/day', async (req, res) => {

    const day = req.query.day;

    try{
        if(day === "today"){
            res.json(await readDailyBattleJsonApi(0));
        } else if(day === "yesterday"){
            res.json(await readDailyBattleJsonApi(1));
        } else{
            return res.status(400).json({ error: "Parametro 'day' mancante o invalido. Usa ?day=oggi o ?day=ieri" });
        }
    }catch (err){
        console.log(err);
        res.status(500).json({error: "Battles not found"});
    }
});

app.get('/api/battles/week', async (req, res) => {
    try{
        res.json(await readComprehensiveReport());
    }catch (err){
        console.log(err);
        res.status(404).json({error: "Weekly Battles not found"});
    }
});

app.listen(PORT, () => {
    console.log(`Albion proxy server in ascolto su http://localhost:${PORT}`);
});
