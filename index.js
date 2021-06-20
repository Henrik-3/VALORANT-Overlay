const fastify = require("fastify")()
const fs = require("fs")
const axios = require("axios")
const https = require("https");

if(!fs.existsSync(`${process.env.LOCALAPPDATA}\\Riot Games\\Riot Client\\Config\\lockfile`)) throw "Bitte öffne VALORANT"

var data = async function () {
    if(fs.existsSync(`${process.env.LOCALAPPDATA}\\Riot Games\\Riot Client\\Config\\lockfile`)) {
        var lockfileContents = fs.readFileSync(`${process.env.LOCALAPPDATA}\\Riot Games\\Riot Client\\Config\\lockfile`, 'utf8');
        var matches = lockfileContents.match(/(.*):(.*):(.*):(.*):(.*)/);
        var port = matches[3]
        var pw = matches[4]
        return await axios.get(`https://127.0.0.1:${port}/entitlements/v1/token`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`riot:${pw}`, 'utf8').toString('base64')}`,
                "user-agent": "ShooterGame/21 Windows/10.0.19042.1.768.64bit",
                "X-Riot-ClientVersion": "release-02.03-shipping-8-521855",
                "Content-Type": "application/json",
                "rchat-blocking": "true"
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
            })
        })
    } else {
        throw "VALORANT nicht offen"
    }
}

const errors = {
    404: {status: "404", message: "Not in expected state"},
    503: {status: "503", message: "Source Server is not reachable"},
    429: {status: "429", message: "Source Server Rate Limit, try again later"},
}

function errorhandler(status, res) {
    if(errors[status] != undefined) return res.code(status).type("application/json").send(errors[status])
    return res.code(500).type("application/json").send({status: "500", message: "Unknown error occured"})
}

fastify.get("/", (req, res) => {
    var buffer = fs.readFileSync("index.html")
    res.type("text/html").send(buffer)
})

fastify.get("/v1/core-game", async (req, res) => {
    var tokens = await data()
    var matchid = await axios.get(`https://glz-eu-1.eu.a.pvp.net/core-game/v1/players/${tokens.data.subject}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-02.09-shipping-14-560778","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    console.log(matchid)
    if(matchid.response) return errorhandler(matchid.response.status, res)
    var core_game_data = await axios.get(`https://glz-eu-1.eu.a.pvp.net/core-game/v1/matches/${matchid.data.MatchID}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-02.09-shipping-14-560778","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(core_game_data.response) return errorhandler(core_game_data.response.status, res)
    res.send({data: core_game_data.data, subject: tokens.data.subject})
})

fastify.get("/v1/get-name/:id", async (req, res) => {
    var tokens = await data()
    var playerid = await axios.put(`https://pd.ap.a.pvp.net/name-service/v2/players`, [req.params.id], {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-02.09-shipping-14-560778","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(playerid.response) return errorhandler(playerid.response.status, res)
    res.send(playerid.data)
})

fastify.get("/DINNextLTPro-Bold.ttf", async (req, res) => {
    var buffer = fs.readFileSync("DINNextLTPro-Bold.ttf")
    res.type("font/opentype").send(buffer)
})

fastify.listen(5000, () => {console.log("Online")})