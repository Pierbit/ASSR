// server.js
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs';
import {readDailyBattleJson, insertDailyBattleJson, readLast14DailyBattleJson, insertComprehensiveReport, readComprehensiveReport} from "./queries.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

const FILE_PATH1 = './battles.json';
const FILE_PATH2 = './battaglie.json';

function generaReportGilde(battaglie) {
    const gildaCount = {};

    battaglie.forEach((battaglia, i) => {
        console.log(`Analizzo battaglia ${i + 1}`);

        const temp = JSON.stringify(battaglia.gilde);
        console.log(temp);

        const gilde = temp || [];

        gilde.forEach(gilda => {
            const nome = gilda.nome;
            if (!nome) return;

            if (!gildaCount[nome]) {
                gildaCount[nome] = 0;
            }
            gildaCount[nome]++;
        });
    });

    return gildaCount;
}

async function fetchBattles() {
    console.log("Fetching battles...");
    let collected = [];
    let offset = 0;
    const limit = 51;
    let stop = false;

    while(offset < 3000) {
        const url = `https://gameinfo-ams.albiononline.com/api/gameinfo/battles?limit=${limit}&offset=${offset}&sort=recent`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            //console.log(`FETCH URL: ${url}`);
            //console.log(`Status: ${res.status}`);

            for (const battle of data) {
                const date = new Date(battle.startTime);
                const hour = date.getUTCHours();

                if (hour >= 19 && hour <= 21) {
                    const totalPlayers = Object.keys(battle.players).length;
                    if (totalPlayers >= 25 && totalPlayers <= 60) {
                        collected.push(battle);
                    }
                }
            }

        } catch (err) {
            console.error("Errore durante il fetch:", err);
        }
        offset+=limit;
        //console.log("offset: "+offset);
    }

    const battaglie = collected
        .map(battle => {
            const guildMap = {};

            Object.values(battle.players).forEach(player => {
                const guild = player.guildName || 'NoGuild';
                const kills = player.kills || 0;
                const deaths = player.deaths || 0;
                const alliance = player.allianceName || 'NoAlliance';

                if (!guildMap[guild]) {
                    guildMap[guild] = { count: 0, alliance, kills: 0, deaths: 0 };
                }
                guildMap[guild].kills += kills;
                guildMap[guild].deaths += deaths;
                guildMap[guild].count++;
            });


            const significantGuilds = Object.entries(guildMap)
                .filter(([_, data]) => data.count >= 10);

            if (significantGuilds.length < 2) return null;


            const allianceCounts = {};

            significantGuilds.forEach(([_, data]) => {
                const alliance = data.alliance || 'NoAlliance';
                allianceCounts[alliance] = (allianceCounts[alliance] || 0) + data.count;
            });

            const dominantAlly = Object.values(allianceCounts).some(count => count >= 25);
            if (dominantAlly) return null;


            const secondaryGuilds = Object.entries(guildMap)
                .filter(([_, data]) => data.count < 10);
            let participantsCount = 0;
            for(let i = 0; i < secondaryGuilds.length; i++) {
                participantsCount+=secondaryGuilds[i][1].count;
            }

            let winner = null;
            let maxKills = -1;
            for (const [name, data] of significantGuilds) {
                if (data.kills > maxKills) {
                    maxKills = data.kills;
                    winner = name;
                }
            }

            return {
                id: battle.id,
                data: battle.endTime,
                gilde: significantGuilds.map(([name, data]) => ({
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
        await insertDailyBattleJson(JSON.stringify(battaglie));
        console.log("Inserimento completato con successo!");
    } catch (err) {
        console.error("Errore durante l'inserimento nel DB:", err);
    }

    try{
        const battaglie = await readLast14DailyBattleJson();
        console.log("Battaglie caricate:", battaglie.length);
        //console.log("Battaglia:", JSON.stringify(battaglie[0], null, 2));
        const report = generaReportGilde(battaglie);
        await insertComprehensiveReport(report);
        console.log("creport success");

    }catch(err){
        console.error("Errore weekly report:", err);
    }

    fs.writeFileSync(FILE_PATH1, JSON.stringify(collected, null, 2));
    fs.writeFileSync(FILE_PATH2, JSON.stringify(battaglie, null, 2));


    console.log(`Salvate ${collected.length} battaglie`);
}


setInterval(fetchBattles, 28800000);
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

