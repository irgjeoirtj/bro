const zlib = require("zlib-sync")
const WebSocket = require("ws")
const erlpack = require("erlpack")
const op = require("./op")
const ZLIB_SUFFIX = 0x0000FFFF

class discord_client {
    #handleEvent = null;

    #auth_data = null;
    #d_gateway = null;

    #zlib_inflate = null;
    
    #ws = null;
    #heartbeat_id = null;
    
    #got_heartbeat_ack = null;
    #last_sequence = null;

    constructor(token, gateway, eventHandler) {
        this.#d_gateway = gateway;
        this.#auth_data = erlpack.pack({"op":op.IDENTIFY,"d":{"token":token,"capabilities":61,"properties":{"os":"Windows","browser":"Chrome","device":"","browser_user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36","browser_version":"87.0.4280.66","os_version":"10","referrer":"","referring_domain":"","referrer_current":"https://discord.com/","referring_domain_current":"discord.com","release_channel":"stable","client_build_number":72382,"client_event_source":null},"presence":{"status":"invisible","since":0,"activities":[],"afk":false},"compress":false,"client_state":{"guild_hashes":{},"highest_last_message_id":"0","read_state_version":0,"user_guild_settings_version":-1}}})
        this.#handleEvent = eventHandler;
    }
    connect = null;
    connect = function() {
        let gw = this.#d_gateway;
        this.#ws = new WebSocket(gw);

        this.#ws.on("open", ()=>{
            this.#zlib_inflate = new zlib.Inflate({chunkSize: 65535, flush: zlib.Z_SYNC_FLUSH});
            this.#got_heartbeat_ack = true;
            console.log("| WS | OPEN");
            this.#ws.send(this.#auth_data);
            console.log("| WS | SENT AUTH");
        })
        
        this.#ws.on('message', async data => {
            if (data.readUInt32BE(data.length-4) ^ ZLIB_SUFFIX == 0) {
                this.#zlib_inflate.push(data, zlib.Z_SYNC_FLUSH);
                if (this.#zlib_inflate.result == undefined)
                    return;
                
                this.#handlePacket(erlpack.unpack(this.#zlib_inflate.result));
            } else {
                console.log(data.buffer.toString());
            }
        });
    
        this.#ws.on("close", ()=>{
            console.log("on_disconect")
            this.connect();
        });
    }

    #handlePacket = async function (packet) {
        if (packet.s != undefined)
            this.#last_sequence = packet.s
    
        switch (packet.op) {
            case op.DISPATCH:
                this.#handleEvent(packet)
                break
            case op.HELLO:
                const heartbeat_interval = packet.d.heartbeat_interval
                console.log("| OP | HELLO")
                console.log(`| SET | heartbeat_interval: ${heartbeat_interval}`)
                if (this.#heartbeat_id != null)
                    clearInterval(this.#heartbeat_id)
                    this.#heartbeat_id = setInterval(()=>{
                    if (!this.#got_heartbeat_ack) {
                        this.#ws.close();
                        return
                    }
                    if (this.#ws != null) {
                        this.#ws.send(erlpack.pack({op: op.HEARTBEAT, d: this.#last_sequence}))
                        console.log("| HEARTBEAT |")
                        this.#got_heartbeat_ack = false
                    }
                }, heartbeat_interval)
                break
            case op.HEARBEAT_ACK:
                this.#got_heartbeat_ack = true
                console.log("| OP | HEARBEAT_ACK")
                break
            default:
                console.log(`| OP | ${JSON.stringify(packet)}`)
        }
    }
}

module.exports = discord_client