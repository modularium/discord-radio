const mod = require('@modularium/discord')
require('dotenv').config()

console.log(process.env)

const config = {
    bot: {
        token: process.env.TOKEN,
        prefix: ";",
        cacheGuilds: true,
        cacheChannels: false,
        cacheOverwrites: false,
        cacheRoles: false,
        cacheEmojis: false,
        cachePresences: false
    },
    lang: "ru_RU",
    features: {
        preventCmdNotFound: true,
        mbErrors: true,
        ascii: false,
        plugins: {
            loadLocal: true,
            log: true,
            logSkipped: true
        },
        updates: true
    },
    user: {
        typing: 1000
    },
    geniusKey: process.env.GENIUS
}

mod.run(config)