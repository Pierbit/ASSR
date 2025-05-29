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
    deleteBattle
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

        /*const battagliaStringa = JSON.stringify(battaglia);
        const stringaPulita = battagliaStringa.replace(/\s+/g, ' ');

        const regexNomiGilde = /"nome"\s*:\s*"([^"]+)"/g;
        let match;

        while ((match = regexNomiGilde.exec(stringaPulita)) !== null) {
            const nome = match[1];
            if (!gildaCount[nome]) {
                gildaCount[nome] = {numero_battaglie: 0, vittorie: 0};
            }
            gildaCount[nome].numero_battaglie++;
            if(battaglia.vincitore === nome) gildaCount[nome].vittorie++;
        }*/

    });

    return gildaCount;
}

function mergeAllies(significantGuilds) {
    const allyMap = {};

    for (const [name, data] of significantGuilds) {
        const ally = data.alliance || 'NoAlliance';
        if (!allyMap[ally]) allyMap[ally] = [];
        allyMap[ally].push([name, data]);
    }

    const mergedGuilds = [];

    for (const [ally, guilds] of Object.entries(allyMap)) {
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
                    alliance: ally
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
    let offset = 5000;
    const limit = 51;
    let stop = false;
    deleteBattle(); //PER CANCELLARE modificare id

    while(offset < 8000) {
        const url = `https://gameinfo-ams.albiononline.com/api/gameinfo/battles?limit=${limit}&offset=${offset}&sort=recent`;
        //const url = `https://gameinfo-ams.albiononline.com/api/gameinfo/battles/193467854`; //TESTING
        try {
            const res = await fetch(url);
            const data = await res.json();
            console.log(`FETCH URL: ${url}`);
            //console.log(`Status: ${res.status}`);

            for (const battle of data) {
                const battleDate = new Date(battle.startTime);

                const now = new Date();
                const yesterday = new Date(now);
                yesterday.setUTCDate(now.getUTCDate() - 2);
                yesterday.setUTCHours(0, 0, 0, 0);

                const startWindow = new Date(yesterday);
                startWindow.setUTCHours(19, 0, 0, 0);

                const endWindow = new Date(yesterday);
                endWindow.setUTCHours(21, 59, 59, 999);

                const totalPlayers = Object.keys(battle.players).length;

                if (
                    battleDate >= startWindow &&
                    battleDate <= endWindow &&
                    totalPlayers >= 25 &&
                    totalPlayers <= 60
                ) {
                    collected.push(battle);
                }
            }

        } catch (err) {
            console.error("Errore durante il fetch:", err);
        }
        offset+=limit;
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
                    .filter(([_, data]) => data.count >= 10);
                if (significantGuilds.length < 2) return null;

                const mergedGuilds = mergeAllies(significantGuilds);

                const allianceCounts = {};
                mergedGuilds.forEach(([_, data]) => {
                    const alliance = data.alliance || 'NoAlliance';
                    allianceCounts[alliance] = (allianceCounts[alliance] || 0) + data.count;
                });

                const dominantAlly = Object.values(allianceCounts).some(count => count >= 25);
                if (dominantAlly) return null;


                const secondaryGuilds = Object.entries(guildMap)
                    .filter(([_, data]) => data.count < 10);
                let participantsCount = 0;
                for (let i = 0; i < secondaryGuilds.length; i++) {
                    participantsCount += secondaryGuilds[i][1].count;
                }

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
                    ratti: participantsCount,
                };
            })
            .filter(battle => battle !== null);

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


setInterval(fetchBattles, 30000);
fetchBattles();


app.get('/api/battles/day', async (req, res) => {
    try{
        res.json(await readDailyBattleJson());
    }catch (err){
        console.log(err);
        res.status(404).json({error: "Battles not found"});
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
