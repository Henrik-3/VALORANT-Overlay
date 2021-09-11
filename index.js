process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0

const fastify = require("fastify")()
const fs = require("fs")
const axios = require("axios")
const https = require("https");
const io = require("socket.io")(5001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
}});
const WebSocket = require('ws');
var wsdata = null
websocketConnect()
const settings = JSON.parse(fs.readFileSync("./settings.json", {encoding: "utf-8"}))

setInterval(async () => {
    tokens = await data()
}, 3000000) //50min (token expires after 60min)

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
        wsdata = null
        console.log("Valorant ist nicht geöffnet, versuche es in 10 Sekunden erneut ...")
        await sleep(10000)
        return await data()
    }
}

async function websocketConnect() {
    wsdata = await fetchLogin();
    var ws = new WebSocket(`wss://riot:${wsdata.pw}@127.0.0.1:${wsdata.port}/`, "wamp");
    ws.on("open", async open => {
        tokens = tokens == undefined ? await data() : tokens
        var presence = await axios.get(`https://127.0.0.1:${wsdata.port}/chat/v4/presences`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`riot:${wsdata.pw}`, 'utf8').toString('base64')}`,
                "user-agent": "ShooterGame/21 Windows/10.0.19042.1.768.64bit",
                "X-Riot-ClientVersion": "release-02.03-shipping-8-521855",
                "Content-Type": "application/json",
                "rchat-blocking": "true"
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
            })
        }).catch(error => {return error})

        if(presence instanceof Error){
            console.log("Eine abfrage an Valorant hat ein Fehler geworfen.")
            ws.close()
            return
        }

        try {
            var f = presence.data.presences.filter(item => item.puuid == tokens.data.subject)
            var d = JSON.parse(Buffer.from(f[0].private, "base64").toString("utf-8"))
            cstate = d.sessionLoopState
            ws.send('[5, \"OnJsonApiEvent\"]');
        } catch(e){
            console.log("Eine abfrage an Valorant hat ein Fehler geworfen.")
             ws.close()
        }
        
    })
    
    ws.on('message', async data => {
        var pdata = JSON.parse(data)
        if(typeof pdata[2] == "object" && pdata[2].eventType == "Update" && pdata[2].uri == "/chat/v4/presences" && pdata[2].data.presences[0].puuid == tokens.data.subject) {
            var decode = JSON.parse(Buffer.from(pdata[2].data.presences[0].private, "base64").toString("utf-8"));
            if(cstate != decode.sessionLoopSate) {
                if(decode.sessionLoopState == "MENUS") {cstate = decode.sessionLoopState;console.log("State: MENUS");return io.emit("update", {state: "Menu", data: decode})}
                if(decode.sessionLoopState == "PREGAME") {cstate = decode.sessionLoopState;console.log("State: PREGAME");return io.emit("update", {state: "PreGame", data: decode})}
                if(decode.sessionLoopState == "INGAME") {cstate = decode.sessionLoopState;console.log("State: INGAME");return io.emit("update", {state: "Ingame", data: decode})}
            }
        }
    });
    
    
    ws.on('close', async data => {
        console.log('Socket is closed. Reconnect will be attempted in 10 second.', data.reason);
        ws.close()
        io.emit("update", {state: "Menu"});
        console.log("State: Close")
        setTimeout(function() {
            if(ws.readyState == 2 || ws.readyState == 3){
                websocketConnect()
           }
        }, 10000);
    });

    ws.on('error', async data => {
        console.error('Socket encountered error: ', data.message, 'Closing socket');
            ws.close()
    });

}

async function fetchLogin() {
    if(fs.existsSync(`${process.env.LOCALAPPDATA}\\Riot Games\\Riot Client\\Config\\lockfile`)) {
        var lockfileContents = fs.readFileSync(`${process.env.LOCALAPPDATA}\\Riot Games\\Riot Client\\Config\\lockfile`, 'utf8');
        var matches = lockfileContents.match(/(.*):(.*):(.*):(.*):(.*)/);
        var port = matches[3]
        var pw = matches[4]
        return {port: port, pw: pw}
    } else {
        console.log("Valorant ist nicht geöffnet, versuche es in 10 Sekunden erneut ...")
        await sleep(10000)
        return await fetchLogin()
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
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

fastify.get("/", async (req, res) => {
    tokens = tokens == undefined ? await data() : tokens
    var buffer = fs.readFileSync("index.html")
    res.type("text/html").send(buffer)
})

var tokens
var cstate

fastify.get("/v1/core-game", async (req, res) => {
    tokens = tokens == undefined ? await data() : tokens
    var matchid = await axios.get(`https://glz-${settings.region}-1.${settings.region}.a.pvp.net/core-game/v1/players/${tokens.data.subject}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(matchid.response && matchid.response.status == 400) {
        tokens = await data()
        matchid = await axios.get(`https://glz-${settings.region}-1.${settings.region}.a.pvp.net/core-game/v1/players/${tokens.data.subject}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    }
    if(matchid.response) return errorhandler(matchid.response.status, res)
    var core_game_data = await axios.get(`https://glz-${settings.region}-1.${settings.region}.a.pvp.net/core-game/v1/matches/${matchid.data.MatchID}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(core_game_data.response) return errorhandler(core_game_data.response.status, res)
    res.send({data: core_game_data.data, subject: tokens.data.subject})
})

fastify.get("/v1/pre-game", async (req, res) => {
    tokens = tokens == undefined ? await data() : tokens
    var matchid = await axios.get(`https://glz-${settings.region}-1.${settings.region}.a.pvp.net/pregame/v1/players/${tokens.data.subject}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(matchid.response && matchid.response.status == 400) {
        tokens = await data()
        matchid = await axios.get(`https://glz-${settings.region}-1.${settings.region}.a.pvp.net/pregame/v1/players/${tokens.data.subject}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    }
    if(matchid.response) return errorhandler(matchid.response.status, res)
    var pre_game_data = await axios.get(`https://glz-${settings.region}-1.eu.a.pvp.net/pregame/v1/matches/${matchid.data.MatchID}`, {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(pre_game_data.response) return errorhandler(pre_game_data.response.status, res)
    res.send({data: pre_game_data.data, subject: tokens.data.subject})
})

fastify.get("/v1/get-name/:id", async (req, res) => {
    var tokens = await data()
    var playerid = await axios.put(`https://pd.${settings.region}.a.pvp.net/name-service/v2/players`, [req.params.id], {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    if(playerid.response && playerid.response.status == 400) {
        tokens = await data()
        playerid = await axios.put(`https://pd.${settings.region}.a.pvp.net/name-service/v2/players`, [req.params.id], {headers: {Authorization: "Bearer " + tokens.data.accessToken,"X-Riot-Entitlements-JWT": tokens.data.token,"X-Riot-ClientVersion": "release-03.00-shipping-22-574489","X-Riot-ClientPlatform": "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9"}}).catch(error => {return error})
    }
    if(playerid.response) return errorhandler(playerid.response.status, res)
    res.send(playerid.data)
})

fastify.get("/DINNextLTPro-Bold.ttf", async (req, res) => {
    var buffer = fs.readFileSync("DINNextLTPro-Bold.ttf")
    res.type("font/opentype").send(buffer)
})

fastify.get("/socket.io.min.js", async (req, res) => {
    var buffer = fs.readFileSync("socket.io.min.js")
    res.type("text/javascript").send(buffer)
})



io.on("connection", async socket => {
    console.log("Connected")
    socket.on('disconnect', () => {
        console.log('Disconnected')
    })
    if(wsdata == null){
        console.log("Eine abfrage an Valorant hat ein Fehler geworfen.")
        io.emit("initialize", {state: "Menu"});
        console.log("State: Close")
        return
    }
    var presence = await axios.get(`https://127.0.0.1:${wsdata.port}/chat/v4/presences`, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`riot:${wsdata.pw}`, 'utf8').toString('base64')}`,
            "user-agent": "ShooterGame/21 Windows/10.0.19042.1.768.64bit",
            "X-Riot-ClientVersion": "release-02.03-shipping-8-521855",
            "Content-Type": "application/json",
            "rchat-blocking": "true"
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        })
    }).catch(error => {return error})
    if(presence instanceof Error){
        console.log("Eine abfrage an Valorant hat ein Fehler geworfen.")
        io.emit("initialize", {state: "Menu"});
        console.log("State: Close")
        return
    }
    try {
          var f = presence.data.presences.filter(item => item.puuid == tokens.data.subject)
    var d = JSON.parse(Buffer.from(Buffer.from(f[0].private, "base64").toString("utf-8")).toString("utf-8"))
    if(d.sessionLoopState == "MENUS") {io.emit("initialize", {state: "Menu", data: d});console.log("State: MENUS")}
    if(d.sessionLoopState == "PREGAME") {io.emit("initialize", {state: "PreGame", data: d});console.log("State: PREGAME")}
    if(d.sessionLoopState == "INGAME") {io.emit("initialize", {state: "Ingame", data: d});console.log("State: INGAME")}
    } catch(e){
        console.log("Eine abfrage an Valorant hat ein Fehler geworfen.")
        io.emit("update", {state: "Menu"});
        console.log("State: Close")
        return
    }
  
})

fastify.listen(5000, '127.0.0.1', (err, address) => {console.log(`Online auf ${address}`)})
